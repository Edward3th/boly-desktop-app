using UnityEngine;

namespace Boly
{
    // Configuracion opcional del SDK. Sin este asset el SDK usa los valores
    // por defecto. Crealo con el menu Boly > Settings (queda en
    // Assets/Resources/BolySettings.asset).
    public sealed class BolySettings : ScriptableObject
    {
        public const string ResourcePath = "BolySettings";

        [Tooltip("Iniciar el SDK automaticamente. Desactivalo solo en builds que no se publican en Boly: con el SDK activo, un build sin -key se cierra.")]
        public bool enabledInBuilds = true;

        [Tooltip("Escena (indice en Build Settings) que se carga cuando la sesion queda lista. -1 = no cargar nada. Equivale al flujo AuthScene -> MainGame del ParamsCatcher.")]
        public int sceneOnReady = -1;

        internal static BolySettings Load()
        {
            var settings = Resources.Load<BolySettings>(ResourcePath);
            return settings != null ? settings : CreateInstance<BolySettings>();
        }
    }
}
