using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Boly.Editor
{
    // Logros declarados en la build (spec/ACHIEVEMENTS_MANIFEST.md): la carpeta
    // boly/ en la raiz del proyecto (junto a Assets/, fuera de el para que Unity
    // no importe los iconos) se copia junto al ejecutable despues de cada build.
    // Asi el zip que se sube a boly.cl siempre lleva los logros de esa build.
    internal sealed class BolyBuildManifest : IPostprocessBuildWithReport
    {
        public int callbackOrder => 0;

        internal static string ProjectFolder => Path.Combine(Directory.GetParent(Application.dataPath).FullName, "boly");

        public void OnPostprocessBuild(BuildReport report)
        {
            if (report.summary.result == BuildResult.Failed || report.summary.result == BuildResult.Cancelled) return;
            var source = ProjectFolder;
            if (!File.Exists(Path.Combine(source, "achievements.json"))) return;

            // Windows: outputPath es el .exe; WebGL y otros: la carpeta de la build
            var output = report.summary.outputPath;
            var buildFolder = Directory.Exists(output) ? output : Path.GetDirectoryName(output);
            var target = Path.Combine(buildFolder, "boly");

            // Sin restos de una build anterior (un icono borrado no debe viajar)
            if (Directory.Exists(target)) Directory.Delete(target, true);
            CopyFolder(source, target);
            Debug.Log("[Boly] boly/achievements.json copiado junto al ejecutable: " + target);
        }

        static void CopyFolder(string from, string to)
        {
            Directory.CreateDirectory(to);
            foreach (var file in Directory.GetFiles(from))
            {
                // Metadatos de editores y del sistema, no van a Boly
                var name = Path.GetFileName(file);
                if (name.EndsWith(".meta") || name == ".DS_Store" || name == "Thumbs.db" || name == ".gdignore") continue;
                File.Copy(file, Path.Combine(to, name), true);
            }
            foreach (var dir in Directory.GetDirectories(from))
            {
                CopyFolder(dir, Path.Combine(to, Path.GetFileName(dir)));
            }
        }
    }
}
