#include "BolySubsystem.h"

#include "BolySettings.h"
#include "Dom/JsonObject.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "HAL/PlatformMisc.h"
#include "HAL/PlatformTime.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Misc/CommandLine.h"
#include "Misc/PackageName.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

DEFINE_LOG_CATEGORY_STATIC(LogBoly, Log, All);

namespace
{
	const TCHAR* HeartbeatPath = TEXT("/v1/validate/validate");
	constexpr int32 MaxConsecutiveFailures = 4;
	// Una peticion colgada cuenta como fallo en vez de detener el heartbeat.
	constexpr float RequestTimeoutSeconds = 15.0f;
}

void UBolySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	if (!GIsEditor && !GetDefault<UBolySettings>()->bEnabledInBuilds)
	{
		return;
	}

	ParseCommandLine();

	if (Key.IsEmpty() || GameId < 0)
	{
		if (GIsEditor)
		{
			// Modo editor (PIE): sin app de Boly no hay sesion real. Se marca
			// listo un tick despues, para que el nivel alcance a suscribirse.
			bEditorSession = true;
			FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateWeakLambda(this, [this](float)
			{
				BecomeReady();
				return false;
			}));
			return;
		}

		UE_LOG(LogBoly, Error, TEXT("Falta -key: el juego debe abrirse desde la app de Boly."));
		EndSession(EBolyEndReason::MissingKey);
		return;
	}

	// Validacion inicial y luego heartbeat periodico sobre FTSTicker: tiempo
	// real, sigue aunque el juego pause o cambie la dilatacion de tiempo.
	SendHeartbeat();
	TickerHandle = FTSTicker::GetCoreTicker().AddTicker(
		FTickerDelegate::CreateUObject(this, &UBolySubsystem::Tick), 0.0f);
}

void UBolySubsystem::Deinitialize()
{
	if (TickerHandle.IsValid())
	{
		FTSTicker::GetCoreTicker().RemoveTicker(TickerHandle);
		TickerHandle.Reset();
	}
	Super::Deinitialize();
}

void UBolySubsystem::ParseCommandLine()
{
	// El launcher envia los argumentos separados por ESPACIO ("-key abc"), no
	// "-key=abc", y FParse::Value solo entiende el formato con "=".
	TArray<FString> Tokens;
	FString(FCommandLine::Get()).ParseIntoArray(Tokens, TEXT(" "), /*CullEmpty=*/true);

	for (int32 i = 0; i < Tokens.Num() - 1; ++i)
	{
		const FString& Value = Tokens[i + 1];
		if (Tokens[i].Equals(TEXT("-key"), ESearchCase::IgnoreCase))
		{
			Key = Value;
		}
		else if (Tokens[i].Equals(TEXT("-game_id"), ESearchCase::IgnoreCase))
		{
			GameId = FCString::Atoi(*Value);
		}
		else if (Tokens[i].Equals(TEXT("-api_base"), ESearchCase::IgnoreCase))
		{
			ApiBase = Value;
			ApiBase.RemoveFromEnd(TEXT("/"));
		}
		else if (Tokens[i].Equals(TEXT("-heartbeat_seconds"), ESearchCase::IgnoreCase))
		{
			const float Seconds = FCString::Atof(*Value);
			if (Seconds > 0.0f)
			{
				HeartbeatSeconds = Seconds;
			}
		}
	}
}

bool UBolySubsystem::Tick(float DeltaTime)
{
	if (bEnding)
	{
		return false;
	}

	TimeSinceLastBeat += DeltaTime;
	if (TimeSinceLastBeat >= HeartbeatSeconds && !bRequestInFlight)
	{
		TimeSinceLastBeat = 0.0f;
		SendHeartbeat();
	}
	return true;
}

void UBolySubsystem::SendHeartbeat()
{
	bRequestInFlight = true;

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(ApiBase + HeartbeatPath);
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetHeader(TEXT("X-Boly-SDK"), FString::Printf(TEXT("unreal/%s"), SdkVersion));
	Request->SetTimeout(RequestTimeoutSeconds);
	// Solo game_id + key. Sin Authorization: la key es la credencial.
	Request->SetContentAsString(FString::Printf(TEXT("{\"game_id\":%d,\"key\":\"%s\"}"), GameId, *Key));
	Request->OnProcessRequestComplete().BindUObject(this, &UBolySubsystem::OnHeartbeatResponse);
	Request->ProcessRequest();
}

