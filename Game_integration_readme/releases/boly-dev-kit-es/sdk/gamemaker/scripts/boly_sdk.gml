// Boly SDK para GameMaker (runtime 2024+). Pega este codigo en un Script
// llamado boly_sdk. El trabajo lo hace el objeto persistente obj_boly (ver
// objects/obj_boly), que debe estar en la PRIMERA room. Contrato:
// spec/PROTOCOL.md.
//
// Uso tipico (en el Create de cualquier objeto):
//   boly_on_ready(function() { empezar_partida(); });
//   boly_on_session_ended(function(_razon) { guardar_partida(); });
//   boly_achievement_unlock(BOLY_ACH_NIVEL_5_COMPLETO);

#macro BOLY_VERSION "0.3.0"

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
    ms_at_sync: 0,
    // Logros
    achievements: {},          // api_name -> { current, target, unlocked }
    achievements_in_sync: false,
    pending: [],               // operaciones sin confirmar (ver __boly_save_pending)
    pending_file: "",
    on_achievement_unlocked: [],
    on_achievements_synced: [],
    uuid_counter: 0,
    // Carpeta donde avisar a la app de Boly de cada desbloqueo, para su aviso
    // tipo Steam (spec/PROTOCOL.md §5.1). Vacia si la app no la paso.
    events_dir: ""
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

// ── Logros (spec/PROTOCOL.md §5) ───────────────────────────────────────────
// Se definen en boly.cl (panel > juego > logros); descarga alli
// boly_achievements.gml para no escribir los nombres a mano. Las llamadas
// nunca bloquean: se guardan en una cola en disco (separada por alumno) y se
// envian apenas hay sesion y red, sin contar dos veces al reintentar.
//
//   boly_achievement_unlock(BOLY_ACH_NIVEL_5_COMPLETO);
//   boly_on_achievement_unlocked(function(_id, _actual, _meta) { mostrar_popup(_id); });

// Desbloquea el logro (lleva el progreso a la meta).
function boly_achievement_unlock(_api_name) {
    __boly_report_achievement(_api_name, "unlock", 0, false);
}

// Suma _amount al progreso (ej. una respuesta correcta mas).
function boly_achievement_increment(_api_name, _amount = 1) {
    if (_amount <= 0) {
        show_debug_message("[Boly] boly_achievement_increment(" + string(_api_name) + ") necesita un amount mayor que 0.");
        return;
    }
    __boly_report_achievement(_api_name, "increment", floor(_amount), true);
}

// Fija el progreso en _value (ej. estrellas acumuladas). Nunca baja.
function boly_achievement_set(_api_name, _value) {
    if (_value < 0) {
        show_debug_message("[Boly] boly_achievement_set(" + string(_api_name) + ") necesita un value mayor o igual a 0.");
        return;
    }
    __boly_report_achievement(_api_name, "set", floor(_value), true);
}

function boly_achievement_is_unlocked(_api_name) {
    var _state = global.__boly.achievements[$ _api_name];
    return !is_undefined(_state) && _state.unlocked;
}

// Estado conocido { current, target, unlocked }, o undefined si no se conoce.
function boly_achievement_get(_api_name) {
    return global.__boly.achievements[$ _api_name];
}

// Operaciones que el servidor aun no confirma.
function boly_achievement_pending() {
    return array_length(global.__boly.pending);
}

// _callback(api_name, current, target) cuando el servidor confirma un logro
// recien desbloqueado (una vez por logro y jugador): buen momento para un popup.
function boly_on_achievement_unlocked(_callback) {
    array_push(global.__boly.on_achievement_unlocked, _callback);
}

// _callback() cuando llega el estado de los logros, al iniciar la sesion.
function boly_on_achievements_synced(_callback) {
    if (global.__boly.achievements_in_sync) {
        _callback();
    } else {
        array_push(global.__boly.on_achievements_synced, _callback);
    }
}

// ── Internas de logros (las usa obj_boly) ──────────────────────────────────

// A-Z, 0-9 y _, empezando con letra (GML no tiene expresiones regulares).
function __boly_valid_api_name(_s) {
    if (!is_string(_s)) return false;
    var _len = string_length(_s);
    if (_len < 1 || _len > 64) return false;
    for (var _i = 1; _i <= _len; _i++) {
        var _c = ord(string_char_at(_s, _i));
        var _upper = (_c >= ord("A") && _c <= ord("Z"));
        if (_i == 1 && !_upper) return false;
        if (!_upper && !(_c >= ord("0") && _c <= ord("9")) && _c != ord("_")) return false;
    }
    return true;
}

