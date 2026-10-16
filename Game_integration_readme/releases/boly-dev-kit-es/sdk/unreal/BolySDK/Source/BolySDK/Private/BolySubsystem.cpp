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
#include "HAL/FileManager.h"
#include "Internationalization/Regex.h"
#include "Misc/FileHelper.h"
#include "Misc/Guid.h"
#include "Misc/Paths.h"
#include "Policies/CondensedJsonPrintPolicy.h"
#include "Serialization/JsonWriter.h"
#include "Misc/CommandLine.h"
#include "Misc/PackageName.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

DEFINE_LOG_CATEGORY_STATIC(LogBoly, Log, All);

namespace
{
	const TCHAR* HeartbeatPath = TEXT("/v1/validate/validate");
	const TCHAR* AchievementsPath = TEXT("/v1/lumen/achievements");
	constexpr int32 MaxBatch = 50;
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
		else if (Tokens[i].Equals(TEXT("-boly_test_achievement"), ESearchCase::IgnoreCase))
		{
			TestAchievement = Value;
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
		else if (PendingOps.Num() > 0)
		{
			// Hay red y sesion: buen momento para reintentar lo pendiente.
			FlushAchievements();
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

	if (!bEditorSession)
	{
		StartAchievements();
		if (IsTestAchievementAllowed())
		{
			UnlockAchievement(TestAchievement);
		}
	}

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

// ── Logros ─────────────────────────────────────────────────────────────────

void UBolySubsystem::UnlockAchievement(const FString& ApiName)
{
	ReportAchievement(ApiName, TEXT("unlock"), 0, false);
}

void UBolySubsystem::IncrementAchievement(const FString& ApiName, int32 Amount)
{
	if (Amount <= 0)
	{
		UE_LOG(LogBoly, Warning, TEXT("IncrementAchievement(%s) necesita un Amount mayor que 0."), *ApiName);
		return;
	}
	ReportAchievement(ApiName, TEXT("increment"), Amount, true);
}

void UBolySubsystem::SetAchievementProgress(const FString& ApiName, int32 Value)
{
	if (Value < 0)
	{
		UE_LOG(LogBoly, Warning, TEXT("SetAchievementProgress(%s) necesita un Value mayor o igual a 0."), *ApiName);
		return;
	}
	ReportAchievement(ApiName, TEXT("set"), Value, true);
}

bool UBolySubsystem::IsAchievementUnlocked(const FString& ApiName) const
{
	const FAchievementState* State = AchievementStates.Find(ApiName);
	return State && State->bUnlocked;
}

bool UBolySubsystem::GetAchievementProgress(const FString& ApiName, int32& Current, int32& Target) const
{
	const FAchievementState* State = AchievementStates.Find(ApiName);
	if (!State)
	{
		return false;
	}
	Current = State->Current;
	Target = State->Target;
	return true;
}

void UBolySubsystem::ReportAchievement(const FString& ApiName, const FString& Op, int32 Value, bool bHasValue)
{
	// Un nombre que no cumple el formato no puede existir en boly.cl: es un
	// error de tipeo, asi que ni se envia.
	const FRegexPattern Pattern(TEXT("^[A-Z][A-Z0-9_]{0,63}$"));
	FRegexMatcher Matcher(Pattern, ApiName);
	if (!Matcher.FindNext())
	{
		UE_LOG(LogBoly, Error, TEXT("\"%s\" no es un api_name valido (A-Z, 0-9 y _). Usa las constantes de BolyAchievements.h."), *ApiName);
		return;
	}

	if (bEditorSession)
	{
		// En el editor no se envia nada; un unlock dispara el evento para probar el popup.
		UE_LOG(LogBoly, Log, TEXT("(editor) %s %s - no se envia a Boly."), *Op, *ApiName);
		if (Op == TEXT("unlock") && !IsAchievementUnlocked(ApiName))
		{
			FAchievementState State;
			State.bUnlocked = true;
			AchievementStates.Add(ApiName, State);
			OnAchievementUnlocked.Broadcast(ApiName, 1, 1);
		}
		return;
	}

	if (Key.IsEmpty())
	{
		UE_LOG(LogBoly, Warning, TEXT("Sin sesion de Boly: el logro %s no se envia."), *ApiName);
		return;
	}

	FPendingOp Pending;
	Pending.ClientEventId = FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower);
	Pending.ApiName = ApiName;
	Pending.Op = Op;
	Pending.Value = Value;
	Pending.bHasValue = bHasValue;
	PendingOps.Add(Pending);
	SavePending();
	FlushAchievements();
}

TSharedRef<IHttpRequest, ESPMode::ThreadSafe> UBolySubsystem::MakeAchievementsRequest(const FString& Verb) const
{
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(ApiBase + AchievementsPath);
	Request->SetVerb(Verb);
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetHeader(TEXT("X-Boly-Game-Id"), FString::FromInt(GameId));
	Request->SetHeader(TEXT("X-Boly-Key"), Key);
	Request->SetHeader(TEXT("X-Boly-SDK"), FString::Printf(TEXT("unreal/%s"), SdkVersion));
	Request->SetTimeout(RequestTimeoutSeconds);
	return Request;
}

// Con el primer heartbeat valido ya se sabe quien juega: recupera lo pendiente
// de ese alumno, sincroniza y envia.
void UBolySubsystem::StartAchievements()
{
	if (!LearnerId.IsEmpty())
	{
		PendingFile = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Boly"),
			FString::Printf(TEXT("achievements-%d-%s.json"), GameId, *LearnerId));
		LoadPending();
		SavePending();
	}
	bAchievementsSession = true;
	SyncAchievements();
	FlushAchievements();
}

void UBolySubsystem::SyncAchievements()
{
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = MakeAchievementsRequest(TEXT("GET"));
	Request->OnProcessRequestComplete().BindWeakLambda(this, [this](FHttpRequestPtr, FHttpResponsePtr Response, bool bWasSuccessful)
	{
		if (!bWasSuccessful || !Response.IsValid() || Response->GetResponseCode() != 200)
		{
			return;
		}
		TSharedPtr<FJsonObject> Json;
		const TArray<TSharedPtr<FJsonValue>>* List = nullptr;
		if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Response->GetContentAsString()), Json)
			|| !Json.IsValid() || !Json->TryGetArrayField(TEXT("achievements"), List))
		{
			return;
		}
		for (const TSharedPtr<FJsonValue>& Item : *List)
		{
			const TSharedPtr<FJsonObject>* Object = nullptr;
			FString ApiName;
			if (!Item->TryGetObject(Object) || !(*Object)->TryGetStringField(TEXT("api_name"), ApiName))
			{
				continue;
			}
			FAchievementState State;
			(*Object)->TryGetNumberField(TEXT("current"), State.Current);
			(*Object)->TryGetNumberField(TEXT("target"), State.Target);
			(*Object)->TryGetBoolField(TEXT("unlocked"), State.bUnlocked);
			AchievementStates.Add(ApiName, State);
		}
		OnAchievementsSynced.Broadcast();
	});
	Request->ProcessRequest();
}