void UBolySubsystem::OnHeartbeatResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	bRequestInFlight = false;
	if (bEnding)
	{
		return;
	}

	const int32 Code = (bWasSuccessful && Response.IsValid()) ? Response->GetResponseCode() : 0;

	if (Code == 200)
	{
		ConsecutiveFailures = 0;
		ApplyResponse(Response->GetContentAsString());
		if (bFirstValidation)
		{
			bFirstValidation = false;
			BecomeReady();
		}
		return;
	}

	// 403 = sesion invalida / reemplazada / expirada / sin acceso. Si falla la
	// validacion inicial tampoco hay sesion que iniciar.
	if (Code == 403 || bFirstValidation)
	{
		UE_LOG(LogBoly, Error, TEXT("Sesion rechazada (%d)."), Code);
		EndSession(EBolyEndReason::Rejected);
		return;
	}

	// Fallo transitorio (429, 5xx, red): se toleran varios seguidos.
	++ConsecutiveFailures;
	UE_LOG(LogBoly, Warning, TEXT("Heartbeat fallido %d/%d (%d)."), ConsecutiveFailures, MaxConsecutiveFailures, Code);
	if (ConsecutiveFailures >= MaxConsecutiveFailures)
	{
		EndSession(EBolyEndReason::Unreachable);
	}
}

void UBolySubsystem::ApplyResponse(const FString& Body)
{
	TSharedPtr<FJsonObject> Json;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
	if (!FJsonSerializer::Deserialize(Reader, Json) || !Json.IsValid())
	{
		return; // Un 200 con cuerpo raro no invalida la sesion.
	}

	Json->TryGetBoolField(TEXT("subscriptionAccess"), bSubscriptionAccess);

	FString Value;
	if (Json->TryGetStringField(TEXT("session_id"), Value) && !Value.IsEmpty())
	{
		SessionId = Value;
	}
	if (Json->TryGetStringField(TEXT("learner_id"), Value) && !Value.IsEmpty())
	{
		LearnerId = Value;
	}

	FDateTime ServerUtc;
	if (Json->TryGetStringField(TEXT("server_time"), Value) && FDateTime::ParseIso8601(*Value, ServerUtc))
	{
		bHasServerTime = true;
		ServerTimeAtSync = ServerUtc;
		PlatformSecondsAtSync = FPlatformTime::Seconds();
	}
}

FDateTime UBolySubsystem::GetServerNow() const
{
	if (!bHasServerTime)
	{
		return FDateTime::UtcNow();
	}
	return ServerTimeAtSync + FTimespan::FromSeconds(FPlatformTime::Seconds() - PlatformSecondsAtSync);
}

void UBolySubsystem::BecomeReady()
{
	if (bReady)
	{
		return;
	}
	bReady = true;
	OnReady.Broadcast();

	const FSoftObjectPath& Level = GetDefault<UBolySettings>()->LevelOnReady;
	UWorld* World = GetGameInstance() ? GetGameInstance()->GetWorld() : nullptr;
	if (Level.IsValid() && World)
	{
		const FString LevelPackage = Level.GetLongPackageName();
		if (UGameplayStatics::GetCurrentLevelName(World, /*bRemovePrefixString=*/true) != FPackageName::GetShortName(LevelPackage))
		{
			UGameplayStatics::OpenLevel(World, FName(*LevelPackage));
		}
	}
}

void UBolySubsystem::EndSession(EBolyEndReason Reason)
{
	if (bEnding)
	{
		return;
	}
	bEnding = true;
	OnSessionEnded.Broadcast(Reason);

	UWorld* World = GetGameInstance() ? GetGameInstance()->GetWorld() : nullptr;
	if (World && UGameplayStatics::GetPlayerController(World, 0))
	{
		UKismetSystemLibrary::QuitGame(World, nullptr, EQuitPreference::Quit, false);
	}
	else if (!GIsEditor)
	{
		// Sin PlayerController (p.ej. al iniciar, antes de cargar el primer
		// nivel) QuitGame no hace nada, asi que se pide la salida directamente.
		FPlatformMisc::RequestExit(false);
	}
}