function __boly_report_achievement(_api_name, _op, _value, _has_value) {
    // Un nombre que no cumple el formato no puede existir en boly.cl: es un
    // error de tipeo, asi que ni se envia.
    if (!__boly_valid_api_name(_api_name)) {
        show_debug_message("[Boly] \"" + string(_api_name) + "\" no es un api_name valido (A-Z, 0-9 y _). Usa las constantes de boly_achievements.gml.");
        return;
    }

    var _b = global.__boly;
    if (_b.is_editor) {
        // Desde el IDE no se envia nada; un unlock avisa para probar el popup.
        show_debug_message("[Boly] (editor) " + _op + " " + _api_name + " - no se envia a Boly.");
        if (_op == "unlock" && !boly_achievement_is_unlocked(_api_name)) {
            _b.achievements[$ _api_name] = { current: 1, target: 1, unlocked: true };
            __boly_call_unlocked([_api_name]);
        }
        return;
    }

    var _entry = { client_event_id: __boly_new_uuid(), api_name: _api_name, op: _op };
    if (_has_value) _entry.value = _value;
    array_push(_b.pending, _entry);
    __boly_save_pending();
    if (instance_exists(obj_boly)) {
        with (obj_boly) ach_schedule_flush();
    }
}

// UUID v4 para client_event_id. Sin randomize(): no se toca la semilla
// aleatoria del juego. El learner_id en el hash lo hace unico entre alumnos.
function __boly_new_uuid() {
    var _b = global.__boly;
    _b.uuid_counter += 1;
    var _h = md5_string_utf8(_b.learner_id + "|" + string(_b.game_id) + "|" + string(date_current_datetime())
        + "|" + string(get_timer()) + "|" + string(_b.uuid_counter) + "|" + string(current_time));
    return string_copy(_h, 1, 8) + "-" + string_copy(_h, 9, 4) + "-4" + string_copy(_h, 14, 3)
        + "-a" + string_copy(_h, 18, 3) + "-" + string_copy(_h, 21, 12);
}

function __boly_set_state(_api_name, _current, _target, _unlocked) {
    global.__boly.achievements[$ _api_name] = {
        current: round(real(_current)),
        target: round(real(_target)),
        unlocked: (_unlocked == true)
    };
}

function __boly_apply_sync(_text) {
    var _data;
    try { _data = json_parse(_text); } catch (_e) { return; }
    if (!is_struct(_data) || !variable_struct_exists(_data, "achievements") || !is_array(_data.achievements)) return;
    for (var _i = 0; _i < array_length(_data.achievements); _i++) {
        var _a = _data.achievements[_i];
        if (is_struct(_a) && variable_struct_exists(_a, "api_name")) {
            __boly_set_state(_a.api_name, _a[$ "current"] ?? 0, _a[$ "target"] ?? 1, _a[$ "unlocked"] ?? false);
        }
    }
    global.__boly.achievements_in_sync = true;
    var _callbacks = global.__boly.on_achievements_synced;
    global.__boly.on_achievements_synced = [];
    for (var _j = 0; _j < array_length(_callbacks); _j++) _callbacks[_j]();
}

// Resultado de un lote de _count operaciones (las primeras de la cola).
function __boly_apply_results(_count, _text) {
    var _data;
    try { _data = json_parse(_text); } catch (_e) { _data = undefined; }
    var _results = (is_struct(_data) && variable_struct_exists(_data, "results") && is_array(_data.results)) ? _data.results : [];
    var _unlocked = [];
    // Cada resultado corresponde, en orden, a una operacion del lote.
    for (var _i = 0; _i < min(_count, array_length(_results)); _i++) {
        var _r = _results[_i];
        if (!is_struct(_r)) continue;
        var _name = string(_r[$ "api_name"] ?? "");
        var _status = string(_r[$ "status"] ?? "");
        if (_status == "ok" || _status == "duplicate") {
            __boly_set_state(_name, _r[$ "current"] ?? 0, _r[$ "target"] ?? 1, _r[$ "unlocked"] ?? false);
            if ((_r[$ "newly_unlocked"] ?? false) == true) array_push(_unlocked, _name);
        } else if (_status == "unknown") {
            show_debug_message("[Boly] El logro \"" + _name + "\" no existe en este juego. Revisa el api_name en boly.cl o descarga de nuevo boly_achievements.gml.");
        } else if (_status == "retired") {
            show_debug_message("[Boly] El logro \"" + _name + "\" fue retirado en boly.cl; se ignora.");
        } else {
            show_debug_message("[Boly] Operacion de logro invalida para \"" + _name + "\" (" + _status + ").");
        }
    }
    __boly_remove_first_pending(_count);
    // Solo desbloqueos confirmados por el servidor: la app de Boly muestra su
    // aviso y el juego recibe sus callbacks.
    for (var _k = 0; _k < array_length(_unlocked); _k++) {
        __boly_write_app_notice(_unlocked[_k], global.__boly.achievements[$ _unlocked[_k]]);
    }
    // Despues de sacar el lote de la cola, asi boly_achievement_pending() ya es el real.
    __boly_call_unlocked(_unlocked);
}