void UBolySubsystem::FlushAchievements()
{
	if (bFlushing || !bAchievementsSession || bEnding || PendingOps.Num() == 0)
	{
		return;
	}
	bFlushing = true;
	InFlightCount = FMath::Min(MaxBatch, PendingOps.Num());

	FString Body;
	const TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> Writer =
		TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&Body);
	Writer->WriteObjectStart();
	Writer->WriteArrayStart(TEXT("updates"));
	for (int32 i = 0; i < InFlightCount; ++i)
	{
		const FPendingOp& Pending = PendingOps[i];
		Writer->WriteObjectStart();
		Writer->WriteValue(TEXT("api_name"), Pending.ApiName);
		Writer->WriteValue(TEXT("op"), Pending.Op);
		Writer->WriteValue(TEXT("client_event_id"), Pending.ClientEventId);
		if (Pending.bHasValue)
		{
			Writer->WriteValue(TEXT("value"), Pending.Value);
		}
		Writer->WriteObjectEnd();
	}
	Writer->WriteArrayEnd();
	Writer->WriteObjectEnd();
	Writer->Close();

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = MakeAchievementsRequest(TEXT("POST"));
	Request->SetContentAsString(Body);
	Request->OnProcessRequestComplete().BindUObject(this, &UBolySubsystem::OnFlushResponse);
	Request->ProcessRequest();
}

void UBolySubsystem::OnFlushResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	bFlushing = false;
	const int32 Code = (bWasSuccessful && Response.IsValid()) ? Response->GetResponseCode() : 0;

	if (Code == 400)
	{
		// El lote completo es invalido: reintentarlo nunca funcionaria.
		UE_LOG(LogBoly, Error, TEXT("El servidor rechazo un lote de logros (400): %s"), *Response->GetContentAsString());
		RemoveFirstPending(InFlightCount);
		FlushAchievements();
		return;
	}
	if (Code != 200)
	{
		// Sin red, 5xx, 429 o sesion rechazada (403): se conserva y se reintenta
		// con el proximo heartbeat (o en la proxima sesion de este alumno).
		return;
	}

	TArray<TPair<FString, FAchievementState>> Unlocked;
	TSharedPtr<FJsonObject> Json;
	const TArray<TSharedPtr<FJsonValue>>* Results = nullptr;
	if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Response->GetContentAsString()), Json)
		&& Json.IsValid() && Json->TryGetArrayField(TEXT("results"), Results))
	{
		// Cada resultado corresponde, en orden, a una operacion del lote.
		for (int32 i = 0; i < InFlightCount && i < Results->Num(); ++i)
		{
			const TSharedPtr<FJsonObject>* Object = nullptr;
			if (!(*Results)[i]->TryGetObject(Object))
			{
				continue;
			}
			FString ApiName;
			FString Status;
			(*Object)->TryGetStringField(TEXT("api_name"), ApiName);
			(*Object)->TryGetStringField(TEXT("status"), Status);
			if (Status == TEXT("ok") || Status == TEXT("duplicate"))
			{
				FAchievementState State;
				(*Object)->TryGetNumberField(TEXT("current"), State.Current);
				(*Object)->TryGetNumberField(TEXT("target"), State.Target);
				(*Object)->TryGetBoolField(TEXT("unlocked"), State.bUnlocked);
				AchievementStates.Add(ApiName, State);
				bool bNewlyUnlocked = false;
				if ((*Object)->TryGetBoolField(TEXT("newly_unlocked"), bNewlyUnlocked) && bNewlyUnlocked)
				{
					Unlocked.Emplace(ApiName, State);
				}
			}
			else if (Status == TEXT("unknown"))
			{
				UE_LOG(LogBoly, Error, TEXT("El logro \"%s\" no existe en este juego. Revisa el api_name en boly.cl o descarga de nuevo BolyAchievements.h."), *ApiName);
			}
			else if (Status == TEXT("retired"))
			{
				UE_LOG(LogBoly, Warning, TEXT("El logro \"%s\" fue retirado en boly.cl; se ignora."), *ApiName);
			}
			else
			{
				UE_LOG(LogBoly, Error, TEXT("Operacion de logro invalida para \"%s\" (%s)."), *ApiName, *Status);
			}
		}
	}

	RemoveFirstPending(InFlightCount);
	// Despues de sacar el lote de la cola, asi GetPendingAchievementCount ya es el real.
	for (const TPair<FString, FAchievementState>& Entry : Unlocked)
	{
		OnAchievementUnlocked.Broadcast(Entry.Key, Entry.Value.Current, Entry.Value.Target);
	}
	FlushAchievements();
}

