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

## Notas

- "Modo editor" = correr desde el IDE (`GM_build_type == "run"`) sin `-key`.
- `http_request` no tiene timeout configurable: un latido sin respuesta durante
  todo un intervalo cuenta como fallo transitorio y se envía uno nuevo.