function __boly_call_unlocked(_names) {
    var _callbacks = global.__boly.on_achievement_unlocked;
    for (var _i = 0; _i < array_length(_names); _i++) {
        var _state = global.__boly.achievements[$ _names[_i]];
        for (var _j = 0; _j < array_length(_callbacks); _j++) {
            _callbacks[_j](_names[_i], _state.current, _state.target);
        }
    }
}

// Un archivo JSON por desbloqueo en la carpeta de -boly_events_dir: primero
// .tmp y despues renombrado, asi la app nunca lee uno a medias. Sin carpeta no
// se escribe nada, y un error nunca afecta al juego.
//
// En Windows, GameMaker solo deja escribir fuera del area de guardado con
// "Disable file system sandbox" activado (Game Options > Windows > General).
// Con el sandbox activo la carpeta no se ve y el aviso simplemente no sale.
function __boly_write_app_notice(_api_name, _state) {
    var _dir = global.__boly.events_dir;
    if (_dir == "" || !directory_exists(_dir)) return;
    try {
        var _name = string_replace_all(__boly_new_uuid(), "-", "");
        var _last = string_char_at(_dir, string_length(_dir));
        var _base = (_last == "\\" || _last == "/") ? _dir : _dir + "\\";
        var _tmp = _base + _name + ".json.tmp";
        var _file = file_text_open_write(_tmp);
        if (_file < 0) return;
        file_text_write_string(_file, json_stringify({
            type: "achievement_unlocked",
            api_name: _api_name,
            current: _state.current,
            target: _state.target,
            ts: __boly_utc_iso8601()
        }));
        file_text_close(_file);
        if (!file_rename(_tmp, _base + _name + ".json")) {
            file_delete(_tmp);
        }
    } catch (_e) {
        show_debug_message("[Boly] No se pudo avisar a la app del logro " + string(_api_name) + ".");
    }
}

// "2026-10-17T12:00:00Z"
function __boly_utc_iso8601() {
    var _tz = date_get_timezone();
    date_set_timezone(timezone_utc);
    var _now = date_current_datetime();
    var _two = function(_n) { return (_n < 10 ? "0" : "") + string(_n); };
    var _iso = string(date_get_year(_now)) + "-" + _two(date_get_month(_now)) + "-" + _two(date_get_day(_now))
        + "T" + _two(date_get_hour(_now)) + ":" + _two(date_get_minute(_now)) + ":" + _two(date_get_second(_now)) + "Z";
    date_set_timezone(_tz);
    return _iso;
}

function __boly_remove_first_pending(_count) {
    var _b = global.__boly;
    array_delete(_b.pending, 0, min(_count, array_length(_b.pending)));
    __boly_save_pending();
}

// Cola en disco por juego y por alumno: en un PC compartido, lo pendiente de
// un alumno solo se envia en una sesion de ese mismo alumno.
function __boly_load_pending() {
    var _b = global.__boly;
    if (_b.pending_file == "" || !file_exists(_b.pending_file)) return;
    var _file = file_text_open_read(_b.pending_file);
    var _text = "";
    while (!file_text_eof(_file)) {
        _text += file_text_read_string(_file);
        file_text_readln(_file);
    }
    file_text_close(_file);
    var _saved;
    try { _saved = json_parse(_text); } catch (_e) { return; }
    if (!is_array(_saved)) return;
    // Lo pendiente de sesiones anteriores va primero, en su orden original.
    var _current = {};
    for (var _i = 0; _i < array_length(_b.pending); _i++) _current[$ _b.pending[_i].client_event_id] = true;
    var _older = [];
    for (var _j = 0; _j < array_length(_saved); _j++) {
        var _entry = _saved[_j];
        if (is_struct(_entry) && variable_struct_exists(_entry, "client_event_id") && !variable_struct_exists(_current, _entry.client_event_id)) {
            array_push(_older, _entry);
        }
    }
    _b.pending = array_concat(_older, _b.pending);
}

function __boly_save_pending() {
    var _b = global.__boly;
    if (_b.pending_file == "") return;
    if (array_length(_b.pending) == 0) {
        if (file_exists(_b.pending_file)) file_delete(_b.pending_file);
        return;
    }
    var _file = file_text_open_write(_b.pending_file);
    if (_file < 0) {
        show_debug_message("[Boly] No se pudo guardar la cola de logros.");
        return;
    }
    file_text_write_string(_file, json_stringify(_b.pending));
    file_text_close(_file);
}
