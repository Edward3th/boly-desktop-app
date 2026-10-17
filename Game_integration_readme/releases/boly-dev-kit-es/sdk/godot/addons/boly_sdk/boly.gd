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
##       Boly.achievement_unlocked.connect(func(id, _actual, _meta): _mostrar_popup(id))
##
##   Boly.unlock_achievement(BolyAchievements.NIVEL_5_COMPLETO)

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
## El servidor confirmo un logro recien desbloqueado (una vez por logro y
## jugador): buen momento para un popup.
signal achievement_unlocked(api_name: String, current: int, target: int)
## Llego el estado de los logros desde el servidor, al iniciar la sesion.
signal achievements_synced

const VERSION := "0.3.0"
## Escena que se carga cuando la sesion queda lista ("" = ninguna). Equivale al
## flujo AuthScene -> MainGame del ParamsCatcher.
const SETTING_SCENE_ON_READY := "boly/scene_on_ready"

const _DEFAULT_API_BASE := "https://ffstudios-shop-api.vercel.app"
const _HEARTBEAT_PATH := "/v1/validate/validate"
const _ACHIEVEMENTS_PATH := "/v1/lumen/achievements"
const _MAX_CONSECUTIVE_FAILURES := 4
const _MAX_BATCH := 50
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
## true cuando ya llego el estado de los logros desde el servidor.
var achievements_in_sync := false

# La UNICA credencial. -token (JWT legado) se ignora a proposito: no se lee,
# no se guarda y nunca se reenvia.
var _key := ""
# Solo para pruebas: el verifier los envia, el launcher de produccion no.
var _api_base := _DEFAULT_API_BASE
var _heartbeat_seconds := 60.0
# Solo para el verifier: logro a desbloquear apenas la sesion este lista. Se
# ignora salvo que _api_base apunte a este mismo equipo.
var _test_achievement := ""
# Carpeta donde avisar a la app de Boly de cada desbloqueo, para su aviso tipo
# Steam (spec/PROTOCOL.md §5.1). Vacia si la app no la paso.
var _events_dir := ""

var _first_validation := true
var _consecutive_failures := 0
var _ending := false
var _http: HTTPRequest
var _server_unix_at_sync := -1.0
var _ticks_at_sync := 0

# Logros. Cola de operaciones pendientes, guardada en disco por juego y por
# alumno: en un PC compartido, lo pendiente de un alumno solo se envia en una
# sesion de ese mismo alumno. Antes del primer heartbeat solo vive en memoria.
var _achievement_states := {}  # api_name -> {"current", "target", "unlocked"}
var _pending: Array = []       # [{"client_event_id", "api_name", "op", "value"?}]
var _pending_file := ""
var _achievements_session := false
var _flushing := false
var _flush_scheduled := false
var _achievements_http: HTTPRequest
var _api_name_re := RegEx.create_from_string("^[A-Z][A-Z0-9_]{0,63}$")


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

	# Un HTTPRequest atiende una peticion a la vez: los logros van por otro.
	_achievements_http = HTTPRequest.new()
	_achievements_http.timeout = _REQUEST_TIMEOUT_SECONDS
	add_child(_achievements_http)

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


# ── Logros (spec/PROTOCOL.md §5) ────────────────────────────────────────────
# Se definen en boly.cl (panel ▸ juego ▸ logros); descarga alli
# boly_achievements.gd para no escribir los nombres a mano. Las llamadas nunca
# bloquean: se encolan y se envian apenas hay sesion y red.

## Desbloquea el logro (lleva el progreso a la meta).
func unlock_achievement(api_name: String) -> void:
	_report_achievement(api_name, "unlock", 0, false)


## Suma `amount` al progreso (ej. una respuesta correcta mas).
func increment_achievement(api_name: String, amount: int = 1) -> void:
	if amount <= 0:
		push_warning("[Boly] increment_achievement(%s) necesita un amount mayor que 0." % api_name)
		return
	_report_achievement(api_name, "increment", amount, true)


