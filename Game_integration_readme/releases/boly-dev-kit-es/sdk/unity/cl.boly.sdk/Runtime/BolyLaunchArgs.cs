using System;
using System.Globalization;

namespace Boly
{
    // Argumentos con los que la app de Boly lanza el juego. Ver
    // spec/PROTOCOL.md §1. Van separados por espacio ("-key abc").
    internal struct BolyLaunchArgs
    {
        public const string DefaultApiBase = "https://ffstudios-shop-api.vercel.app";

        public int GameId;
        // La UNICA credencial. -token (JWT legado) se ignora a proposito: no
        // se lee, no se guarda y nunca se reenvia.
        public string Key;
        // Solo para pruebas: el verifier los envia, el launcher de produccion no.
        public string ApiBase;
        public float HeartbeatSeconds;
        // Solo para el verifier: logro a desbloquear apenas la sesion este lista.
        // Se ignora salvo que ApiBase apunte a este mismo equipo (ver
        // TestAchievementAllowed), asi no sirve para regalarse logros reales.
        public string TestAchievement;

        public static BolyLaunchArgs Parse(string[] args)
        {
            var parsed = new BolyLaunchArgs
            {
                GameId = 0,
                Key = "",
                ApiBase = DefaultApiBase,
                HeartbeatSeconds = 60f
            };

            for (int i = 0; i < args.Length - 1; i++)
            {
                string value = args[i + 1];
                switch (args[i])
                {
                    case "-key":
                        parsed.Key = value;
                        break;
                    case "-game_id":
                        int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed.GameId);
                        break;
                    case "-api_base":
                        parsed.ApiBase = value.TrimEnd('/');
                        break;
                    case "-boly_test_achievement":
                        parsed.TestAchievement = value;
                        break;
                    case "-heartbeat_seconds":
                        if (float.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out float seconds) && seconds > 0f)
                            parsed.HeartbeatSeconds = seconds;
                        break;
                }
            }

            return parsed;
        }

        // true solo si el API es un servidor local (el mock del verifier).
        public bool TestAchievementAllowed
        {
            get
            {
                if (string.IsNullOrEmpty(TestAchievement)) return false;
                if (!Uri.TryCreate(ApiBase, UriKind.Absolute, out var uri)) return false;
                return uri.IsLoopback;
            }
        }
    }
}
