#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Containers/Ticker.h"
#include "Interfaces/IHttpRequest.h"
#include "BolySubsystem.generated.h"

// Por que termino la sesion. El SDK cierra el juego justo despues de avisar.
UENUM(BlueprintType)
enum class EBolyEndReason : uint8
{
	// Build lanzado sin -key (no vino desde la app de Boly).
	MissingKey,
	// 403 (reemplazada, expirada, sin acceso) o fallo la validacion inicial.
	Rejected,
	// 4 heartbeats seguidos sin respuesta valida.
	Unreachable
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FBolyReadySignature);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FBolySessionEndedSignature, EBolyEndReason, Reason);

// Boly SDK para Unreal. Un UGameInstanceSubsystem se crea solo con el
// GameInstance y persiste entre niveles; el heartbeat usa FTSTicker (global,
// no atado a un UWorld), asi que sigue corriendo tras OpenLevel. No hay que
// colocar nada en la escena. Contrato: spec/PROTOCOL.md.
//
// Uso tipico (C++):
//   UBolySubsystem* Boly = GetGameInstance()->GetSubsystem<UBolySubsystem>();
//   if (Boly->IsReady()) Empezar(); else Boly->OnReady.AddDynamic(this, &AMiActor::Empezar);
// En Blueprint: "Get Game Instance Subsystem" (Boly Subsystem) > Bind Event to On Ready.
UCLASS()
class BOLYSDK_API UBolySubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	static constexpr const TCHAR* SdkVersion = TEXT("0.1.0");

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// true desde el primer heartbeat valido (o de inmediato en el editor).
	UFUNCTION(BlueprintPure, Category = "Boly")
	bool IsReady() const { return bReady; }

	// Id del juego en Boly (llega por -game_id).
	UFUNCTION(BlueprintPure, Category = "Boly")
	int32 GetGameId() const { return GameId; }

	// Id de esta sesion de juego. Vacio en el editor o si el servidor no lo informa.
	UFUNCTION(BlueprintPure, Category = "Boly")
	FString GetSessionId() const { return SessionId; }

	// Id seudonimo y estable del alumno. No identifica a la persona.
	UFUNCTION(BlueprintPure, Category = "Boly")
	FString GetLearnerId() const { return LearnerId; }

	// true si el acceso viene de una suscripcion activa.
	UFUNCTION(BlueprintPure, Category = "Boly")
	bool HasSubscriptionAccess() const { return bSubscriptionAccess; }

	// true al correr en el editor (PIE) sin -key: sin red ni sesion real.
	UFUNCTION(BlueprintPure, Category = "Boly")
	bool IsEditorSession() const { return bEditorSession; }

	// Hora del servidor (UTC), corregida con el reloj local desde el ultimo
	// heartbeat. Antes del primero devuelve la hora local en UTC.
	UFUNCTION(BlueprintPure, Category = "Boly")
	FDateTime GetServerNow() const;

	// Se dispara una vez, con el primer heartbeat valido. Si te suscribes
	// tarde, revisa IsReady primero.
	UPROPERTY(BlueprintAssignable, Category = "Boly")
	FBolyReadySignature OnReady;

	// Se dispara justo antes de cerrar el juego. Ultima oportunidad para guardar.
	UPROPERTY(BlueprintAssignable, Category = "Boly")
	FBolySessionEndedSignature OnSessionEnded;

private:
	// La UNICA credencial. -token (JWT legado) se ignora a proposito: no se
	// parsea, no se guarda y nunca se reenvia.
	FString Key;
	int32 GameId = 0;
	// Solo para pruebas: el verifier los envia, el launcher de produccion no.
	FString ApiBase = TEXT("https://ffstudios-shop-api.vercel.app");
	float HeartbeatSeconds = 60.0f;

	FString SessionId;
	FString LearnerId;
	bool bSubscriptionAccess = false;
	bool bEditorSession = false;
	bool bReady = false;
	bool bFirstValidation = true;
	bool bRequestInFlight = false;
	bool bEnding = false;
	int32 ConsecutiveFailures = 0;
	float TimeSinceLastBeat = 0.0f;

	bool bHasServerTime = false;
	FDateTime ServerTimeAtSync;
	double PlatformSecondsAtSync = 0.0;

	FTSTicker::FDelegateHandle TickerHandle;

	void ParseCommandLine();
	bool Tick(float DeltaTime);
	void SendHeartbeat();
	void OnHeartbeatResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void ApplyResponse(const FString& Body);
	void BecomeReady();
	void EndSession(EBolyEndReason Reason);
};
