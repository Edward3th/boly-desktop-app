# Boly SDK — Unreal 5

Plugin `BolySDK` (módulo Runtime, C++ y Blueprint). Unreal Engine 5.x.

> **Estado:** revisado contra los headers de UE 5.3, pero aún **no compilado**
> (el equipo donde se escribió no tiene Visual Studio con C++). Compílalo y
> pásalo por el verifier antes de usarlo en un juego.

## Instalar

1. Copia la carpeta `BolySDK` a `TuProyecto/Plugins/BolySDK`.
2. Regenera los archivos del proyecto y compila. El plugin queda activo.

No hay que colocar nada en el nivel: `UBolySubsystem` es un
`UGameInstanceSubsystem` que se crea solo y persiste entre niveles.

## Migrar desde el ValidationSubsystem (ParamsCatcher)

1. Borra `ValidationSubsystem.h/.cpp` y quita `HTTP`, `Json`, `JsonUtilities`
   de tu `.Build.cs` si solo los usabas para eso.
2. Si usabas *AuthMap → MainLevel*: **Project Settings ▸ Plugins ▸ Boly SDK ▸
   Level On Ready** = `MainLevel`. O deja tu nivel principal como Startup Map.

## Uso

```cpp
#include "BolySubsystem.h"

UBolySubsystem* Boly = GetGameInstance()->GetSubsystem<UBolySubsystem>();
if (Boly->IsReady()) Empezar();
else Boly->OnReady.AddDynamic(this, &AMiActor::Empezar);   // UFUNCTION()
Boly->OnSessionEnded.AddDynamic(this, &AMiActor::Guardar);  // UFUNCTION() void Guardar(EBolyEndReason)
```

En Blueprint: **Get Game Instance Subsystem (Boly Subsystem)** ▸ *Is Ready*,
*Bind Event to On Ready*, *Bind Event to On Session Ended*.

| Miembro | Descripción |
|---|---|
| `IsReady()` / `OnReady` | La sesión fue validada (en PIE, de inmediato). |
| `OnSessionEnded(EBolyEndReason)` | Justo antes de cerrar: `MissingKey`, `Rejected`, `Unreachable`. |
| `GetGameId()`, `GetSessionId()`, `GetLearnerId()`, `HasSubscriptionAccess()`, `IsEditorSession()` | Datos de la sesión. |
| `GetServerNow()` | Hora del servidor (UTC). |

## Logros (SDK 0.2+)

1. Define los logros en **boly.cl ▸ Panel de desarrollador ▸ tu juego ▸
   Gestionar logros**: nombre, cómo se consigue, meta (1 = de una vez) y la
   clave `api_name`.
2. En esa misma página, **Descargar constantes ▸ Unreal** y agrega
   `BolyAchievements.h` a tu proyecto.
3. Reporta el progreso desde tu código:

```cpp
#include "BolyAchievements.h"

Boly->UnlockAchievement(BolyAchievements::NIVEL_5_COMPLETO);
Boly->IncrementAchievement(BolyAchievements::RESPONDER_100);      // +1
Boly->SetAchievementProgress(BolyAchievements::ESTRELLAS, 12);    // nunca baja

Boly->OnAchievementUnlocked.AddDynamic(this, &AMiActor::MostrarPopup); // UFUNCTION() void MostrarPopup(const FString&, int32, int32)
```

En Blueprint: nodos **Unlock Achievement**, **Increment Achievement**, **Set
Achievement Progress** y el evento **On Achievement Unlocked** (categoría
*Boly | Achievements*).

| Miembro | Descripción |
|---|---|
| `UnlockAchievement(Id)` / `IncrementAchievement(Id, N = 1)` / `SetAchievementProgress(Id, V)` | Reportan progreso. No bloquean ni fallan: se encolan. |
| `OnAchievementUnlocked(ApiName, Current, Target)` | El servidor confirmó un desbloqueo nuevo (una vez por logro y jugador). |
| `OnAchievementsSynced` | Llegó el estado de los logros al iniciar la sesión. |
| `IsAchievementUnlocked(Id)`, `GetAchievementProgress(Id, Current, Target)` | Estado conocido. |
| `GetPendingAchievementCount()` | Operaciones que el servidor aún no confirma. |

Cómo se envían:
- Cada operación se guarda en una cola en disco (`Saved/Boly/`), **separada por
  alumno**: en un PC compartido, lo pendiente de un alumno solo se envía cuando
  ese mismo alumno vuelve a jugar.
- Sin conexión se reintenta en cada heartbeat; si el juego se cierra, se envía
  en la próxima sesión. Los reintentos nunca cuentan dos veces.
- Un `api_name` mal escrito aparece como error en el log (`[Boly] El logro
  "..." no existe en este juego`).
- **En PIE** no se envía nada: un unlock dispara el aviso de desbloqueo
  localmente para que puedas probar tu popup.
- Para volver a probar un desbloqueo con tu cuenta, usa **Borrar mi progreso
  de prueba** en la página de logros de boly.cl.

> **Estado:** escrito siguiendo el SDK de Unity (que sí está verificado), pero
> aún sin compilar. Pásalo por el verifier (escenario 6) antes de publicarlo.

## Notas

- En PIE sin `-key` no hace peticiones. Ojo: *Standalone Game* lanzado desde el
  editor no es PIE y se cierra por falta de `-key`.
- Si falta `-key` al arrancar todavía no hay PlayerController, así que el SDK
  pide la salida con `FPlatformMisc::RequestExit` (el `QuitGame` del antiguo
  ValidationSubsystem no hacía nada en ese momento).