void UBolySubsystem::RemoveFirstPending(int32 Count)
{
	PendingOps.RemoveAt(0, FMath::Min(Count, PendingOps.Num()));
	InFlightCount = 0;
	SavePending();
}

void UBolySubsystem::LoadPending()
{
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *PendingFile))
	{
		return;
	}
	TArray<TSharedPtr<FJsonValue>> Saved;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Saved))
	{
		return;
	}

	// Lo pendiente de sesiones anteriores va primero, en su orden original.
	TSet<FString> Current;
	for (const FPendingOp& Pending : PendingOps)
	{
		Current.Add(Pending.ClientEventId);
	}
	TArray<FPendingOp> Older;
	for (const TSharedPtr<FJsonValue>& Item : Saved)
	{
		const TSharedPtr<FJsonObject>* Object = nullptr;
		FPendingOp Pending;
		if (!Item->TryGetObject(Object)
			|| !(*Object)->TryGetStringField(TEXT("client_event_id"), Pending.ClientEventId)
			|| !(*Object)->TryGetStringField(TEXT("api_name"), Pending.ApiName)
			|| !(*Object)->TryGetStringField(TEXT("op"), Pending.Op)
			|| Current.Contains(Pending.ClientEventId))
		{
			continue;
		}
		Pending.bHasValue = (*Object)->TryGetNumberField(TEXT("value"), Pending.Value);
		Older.Add(Pending);
	}
	PendingOps.Insert(Older, 0);
}

void UBolySubsystem::SavePending() const
{
	if (PendingFile.IsEmpty())
	{
		return;
	}
	if (PendingOps.Num() == 0)
	{
		IFileManager::Get().Delete(*PendingFile, false, false, true);
		return;
	}

	FString Text;
	const TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> Writer =
		TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&Text);
	Writer->WriteArrayStart();
	for (const FPendingOp& Pending : PendingOps)
	{
		Writer->WriteObjectStart();
		Writer->WriteValue(TEXT("client_event_id"), Pending.ClientEventId);
		Writer->WriteValue(TEXT("api_name"), Pending.ApiName);
		Writer->WriteValue(TEXT("op"), Pending.Op);
		if (Pending.bHasValue)
		{
			Writer->WriteValue(TEXT("value"), Pending.Value);
		}
		Writer->WriteObjectEnd();
	}
	Writer->WriteArrayEnd();
	Writer->Close();

	IFileManager::Get().MakeDirectory(*FPaths::GetPath(PendingFile), true);
	if (!FFileHelper::SaveStringToFile(Text, *PendingFile))
	{
		UE_LOG(LogBoly, Warning, TEXT("No se pudo guardar la cola de logros."));
	}
}

// true solo si el API es un servidor local (el mock del verifier).
bool UBolySubsystem::IsTestAchievementAllowed() const
{
	if (TestAchievement.IsEmpty())
	{
		return false;
	}
	FString Host;
	if (!ApiBase.Split(TEXT("://"), nullptr, &Host))
	{
		return false;
	}
	Host.Split(TEXT("/"), &Host, nullptr);
	if (Host.StartsWith(TEXT("[")))
	{
		Host.Split(TEXT("]"), &Host, nullptr);
		Host.RemoveFromStart(TEXT("["));
	}
	else
	{
		Host.Split(TEXT(":"), &Host, nullptr);
	}
	return Host == TEXT("localhost") || Host == TEXT("::1") || Host.StartsWith(TEXT("127."));
}
