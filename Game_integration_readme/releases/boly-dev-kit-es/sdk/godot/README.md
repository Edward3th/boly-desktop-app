# Boly SDK — Godot 4

Addon `addons/boly_sdk`. Godot 4.x (GDScript). Versión 0.3.1: qué cambió respecto de 0.3.0 en [`CAMBIOS_0.3.1.md`](CAMBIOS_0.3.1.md).

> **Estado:** escrito siguiendo el ParamsCatcher de Godot, pero aún no
> probado en el motor. Pruébalo con el verifier antes de usarlo en un juego.

## Instalar

1. Copia la carpeta `addons/boly_sdk` dentro de tu proyecto (`res://addons/boly_sdk`).
2. **Proyecto ▸ Configuración del proyecto ▸ Plugins** y activa **Boly SDK**.
   Eso registra el autoload `Boly` y el ajuste `boly/scene_on_ready`.

No hay que agregar nada a la escena: el autoload corre antes de la primera
escena y sobrevive a `change_scene_to_file()`.

## Migrar desde el ParamsCatcher

1. Borra el nodo con `ParamsCatcher.gd`.
2. Si usabas el flujo *AuthScene → MainGame*: en **Configuración del proyecto ▸
   boly ▸ scene_on_ready** elige `res://MainGame.tscn`. O deja tu juego como
   escena principal.

## Uso

```gdscript
func _ready():
    if Boly.is_ready:
        _empezar()
    else:
        Boly.session_ready.connect(_empezar)
    Boly.session_ended.connect(func(_razon): _guardar_partida())
```

| Miembro | Descripción |
|---|---|
| `Boly.is_ready` / `session_ready` | La sesión fue validada (en el editor, de inmediato). |
| `Boly.session_ended(reason)` | Justo antes de cerrar: `Boly.EndReason.MISSING_KEY`, `REJECTED`, `UNREACHABLE`. |
| `Boly.game_id`, `session_id`, `learner_id`, `subscription_access`, `is_editor` | Datos de la sesión. |
| `Boly.server_now_unix()` | Hora del servidor en segundos Unix (UTC). |

## Logros (SDK 0.2+)

1. Define los logros en **boly.cl ▸ Panel de desarrollador ▸ tu juego ▸
   Gestionar logros**: nombre, cómo se consigue, meta (1 = de una vez) y la
   clave `api_name`.
2. En esa misma página, **Descargar constantes ▸ Godot** y agrega
   `boly_achievements.gd` a tu proyecto.
3. Reporta el progreso desde tu código:

```gdscript
Boly.unlock_achievement(BolyAchievements.NIVEL_5_COMPLETO)
Boly.increment_achievement(BolyAchievements.RESPONDER_100)       # +1
Boly.set_achievement_progress(BolyAchievements.ESTRELLAS, 12)    # nunca baja

Boly.achievement_unlocked.connect(func(id, _actual, _meta): _mostrar_popup(id))
```

| Miembro | Descripción |
|---|---|
| `unlock_achievement(id)` / `increment_achievement(id, n = 1)` / `set_achievement_progress(id, v)` | Reportan progreso. No bloquean ni fallan: se encolan. |
| `achievement_unlocked(api_name, current, target)` | El servidor confirmó un desbloqueo nuevo (una vez por logro y jugador). |
| `achievements_synced` / `achievements_in_sync` | Llegó el estado de los logros al iniciar la sesión. |
| `is_achievement_unlocked(id)`, `get_achievement(id)` | Estado conocido (`{"current", "target", "unlocked"}`). |
| `pending_achievements()` | Operaciones que el servidor aún no confirma. |

Cómo se envían:
- Cada operación se guarda en una cola en disco (`user://boly/`), **separada por
  alumno**: en un PC compartido, lo pendiente de un alumno solo se envía cuando
  ese mismo alumno vuelve a jugar.
- Sin conexión se reintenta en cada heartbeat; si el juego se cierra, se envía
  en la próxima sesión. Los reintentos nunca cuentan dos veces.
- Un `api_name` mal escrito aparece como error en el log (`[Boly] El logro
  "..." no existe en este juego`).
- **En el editor** no se envía nada: un unlock dispara el aviso de desbloqueo
  localmente para que puedas probar tu popup.
- Para volver a probar un desbloqueo con tu cuenta, usa **Borrar mi progreso
  de prueba** en la página de logros de boly.cl.

> **Estado:** escrito siguiendo el SDK de Unity (que sí está verificado), pero
> aún sin probar en Godot. Pásalo por el verifier (escenario 6) antes de publicarlo.

## Aviso de Boly (SDK 0.3+)

Cuando el servidor confirma un desbloqueo, la app de Boly muestra un aviso
tipo Steam encima del juego. El SDK le avisa por la carpeta que la app pasa en
`-boly_events_dir`; no hay nada que programar, y el evento de desbloqueo del
SDK sigue disponible para efectos dentro del juego.

Usa el modo **Fullscreen**, no *Exclusive Fullscreen*: sobre la pantalla completa exclusiva ninguna ventana se ve.

## Logros declarados en la build

En vez de crearlos en boly.cl, el juego puede traer sus logros en
`res://boly/achievements.json` (con los íconos en `res://boly/icons/`). Crea
también un archivo vacío `res://boly/.gdignore`, para que Godot no importe los
íconos ni los meta en el `.pck`. Al exportar, el SDK copia la carpeta junto al
ejecutable (`EditorExportPlugin`), así el zip que subes ya la lleva. Al subir la
build, Boly crea los logros nuevos como borradores y los activa cuando la
build se aprueba.

En el editor, reportar un `api_name` que no está en el archivo muestra un
aviso en el log.

Valida el archivo y genera las constantes con el verificador del kit:
`boly-verify-win.exe manifest <carpeta del build> --constants godot`.
Formato completo: [`spec/ACHIEVEMENTS_MANIFEST.md`](../spec/ACHIEVEMENTS_MANIFEST.md).

## Notas

- Corre con `PROCESS_MODE_ALWAYS`: el heartbeat sigue con el árbol en pausa.
- En el editor, sin `-key`, no hace peticiones (`is_editor = true`).
