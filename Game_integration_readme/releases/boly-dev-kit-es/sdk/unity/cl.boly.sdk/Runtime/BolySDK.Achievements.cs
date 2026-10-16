using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Boly
{
    // Estado de un logro para este jugador, segun el servidor.
    public sealed class BolyAchievementState
    {
        public string ApiName { get; internal set; }
        // Progreso actual y meta. Meta 1 = se desbloquea de una vez.
        public int Current { get; internal set; }
        public int Target { get; internal set; }
        public bool Unlocked { get; internal set; }
    }

    public static partial class BolySDK
    {
        // Logros (LumenAI). Se definen en boly.cl (panel ▸ juego ▸ logros); el
        // juego solo reporta progreso usando el api_name de cada uno. Descarga
        // alli el archivo BolyAchievements.cs para no escribir los nombres a mano.
        //
        //   BolySDK.Achievements.Unlock(BolyAchievements.NIVEL_5_COMPLETO);
        //   BolySDK.Achievements.Increment(BolyAchievements.RESPONDER_100);
        //   BolySDK.Achievements.OnUnlocked += logro => MostrarPopup(logro);
        //
        // Las llamadas nunca bloquean el juego: cada operacion se guarda en una
        // cola en disco (separada por alumno) y se envia apenas hay sesion y red.
        // Si se pierde la conexion, se reintenta sola; si el juego se cierra, se
        // envia en la proxima sesion de ese mismo alumno.
        public static class Achievements
        {
            static readonly Regex ApiNameRe = new Regex("^[A-Z][A-Z0-9_]{0,63}$");
            static readonly Dictionary<string, BolyAchievementState> states = new Dictionary<string, BolyAchievementState>();

            // Se dispara cuando el servidor confirma un logro recien desbloqueado
            // (una sola vez por logro y jugador): buen momento para un popup.
            public static event Action<BolyAchievementState> OnUnlocked;

            // Se dispara cuando llega el estado de los logros desde el servidor,
            // al iniciar la sesion.
            public static event Action OnSynced;

            // true cuando ya se recibio el estado desde el servidor.
            public static bool IsSynced { get; private set; }

            // Operaciones que todavia no confirma el servidor.
            public static int PendingCount => BolyRuntime.Instance?.Achievements?.Count ?? 0;

            // Desbloquea el logro (lleva el progreso a la meta).
            public static void Unlock(string apiName) => Report(apiName, "unlock", 0, false);

            // Suma `amount` al progreso (ej. una respuesta correcta mas).
            public static void Increment(string apiName, int amount = 1)
            {
                if (amount <= 0)
                {
                    Debug.LogWarning("[Boly] Increment(" + apiName + ") necesita un amount mayor que 0.");
                    return;
                }
                Report(apiName, "increment", amount, true);
            }

            // Fija el progreso en `value` (ej. estrellas acumuladas). Nunca baja.
            public static void SetProgress(string apiName, int value)
            {
                if (value < 0)
                {
                    Debug.LogWarning("[Boly] SetProgress(" + apiName + ") necesita un value mayor o igual a 0.");
                    return;
                }
                Report(apiName, "set", value, true);
            }

            public static bool IsUnlocked(string apiName) =>
                apiName != null && states.TryGetValue(apiName, out var state) && state.Unlocked;

            public static bool TryGetState(string apiName, out BolyAchievementState state)
            {
                state = null;
                return apiName != null && states.TryGetValue(apiName, out state);
            }

            static void Report(string apiName, string op, int value, bool hasValue)
            {
                // Un nombre que no cumple el formato no puede existir en boly.cl:
                // es un error de tipeo, asi que ni se envia.
                if (apiName == null || !ApiNameRe.IsMatch(apiName))
                {
                    Debug.LogError("[Boly] \"" + apiName + "\" no es un api_name valido (A-Z, 0-9 y _). Usa las constantes de BolyAchievements.cs.");
                    return;
                }

                if (Session.IsEditor)
                {
                    SimulateInEditor(apiName, op);
                    return;
                }

                var queue = BolyRuntime.Instance?.Achievements;
                if (queue == null)
                {
                    Debug.LogWarning("[Boly] El SDK no esta activo en este build: el logro " + apiName + " no se envia.");
                    return;
                }
                queue.Enqueue(apiName, op, value, hasValue);
            }

            // En el editor no hay sesion real: se registra en la consola y un
            // Unlock dispara OnUnlocked para poder probar el popup del juego.
            static void SimulateInEditor(string apiName, string op)
            {
                Debug.Log("[Boly] (editor) " + op + " " + apiName + " — no se envia a Boly.");
                WarnIfUndeclared(apiName);
                if (op != "unlock" || IsUnlocked(apiName)) return;
                var state = new BolyAchievementState { ApiName = apiName, Current = 1, Target = 1, Unlocked = true };
                states[apiName] = state;
                RaiseUnlocked(state);
            }

            // Si el proyecto declara sus logros en boly/achievements.json (raiz del
            // proyecto), un api_name que no esta ahi seria ignorado por Boly: se
            // avisa ya en el editor. Se relee en cada Play.
            static HashSet<string> declaredNames;
            static bool declaredLoaded;

            [Serializable] class ManifestNames { public ManifestEntry[] achievements; }
            [Serializable] class ManifestEntry { public string api_name; }

            static void WarnIfUndeclared(string apiName)
            {
                if (!declaredLoaded)
                {
                    declaredLoaded = true;
                    declaredNames = LoadDeclaredNames();
                }
                if (declaredNames != null && !declaredNames.Contains(apiName))
                {
                    Debug.LogWarning("[Boly] (editor) \"" + apiName + "\" no esta en boly/achievements.json: Boly lo ignorara. Agregalo al archivo o revisa el nombre.");
                }
            }

            static HashSet<string> LoadDeclaredNames()
            {
                var path = Path.Combine(Directory.GetParent(Application.dataPath).FullName, "boly", "achievements.json");
                if (!File.Exists(path)) return null;
                try
                {
                    var manifest = JsonUtility.FromJson<ManifestNames>(File.ReadAllText(path));
                    var names = new HashSet<string>();
                    foreach (var entry in manifest?.achievements ?? new ManifestEntry[0])
                    {
                        if (!string.IsNullOrEmpty(entry?.api_name)) names.Add(entry.api_name);
                    }
                    return names;
                }
                catch (Exception e)
                {
                    Debug.LogWarning("[Boly] (editor) boly/achievements.json no es un JSON valido: " + e.Message);
                    return null;
                }
            }

            internal static void ApplyServerState(string apiName, int current, int target, bool unlocked)
            {
                if (!states.TryGetValue(apiName, out var state))
                {
                    state = new BolyAchievementState { ApiName = apiName };
                    states[apiName] = state;
                }
                state.Current = current;
                state.Target = target;
                state.Unlocked = unlocked;
            }

            internal static void MarkSynced()
            {
                IsSynced = true;
                try { OnSynced?.Invoke(); }
                catch (Exception e) { Debug.LogException(e); }
            }

            internal static void RaiseUnlocked(BolyAchievementState state)
            {
                try { OnUnlocked?.Invoke(state); }
                catch (Exception e) { Debug.LogException(e); }
            }

            internal static BolyAchievementState GetState(string apiName) =>
                states.TryGetValue(apiName, out var state) ? state : null;

            [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
            static void ResetStatics()
            {
                states.Clear();
                OnUnlocked = null;
                OnSynced = null;
                IsSynced = false;
                declaredLoaded = false;
                declaredNames = null;
            }
        }
    }
}
