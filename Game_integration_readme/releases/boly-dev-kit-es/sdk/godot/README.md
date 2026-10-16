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

## Notas

- Corre con `PROCESS_MODE_ALWAYS`: el heartbeat sigue con el árbol en pausa.
- En el editor, sin `-key`, no hace peticiones (`is_editor = true`).
