# Boly SDK — GameMaker

Código GML para GameMaker con runtime 2024+ (usa `call_later`, time sources y
`json_parse`).

> **Estado:** escrito siguiendo el ParamsCatcher de GameMaker, pero aún no
> probado en el motor. Pruébalo con el verifier antes de usarlo en un juego.
> Cuando esté probado se exportará como *Local Package* (`.yymps`) desde el IDE.

## Instalar

1. **Script:** crea un Script llamado `boly_sdk` y pega
   [`scripts/boly_sdk.gml`](scripts/boly_sdk.gml).
2. **Objeto:** crea un objeto `obj_boly` con la casilla **Persistent**
   activada y agrega dos eventos:
   - **Create** → pega [`objects/obj_boly/Create_0.gml`](objects/obj_boly/Create_0.gml)
   - **Async ▸ HTTP** → pega [`objects/obj_boly/Other_62.gml`](objects/obj_boly/Other_62.gml)
3. Coloca una instancia de `obj_boly` en tu **primera** room (arriba del todo
   en el Room Manager).

## Migrar desde el ParamsCatcher

1. Borra `obj_params_catcher`.
2. Si usabas *rm_auth → rm_main*: en el **Creation Code** de la instancia de
   `obj_boly` escribe `room_on_ready = rm_main;`. O deja tu juego en la primera
   room junto a `obj_boly`.

## Uso

```gml
boly_on_ready(function() { empezar_partida(); });
boly_on_session_ended(function(_razon) { guardar_partida(); });
```

| Función | Descripción |
|---|---|
| `boly_is_ready()` / `boly_on_ready(cb)` | La sesión fue validada (desde el IDE, de inmediato). |
| `boly_on_session_ended(cb)` | `cb(razon)` justo antes de cerrar: `BOLY_END_REASON.MISSING_KEY`, `REJECTED`, `UNREACHABLE`. |
| `boly_game_id()`, `boly_session_id()`, `boly_learner_id()`, `boly_has_subscription_access()`, `boly_is_editor()` | Datos de la sesión. |
| `boly_server_now()` | Hora del servidor en segundos Unix (UTC). |

## Guardar la partida por alumno (SDK 0.4+)

Dentro de `boly_on_ready`, usa `boly_save_dir()` o
`boly_save_path("partida.ini")` con `ini_open` y las funciones de archivo.
Se crea `boly_saves/<alumno>/` en el área de guardado; antes de estar listo
se devuelve `""`. Desde el IDE usa `editor`; sin `learner_id` se usa
`_sin_alumno`. Las partidas anteriores quedan intactas. Comprueba la creación
de carpetas con el sandbox de tu runtime; ver `BOLY_SDK.md` §9.

## Logros (SDK 0.2+)

1. Define los logros en **boly.cl ▸ Panel de desarrollador ▸ tu juego ▸
   Gestionar logros**: nombre, cómo se consigue, meta (1 = de una vez) y la
   clave `api_name`.
2. En esa misma página, **Descargar constantes ▸ GameMaker** y agrega
   `boly_achievements.gml` a tu proyecto, en un Script con ese nombre.
3. Reporta el progreso desde tu código:

```gml
boly_achievement_unlock(BOLY_ACH_NIVEL_5_COMPLETO);
boly_achievement_increment(BOLY_ACH_RESPONDER_100);       // +1
boly_achievement_set(BOLY_ACH_ESTRELLAS, 12);             // nunca baja

boly_on_achievement_unlocked(function(_id, _actual, _meta) { mostrar_popup(_id); });
```

| Función | Descripción |
|---|---|
| `boly_achievement_unlock(id)` / `boly_achievement_increment(id, n = 1)` / `boly_achievement_set(id, v)` | Reportan progreso. No bloquean ni fallan: se encolan. |
| `boly_on_achievement_unlocked(cb)` | `cb(api_name, current, target)` cuando el servidor confirma un desbloqueo nuevo. |
| `boly_on_achievements_synced(cb)` | Llegó el estado de los logros al iniciar la sesión. |
| `boly_achievement_is_unlocked(id)`, `boly_achievement_get(id)` | Estado conocido (`{ current, target, unlocked }`). |
| `boly_achievement_pending()` | Operaciones que el servidor aún no confirma. |

Cómo se envían:
- Cada operación se guarda en una cola en disco (un archivo `boly_achievements_<juego>_<alumno>.json` en el área de guardado del juego), **separada por
  alumno**: en un PC compartido, lo pendiente de un alumno solo se envía cuando
  ese mismo alumno vuelve a jugar.
- Sin conexión se reintenta en cada heartbeat; si el juego se cierra, se envía
  en la próxima sesión. Los reintentos nunca cuentan dos veces.
- Un `api_name` mal escrito aparece como error en el log (`[Boly] El logro
  "..." no existe en este juego`).
- **Desde el IDE** no se envía nada: un unlock dispara el aviso de desbloqueo
  localmente para que puedas probar tu popup.
- Para volver a probar un desbloqueo con tu cuenta, usa **Borrar mi progreso
  de prueba** en la página de logros de boly.cl.

> **Estado:** escrito siguiendo el SDK de Unity (que sí está verificado), pero
> aún sin probar en GameMaker. Pásalo por el verifier (escenario 6) antes de publicarlo.

## Aviso de Boly (SDK 0.3+)

Cuando el servidor confirma un desbloqueo, la app de Boly muestra un aviso
tipo Steam encima del juego. El SDK le avisa por la carpeta que la app pasa en
`-boly_events_dir`; no hay nada que programar, y el evento de desbloqueo del
SDK sigue disponible para efectos dentro del juego.

Activa **Game Options ▸ Windows ▸ General ▸ Disable file system sandbox**: con el sandbox, GameMaker no puede escribir el aviso fuera de su área de guardado y no aparece (el juego funciona igual). Usa ventana o pantalla completa sin bordes.

## Logros declarados en la build

En vez de crearlos en boly.cl, el juego puede traer sus logros en una carpeta
`boly/` (`achievements.json` + `icons/`). Guárdala fuera de los assets del
proyecto y **cópiala a mano junto al `.exe`** del build antes de comprimirlo.
Al subir la build, Boly crea los logros nuevos como borradores y los activa
cuando la build se aprueba.

Valida el archivo y genera las constantes con el verificador del kit:
`boly-verify-win.exe manifest <carpeta del build> --constants gamemaker`.
Formato completo: [`spec/ACHIEVEMENTS_MANIFEST.md`](../spec/ACHIEVEMENTS_MANIFEST.md).

## Notas

- "Modo editor" = correr desde el IDE (`GM_build_type == "run"`) sin `-key`.
- `http_request` no tiene timeout configurable: un latido sin respuesta durante
  todo un intervalo cuenta como fallo transitorio y se envía uno nuevo.
