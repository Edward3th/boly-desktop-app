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
// Solo para el verifier: logro a desbloquear apenas la sesion este lista. Se
// ignora salvo que api_base apunte a este mismo equipo.
test_achievement = "";

first_validation = true;
consecutive_failures = 0;
ending = false;
request_id = -1;

// Logros: una peticion a la vez, aparte del heartbeat.
ach_request_id = -1;
ach_request_kind = "";
ach_request_time = 0;
ach_in_flight = 0;
ach_session = false;
ach_flush_scheduled = false;

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
    } else if (_arg == "-boly_test_achievement") {
        test_achievement = _value;
    } else if (_arg == "-boly_events_dir") {
        global.__boly.events_dir = _value;
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

// ── Logros ───────────────────────────────────────────────────────────────────

ach_request = function(_method, _body, _kind) {
    var _headers = ds_map_create();
    ds_map_add(_headers, "Content-Type", "application/json");
    ds_map_add(_headers, "X-Boly-Game-Id", string(global.__boly.game_id));
    ds_map_add(_headers, "X-Boly-Key", key);
    ds_map_add(_headers, "X-Boly-SDK", "gamemaker/" + BOLY_VERSION);
    ach_request_kind = _kind;
    ach_request_time = current_time;
    ach_request_id = http_request(api_base + "/v1/lumen/achievements", _method, _headers, _body);
    ds_map_destroy(_headers);
};

// Con el primer heartbeat valido ya se sabe quien juega: recupera lo pendiente
// de ese alumno y sincroniza; al responder, envia (ver Async HTTP).
ach_start = function() {
    var _b = global.__boly;
    if (_b.learner_id != "") {
        _b.pending_file = "boly_achievements_" + string(_b.game_id) + "_" + _b.learner_id + ".json";
        __boly_load_pending();
        __boly_save_pending();
    }
    ach_session = true;
    ach_request("GET", "", "sync");
};

ach_flush = function() {
    var _pending = global.__boly.pending;
    if (!ach_session || ending || ach_request_id != -1 || array_length(_pending) == 0) return;
    ach_in_flight = min(50, array_length(_pending));
    var _batch = array_create(ach_in_flight);
    array_copy(_batch, 0, _pending, 0, ach_in_flight);
    ach_request("POST", json_stringify({ updates: _batch }), "flush");
};

// Un frame despues: varias llamadas seguidas viajan en un solo lote.
ach_schedule_flush = function() {
    if (!ach_session || ach_flush_scheduled) return;
    ach_flush_scheduled = true;
    call_later(1, time_source_units_frames, function() {
        ach_flush_scheduled = false;
        ach_flush();
    });
};

// Tras cada heartbeat valido: reintenta lo pendiente. http_request no tiene
// timeout, asi que una peticion de logros colgada mas de 30 s se abandona (su
// respuesta tardia se ignora; los client_event_id evitan contar dos veces).
ach_retry = function() {
    if (ach_request_id != -1 && current_time - ach_request_time > 30000) ach_request_id = -1;
    ach_flush();
};

// true solo si el API es un servidor local (el mock del verifier).
test_achievement_allowed = function() {
    if (test_achievement == "") return false;
    var _host = api_base;
    var _scheme = string_pos("://", _host);
    if (_scheme > 0) _host = string_delete(_host, 1, _scheme + 2);
    var _slash = string_pos("/", _host);
    if (_slash > 0) _host = string_copy(_host, 1, _slash - 1);
    if (string_char_at(_host, 1) == "[") {
        _host = string_copy(_host, 2, string_pos("]", _host) - 2);
    } else {
        var _colon = string_pos(":", _host);
        if (_colon > 0) _host = string_copy(_host, 1, _colon - 1);
    }
    return _host == "localhost" || _host == "::1" || string_copy(_host, 1, 4) == "127.";
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
