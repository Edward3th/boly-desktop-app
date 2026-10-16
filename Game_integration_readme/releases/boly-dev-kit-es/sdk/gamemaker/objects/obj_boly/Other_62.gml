// obj_boly — evento ASYNC - HTTP.

// ── Respuesta de logros ──────────────────────────────────────────────────────
if (async_load[? "id"] == ach_request_id) {
    if (async_load[? "status"] == 1) exit;
    ach_request_id = -1;
    var _ach_ok = (async_load[? "status"] == 0);
    var _ach_code = async_load[? "http_status"];
    if (ach_request_kind == "sync") {
        if (_ach_ok && _ach_code == 200) __boly_apply_sync(async_load[? "result"]);
        ach_flush();
    } else if (_ach_ok && _ach_code == 200) {
        __boly_apply_results(ach_in_flight, async_load[? "result"]);
        ach_flush();
    } else if (_ach_ok && _ach_code == 400) {
        // El lote completo es invalido: reintentarlo nunca funcionaria.
        show_debug_message("[Boly] El servidor rechazo un lote de logros (400): " + string(async_load[? "result"]));
        __boly_remove_first_pending(ach_in_flight);
        ach_flush();
    }
    // Sin red, 5xx, 429 o sesion rechazada (403): se conserva y se reintenta
    // con el proximo heartbeat (o en la proxima sesion de este alumno).
    exit;
}

// ── Respuesta del heartbeat ──────────────────────────────────────────────────
// Ignorar respuestas que no sean del heartbeat en vuelo.
if (async_load[? "id"] != request_id) exit;

// status 0 = descarga completa; status 1 = aun descargando (llegara otro evento).
if (async_load[? "status"] == 1) exit;
request_id = -1;
if (ending) exit;

var _code = async_load[? "http_status"];
if (async_load[? "status"] == 0 && _code == 200) {
    consecutive_failures = 0;
    __boly_apply_response(async_load[? "result"]);
    if (first_validation) {
        first_validation = false;
        __boly_become_ready(room_on_ready);
        ach_start();
        if (test_achievement_allowed()) boly_achievement_unlock(test_achievement);
    } else {
        // Hay red y sesion: buen momento para reintentar lo pendiente.
        ach_retry();
    }
    exit;
}

on_heartbeat_failed(_code);
