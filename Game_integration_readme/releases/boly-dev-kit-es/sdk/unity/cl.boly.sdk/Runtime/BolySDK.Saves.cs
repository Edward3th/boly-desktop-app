using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace Boly
{
    public static partial class BolySDK
    {
        static bool localStorageNotReadyLogged;
        static bool missingLearnerLogged;

        internal static void ResetLocalStorageState()
        {
            localStorageNotReadyLogged = false;
            missingLearnerLogged = false;
        }

        internal static string LocalLearnerFolder()
        {
            if (!IsReady)
            {
                if (!localStorageNotReadyLogged)
                {
                    localStorageNotReadyLogged = true;
                    Debug.LogError("[Boly] Espera a OnReady antes de leer o guardar la partida.");
                }
                return null;
            }
            if (session.IsEditor) return "editor";
            if (Guid.TryParse(session.LearnerId, out Guid id)) return id.ToString("D");
            if (!missingLearnerLogged)
            {
                missingLearnerLogged = true;
                Debug.LogWarning("[Boly] learner_id ausente o invalido; se usara _sin_alumno para esta partida.");
            }
            return "_sin_alumno";
        }

        public static class Saves
        {
            // Se crea al primer acceso. Nunca se recurre a persistentDataPath
            // directamente si todavia no se valido la sesion.
            public static string Directory
            {
                get
                {
                    string learner = LocalLearnerFolder();
                    if (learner == null) return null;
                    string path = Path.Combine(Application.persistentDataPath, "boly", "saves", learner);
                    try
                    {
                        System.IO.Directory.CreateDirectory(path);
                        return path;
                    }
                    catch (Exception e)
                    {
                        Debug.LogError("[Boly] No se pudo crear la carpeta de guardado: " + e.Message);
                        return null;
                    }
                }
            }

            // Acepta una ruta relativa dentro de la carpeta del alumno.
            public static string PathFor(string relativePath)
            {
                string root = Directory;
                if (root == null) return null;
                if (string.IsNullOrWhiteSpace(relativePath) || Path.IsPathRooted(relativePath))
                {
                    Debug.LogError("[Boly] PathFor necesita una ruta relativa dentro de la carpeta del alumno.");
                    return null;
                }
                try
                {
                    string full = Path.GetFullPath(Path.Combine(root, relativePath));
                    string prefix = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                    if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    {
                        Debug.LogError("[Boly] PathFor no permite salir de la carpeta del alumno.");
                        return null;
                    }
                    string parent = Path.GetDirectoryName(full);
                    if (parent != null) System.IO.Directory.CreateDirectory(parent);
                    return full;
                }
                catch (Exception e)
                {
                    Debug.LogError("[Boly] Ruta de guardado invalida: " + e.Message);
                    return null;
                }
            }

            // Migracion optativa para un archivo o carpeta anterior dentro de
            // persistentDataPath. El primer alumno que la reclama obtiene una
            // copia; el original no se borra. Usar solo si se conoce su dueno.
            public static bool ClaimLegacy(string legacyPath)
            {
                string learner = LocalLearnerFolder();
                if (learner == null) return false;
                if (string.IsNullOrWhiteSpace(legacyPath)) return false;
                string savesRoot = Directory;
                if (savesRoot == null) return false;
                try
                {
                    string appRoot = Path.GetFullPath(Application.persistentDataPath)
                        .TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                    string source = Path.GetFullPath(Path.IsPathRooted(legacyPath)
                        ? legacyPath : Path.Combine(appRoot, legacyPath));
                    string sdkArea = Path.Combine(appRoot, "boly")
                        .TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                    if (!source.StartsWith(appRoot, StringComparison.OrdinalIgnoreCase) ||
                        source.StartsWith(sdkArea, StringComparison.OrdinalIgnoreCase))
                    {
                        Debug.LogError("[Boly] ClaimLegacy solo acepta partidas antiguas de este juego.");
                        return false;
                    }
                    bool isFile = File.Exists(source);
                    if (!isFile && !System.IO.Directory.Exists(source)) return false;
                    string destination = Path.Combine(savesRoot, Path.GetFileName(source.TrimEnd(Path.DirectorySeparatorChar)));
                    if (File.Exists(destination) || System.IO.Directory.Exists(destination)) return false;

                    byte[] digest;
                    using (var sha = SHA256.Create()) digest = sha.ComputeHash(Encoding.UTF8.GetBytes(source.ToLowerInvariant()));
                    string claims = Path.Combine(appRoot, "boly", "legacy_claims");
                    System.IO.Directory.CreateDirectory(claims);
                    string marker = Path.Combine(claims, BitConverter.ToString(digest).Replace("-", "").ToLowerInvariant() + ".txt");
                    using (var lockFile = new FileStream(marker, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    using (var writer = new StreamWriter(lockFile)) writer.Write(learner);
                    if (isFile) File.Copy(source, destination, false);
                    else CopyDirectory(source, destination);
                    return true;
                }
                catch (IOException e)
                {
                    Debug.LogWarning("[Boly] La partida antigua ya fue reclamada o no se pudo copiar: " + e.Message);
                    return false;
                }
                catch (Exception e)
                {
                    Debug.LogError("[Boly] ClaimLegacy fallo: " + e.Message);
                    return false;
                }
            }

            static void CopyDirectory(string source, string destination)
            {
                System.IO.Directory.CreateDirectory(destination);
                foreach (string file in System.IO.Directory.GetFiles(source))
                    File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), false);
                foreach (string child in System.IO.Directory.GetDirectories(source))
                    CopyDirectory(child, Path.Combine(destination, Path.GetFileName(child)));
            }
        }

        public static class Prefs
        {
            [Serializable]
            sealed class KeyIndex { public List<string> keys = new List<string>(); }

            static string Prefix()
            {
                string learner = LocalLearnerFolder();
                return learner == null ? null : "boly." + learner + ".";
            }

            static bool ValidKey(string key)
            {
                if (!string.IsNullOrEmpty(key) && key != "__keys") return true;
                Debug.LogError("[Boly] Clave de Prefs vacia o reservada.");
                return false;
            }

            static KeyIndex ReadIndex(string prefix)
            {
                string json = PlayerPrefs.GetString(prefix + "__keys", "");
                if (string.IsNullOrEmpty(json)) return new KeyIndex();
                try { return JsonUtility.FromJson<KeyIndex>(json) ?? new KeyIndex(); }
                catch (Exception) { Debug.LogWarning("[Boly] Indice de Prefs ilegible."); return new KeyIndex(); }
            }

            static void Track(string prefix, string key)
            {
                KeyIndex index = ReadIndex(prefix);
                if (index.keys == null) index.keys = new List<string>();
                if (index.keys.Contains(key)) return;
                index.keys.Add(key);
                PlayerPrefs.SetString(prefix + "__keys", JsonUtility.ToJson(index));
            }

            public static int GetInt(string key, int defaultValue = 0)
            {
                string prefix = Prefix();
                return prefix == null || !ValidKey(key) ? defaultValue : PlayerPrefs.GetInt(prefix + key, defaultValue);
            }
            public static float GetFloat(string key, float defaultValue = 0f)
            {
                string prefix = Prefix();
                return prefix == null || !ValidKey(key) ? defaultValue : PlayerPrefs.GetFloat(prefix + key, defaultValue);
            }
            public static string GetString(string key, string defaultValue = "")
            {
                string prefix = Prefix();
                return prefix == null || !ValidKey(key) ? defaultValue : PlayerPrefs.GetString(prefix + key, defaultValue);
            }
            public static void SetInt(string key, int value)
            {
                string prefix = Prefix();
                if (prefix == null || !ValidKey(key)) return;
                Track(prefix, key);
                PlayerPrefs.SetInt(prefix + key, value);
            }
            public static void SetFloat(string key, float value)
            {
                string prefix = Prefix();
                if (prefix == null || !ValidKey(key)) return;
                Track(prefix, key);
                PlayerPrefs.SetFloat(prefix + key, value);
            }
            public static void SetString(string key, string value)
            {
                string prefix = Prefix();
                if (prefix == null || !ValidKey(key)) return;
                Track(prefix, key);
                PlayerPrefs.SetString(prefix + key, value);
            }
            public static bool HasKey(string key)
            {
                string prefix = Prefix();
                return prefix != null && ValidKey(key) && PlayerPrefs.HasKey(prefix + key);
            }
            public static void DeleteKey(string key)
            {
                string prefix = Prefix();
                if (prefix == null || !ValidKey(key)) return;
                PlayerPrefs.DeleteKey(prefix + key);
                KeyIndex index = ReadIndex(prefix);
                if (index.keys != null && index.keys.Remove(key))
                    PlayerPrefs.SetString(prefix + "__keys", JsonUtility.ToJson(index));
            }
            public static void DeleteAll()
            {
                string prefix = Prefix();
                if (prefix == null) return;
                KeyIndex index = ReadIndex(prefix);
                if (index.keys != null)
                    foreach (string key in index.keys) PlayerPrefs.DeleteKey(prefix + key);
                PlayerPrefs.DeleteKey(prefix + "__keys");
            }
            public static void Save()
            {
                if (Prefix() != null) PlayerPrefs.Save();
            }
        }
    }
}
