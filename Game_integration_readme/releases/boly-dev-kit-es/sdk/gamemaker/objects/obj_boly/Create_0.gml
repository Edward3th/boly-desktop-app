// obj_boly — evento CREATE. Objeto con la casilla "Persistent" ACTIVADA,
// colocado en la PRIMERA room. Sobrevive a room_goto() y el heartbeat corre
// sobre un time source GLOBAL, asi que sigue latiendo entre rooms.

// Room que se abre cuando la sesion queda lista (-1 = ninguna). No edites esta
// linea: asignala en el Creation Code de la instancia en la room, p.ej.
//   room_on_ready = rm_main;
// (el Creation Code corre despues de este evento).
room_on_ready = -1;

// La UNICA credencial. -token (JWT legado) se ignora a proposito: no se lee,
// no se guarda y nunca se reenvia.
key = "";
// Solo para pruebas: el verifier los envia, el launcher de produccion no.
api_base = "https://ffstudios-shop-api.vercel.app";
heartbeat_seconds = 60;

first_validation = true;
consecutive_failures = 0;
ending = false;
request_id = -1;

// Argumentos de linea de comandos (parameter_string es 1-indexado). Van
// separados por espacio: "-key abc".
var _n = parameter_count();
for (var _i = 1; _i < _n; _i++) {
    var _arg = parameter_string(_i);
    var _value = parameter_string(_i + 1);
    if (_arg == "-key") {
        key = _value;
    } else if (_arg == "-game_id") {
        var _digits = string_digits(_value);
        global.__boly.game_id = (_digits == "") ? 0 : real(_digits);
    } else if (_arg == "-api_base") {
        api_base = _value;
        if (string_char_at(api_base, string_length(api_base)) == "/") {
            api_base = string_copy(api_base, 1, string_length(api_base) - 1);
        }
    } else if (_arg == "-heartbeat_seconds") {
        try {
            if (real(_value) > 0) heartbeat_seconds = real(_value);
        } catch (_e) {}
    }
}

// Registra un heartbeat fallido. Devuelve true si cerro la sesion.
on_heartbeat_failed = function(_code) {
    // 403 = sesion invalida / reemplazada / expirada / sin acceso. Si falla la
    // validacion inicial tampoco hay sesion que iniciar.
    if (_code == 403 || first_validation) {
        show_debug_message("[Boly] Sesion rechazada (" + string(_code) + ").");
        end_session(BOLY_END_REASON.REJECTED);
        return true;
    }
    // Fallo transitorio (429, 5xx, red): se toleran varios seguidos.
    consecutive_failures += 1;
    show_debug_message("[Boly] Heartbeat fallido " + string(consecutive_failures) + "/4 (" + string(_code) + ").");
    if (consecutive_failures >= 4) {
        end_session(BOLY_END_REASON.UNREACHABLE);
        return true;
    }
    return false;
};

// POST { game_id, key } sin Authorization: la key es la credencial.
send_heartbeat = function() {
    if (ending) return;
    // http_request no tiene timeout: un latido sin respuesta durante todo un
    // intervalo cuenta como fallo, y su respuesta tardia se ignora.
    if (request_id != -1) {
        request_id = -1;
        if (on_heartbeat_failed(0)) return;
    }
    var _headers = ds_map_create();
    ds_map_add(_headers, "Content-Type", "application/json");
    ds_map_add(_headers, "X-Boly-SDK", "gamemaker/" + BOLY_VERSION);
    var _body = json_stringify({ game_id: global.__boly.game_id, key: key });
    request_id = http_request(api_base + "/v1/validate/validate", "POST", _headers, _body);
    ds_map_destroy(_headers);
};

end_session = function(_reason) {
    if (ending) return;
    ending = true;
    __boly_end_session(_reason);
};

if (key == "") {
    if (GM_build_type == "run") {
        // Corriendo desde el IDE: sin app de Boly no hay sesion real. Se marca
        // listo un frame despues, cuando el Creation Code ya fijo room_on_ready.
        global.__boly.is_editor = true;
        call_later(1, time_source_units_frames, function() { __boly_become_ready(room_on_ready); });
        exit;
    }
    show_debug_message("[Boly] Falta -key: el juego debe abrirse desde la app de Boly.");
    end_session(BOLY_END_REASON.MISSING_KEY);
    exit;
}

// Validacion inicial y heartbeat periodico sobre un time source GLOBAL (no
// depende de la room). Repite indefinidamente (-1).
send_heartbeat();
heartbeat_ts = time_source_create(time_source_global, heartbeat_seconds, time_source_units_seconds, send_heartbeat, [], -1);
time_source_start(heartbeat_ts);
