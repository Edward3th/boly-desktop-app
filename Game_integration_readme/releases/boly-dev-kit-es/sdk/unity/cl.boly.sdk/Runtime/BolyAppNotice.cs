using System;
using System.IO;
using UnityEngine;

namespace Boly
{
    // Avisa a la app de Boly de un logro recien desbloqueado, para que muestre
    // el aviso tipo Steam encima del juego (spec/PROTOCOL.md §5.1).
    //
    // La app pasa una carpeta en -boly_events_dir y el SDK deja ahi un archivo
    // JSON por desbloqueo: primero .tmp y despues renombrado, asi la app nunca
    // lee uno a medias. Sin red ni puertos. Si no hay carpeta (editor, build
    // abierto a mano, app antigua) no se escribe nada, y un error de disco se
    // ignora: nunca afecta al juego.
    internal static class BolyAppNotice
    {
        [Serializable]
        class UnlockNotice
        {
            public string type = "achievement_unlocked";
            public string api_name;
            public int current;
            public int target;
            public string ts;
        }

        internal static void WriteUnlock(string eventsDir, BolyAchievementState state)
        {
            if (state == null || string.IsNullOrEmpty(eventsDir) || !Directory.Exists(eventsDir)) return;
            try
            {
                var notice = new UnlockNotice
                {
                    api_name = state.ApiName,
                    current = state.Current,
                    target = state.Target,
                    ts = DateTime.UtcNow.ToString("o")
                };
                var name = Guid.NewGuid().ToString("N");
                var tmp = Path.Combine(eventsDir, name + ".json.tmp");
                File.WriteAllText(tmp, JsonUtility.ToJson(notice));
                File.Move(tmp, Path.Combine(eventsDir, name + ".json"));
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Boly] No se pudo avisar a la app del logro " + state.ApiName + ": " + e.Message);
            }
        }
    }
}
