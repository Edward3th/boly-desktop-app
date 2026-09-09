extends Node

# ID del juego. El launcher lo envia por -game_id en tiempo de ejecucion.
var game_id: int = 0

# Clave de sesion recibida por -key. Es la UNICA credencial.
# El launcher todavia envia -token (JWT) por compatibilidad con juegos antiguos,
# pero este script lo IGNORA a proposito: no lo lee, no lo guarda y nunca lo
# reenvia. No agregues codigo que lo use.
var key: String = ""

# Intervalo del heartbeat. Debe ser menor al TTL del servidor (~5 min).
# El launcher de PRODUCCION nunca envia -heartbeat_seconds; solo lo usa la
# herramienta de verificacion (verifier/) para correr las pruebas en segundos.
var heartbeat_seconds := 60.0

# Origen del API. En produccion es el valor por defecto; el verifier lo
# sobreescribe con -api_base http://127.0.0.1:<port> para apuntar al mock local.
var api_base := "https://ffstudios-shop-api.vercel.app"

var http_request: HTTPRequest
var first_validation: bool = true
var consecutive_failures: int = 0

# IMPORTANTE: adjunta este script a un nodo HIJO de tu primera escena (no al
# nodo raiz de la escena). En _ready se reparenta solo a la raiz del SceneTree
# para SOBREVIVIR a change_scene_to_file() y seguir haciendo heartbeat entre
# escenas, sin depender de configurar un Autoload. (Si prefieres registrarlo
# como Autoload, tambien funciona: en ese caso ya cuelga de la raiz y el
# reparentado se omite.)
func _ready():
    call_deferred("_persist_and_start")

func _persist_and_start():
    # Reparentarse a /root para no ser liberado al cambiar de escena.
    var parent := get_parent()
    if parent != null and parent != get_tree().root:
        parent.remove_child(self)
        get_tree().root.add_child(self)

    # Seguir procesando aunque el juego pause el SceneTree (get_tree().paused =
    # true en un menu de pausa): si el heartbeat se congela, la sesion expira en
    # el servidor (TTL 5 min) y el juego se cierra al despausar. Los hijos
    # (HTTPRequest y Timer) heredan este modo.
    process_mode = Node.PROCESS_MODE_ALWAYS

    # Nodo HTTPRequest (hijo de este nodo, asi que tambien persiste)
    http_request = HTTPRequest.new()
    add_child(http_request)
    http_request.request_completed.connect(_on_request_completed)

    # Argumentos de linea de comandos
    var args = OS.get_cmdline_args()
    for i in range(args.size()):
        if args[i] == "-key" and i + 1 < args.size():
            key = args[i + 1]
        if args[i] == "-game_id" and i + 1 < args.size():
            game_id = int(args[i + 1])
        # Opcionales SOLO para pruebas (los envia el verifier, no el launcher).
        if args[i] == "-api_base" and i + 1 < args.size():
            api_base = args[i + 1].trim_suffix("/")
        if args[i] == "-heartbeat_seconds" and i + 1 < args.size():
            heartbeat_seconds = float(args[i + 1])

    # La key es obligatoria; sin ella no hay sesion.
    if key == "" or game_id < 0:
        push_error("Validation error: missing -key.")
        get_tree().quit()
        return

    # Validacion inicial
    _send_validation_request()

    # Heartbeat periodico (el Timer es hijo de este nodo, asi que tambien persiste
    # y hereda PROCESS_MODE_ALWAYS, o sea sigue corriendo con el juego pausado)
    var timer = Timer.new()
    timer.wait_time = heartbeat_seconds
    timer.autostart = true
    # El heartbeat debe correr en tiempo real aunque el juego cambie
    # Engine.time_scale (camara lenta, pausa). Propiedad disponible en Godot 4.2+.
    if "ignore_time_scale" in timer:
        timer.ignore_time_scale = true
    timer.timeout.connect(_send_validation_request)
    add_child(timer)

func _send_validation_request():
    # Body en JSON: solo game_id + key (sin token).
    var body = {
        "game_id": game_id,
        "key": key
    }
    var headers = ["Content-Type: application/json"] # sin Authorization

    var error = http_request.request(
        api_base + "/v1/validate/validate",
        headers,
        HTTPClient.METHOD_POST,
        JSON.stringify(body)
    )

    if error != OK:
        push_error("Failed to send request")

func _on_request_completed(result, response_code, headers, body):
    var ok = result == HTTPRequest.RESULT_SUCCESS and response_code == 200

    if ok:
        consecutive_failures = 0
        if first_validation:
            first_validation = false
            # Seguimos vivos bajo /root, asi que el heartbeat continua tras esto.
            get_tree().change_scene_to_file("res://MainGame.tscn")
        return

    # 403 = sesion invalida / superada / expirada / acceso perdido -> cerrar.
    # Tambien cerramos si falla la validacion inicial.
    if response_code == 403 or first_validation:
        push_error("Validation failed: " + str(response_code))
        get_tree().quit()
        return

    # Error de red transitorio en un heartbeat: tolerar un par de fallos.
    consecutive_failures += 1
    if consecutive_failures >= 4:
        push_error("Validation failed (network): " + str(response_code))
        get_tree().quit()
