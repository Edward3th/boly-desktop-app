# Boly SDK — Unity

Paquete UPM `cl.boly.sdk`. Unity 2021.3 LTS o superior.

## Instalar

Copia la carpeta `cl.boly.sdk` (del kit de integración o de este repo) dentro
de la carpeta `Packages/` de tu proyecto, para que quede
`Packages/cl.boly.sdk/package.json`. Unity la detecta sola y el paquete queda
versionado junto a tu proyecto. Conserva los `.meta`.

Con acceso al repo (privado) también puedes usar **Window ▸ Package Manager ▸
+ ▸ Add package from git URL…** con:

```
https://github.com/Edward3th/boly-sdk.git?path=unity/cl.boly.sdk
```

No hay que agregar nada a la escena: el SDK se crea solo antes de la primera
escena y sobrevive a los cambios de escena.

## Migrar desde el ParamsCatcher

1. Borra `ParamsCatcher.cs` y su GameObject.
2. Si usabas el flujo *AuthScene → MainGame*: menú **Boly ▸ Settings** y pon
   **Scene On Ready** en el índice de la escena principal (antes, `1`). O
   elimina la AuthScene y deja tu juego como escena 0.
3. Compila y prueba con el verifier.

## Uso

```csharp
using Boly;

void Awake()
{
    if (BolySDK.IsReady) Empezar();
    else BolySDK.OnReady += Empezar;

    BolySDK.OnSessionEnded += razon => GuardarPartida();
}
```

| Miembro | Descripción |
|---|---|
| `BolySDK.IsReady` / `OnReady` | La sesión fue validada (en el editor, de inmediato). |
| `BolySDK.OnSessionEnded(BolyEndReason)` | Justo antes de cerrar el juego: `MissingKey`, `Rejected`, `Unreachable`. |
| `BolySDK.Session` | `GameId`, `SessionId`, `LearnerId`, `SubscriptionAccess`, `IsEditor`. |
| `BolySDK.ServerNow` | Hora del servidor (UTC). |

## Logros (SDK 0.2+)

1. Define los logros en **boly.cl ▸ Panel de desarrollador ▸ tu juego ▸
   Gestionar logros**: nombre, cómo se consigue, meta (1 = de una vez) y la
   clave `api_name`.
2. En esa misma página, **Descargar constantes ▸ Unity** y agrega
   `BolyAchievements.cs` a tu proyecto.
3. Reporta el progreso desde tu código:

```csharp
using Boly;

BolySDK.Achievements.Unlock(BolyAchievements.NIVEL_5_COMPLETO);
BolySDK.Achievements.Increment(BolyAchievements.RESPONDER_100);      // +1
BolySDK.Achievements.SetProgress(BolyAchievements.ESTRELLAS, 12);    // nunca baja

BolySDK.Achievements.OnUnlocked += logro => MostrarPopup(logro.ApiName);
```

| Miembro | Descripción |
|---|---|
| `Unlock(id)` / `Increment(id, n = 1)` / `SetProgress(id, v)` | Reportan progreso. No bloquean ni fallan: se encolan. |
| `OnUnlocked(BolyAchievementState)` | El servidor confirmó un desbloqueo nuevo (una vez por logro y jugador). |
| `OnSynced` / `IsSynced` | Llegó el estado de los logros al iniciar la sesión. |
| `IsUnlocked(id)`, `TryGetState(id, out state)` | Estado conocido (`Current`, `Target`, `Unlocked`). |
| `PendingCount` | Operaciones que el servidor aún no confirma. |

Cómo se envían:
- Cada operación se guarda en una cola en disco
  (`Application.persistentDataPath/boly/`), **separada por alumno**: en un PC
  compartido, lo pendiente de un alumno solo se envía cuando ese mismo alumno
  vuelve a jugar.
- Sin conexión se reintenta en cada heartbeat; si el juego se cierra, se envía
  en la próxima sesión. Los reintentos nunca cuentan dos veces.
- Un `api_name` mal escrito aparece como error en la consola (`[Boly] El logro
  "..." no existe en este juego`).
- **En el editor** no se envía nada: `Unlock` dispara `OnUnlocked` localmente
  para que puedas probar tu popup.
- Para volver a probar un desbloqueo con tu cuenta, usa **Borrar mi progreso
  de prueba** en la página de logros de boly.cl.

## Configuración (Boly ▸ Settings)

| Campo | Default | |
|---|---|---|
| Enabled In Builds | ✔ | Desactívalo solo en builds que no van a Boly (un build sin `-key` se cierra). |
| Scene On Ready | -1 | Escena a cargar cuando la sesión queda lista. |

## Notas

- En el editor, sin `-key`, el SDK no hace peticiones y `Session.IsEditor` es `true`.
- El heartbeat usa `WaitForSecondsRealtime`: sigue con `Time.timeScale = 0`.
- Los `.meta` del paquete están versionados: no los borres (Unity los exige en
  paquetes instalados por git).
