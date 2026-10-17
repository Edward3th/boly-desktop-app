using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Boly
{
    // Cola de operaciones de logros pendientes de confirmar por el servidor
    // (spec/PROTOCOL.md §5). Vive en BolyRuntime, que corre sus corrutinas.
    //
    // - Cada operacion lleva un client_event_id: si una peticion se reintenta,
    //   el servidor no la aplica dos veces.
    // - Se guarda en disco por juego y por alumno (learner_id). En un PC
    //   compartido del colegio, lo pendiente de un alumno solo se envia cuando
    //   ESE alumno vuelve a abrir sesion, nunca a nombre de otro.
    // - Antes de conocer el learner_id (primer heartbeat) solo vive en memoria.
    internal sealed class BolyAchievementQueue
    {
        const string Path = "/v1/lumen/achievements";
        const int MaxBatch = 50;
        const int RequestTimeoutSeconds = 15;

        [Serializable]
        internal class PendingOp
        {
            public string client_event_id;
            public string api_name;
            public string op;
            public int value;
            public bool has_value;
        }

        [Serializable]
        class PendingFile
        {
            public List<PendingOp> ops = new List<PendingOp>();
        }

        [Serializable]
        class PostResponse
        {
            public List<ResultItem> results;
        }

        [Serializable]
        class ResultItem
        {
            public string api_name;
            public string status;
            public float current;
            public float target;
            public bool unlocked;
            public bool newly_unlocked;
        }

        [Serializable]
        class GetResponse
        {
            public List<StateItem> achievements;
        }

        [Serializable]
        class StateItem
        {
            public string api_name;
            public float target;
            public float current;
            public bool unlocked;
        }

        readonly MonoBehaviour host;
        readonly string apiBase;
        readonly int gameId;
        readonly string key;
        readonly List<PendingOp> ops = new List<PendingOp>();
        string filePath;
        bool sessionReady;
        bool flushing;
        bool flushScheduled;

        public int Count => ops.Count;

        public BolyAchievementQueue(MonoBehaviour host, string apiBase, int gameId, string key)
        {
            this.host = host;
            this.apiBase = apiBase;
            this.gameId = gameId;
            this.key = key;
        }

        public void Enqueue(string apiName, string op, int value, bool hasValue)
        {
            ops.Add(new PendingOp
            {
                client_event_id = Guid.NewGuid().ToString(),
                api_name = apiName,
                op = op,
                value = value,
                has_value = hasValue
            });
            Save();
            ScheduleFlush();
        }

        // Con el primer heartbeat valido: ya se sabe quien juega. Recupera lo que
        // ese alumno dejo pendiente en sesiones anteriores, sincroniza y envia.
        public IEnumerator OnSessionReady(string learnerId)
        {
            if (!string.IsNullOrEmpty(learnerId))
            {
                filePath = System.IO.Path.Combine(
                    Application.persistentDataPath, "boly",
                    "achievements-" + gameId.ToString(CultureInfo.InvariantCulture) + "-" + learnerId + ".json");
                LoadAndMerge();
                Save();
            }
            sessionReady = true;
            yield return Sync();
            yield return Flush();
        }

        // Reintento: se llama despues de cada heartbeat valido.
        public void Retry()
        {
            if (ops.Count > 0) ScheduleFlush();
        }

        void ScheduleFlush()
        {
            if (!sessionReady || flushScheduled) return;
            flushScheduled = true;
            host.StartCoroutine(FlushNextFrame());
        }

        // Espera un frame: varias llamadas seguidas viajan en un solo lote.
        IEnumerator FlushNextFrame()
        {
            yield return null;
            flushScheduled = false;
            yield return Flush();
        }

        IEnumerator Sync()
        {
            using (var request = UnityWebRequest.Get(apiBase + Path))
            {
                SetHeaders(request);
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success) yield break;

                GetResponse response = null;
                try { response = JsonUtility.FromJson<GetResponse>(request.downloadHandler.text); }
                catch (Exception e) { Debug.LogWarning("[Boly] Respuesta de logros ilegible: " + e.Message); }
                if (response?.achievements == null) yield break;

                foreach (var a in response.achievements)
                {
                    BolySDK.Achievements.ApplyServerState(a.api_name, Mathf.RoundToInt(a.current), Mathf.RoundToInt(a.target), a.unlocked);
                }
                BolySDK.Achievements.MarkSynced();
            }
        }

        IEnumerator Flush()
        {
            if (flushing || !sessionReady) yield break;
            flushing = true;
            try
            {
                while (ops.Count > 0)
                {
                    var batch = ops.GetRange(0, Math.Min(MaxBatch, ops.Count));
                    using (var request = new UnityWebRequest(apiBase + Path, UnityWebRequest.kHttpVerbPOST))
                    {
                        request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(BuildBody(batch)));
                        request.downloadHandler = new DownloadHandlerBuffer();
                        request.SetRequestHeader("Content-Type", "application/json");
                        SetHeaders(request);
                        request.timeout = RequestTimeoutSeconds;

                        yield return request.SendWebRequest();

                        if (request.result == UnityWebRequest.Result.Success)
                        {
                            ApplyResults(batch, request.downloadHandler.text);
                            continue;
                        }

                        if (request.responseCode == 400)
                        {
                            // El lote completo es invalido: reintentarlo nunca funcionaria.
                            Debug.LogError("[Boly] El servidor rechazo un lote de logros (400): " + request.downloadHandler.text);
                            RemoveBatch(batch);
                            continue;
                        }

                        // Sin red, 5xx, 429 o sesion rechazada (403): se conserva y se
                        // reintenta con el proximo heartbeat (o en la proxima sesion).
                        yield break;
                    }
                }
            }
            finally
            {
                flushing = false;
            }
        }

        void ApplyResults(List<PendingOp> batch, string json)
        {
            PostResponse response = null;
            try { response = JsonUtility.FromJson<PostResponse>(json); }
            catch (Exception e) { Debug.LogWarning("[Boly] Respuesta de logros ilegible: " + e.Message); }

            // Cada resultado corresponde, en orden, a una operacion del lote.
            var results = response?.results ?? new List<ResultItem>();
            var unlocked = new List<BolyAchievementState>();
            for (int i = 0; i < batch.Count && i < results.Count; i++)
            {
                var result = results[i];
                switch (result.status)
                {
                    case "ok":
                    case "duplicate":
                        BolySDK.Achievements.ApplyServerState(result.api_name, Mathf.RoundToInt(result.current), Mathf.RoundToInt(result.target), result.unlocked);
                        if (result.newly_unlocked) unlocked.Add(BolySDK.Achievements.GetState(result.api_name));
                        break;
                    case "unknown":
                        Debug.LogError("[Boly] El logro \"" + result.api_name + "\" no existe en este juego. Revisa el api_name en boly.cl o descarga de nuevo BolyAchievements.cs.");
                        break;
                    case "retired":
                        Debug.LogWarning("[Boly] El logro \"" + result.api_name + "\" fue retirado en boly.cl; se ignora.");
                        break;
                    default:
                        Debug.LogError("[Boly] Operacion de logro invalida para \"" + result.api_name + "\" (" + result.status + ").");
                        break;
                }
            }
            RemoveBatch(batch);

            // Despues de sacar el lote de la cola, asi PendingCount ya es el real.
            // La app de Boly muestra su aviso; el juego recibe OnUnlocked.
            foreach (var state in unlocked)
            {
                BolyAppNotice.WriteUnlock(BolyRuntime.Instance?.EventsDir, state);
                BolySDK.Achievements.RaiseUnlocked(state);
            }
        }

        void RemoveBatch(List<PendingOp> batch)
        {
            var sent = new HashSet<string>();
            foreach (var op in batch) sent.Add(op.client_event_id);
            ops.RemoveAll(op => sent.Contains(op.client_event_id));
            Save();
        }

        void SetHeaders(UnityWebRequest request)
        {
            request.SetRequestHeader("X-Boly-Game-Id", gameId.ToString(CultureInfo.InvariantCulture));
            request.SetRequestHeader("X-Boly-Key", key);
            request.SetRequestHeader("X-Boly-SDK", BolySDK.SdkHeader);
        }

        // JSON a mano: JsonUtility no sabe omitir "value" cuando no aplica. Los
        // api_name ya pasaron la validacion (A-Z, 0-9, _) y los ids son GUID.
        static string BuildBody(List<PendingOp> batch)
        {
            var body = new StringBuilder("{\"updates\":[");
            for (int i = 0; i < batch.Count; i++)
            {
                var op = batch[i];
                if (i > 0) body.Append(',');
                body.Append("{\"api_name\":\"").Append(op.api_name)
                    .Append("\",\"op\":\"").Append(op.op)
                    .Append("\",\"client_event_id\":\"").Append(op.client_event_id).Append('"');
                if (op.has_value) body.Append(",\"value\":").Append(op.value.ToString(CultureInfo.InvariantCulture));
                body.Append('}');
            }
            return body.Append("]}").ToString();
        }

        void LoadAndMerge()
        {
            try
            {
                if (!File.Exists(filePath)) return;
                var saved = JsonUtility.FromJson<PendingFile>(File.ReadAllText(filePath));
                if (saved?.ops == null) return;
                // Lo pendiente de sesiones anteriores va primero, en su orden original.
                var current = new HashSet<string>();
                foreach (var op in ops) current.Add(op.client_event_id);
                ops.InsertRange(0, saved.ops.FindAll(op => !current.Contains(op.client_event_id)));
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Boly] No se pudo leer la cola de logros: " + e.Message);
            }
        }

        void Save()
        {
            if (filePath == null) return;
            try
            {
                if (ops.Count == 0)
                {
                    if (File.Exists(filePath)) File.Delete(filePath);
                    return;
                }
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(filePath));
                File.WriteAllText(filePath, JsonUtility.ToJson(new PendingFile { ops = ops }));
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Boly] No se pudo guardar la cola de logros: " + e.Message);
            }
        }
    }
}
