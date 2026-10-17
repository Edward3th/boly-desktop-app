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
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FBolyAchievementUnlockedSignature, const FString&, ApiName, int32, Current, int32, Target);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FBolyAchievementsSyncedSignature);

// Boly SDK para Unreal. Un UGameInstanceSubsystem se crea solo con el
// GameInstance y persiste entre niveles; el heartbeat usa FTSTicker (global,
// no atado a un UWorld), asi que sigue corriendo tras OpenLevel. No hay que
// colocar nada en la escena. Contrato: spec/PROTOCOL.md.
//
// Uso tipico (C++):
//   UBolySubsystem* Boly = GetGameInstance()->GetSubsystem<UBolySubsystem>();
//   if (Boly->IsReady()) Empezar(); else Boly->OnReady.AddDynamic(this, &AMiActor::Empezar);
//   Boly->UnlockAchievement(BolyAchievements::NIVEL_5_COMPLETO);
// En Blueprint: "Get Game Instance Subsystem" (Boly Subsystem) > Bind Event to On Ready.
UCLASS()
class BOLYSDK_API UBolySubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	static constexpr const TCHAR* SdkVersion = TEXT("0.3.0");

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

	// ── Logros (spec/PROTOCOL.md §5) ───────────────────────────────────────
	// Se definen en boly.cl (panel > juego > logros); descarga alli
	// BolyAchievements.h para no escribir los nombres a mano. Las llamadas
	// nunca bloquean: se guardan en una cola en disco (separada por alumno) y
	// se envian apenas hay sesion y red, sin contar dos veces al reintentar.

	// Desbloquea el logro (lleva el progreso a la meta).
	UFUNCTION(BlueprintCallable, Category = "Boly|Achievements")
	void UnlockAchievement(const FString& ApiName);

	// Suma Amount al progreso (ej. una respuesta correcta mas).
	UFUNCTION(BlueprintCallable, Category = "Boly|Achievements")
	void IncrementAchievement(const FString& ApiName, int32 Amount = 1);

	// Fija el progreso en Value (ej. estrellas acumuladas). Nunca baja.
	UFUNCTION(BlueprintCallable, Category = "Boly|Achievements")
	void SetAchievementProgress(const FString& ApiName, int32 Value);

	UFUNCTION(BlueprintPure, Category = "Boly|Achievements")
	bool IsAchievementUnlocked(const FString& ApiName) const;

	// Progreso y meta conocidos; false si el logro aun no se conoce.
	UFUNCTION(BlueprintPure, Category = "Boly|Achievements")
	bool GetAchievementProgress(const FString& ApiName, int32& Current, int32& Target) const;

	// Operaciones que el servidor aun no confirma.
	UFUNCTION(BlueprintPure, Category = "Boly|Achievements")
	int32 GetPendingAchievementCount() const { return PendingOps.Num(); }

	// El servidor confirmo un logro recien desbloqueado (una vez por logro y
	// jugador): buen momento para un popup.
	UPROPERTY(BlueprintAssignable, Category = "Boly|Achievements")
	FBolyAchievementUnlockedSignature OnAchievementUnlocked;

	// Llego el estado de los logros desde el servidor, al iniciar la sesion.
	UPROPERTY(BlueprintAssignable, Category = "Boly|Achievements")
	FBolyAchievementsSyncedSignature OnAchievementsSynced;

private:
	// La UNICA credencial. -token (JWT legado) se ignora a proposito: no se
	// parsea, no se guarda y nunca se reenvia.
	FString Key;
	int32 GameId = 0;
	// Solo para pruebas: el verifier los envia, el launcher de produccion no.
	FString ApiBase = TEXT("https://ffstudios-shop-api.vercel.app");
	float HeartbeatSeconds = 60.0f;
	// Solo para el verifier: logro a desbloquear apenas la sesion este lista.
	// Se ignora salvo que ApiBase apunte a este mismo equipo.
	FString TestAchievement;
	// Carpeta donde avisar a la app de Boly de cada desbloqueo, para su aviso
	// tipo Steam (spec/PROTOCOL.md §5.1). Vacia si la app no la paso.
	FString EventsDir;

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

	struct FPendingOp
	{
		FString ClientEventId;
		FString ApiName;
		FString Op;
		int32 Value = 0;
		bool bHasValue = false;
	};

	struct FAchievementState
	{
		int32 Current = 0;
		int32 Target = 1;
		bool bUnlocked = false;
	};

	// Cola guardada en Saved/Boly por juego y por alumno: en un PC compartido,
	// lo pendiente de un alumno solo se envia en una sesion de ese alumno.
	TArray<FPendingOp> PendingOps;
	TMap<FString, FAchievementState> AchievementStates;
	FString PendingFile;
	bool bAchievementsSession = false;
	bool bFlushing = false;
	int32 InFlightCount = 0;

	void ReportAchievement(const FString& ApiName, const FString& Op, int32 Value, bool bHasValue);
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> MakeAchievementsRequest(const FString& Verb) const;
	void StartAchievements();
	void SyncAchievements();
	void FlushAchievements();
	void OnFlushResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void RemoveFirstPending(int32 Count);
	void LoadPending();
	void SavePending() const;
	void WriteAppNotice(const FString& ApiName, int32 Current, int32 Target) const;
	bool IsTestAchievementAllowed() const;

	void ParseCommandLine();
	bool Tick(float DeltaTime);
	void SendHeartbeat();
	void OnHeartbeatResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void ApplyResponse(const FString& Body);
	void BecomeReady();
	void EndSession(EBolyEndReason Reason);
};
