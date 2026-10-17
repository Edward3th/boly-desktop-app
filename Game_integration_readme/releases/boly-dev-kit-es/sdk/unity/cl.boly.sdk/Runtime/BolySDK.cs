using System;
using UnityEngine;

namespace Boly
{
    // Por que termino la sesion. El SDK cierra el juego justo despues de avisar.
    public enum BolyEndReason
    {
        // Build lanzado sin -key (no vino desde la app de Boly).
        MissingKey,
        // El servidor rechazo la sesion: otro equipo la reemplazo, expiro o se
        // perdio el acceso (403), o fallo la validacion inicial.
        Rejected,
        // 4 heartbeats seguidos sin respuesta valida (sin conexion, 5xx, 429).
        Unreachable
    }

    // Datos de la sesion actual. Se completan con el primer heartbeat valido.
    public sealed class BolySession
    {
        // Id del juego en Boly (llega por -game_id).
        public int GameId { get; internal set; }

        // Id de esta sesion de juego. null en modo editor, antes del primer
        // heartbeat, o si el servidor aun no lo informa.
        public string SessionId { get; internal set; }

        // Id seudonimo y estable del alumno (igual en todos los juegos). No
        // identifica a la persona; sirve para separar datos por alumno.
        public string LearnerId { get; internal set; }

        // true si el acceso viene de una suscripcion activa.
        public bool SubscriptionAccess { get; internal set; }

        // true al correr en el editor de Unity sin -key: no hay red ni sesion
        // real, y OnReady se dispara de inmediato para poder probar el juego.
        public bool IsEditor { get; internal set; }
    }

    // Punto de entrada del SDK. No hay que agregar nada a la escena: el SDK se
    // inicia solo antes de cargar la primera escena (ver BolyRuntime) y
    // sobrevive a los cambios de escena.
    //
    // Uso tipico:
    //   if (BolySDK.IsReady) Empezar(); else BolySDK.OnReady += Empezar;
    //   BolySDK.OnSessionEnded += razon => GuardarPartida();
    //   BolySDK.Achievements.Unlock(BolyAchievements.NIVEL_5_COMPLETO);
    public static partial class BolySDK
    {
        public const string Version = "0.3.0";

        // Valor del header X-Boly-SDK que acompana cada peticion.
        internal const string SdkHeader = "unity/" + Version;

        static readonly BolySession session = new BolySession();
        static DateTime? serverTimeAtSync;
        static double realtimeAtSync;

        // true desde el primer heartbeat valido (o de inmediato en el editor).
        public static bool IsReady { get; private set; }

        public static BolySession Session => session;

        // Se dispara una vez, con el primer heartbeat valido. Si te suscribes
        // tarde, revisa IsReady primero.
        public static event Action OnReady;

        // Se dispara justo antes de que el SDK cierre el juego. Ultima
        // oportunidad para guardar; el cierre no se puede cancelar.
        public static event Action<BolyEndReason> OnSessionEnded;

        // Hora del servidor (UTC), corregida con el reloj local desde el ultimo
        // heartbeat. Antes del primero devuelve la hora local en UTC.
        public static DateTime ServerNow =>
            serverTimeAtSync.HasValue
                ? serverTimeAtSync.Value.AddSeconds(Time.realtimeSinceStartupAsDouble - realtimeAtSync)
                : DateTime.UtcNow;

        internal static void SyncServerTime(DateTime serverUtc)
        {
            serverTimeAtSync = serverUtc;
            realtimeAtSync = Time.realtimeSinceStartupAsDouble;
        }

        internal static void MarkReady()
        {
            if (IsReady) return;
            IsReady = true;
            try { OnReady?.Invoke(); }
            catch (Exception e) { Debug.LogException(e); }
        }

        internal static void NotifySessionEnded(BolyEndReason reason)
        {
            try { OnSessionEnded?.Invoke(reason); }
            catch (Exception e) { Debug.LogException(e); }
        }

        // Los campos estaticos sobreviven entre sesiones de Play en el editor
        // cuando "Enter Play Mode Options" desactiva el domain reload.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            IsReady = false;
            OnReady = null;
            OnSessionEnded = null;
            serverTimeAtSync = null;
            session.GameId = 0;
            session.SessionId = null;
            session.LearnerId = null;
            session.SubscriptionAccess = false;
            session.IsEditor = false;
        }
    }
}