## Fija el progreso en `value` (ej. estrellas acumuladas). Nunca baja.
func set_achievement_progress(api_name: String, value: int) -> void:
	if value < 0:
		push_warning("[Boly] set_achievement_progress(%s) necesita un value mayor o igual a 0." % api_name)
		return
	_report_achievement(api_name, "set", value, true)


func is_achievement_unlocked(api_name: String) -> bool:
	return _achievement_states.has(api_name) and _achievement_states[api_name]["unlocked"]


## Estado conocido: {"current", "target", "unlocked"}, o {} si no se conoce.
func get_achievement(api_name: String) -> Dictionary:
	return _achievement_states.get(api_name, {})


## Operaciones que el servidor aun no confirma.
func pending_achievements() -> int:
	return _pending.size()


func _report_achievement(api_name: String, op: String, value: int, has_value: bool) -> void:
	# Un nombre que no cumple el formato no puede existir en boly.cl: es un
	# error de tipeo, asi que ni se envia.
	if _api_name_re.search(api_name) == null:
		push_error("[Boly] \"%s\" no es un api_name valido (A-Z, 0-9 y _). Usa las constantes de boly_achievements.gd." % api_name)
		return

	if is_editor:
		# En el editor no se envia nada; un unlock emite la senal para probar el popup.
		print("[Boly] (editor) %s %s — no se envia a Boly." % [op, api_name])
		_warn_if_undeclared(api_name)
		if op == "unlock" and not is_achievement_unlocked(api_name):
			_achievement_states[api_name] = {"current": 1, "target": 1, "unlocked": true}
			achievement_unlocked.emit(api_name, 1, 1)
		return

	if _achievements_http == null:
		push_warning("[Boly] Sin sesion de Boly: el logro %s no se envia." % api_name)
		return

	var entry := {"client_event_id": _new_uuid(), "api_name": api_name, "op": op}
	if has_value:
		entry["value"] = value
	_pending.append(entry)
	_save_pending()
	_schedule_flush()


# Si el proyecto declara sus logros en res://boly/achievements.json, un
# api_name que no esta ahi seria ignorado por Boly: se avisa ya en el editor.
var _declared_names = null  # null = sin manifiesto (logros gestionados en boly.cl)
var _declared_loaded := false


func _warn_if_undeclared(api_name: String) -> void:
	if not _declared_loaded:
		_declared_loaded = true
		_declared_names = _load_declared_names()
	if _declared_names != null and not _declared_names.has(api_name):
		push_warning("[Boly] (editor) \"%s\" no esta en boly/achievements.json: Boly lo ignorara. Agregalo al archivo o revisa el nombre." % api_name)


func _load_declared_names():
	var path := "res://boly/achievements.json"
	if not FileAccess.file_exists(path):
		return null
	var manifest = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(manifest) != TYPE_DICTIONARY or typeof(manifest.get("achievements")) != TYPE_ARRAY:
		push_warning("[Boly] (editor) boly/achievements.json no es un manifiesto valido.")
		return null
	var names := {}
	for entry in manifest["achievements"]:
		if typeof(entry) == TYPE_DICTIONARY and typeof(entry.get("api_name")) == TYPE_STRING:
			names[entry["api_name"]] = true
	return names


# Con el primer heartbeat valido ya se sabe quien juega: recupera lo pendiente
# de ese alumno, sincroniza y envia.
func _start_achievements() -> void:
	if learner_id != "":
		_pending_file = "user://boly/achievements-%d-%s.json" % [game_id, learner_id]
		_load_pending()
		_save_pending()
	_achievements_session = true
	await _sync_achievements()
	await _flush_achievements()


func _schedule_flush() -> void:
	if not _achievements_session or _flush_scheduled:
		return
	_flush_scheduled = true
	# Diferido: varias llamadas seguidas viajan en un solo lote.
	_run_scheduled_flush.call_deferred()


func _run_scheduled_flush() -> void:
	_flush_scheduled = false
	await _flush_achievements()


