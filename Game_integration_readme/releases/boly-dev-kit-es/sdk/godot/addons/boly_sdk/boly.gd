extends Node

## Boly SDK para Godot 4. Se registra como autoload "Boly" al activar el
## plugin: corre antes de la primera escena y sobrevive a los cambios de
## escena, asi que no hay que colocar nada. Contrato: spec/PROTOCOL.md.
##
## Uso tipico:
##   func _ready():
##       if Boly.is_ready: _empezar()
##       else: Boly.session_ready.connect(_empezar)
##       Boly.session_ended.connect(func(_razon): _guardar_partida())

## Por que termino la sesion. El SDK cierra el juego justo despues de avisar.
enum EndReason {
	MISSING_KEY,  ## Build lanzado sin -key (no vino desde la app de Boly).
	REJECTED,     ## 403 (reemplazada, expirada, sin acceso) o fallo la validacion inicial.
	UNREACHABLE,  ## 4 heartbeats seguidos sin respuesta valida.
}

## Se emite una vez, con el primer heartbeat valido (o de inmediato en el editor).
signal session_ready
## Se emite justo antes de cerrar el juego. Ultima oportunidad para guardar.
signal session_ended(reason: EndReason)

const VERSION := "0.1.0"
## Escena que se carga cuando la sesion queda lista ("" = ninguna). Equivale al
## flujo AuthScene -> MainGame del ParamsCatcher.
const SETTING_SCENE_ON_READY := "boly/scene_on_ready"

const _DEFAULT_API_BASE := "https://ffstudios-shop-api.vercel.app"
const _HEARTBEAT_PATH := "/v1/validate/validate"
const _MAX_CONSECUTIVE_FAILURES := 4
## Una peticion colgada cuenta como fallo en vez de detener el heartbeat.
const _REQUEST_TIMEOUT_SECONDS := 15.0

## true desde el primer heartbeat valido (o de inmediato en el editor).
var is_ready := false
## Id del juego en Boly (llega por -game_id).
var game_id := 0
## Id de esta sesion de juego. "" en el editor o si el servidor no lo informa.
var session_id := ""
## Id seudonimo y estable del alumno. No identifica a la persona.
var learner_id := ""
## true si el acceso viene de una suscripcion activa.
var subscription_access := false
## true al correr en el editor sin -key: sin red ni sesion real.
var is_editor := false

# La UNICA credencial. -token (JWT legado) se ignora a proposito: no se lee,
# no se guarda y nunca se reenvia.
var _key := ""
# Solo para pruebas: el verifier los envia, el launcher de produccion no.
var _api_base := _DEFAULT_API_BASE
var _heartbeat_seconds := 60.0

var _first_validation := true
var _consecutive_failures := 0
var _ending := false
var _http: HTTPRequest
var _server_unix_at_sync := -1.0
var _ticks_at_sync := 0


func _ready() -> void:
	# Seguir latiendo aunque el juego pause el SceneTree; si el heartbeat se
	# congela, la sesion expira en el servidor (TTL 5 min). Los hijos lo heredan.
	process_mode = Node.PROCESS_MODE_ALWAYS
	_parse_args(OS.get_cmdline_args() + OS.get_cmdline_user_args())

	if _key == "" or game_id < 0:
		if OS.has_feature("editor"):
			# Modo editor: sin app de Boly no hay sesion real. Diferido para que
			# la escena principal alcance a conectarse a session_ready.
			is_editor = true
			_become_ready.call_deferred()
			return
		push_error("[Boly] Falta -key: el juego debe abrirse desde la app de Boly.")
		_end_session(EndReason.MISSING_KEY)
		return

	_http = HTTPRequest.new()
	_http.timeout = _REQUEST_TIMEOUT_SECONDS
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)

	var timer := Timer.new()
	timer.wait_time = _heartbeat_seconds
	timer.autostart = true
	# Tiempo real aunque cambie Engine.time_scale (propiedad de Godot 4.2+).
	if "ignore_time_scale" in timer:
		timer.ignore_time_scale = true
	timer.timeout.connect(_send_heartbeat)
	add_child(timer)

	_send_heartbeat()


