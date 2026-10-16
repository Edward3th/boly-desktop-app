# Boly SDK — Godot 4

Addon `addons/boly_sdk`. Godot 4.x (GDScript).

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

## Notas

- Corre con `PROCESS_MODE_ALWAYS`: el heartbeat sigue con el árbol en pausa.
- En el editor, sin `-key`, no hace peticiones (`is_editor = true`).
