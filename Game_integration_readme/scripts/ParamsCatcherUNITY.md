using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using System.Text;
using UnityEngine.SceneManagement;

public class ParamsCatcher : MonoBehaviour
{
    // ID del juego. El launcher lo envia por -game_id en tiempo de ejecucion.
    int gameId = 0;

    // Clave de sesion recibida por argumentos (-key). Es la UNICA credencial.
    // El launcher todavia envia -token (JWT) por compatibilidad con juegos
    // antiguos, pero este script lo IGNORA a proposito: no lo lee, no lo guarda
    // y nunca lo reenvia. No agregues codigo que lo use.
    string key = "";

    // Intervalo del heartbeat. Debe ser menor al TTL del servidor (~5 min).
    // El launcher de PRODUCCION nunca envia -heartbeat_seconds; solo lo usa la
    // herramienta de verificacion (verifier/) para correr las pruebas en segundos.
    float heartbeatSeconds = 60f;

    // Origen del API. En produccion es el valor por defecto; el verifier lo
    // sobreescribe con -api_base http://127.0.0.1:<port> para apuntar al mock local.
    string apiBase = "https://ffstudios-shop-api.vercel.app";

    // URL completa del heartbeat (se construye a partir de apiBase).
    string ValidateUrl => apiBase + "/v1/validate/validate";

    bool firstValidation = true;
    int consecutiveFailures = 0;

    void Start()
    {
        // Mantener vivo este objeto para poder hacer heartbeat tras cargar la escena.
        DontDestroyOnLoad(this.gameObject);

        // Obtener argumentos de linea de comandos
        string[] args = System.Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "-key":
                    if (i + 1 < args.Length) key = args[i + 1];
                    break;

                case "-game_id":
                    if (i + 1 < args.Length) int.TryParse(args[i + 1], out gameId);
                    break;

                // Opcionales SOLO para pruebas (los envia el verifier, no el launcher).
                case "-api_base":
                    if (i + 1 < args.Length) apiBase = args[i + 1].TrimEnd('/');
                    break;

                case "-heartbeat_seconds":
                    if (i + 1 < args.Length) float.TryParse(args[i + 1], out heartbeatSeconds);
                    break;
            }
        }

        // La key es obligatoria; sin ella no hay sesion.
        if (string.IsNullOrEmpty(key) || gameId < 0)
        {
            Debug.LogError("Validation error: missing -key.");
            Application.Quit();
            return;
        }

        StartCoroutine(ValidationLoop());
    }

    IEnumerator ValidationLoop()
    {
        // Validacion inicial antes de entrar al juego.
        yield return SendValidationRequest();

        // Heartbeat periodico mientras el juego corre. Si la sesion fue
        // superada por otra maquina, expiro, o se perdio el acceso, el servidor
        // responde 403 y cerramos el juego.
        // WaitForSecondsRealtime (NO WaitForSeconds): el heartbeat debe correr en
        // tiempo real aunque el juego pause con Time.timeScale = 0 (menu de pausa,
        // pantalla de victoria) o el hilo principal se atasque cargando una escena;
        // si no, la sesion expira en el servidor (TTL 5 min) y el juego se cierra.
        while (true)
        {
            yield return new WaitForSecondsRealtime(heartbeatSeconds);
            yield return SendValidationRequest();
        }
    }

    IEnumerator SendValidationRequest()
    {
        // Body en JSON: solo game_id + key (sin token).
        string jsonBody = JsonUtility.ToJson(new ValidationData(gameId, key));

        UnityWebRequest request = new UnityWebRequest(ValidateUrl, "POST");
        byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonBody);
        request.uploadHandler = new UploadHandlerRaw(bodyRaw);
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");
        // Sin header Authorization: la key es la credencial.

        yield return request.SendWebRequest();

        bool success = request.result == UnityWebRequest.Result.Success; // HTTP 2xx
        long code = request.responseCode; // codigo HTTP (403, 429, 500, ...)

        if (success)
        {
            consecutiveFailures = 0;
            if (firstValidation)
            {
                firstValidation = false;
                // Carga ASINCRONA de la escena principal: LoadScene (sincrono)
                // bloquea el hilo principal — con una escena pesada congela el
                // coroutine varios segundos y se saltan heartbeats (falla la
                // prueba de cadencia del verifier). Async deja el loop latiendo
                // mientras carga.
                SceneManager.LoadSceneAsync(1);
            }
            yield break;
        }

        // 403 = sesion invalida / superada / expirada / acceso perdido -> cerrar.
        // Tambien cerramos si falla la validacion inicial (no hay sesion que iniciar).
        if (code == 403 || firstValidation)
        {
            Debug.LogError("Validation failed: " + request.error);
            Application.Quit();
            yield break;
        }

        // Resto de fallos transitorios en un heartbeat (429, 5xx, error de red):
        // tolerar varios fallos seguidos antes de cerrar (una conexion inestable
        // puede fallar 1-2 latidos sin estar realmente caida).
        consecutiveFailures++;
        if (consecutiveFailures >= 4)
        {
            Debug.LogError("Validation failed (transient): " + request.error);
            Application.Quit();
        }
    }

    // Clase para serializar los datos enviados a la API
    [System.Serializable]
    public class ValidationData
    {
        public int game_id;
        public string key;

        public ValidationData(int gameId, string key)
        {
            this.game_id = gameId;
            this.key = key;
        }
    }
}

