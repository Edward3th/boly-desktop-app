// Guarda este archivo como ValidationSubsystem.cpp

#include "ValidationSubsystem.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"

void UValidationSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    ParseCommandLine();

    // La key es obligatoria; sin ella no hay sesion.
    if (Key.IsEmpty() || GameId < 0)
    {
        UE_LOG(LogTemp, Error, TEXT("Validation error: missing -key"));
        QuitGame();
        return;
    }

    // Validacion inicial
    SendValidationRequest();

    // Heartbeat con FTSTicker: ticker GLOBAL, no atado a un UWorld. Sobrevive a
    // OpenLevel (a diferencia de un timer del World o de un AActor), por lo que
    // el heartbeat sigue corriendo durante toda la sesion.
    TickerHandle = FTSTicker::GetCoreTicker().AddTicker(
        FTickerDelegate::CreateUObject(this, &UValidationSubsystem::Tick), 0.0f);
}

void UValidationSubsystem::Deinitialize()
{
    if (TickerHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(TickerHandle);
        TickerHandle.Reset();
    }
    Super::Deinitialize();
}

bool UValidationSubsystem::Tick(float DeltaTime)
{
    TimeSinceLastBeat += DeltaTime;
    if (TimeSinceLastBeat >= HeartbeatSeconds)
    {
        TimeSinceLastBeat = 0.0f;
        SendValidationRequest();
    }
    return true; // seguir tickeando
}

void UValidationSubsystem::ParseCommandLine()
{
    // El launcher de Boly envia los argumentos separados por ESPACIO
    // ("-game_id <int> -key <hex>"), no en formato "-key=valor". FParse::Value
    // solo entiende el formato con "=", asi que tokenizamos a mano.
    //
    // El launcher todavia envia -token (JWT) por compatibilidad con juegos
    // antiguos, pero aqui lo IGNORAMOS a proposito: no se parsea, no se guarda
    // y nunca se reenvia. No agregues codigo que lo use.
    TArray<FString> Tokens;
    FString CmdLine = FCommandLine::Get();
    CmdLine.ParseIntoArray(Tokens, TEXT(" "), /*CullEmpty=*/true);

    for (int32 i = 0; i < Tokens.Num() - 1; ++i)
    {
        if (Tokens[i].Equals(TEXT("-key"), ESearchCase::IgnoreCase))
        {
            Key = Tokens[i + 1];
        }
        else if (Tokens[i].Equals(TEXT("-game_id"), ESearchCase::IgnoreCase))
        {
            GameId = FCString::Atoi(*Tokens[i + 1]);
        }
        // Opcionales SOLO para pruebas (los envia el verifier, no el launcher).
        else if (Tokens[i].Equals(TEXT("-api_base"), ESearchCase::IgnoreCase))
        {
            ApiBase = Tokens[i + 1];
            ApiBase.RemoveFromEnd(TEXT("/"));
        }
        else if (Tokens[i].Equals(TEXT("-heartbeat_seconds"), ESearchCase::IgnoreCase))
        {
            HeartbeatSeconds = FCString::Atof(*Tokens[i + 1]);
        }
    }
}

void UValidationSubsystem::SendValidationRequest()
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(ApiBase + TEXT("/v1/validate/validate"));
    Request->SetVerb("POST");
    Request->SetHeader("Content-Type", "application/json");
    // Sin header Authorization: la key es la credencial.

    // Body en JSON: solo game_id + key (sin token).
    FString JsonBody = FString::Printf(
        TEXT("{\"game_id\": %d, \"key\": \"%s\"}"),
        GameId,
        *Key
    );

    Request->SetContentAsString(JsonBody);
    Request->OnProcessRequestComplete().BindUObject(this, &UValidationSubsystem::OnResponseReceived);
    Request->ProcessRequest();
}

void UValidationSubsystem::OnResponseReceived(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
    const int32 Code = (bWasSuccessful && Response.IsValid()) ? Response->GetResponseCode() : 0;

    if (Code == 200)
    {
        ConsecutiveFailures = 0;
        if (bFirstValidation)
        {
            bFirstValidation = false;
            UGameplayStatics::OpenLevel(GetGameInstance(), TEXT("MainLevel"));
        }
        return;
    }

    // 403 = sesion invalida / superada / expirada / acceso perdido -> cerrar.
    // Tambien cerramos si falla la validacion inicial.
    if (Code == 403 || bFirstValidation)
    {
        UE_LOG(LogTemp, Error, TEXT("Validation failed: %d"), Code);
        QuitGame();
        return;
    }

    // Error de red transitorio en un heartbeat: tolerar varios fallos seguidos
    // (una conexion inestable puede fallar 1-2 latidos sin estar realmente caida).
    if (++ConsecutiveFailures >= 4)
    {
        UE_LOG(LogTemp, Error, TEXT("Validation failed (network): %d"), Code);
        QuitGame();
    }
}

void UValidationSubsystem::QuitGame()
{
    if (UGameInstance* GI = GetGameInstance())
    {
        UKismetSystemLibrary::QuitGame(GI->GetWorld(), nullptr, EQuitPreference::Quit, false);
    }
}