func _achievements_request(method: int, body: String) -> Array:
	var headers := [
		"Content-Type: application/json",
		"X-Boly-Game-Id: %d" % game_id,
		"X-Boly-Key: " + _key,
		"X-Boly-SDK: godot/" + VERSION,
	]
	var error := _achievements_http.request(_api_base + _ACHIEVEMENTS_PATH, headers, method, body)
	if error != OK:
		return [HTTPRequest.RESULT_CANT_CONNECT, 0, ""]
	var done: Array = await _achievements_http.request_completed
	return [done[0], done[1], (done[3] as PackedByteArray).get_string_from_utf8()]


func _sync_achievements() -> void:
	var response := await _achievements_request(HTTPClient.METHOD_GET, "")
	if response[0] != HTTPRequest.RESULT_SUCCESS or response[1] != 200:
		return
	var data = JSON.parse_string(response[2])
	if typeof(data) != TYPE_DICTIONARY or not (data.get("achievements") is Array):
		return
	for a in data["achievements"]:
		if a is Dictionary and a.get("api_name") is String:
			_set_state(a["api_name"], a.get("current", 0), a.get("target", 1), a.get("unlocked", false) == true)
	achievements_in_sync = true
	achievements_synced.emit()


func _flush_achievements() -> void:
	if _flushing or not _achievements_session:
		return
	_flushing = true
	while not _pending.is_empty():
		var batch := _pending.slice(0, mini(_MAX_BATCH, _pending.size()))
		var response := await _achievements_request(HTTPClient.METHOD_POST, JSON.stringify({"updates": batch}))
		if response[0] == HTTPRequest.RESULT_SUCCESS and response[1] == 200:
			_apply_results(batch, response[2])
			continue
		if response[0] == HTTPRequest.RESULT_SUCCESS and response[1] == 400:
			# El lote completo es invalido: reintentarlo nunca funcionaria.
			push_error("[Boly] El servidor rechazo un lote de logros (400): " + response[2])
			_remove_batch(batch)
			continue
		# Sin red, 5xx, 429 o sesion rechazada (403): se conserva y se reintenta
		# con el proximo heartbeat (o en la proxima sesion de este alumno).
		break
	_flushing = false


func _apply_results(batch: Array, text: String) -> void:
	var data = JSON.parse_string(text)
	var results: Array = data.get("results", []) if typeof(data) == TYPE_DICTIONARY else []
	var unlocked: Array = []
	# Cada resultado corresponde, en orden, a una operacion del lote.
	for i in range(mini(batch.size(), results.size())):
		var r = results[i]
		if not (r is Dictionary):
			continue
		var api_name := str(r.get("api_name", ""))
		match str(r.get("status", "")):
			"ok", "duplicate":
				_set_state(api_name, r.get("current", 0), r.get("target", 1), r.get("unlocked", false) == true)
				if r.get("newly_unlocked", false) == true:
					unlocked.append(api_name)
			"unknown":
				push_error("[Boly] El logro \"%s\" no existe en este juego. Revisa el api_name en boly.cl o descarga de nuevo boly_achievements.gd." % api_name)
			"retired":
				push_warning("[Boly] El logro \"%s\" fue retirado en boly.cl; se ignora." % api_name)
			_:
				push_error("[Boly] Operacion de logro invalida para \"%s\"." % api_name)
	_remove_batch(batch)
	# Despues de sacar el lote de la cola, asi pending_achievements() ya es el real.
	# La app de Boly muestra su aviso; el juego recibe la senal.
	for api_name in unlocked:
		var state: Dictionary = _achievement_states[api_name]
		_write_app_notice(api_name, state)
		achievement_unlocked.emit(api_name, state["current"], state["target"])


