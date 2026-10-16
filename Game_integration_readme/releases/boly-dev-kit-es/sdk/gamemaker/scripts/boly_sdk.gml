// Boly SDK para GameMaker (runtime 2024+). Pega este codigo en un Script
// llamado boly_sdk. El trabajo lo hace el objeto persistente obj_boly (ver
// objects/obj_boly), que debe estar en la PRIMERA room. Contrato:
// spec/PROTOCOL.md.
//
// Uso tipico (en el Create de cualquier objeto):
//   boly_on_ready(function() { empezar_partida(); });
//   boly_on_session_ended(function(_razon) { guardar_partida(); });

#macro BOLY_VERSION "0.1.0"

// Por que termino la sesion. El SDK cierra el juego justo despues de avisar.
enum BOLY_END_REASON {
    MISSING_KEY,  // Build lanzado sin -key (no vino desde la app de Boly).
    REJECTED,     // 403 (reemplazada, expirada, sin acceso) o fallo la validacion inicial.
    UNREACHABLE   // 4 heartbeats seguidos sin respuesta valida.
}

// Estado compartido. Se inicializa al arrancar el juego, antes de la primera room.
global.__boly = {
    ready: false,
    game_id: 0,
    session_id: "",
    learner_id: "",
    subscription_access: false,
    is_editor: false,
    on_ready: [],
    on_session_ended: [],
    server_unix_at_sync: -1,
    ms_at_sync: 0
};

// true desde el primer heartbeat valido (o de inmediato al correr desde el IDE).
function boly_is_ready() {
    return global.__boly.ready;
}

// Id del juego en Boly (llega por -game_id).
function boly_game_id() {
    return global.__boly.game_id;
}

// Id de esta sesion de juego. "" desde el IDE o si el servidor no lo informa.
function boly_session_id() {
    return global.__boly.session_id;
}

// Id seudonimo y estable del alumno. No identifica a la persona.
function boly_learner_id() {
    return global.__boly.learner_id;
}

// true si el acceso viene de una suscripcion activa.
function boly_has_subscription_access() {
    return global.__boly.subscription_access;
}

// true al correr desde el IDE sin -key: sin red ni sesion real.
function boly_is_editor() {
    return global.__boly.is_editor;
}

// Llama a _callback cuando la sesion quede lista (o de inmediato si ya lo esta).
function boly_on_ready(_callback) {
    if (global.__boly.ready) {
        _callback();
    } else {
        array_push(global.__boly.on_ready, _callback);
    }
}

// Llama a _callback(razon) justo antes de que el SDK cierre el juego. Ultima
// oportunidad para guardar; el cierre no se puede cancelar.
function boly_on_session_ended(_callback) {
    array_push(global.__boly.on_session_ended, _callback);
}

// Hora del servidor en segundos Unix (UTC), corregida con el reloj local desde
// el ultimo heartbeat. Antes del primero devuelve la hora local en UTC.
function boly_server_now() {
    var _b = global.__boly;
    if (_b.server_unix_at_sync < 0) {
        var _tz = date_get_timezone();
        date_set_timezone(timezone_utc);
        var _now = (date_current_datetime() - 25569) * 86400;
        date_set_timezone(_tz);
        return _now;
    }
    return _b.server_unix_at_sync + (current_time - _b.ms_at_sync) / 1000;
}

// ── Internas (las usa obj_boly) ────────────────────────────────────────────

function __boly_become_ready(_room_on_ready) {
    var _b = global.__boly;
    if (_b.ready) return;
    _b.ready = true;
    var _callbacks = _b.on_ready;
    _b.on_ready = [];
    for (var _i = 0; _i < array_length(_callbacks); _i++) {
        _callbacks[_i]();
    }
    if (_room_on_ready != -1 && room != _room_on_ready) {
        room_goto(_room_on_ready);
    }
}

function __boly_end_session(_reason) {
    var _callbacks = global.__boly.on_session_ended;
    for (var _i = 0; _i < array_length(_callbacks); _i++) {
        _callbacks[_i](_reason);
    }
    game_end();
}

// Lee los campos de un 200 del heartbeat. Un cuerpo raro no invalida la sesion.
function __boly_apply_response(_text) {
    var _data;
    try {
        _data = json_parse(_text);
    } catch (_e) {
        return;
    }
    if (!is_struct(_data)) return;

    var _b = global.__boly;
    if (variable_struct_exists(_data, "subscriptionAccess")) {
        _b.subscription_access = (_data.subscriptionAccess == true);
    }
    if (variable_struct_exists(_data, "session_id") && is_string(_data.session_id) && _data.session_id != "") {
        _b.session_id = _data.session_id;
    }
    if (variable_struct_exists(_data, "learner_id") && is_string(_data.learner_id) && _data.learner_id != "") {
        _b.learner_id = _data.learner_id;
    }
    if (variable_struct_exists(_data, "server_time") && is_string(_data.server_time)) {
        var _unix = __boly_parse_iso8601(_data.server_time);
        if (_unix >= 0) {
            _b.server_unix_at_sync = _unix;
            _b.ms_at_sync = current_time;
        }
    }
}

// "2026-10-15T18:04:05.120Z" -> segundos Unix. -1 si no se puede leer.
function __boly_parse_iso8601(_s) {
    if (string_length(_s) < 19) return -1;
    var _tz = date_get_timezone();
    date_set_timezone(timezone_utc);
    var _date = date_create_datetime(
        real(string_copy(_s, 1, 4)), real(string_copy(_s, 6, 2)), real(string_copy(_s, 9, 2)),
        real(string_copy(_s, 12, 2)), real(string_copy(_s, 15, 2)), real(string_copy(_s, 18, 2))
    );
    date_set_timezone(_tz);
    var _unix = round((_date - 25569) * 86400);
    if (string_char_at(_s, 20) == ".") {
        var _frac = string_digits(string_copy(_s, 21, 3));
        if (_frac != "") _unix += real(_frac) / power(10, string_length(_frac));
    }
    return _unix;
}