## Hora del servidor en segundos Unix (UTC), corregida con el reloj local desde
## el ultimo heartbeat. Antes del primero devuelve la hora local.
func server_now_unix() -> float:
	if _server_unix_at_sync < 0.0:
		return Time.get_unix_time_from_system()
	return _server_unix_at_sync + (Time.get_ticks_msec() - _ticks_at_sync) / 1000.0


func _parse_args(args: PackedStringArray) -> void:
	for i in range(args.size() - 1):
		var value := args[i + 1]
		match args[i]:
			"-key":
				_key = value
			"-game_id":
				game_id = value.to_int()
			"-api_base":
				_api_base = value.trim_suffix("/")
			"-heartbeat_seconds":
				if value.to_float() > 0.0:
					_heartbeat_seconds = value.to_float()


func _send_heartbeat() -> void:
	if _ending:
		return
	# Solo game_id + key. Sin Authorization: la key es la credencial.
	var headers := ["Content-Type: application/json", "X-Boly-SDK: godot/" + VERSION]
	var body := JSON.stringify({"game_id": game_id, "key": _key})
	var error := _http.request(_api_base + _HEARTBEAT_PATH, headers, HTTPClient.METHOD_POST, body)
	if error == ERR_BUSY:
		return  # El latido anterior sigue en vuelo; su resultado decide.
	if error != OK:
		_on_request_completed(HTTPRequest.RESULT_CANT_CONNECT, 0, PackedStringArray(), PackedByteArray())


func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200:
		_consecutive_failures = 0
		_apply_response(body.get_string_from_utf8())
		if _first_validation:
			_first_validation = false
			_become_ready()
		return

	# 403 = sesion invalida / reemplazada / expirada / sin acceso. Si falla la
	# validacion inicial tampoco hay sesion que iniciar.
	if response_code == 403 or _first_validation:
		push_error("[Boly] Sesion rechazada (%d)." % response_code)
		_end_session(EndReason.REJECTED)
		return

	# Fallo transitorio (429, 5xx, red): se toleran varios seguidos.
	_consecutive_failures += 1
	push_warning("[Boly] Heartbeat fallido %d/%d (%d)." % [_consecutive_failures, _MAX_CONSECUTIVE_FAILURES, response_code])
	if _consecutive_failures >= _MAX_CONSECUTIVE_FAILURES:
		_end_session(EndReason.UNREACHABLE)


func _apply_response(text: String) -> void:
	var data = JSON.parse_string(text)
	if typeof(data) != TYPE_DICTIONARY:
		return  # Un 200 con cuerpo raro no invalida la sesion.

	subscription_access = data.get("subscriptionAccess", false) == true
	var sid = data.get("session_id")
	if sid is String and sid != "":
		session_id = sid
	var lid = data.get("learner_id")
	if lid is String and lid != "":
		learner_id = lid

	# "2026-10-15T18:04:05.120Z": Godot parsea hasta los segundos; los
	# milisegundos se suman aparte.
	var st = data.get("server_time")
	if st is String and st.length() >= 19:
		var unix := float(Time.get_unix_time_from_datetime_string(st.substr(0, 19)))
		if st.length() > 20 and st[19] == ".":
			unix += ("0." + st.substr(20).trim_suffix("Z")).to_float()
		_server_unix_at_sync = unix
		_ticks_at_sync = Time.get_ticks_msec()


func _become_ready() -> void:
	if is_ready:
		return
	is_ready = true
	session_ready.emit()

	var scene: String = ProjectSettings.get_setting(SETTING_SCENE_ON_READY, "")
	if scene != "":
		var current := get_tree().current_scene
		if current == null or current.scene_file_path != scene:
			get_tree().change_scene_to_file(scene)


func _end_session(reason: EndReason) -> void:
	if _ending:
		return
	_ending = true
	session_ended.emit(reason)
	get_tree().quit()
