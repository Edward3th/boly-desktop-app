using System;
using System.Collections;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.SceneManagement;

namespace Boly
{
    // Motor interno del SDK: lee los argumentos, valida la sesion y mantiene el
    // heartbeat. Lo crea Bootstrap() antes de cargar la primera escena, en un
    // GameObject con DontDestroyOnLoad, asi que no hay que colocarlo en ninguna
    // escena. Contrato completo en spec/PROTOCOL.md §3.
    [AddComponentMenu("")]
    internal sealed class BolyRuntime : MonoBehaviour
    {
        const string HeartbeatPath = "/v1/validate/validate";
        const int MaxConsecutiveFailures = 4;
        // Una peticion colgada cuenta como fallo en vez de detener el heartbeat.
        const int RequestTimeoutSeconds = 15;

        // La instancia activa; null si el SDK esta desactivado en este build.
        internal static BolyRuntime Instance { get; private set; }

        // Cola de logros; null en modo editor.
        internal BolyAchievementQueue Achievements { get; private set; }

        BolySettings settings;
        BolyLaunchArgs launch;

        // Carpeta de avisos para la app de Boly (-boly_events_dir), o null.
        internal string EventsDir => launch.EventsDir;
        bool firstValidation = true;
        int consecutiveFailures;
        bool ending;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Bootstrap()
        {
            var settings = BolySettings.Load();
            if (!Application.isEditor && !settings.enabledInBuilds) return;

            var host = new GameObject("[Boly SDK]");
            DontDestroyOnLoad(host);
            var runtime = host.AddComponent<BolyRuntime>();
            runtime.settings = settings;
            Instance = runtime;
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        IEnumerator Start()
        {
            launch = BolyLaunchArgs.Parse(Environment.GetCommandLineArgs());
            BolySDK.Session.GameId = launch.GameId;

            if (string.IsNullOrEmpty(launch.Key) || launch.GameId < 0)
            {
                if (Application.isEditor)
                {
                    // Modo editor: sin app de Boly no hay sesion real. Se marca
                    // listo para que el juego se pueda probar con Play.
                    BolySDK.Session.IsEditor = true;
                    // Un frame de espera: deja que la escena se suscriba a OnReady.
                    yield return null;
                    BecomeReady();
                    yield break;
                }

                Debug.LogError("[Boly] Falta -key: el juego debe abrirse desde la app de Boly.");
                EndSession(BolyEndReason.MissingKey);
                yield break;
            }

            Achievements = new BolyAchievementQueue(this, launch.ApiBase, launch.GameId, launch.Key);

            // Validacion inicial y luego heartbeat periodico. WaitForSecondsRealtime
            // (no WaitForSeconds): el heartbeat debe seguir aunque el juego pause
            // con Time.timeScale = 0; si se congela, la sesion expira en el
            // servidor (TTL 5 min) y el juego se cierra.
            yield return Heartbeat();
            while (!ending)
            {
                yield return new WaitForSecondsRealtime(launch.HeartbeatSeconds);
                if (!ending) yield return Heartbeat();
            }
        }

        IEnumerator Heartbeat()
        {
            // Solo game_id + key. Sin header Authorization: la key es la credencial.
            string body = JsonUtility.ToJson(new HeartbeatRequest { game_id = launch.GameId, key = launch.Key });

            using (var request = new UnityWebRequest(launch.ApiBase + HeartbeatPath, UnityWebRequest.kHttpVerbPOST))
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("X-Boly-SDK", BolySDK.SdkHeader);
                request.timeout = RequestTimeoutSeconds;

                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    consecutiveFailures = 0;
                    ApplyResponse(request.downloadHandler.text);
                    if (firstValidation)
                    {
                        firstValidation = false;
                        BecomeReady();
                    }
                    else
                    {
                        // Hay red y sesion: buen momento para reintentar lo pendiente.
                        Achievements.Retry();
                    }
                    yield break;
                }

                long code = request.responseCode;

                // 403 = sesion invalida / reemplazada / expirada / sin acceso.
                // Si falla la validacion inicial tampoco hay sesion que iniciar.
                if (code == 403 || firstValidation)
                {
                    Debug.LogError("[Boly] Sesion rechazada (" + code + "): " + request.error);
                    EndSession(BolyEndReason.Rejected);
                    yield break;
                }

                // Fallo transitorio (429, 5xx, red): una conexion inestable puede
                // perder 1-2 latidos sin estar caida, asi que se toleran varios.
                consecutiveFailures++;
                Debug.LogWarning("[Boly] Heartbeat fallido " + consecutiveFailures + "/" + MaxConsecutiveFailures + " (" + code + "): " + request.error);
                if (consecutiveFailures >= MaxConsecutiveFailures)
                {
                    EndSession(BolyEndReason.Unreachable);
                }
            }
        }

        void ApplyResponse(string json)
        {
            HeartbeatResponse response;
            try
            {
                response = JsonUtility.FromJson<HeartbeatResponse>(json);
            }
            catch (Exception e)
            {
                // Un 200 con cuerpo raro no invalida la sesion; solo se pierden los datos extra.
                Debug.LogWarning("[Boly] Respuesta de heartbeat ilegible: " + e.Message);
                return;
            }
            if (response == null) return;

            var session = BolySDK.Session;
            session.SubscriptionAccess = response.subscriptionAccess;
            if (!string.IsNullOrEmpty(response.session_id)) session.SessionId = response.session_id;
            if (!string.IsNullOrEmpty(response.learner_id)) session.LearnerId = response.learner_id;

            if (!string.IsNullOrEmpty(response.server_time) &&
                DateTime.TryParse(response.server_time, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out DateTime serverUtc))
            {
                BolySDK.SyncServerTime(serverUtc);
            }
        }

        void BecomeReady()
        {
            BolySDK.MarkReady();

            if (Achievements != null)
            {
                StartCoroutine(Achievements.OnSessionReady(BolySDK.Session.LearnerId));
                if (launch.TestAchievementAllowed) BolySDK.Achievements.Unlock(launch.TestAchievement);
            }

            int scene = settings != null ? settings.sceneOnReady : -1;
            if (scene >= 0 && scene < SceneManager.sceneCountInBuildSettings &&
                SceneManager.GetActiveScene().buildIndex != scene)
            {
                // Asincrono: LoadScene (sincrono) bloquea el hilo principal y con
                // una escena pesada se saltan heartbeats.
                SceneManager.LoadSceneAsync(scene);
            }
        }

        void EndSession(BolyEndReason reason)
        {
            if (ending) return;
            ending = true;
            BolySDK.NotifySessionEnded(reason);
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        [Serializable]
        class HeartbeatRequest
        {
            public int game_id;
            public string key;
        }

        [Serializable]
        class HeartbeatResponse
        {
            public bool state;
            public bool subscriptionAccess;
            public string session_id;
            public string learner_id;
            public string server_time;
        }
    }
}
