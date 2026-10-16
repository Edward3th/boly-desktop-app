// obj_boly — evento ASYNC - HTTP.

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
    }
    exit;
}

on_heartbeat_failed(_code);