# Un archivo JSON por desbloqueo en la carpeta de -boly_events_dir: primero
# .tmp y despues renombrado, asi la app nunca lee uno a medias. Sin carpeta
# no se escribe nada, y un error de disco nunca afecta al juego.
func _write_app_notice(api_name: String, state: Dictionary) -> void:
	if _events_dir == "" or not DirAccess.dir_exists_absolute(_events_dir):
		return
	var file_name := _new_uuid().replace("-", "")
	var tmp_path := _events_dir.path_join(file_name + ".json.tmp")
	var file := FileAccess.open(tmp_path, FileAccess.WRITE)
	if file == null:
		push_warning("[Boly] No se pudo avisar a la app del logro %s." % api_name)
		return
	file.store_string(JSON.stringify({
		"type": "achievement_unlocked",
		"api_name": api_name,
		"current": state["current"],
		"target": state["target"],
		"ts": Time.get_datetime_string_from_system(true) + "Z",
	}))
	file.close()
	if DirAccess.rename_absolute(tmp_path, _events_dir.path_join(file_name + ".json")) != OK:
		DirAccess.remove_absolute(tmp_path)
		push_warning("[Boly] No se pudo avisar a la app del logro %s." % api_name)


func _set_state(api_name: String, current, target, unlocked: bool) -> void:
	_achievement_states[api_name] = {
		"current": int(round(float(current))),
		"target": int(round(float(target))),
		"unlocked": unlocked,
	}


func _remove_batch(batch: Array) -> void:
	var sent := {}
	for entry in batch:
		sent[entry["client_event_id"]] = true
	_pending = _pending.filter(func(entry): return not sent.has(entry["client_event_id"]))
	_save_pending()


func _load_pending() -> void:
	if not FileAccess.file_exists(_pending_file):
		return
	var file := FileAccess.open(_pending_file, FileAccess.READ)
	if file == null:
		return
	var saved = JSON.parse_string(file.get_as_text())
	if not (saved is Array):
		return
	# Lo pendiente de sesiones anteriores va primero, en su orden original.
	var current := {}
	for entry in _pending:
		current[entry["client_event_id"]] = true
	var older: Array = []
	for entry in saved:
		if entry is Dictionary and entry.get("client_event_id") is String and not current.has(entry["client_event_id"]):
			if entry.has("value"):
				entry["value"] = int(entry["value"])  # JSON devuelve float
			older.append(entry)
	_pending = older + _pending


func _save_pending() -> void:
	if _pending_file == "":
		return
	if _pending.is_empty():
		if FileAccess.file_exists(_pending_file):
			DirAccess.remove_absolute(_pending_file)
		return
	DirAccess.make_dir_recursive_absolute("user://boly")
	var file := FileAccess.open(_pending_file, FileAccess.WRITE)
	if file == null:
		push_warning("[Boly] No se pudo guardar la cola de logros.")
		return
	file.store_string(JSON.stringify(_pending))


# UUID v4 para client_event_id.
func _new_uuid() -> String:
	var b := Crypto.new().generate_random_bytes(16)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	var h := b.hex_encode()
	return "%s-%s-%s-%s-%s" % [h.substr(0, 8), h.substr(8, 4), h.substr(12, 4), h.substr(16, 4), h.substr(20, 12)]


# true solo si el API es un servidor local (el mock del verifier).
func _test_achievement_allowed() -> bool:
	if _test_achievement == "":
		return false
	var host := _api_base.get_slice("://", 1).get_slice("/", 0)
	if host.begins_with("["):
		host = host.get_slice("]", 0).trim_prefix("[")
	else:
		host = host.get_slice(":", 0)
	return host == "localhost" or host == "::1" or host.begins_with("127.")


# ── Sesion ───────────────────────────────────────────────────────────────────

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
			"-boly_test_achievement":
				_test_achievement = value
			"-boly_events_dir":
				_events_dir = value


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
		elif not _pending.is_empty():
			# Hay red y sesion: buen momento para reintentar lo pendiente.
			_schedule_flush()
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

	if _achievements_http != null:
		_start_achievements()
		if _test_achievement_allowed():
			unlock_achievement(_test_achievement)

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
