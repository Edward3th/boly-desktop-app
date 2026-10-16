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

## Notas

- En PIE sin `-key` no hace peticiones. Ojo: *Standalone Game* lanzado desde el
  editor no es PIE y se cierra por falta de `-key`.
- Si falta `-key` al arrancar todavía no hay PlayerController, así que el SDK
  pide la salida con `FPlatformMisc::RequestExit` (el `QuitGame` del antiguo
  ValidationSubsystem no hacía nada en ese momento).
