// ParamsCatcher para GameMaker (GML, runtime moderno 2024+).
//
// GameMaker separa la logica en EVENTOS, no en un solo archivo. Crea un objeto
// llamado obj_params_catcher con la casilla "Persistent" ACTIVADA y colocalo en
// tu PRIMERA room (una room de arranque/autenticacion). Luego pega cada bloque
// de abajo en el evento correspondiente del objeto:
//   - "===== CREATE EVENT ====="      -> evento Create
//   - "===== ASYNC - HTTP EVENT ====="-> evento Async > HTTP
//
// El objeto es Persistent y el heartbeat corre sobre un time source GLOBAL, asi
// que sobrevive a room_goto() y sigue latiendo durante toda la sesion.
//
// Nota: esto apunta a GameMaker moderno. En GameMaker Studio 1.4 no existen los
// time sources ni json_stringify; ahi se usaria una Alarm y http_request/JSON
// manual. Este script asume el runtime actual.


// ===== CREATE EVENT =====

// ID del juego. El launcher lo envia por -game_id en tiempo de ejecucion.
// Dejalo en 0: la app de escritorio siempre manda el id real al arrancar.
game_id = 0;

// Clave de sesion recibida por -key. Es la UNICA credencial.
// El launcher todavia envia -token (JWT) por compatibilidad con juegos antiguos,
// pero este script lo IGNORA a proposito: no lo lee, no lo guarda y nunca lo
// reenvia. No agregues codigo que lo use.
key = "";

// Intervalo del heartbeat. Debe ser menor al TTL del servidor (~5 min).
// El launcher de PRODUCCION nunca envia -heartbeat_seconds; solo lo usa la
// herramienta de verificacion (verifier/) para correr las pruebas en segundos.
heartbeat_seconds = 60;

// Origen del API. En produccion es el valor por defecto; el verifier lo
// sobreescribe con -api_base http://127.0.0.1:<port> para apuntar al mock local.
api_base = "https://ffstudios-shop-api.vercel.app";

first_validation = true;
consecutive_failures = 0;
request_id = -1;

// Envia la validacion/heartbeat: POST { game_id, key } sin Authorization.
// Se define como metodo para poder pasarlo como callback del time source.
send_validation = function() {
    var headers = ds_map_create();
    ds_map_add(headers, "Content-Type", "application/json"); // sin Authorization
    var body = json_stringify({ game_id: game_id, key: key });
    request_id = http_request(api_base + "/v1/validate/validate", "POST", headers, body);
    ds_map_destroy(headers);
};

// Argumentos de linea de comandos (parameter_string es 1-indexado).
var _n = parameter_count();
var _i = 1;
while (_i <= _n) {
    var _a = parameter_string(_i);
    if (_a == "-key" && _i < _n) {
        key = parameter_string(_i + 1);
        _i++;
    } else if (_a == "-game_id" && _i < _n) {
        game_id = real(parameter_string(_i + 1));
        _i++;
    } else if (_a == "-api_base" && _i < _n) {
        // Solo para pruebas (lo envia el verifier, no el launcher).
        api_base = parameter_string(_i + 1);
        // Quitar "/" final si viene, el script agrega la ruta.
        if (string_char_at(api_base, string_length(api_base)) == "/") {
            api_base = string_copy(api_base, 1, string_length(api_base) - 1);
        }
        _i++;
    } else if (_a == "-heartbeat_seconds" && _i < _n) {
        // Solo para pruebas (lo envia el verifier, no el launcher).
        heartbeat_seconds = real(parameter_string(_i + 1));
        _i++;
    }
    _i++;
}

// La key es obligatoria; sin ella no hay sesion.
if (key == "") {
    show_debug_message("Validation error: missing -key.");
    game_end();
    exit;
}

// Validacion inicial.
send_validation();

// Heartbeat periodico sobre un time source GLOBAL: no depende de la room y sigue
// corriendo tras room_goto(). Repite indefinidamente (-1).
heartbeat_ts = time_source_create(
    time_source_global,
    heartbeat_seconds,
    time_source_units_seconds,
    send_validation,
    [],
    -1
);
time_source_start(heartbeat_ts);


// ===== ASYNC - HTTP EVENT =====

// Ignorar respuestas que no sean de nuestra peticion.
if (async_load[? "id"] != request_id) exit;

// status == 0 -> descarga completa; http_status -> codigo HTTP real.
var _ok = (async_load[? "status"] == 0 && async_load[? "http_status"] == 200);

if (_ok) {
    consecutive_failures = 0;
    if (first_validation) {
        first_validation = false;
        // Seguimos vivos (objeto Persistent + time source global), asi que el
        // heartbeat continua tras cambiar de room. Cambia rm_main por tu room.
        room_goto(rm_main);
    }
    exit;
}

// 403 = sesion invalida / superada / expirada / acceso perdido -> cerrar.
// Tambien cerramos si falla la validacion inicial.
if (async_load[? "http_status"] == 403 || first_validation) {
    show_debug_message("Validation failed: " + string(async_load[? "http_status"]));
    game_end();
    exit;
}

// Error de red transitorio en un heartbeat: tolerar varios fallos seguidos
// (una conexion inestable puede fallar 1-2 latidos sin estar realmente caida).
consecutive_failures += 1;
if (consecutive_failures >= 4) {
    show_debug_message("Validation failed (network): " + string(async_load[? "http_status"]));
    game_end();
}
