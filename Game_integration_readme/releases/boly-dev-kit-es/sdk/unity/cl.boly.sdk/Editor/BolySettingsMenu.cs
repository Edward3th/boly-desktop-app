using System.IO;
using UnityEditor;
using UnityEngine;

namespace Boly.Editor
{
    internal static class BolySettingsMenu
    {
        const string AssetPath = "Assets/Resources/" + BolySettings.ResourcePath + ".asset";

        // Crea (o selecciona) Assets/Resources/BolySettings.asset.
        [MenuItem("Boly/Settings")]
        static void OpenSettings()
        {
            var settings = AssetDatabase.LoadAssetAtPath<BolySettings>(AssetPath);
            if (settings == null)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(AssetPath));
                settings = ScriptableObject.CreateInstance<BolySettings>();
                AssetDatabase.CreateAsset(settings, AssetPath);
                AssetDatabase.SaveAssets();
            }
            Selection.activeObject = settings;
            EditorGUIUtility.PingObject(settings);
        }
    }
}
