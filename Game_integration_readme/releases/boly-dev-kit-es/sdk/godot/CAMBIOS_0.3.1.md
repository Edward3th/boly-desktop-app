# Boly SDK Godot · 0.3.0 → 0.3.1

Fecha: 19-10-2026. Solo cambia el SDK de **Godot** (`addons/boly_sdk/boly.gd` y
`plugin.cfg`). Unity, Unreal y GameMaker siguen en 0.3.0. El protocolo con el
servidor no cambia.

## El error

Al empezar la sesión, el SDK pide el estado de los logros con un
`GET /v1/lumen/achievements` por su `HTTPRequest` de logros. Si el juego
reportaba un logro **mientras ese GET seguía en vuelo**, el SDK intentaba un
`POST` por el mismo `HTTPRequest`. Godot solo atiende una petición a la vez por
`HTTPRequest`, así que la llamada fallaba con:

```
HTTPRequest is processing a request. Wait for completion or cancel it before attempting a new one.
```

Pasaba siempre con el verificador (`-boly_test_achievement` se desbloquea justo
cuando arranca el GET) y en cualquier juego que desbloquee un logro en los
primeros segundos de la sesión (por ejemplo, al cargar la partida en
`session_ready`).

Consecuencias en 0.3.0:

- Un error rojo en el log del juego en cada arranque afectado.
- El logro **no se perdía**: quedaba en la cola y salía cuando terminaba el GET.
  Por eso el verificador daba PASS igual.
- Se gastaba un intento de envío fallido, y el resultado dependía de cuánto
  tardara el servidor en responder el GET.

## El arreglo

`boly.gd` tiene una bandera nueva, `_syncing`, que vale `true` mientras el GET
inicial está en vuelo:

```gdscript
# _start_achievements()
_achievements_session = true
_syncing = true
await _sync_achievements()
_syncing = false
await _flush_achievements()

# _flush_achievements()
if _flushing or _syncing or not _achievements_session:
    return
```

Mientras dura la sincronización no se envía ningún `POST`. Lo que el juego
reporte en ese tiempo se encola (en memoria y en `user://boly/`, como siempre)
y sale en un solo lote apenas termina el GET. Si el GET falla o se agota el
tiempo (15 s), `_syncing` vuelve a `false` igual y el envío sigue normal.

Además:

- `Boly.VERSION` y `plugin.cfg` pasan a `0.3.1`, así que el encabezado
  `X-Boly-SDK` ahora dice `godot/0.3.1`.
- `sdk/BOLY_SDK.md` muestra la versión nueva en la tabla de la API de Godot.

La API pública no cambia: no hay que tocar el código del juego.

## Cómo actualizar un juego que ya usa 0.3.0

1. Reemplaza `res://addons/boly_sdk/boly.gd` y `plugin.cfg` por los de esta
   carpeta (deja los `.uid` del proyecto como están).
2. Exporta de nuevo y pasa el build por `boly-verify-win.exe`.
3. En el log del juego ya no debe aparecer `HTTPRequest is processing a request`.
