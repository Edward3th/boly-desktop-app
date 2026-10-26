# Boly SDK — referencia para integrar con IA

Los cuatro motores están en 0.4.0.

Referencia completa del SDK de Boly para un asistente de IA (Claude Code,
Cursor, Copilot, etc.) que trabaja **dentro del proyecto de un juego** en
Unity, Godot, Unreal o GameMaker. Contiene todo lo necesario para instalar el
SDK, conectarlo al juego, reportar logros y probarlo, sin leer otros archivos.

> **Para la persona:** copia este archivo a tu proyecto (por ejemplo
> `docs/BOLY_SDK.md`) y agrega a las instrucciones de tu asistente
> (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`…)
> esta línea:
>
> ```
> Este juego se publica en Boly. Antes de tocar el arranque, el guardado, los
> logros o el cierre del juego, lee docs/BOLY_SDK.md y respeta sus reglas.
> ```
>
> Para la primera integración, guiada paso a paso y con el verificador, usa
> `INSTRUCCIONES_IA.md` del kit de integración.

---

## 1. Qué hace el SDK

Boly es una tienda de juegos educativos. Los juegos se abren **solo desde la
app de escritorio de Boly**, que los lanza así:

```
Juego.exe -game_id <número> -key <hex>
```

El SDK:

1. Se inicia solo antes de la primera escena/nivel/room y sobrevive a los
   cambios de escena (en GameMaker, con un objeto persistente).
2. Lee `-game_id` y `-key` y valida la sesión contra el API de Boly.
3. Queda **listo** (`ready`) con el primer heartbeat válido. Antes de eso el
   juego no debería empezar el gameplay.
4. Envía un heartbeat cada ~60 s en tiempo real (sigue con el juego en pausa o
   con la escala de tiempo en 0).
5. **Cierra el juego** cuando la sesión termina, y avisa justo antes
   (`session ended`) para que el juego guarde. El cierre no se puede cancelar.
6. Reporta **logros** (desde 0.2.0) con una cola en disco que reintenta sola.
7. Le avisa a la **app de Boly** de cada logro desbloqueado, para que muestre
   su aviso tipo Steam encima del juego (desde 0.3.0, §4).

Razones de cierre (`EndReason`):

| Razón | Cuándo |
|---|---|
| `MissingKey` | El `.exe` se abrió sin `-key` (no vino desde la app de Boly). |
| `Rejected` | El servidor respondió 403: otro equipo abrió la misma cuenta, la sesión expiró, se perdió el acceso, o falló la validación inicial. |
| `Unreachable` | 4 heartbeats seguidos sin respuesta válida (sin red, 5xx, 429). Un fallo aislado se tolera. |

**Modo editor:** dentro del editor (Play de Unity, F5 de Godot, PIE de Unreal,
Run de GameMaker) y sin `-key`, el SDK no hace peticiones, no cierra el juego,
queda listo de inmediato y marca la sesión como `IsEditor`. Los logros se
simulan localmente (ver §4). Un **build** abierto a mano, sin la app, se cierra
con `MissingKey`: es lo esperado.

---

## 2. Reglas (obligatorias)

**Haz:**

- Instala el SDK tal como viene y deja que se inicie solo.
- Empieza el gameplay cuando el SDK esté listo (`IsReady` / `OnReady`).
- Guarda el progreso del juego en `OnSessionEnded` si el juego tiene progreso.
- Reporta logros **solo** con las funciones del SDK y las constantes
  descargadas de boly.cl.
- Usa cargas asíncronas para escenas o niveles pesados.
- Prueba siempre un **build** de Windows con el verificador (§7).

**No hagas:**

1. **No edites los archivos del SDK.** Si algo falla dentro del SDK, repórtalo
   a la persona; no lo parches.
2. No leas ni uses `-token`, y no agregues un header `Authorization` a nada de
   Boly. La única credencial es `-key` y la maneja el SDK.
3. No escribas el id del juego en el código: llega en `-game_id`.
4. No hagas peticiones HTTP propias a Boly (heartbeat, logros, nada).
5. No inventes logros: los define la persona, en boly.cl o en
   `boly/achievements.json`. Si te pide escribir ese archivo, usa los logros
   que ella describa, y no cambies un `api_name` que ya existe.
6. No agregues reintentos, colas ni guardado propio para los logros.
7. No bloquees el cierre: en Unity no devuelvas `false` en
   `Application.wantsToQuit`; en ningún motor hagas esperas largas dentro del
   aviso de cierre.
8. No uses el SDK en builds web (WebGL / HTML5): todavía no está soportado.
   Pregunta a la persona.
9. No subas builds ni nada a boly.cl: eso lo hace la persona.

**Detente y pregunta** si el motor no es compatible (Unity < 2021.3, Godot 3,
Unreal 4, GameMaker anterior a 2024), si el juego es web, o si encuentras una
integración antigua (`ParamsCatcher`) y no está claro el flujo de escenas.

---

## 3. Elegir el motor

| Motor | Versión mínima | Formato | Carpeta en el kit | Estado |
|---|---|---|---|---|
| Unity | 2021.3 LTS | Paquete UPM `cl.boly.sdk` | `sdk/unity/cl.boly.sdk/` | 0.4.0 probado en Unity 2021.3.40f1 y 6000 |
| Godot | 4.0 (GDScript) | Addon + autoload `Boly` | `sdk/godot/addons/boly_sdk/` | Sin probar en el motor |
| Unreal | 5.0 | Plugin C++/Blueprint `BolySDK` | `sdk/unreal/BolySDK/` | Sin compilar |
| GameMaker | runtime 2024 | Script `boly_sdk` + objeto `obj_boly` | `sdk/gamemaker/` | Sin probar en el motor |

"Sin probar" significa que el código sigue al SDK de Unity pero nadie lo ha
corrido en ese motor. El verificador (§7) es la prueba: si falla con el SDK sin
modificar, es un error del SDK; repórtalo a la persona con la salida.

Cómo reconocer el motor: Unity → `ProjectSettings/ProjectVersion.txt`; Godot →
`project.godot`; Unreal → `*.uproject`; GameMaker → `*.yyp`.

---

## 4. Logros: lo común a todos los motores

### Dónde nacen

Cada logro tiene:

- **Nombre** y **descripción** (lo que ven los jugadores; en español e inglés).
- **`api_name`**: la clave que usa el código. Formato `^[A-Z][A-Z0-9_]{0,63}$`,
  por ejemplo `NIVEL_5_COMPLETO`. Única por juego. No cambia nunca.
- **Meta** (`target`): `1` = se consigue de una vez; `N > 1` = tiene progreso
  (ej. "Responde 100 preguntas" → meta 100).
- **Oculto**: no muestra nombre ni descripción hasta desbloquearse.
- **Ícono** (opcional).

Hay dos formas de definirlos. Para juegos nuevos se recomienda la B.

**A. En boly.cl.** La persona los crea en **Panel de desarrollador ▸ su juego
▸ Gestionar logros** y descarga ahí el archivo de constantes del motor.

**B. En la build: `boly/achievements.json`.** El juego trae sus logros:

```
<proyecto>/boly/achievements.json
<proyecto>/boly/icons/nivel_5.png
```

```json
{
  "$schema": "https://boly.cl/schemas/achievements-1.json",
  "version": 1,
  "achievements": [
    {
      "api_name": "NIVEL_5_COMPLETO",
      "name": { "es": "Nivel 5 completo", "en": "Level 5 complete" },
      "description": { "es": "Termina el nivel 5" },
      "target": 1,
      "hidden": false,
      "icon": "icons/nivel_5.png"
    }
  ]
}
```

- Orden del arreglo = orden en que se muestran. `target` (default 1),
  `hidden` (default `false`), `description` e `icon` son opcionales. No se
  aceptan otros campos: uno mal escrito (`"hiden"`) es un error.
- Íconos: PNG o JPEG cuadrados, de 64 a 512 px, hasta 256 KB. La ruta es
  relativa a `boly/` y distingue mayúsculas.
- La carpeta `boly/` tiene que quedar **junto al ejecutable** dentro del zip
  que se sube:

  | Motor | Dónde va en el proyecto | Cómo llega a la build |
  |---|---|---|
  | Unity | `<proyecto>/boly/` (junto a `Assets/`, no dentro) | El SDK la copia junto al `.exe` al compilar |
  | Godot | `res://boly/` con un archivo vacío `boly/.gdignore` | El SDK la copia junto al ejecutable al exportar |
  | Unreal | `<proyecto>/boly/` | Copiarla a mano junto al `.exe` antes de comprimir |
  | GameMaker | Una carpeta `boly/` fuera del proyecto | Copiarla a mano junto al `.exe` antes de comprimir |

- Al subir la build, Boly crea los logros nuevos como **borradores**: solo
  el desarrollador del juego y los admins los ven y pueden probarlos con la
  build instalada desde la app. Al **aprobar** la build se activan; los que
  ya no aparecen se retiran (los jugadores conservan su progreso). Desde ahí
  el archivo manda y el editor de boly.cl queda en solo lectura.
- Valida el archivo y genera las constantes con el verificador del kit, sin
  subir nada (ver §7):

  ```powershell
  & "<KIT>\boly-verify-win.exe" manifest "<carpeta del build o .zip>" --constants unity --out "<carpeta de scripts>"
  ```

- En el editor (Unity y Godot), reportar un `api_name` que no está en el
  manifiesto muestra un aviso: Boly lo ignoraría.
- Un juego que ya tiene logros en boly.cl puede pasarse a B con **Descargar
  carpeta boly/** en la página de logros.
- Especificación completa: `spec/ACHIEVEMENTS_MANIFEST.md` del repo del SDK.

En ambos casos el **archivo de constantes** (`BolyAchievements.cs`,
`boly_achievements.gd`, `BolyAchievements.h` o `boly_achievements.gml`) se
agrega al proyecto y se usa en vez de escribir strings. No se edita a mano:
si cambian los logros, se vuelve a generar.

### Tres operaciones

| Operación | Para qué | Ejemplo |
|---|---|---|
| **Unlock** | Logros de una vez, o completar uno con meta. Lleva el progreso a la meta. | "Termina el nivel 5" |
| **Increment(n = 1)** | Contadores por evento: suma `n` (> 0). | "Responde 100 preguntas": `Increment` en cada acierto |
| **SetProgress(v)** | El juego ya lleva un total (≥ 0) y lo informa. | "Junta 50 estrellas": `SetProgress(estrellasTotales)` |

Garantías del servidor:

- El progreso **nunca baja** (un `SetProgress` menor que el actual no hace nada)
  y **nunca pasa la meta**. Al llegar a la meta, el logro se desbloquea solo.
- Un desbloqueo es para siempre. Repetir `Unlock` no hace nada.
- Cada operación lleva un id único: si se reenvía, **no se cuenta dos veces**.

### Cómo se envían

- Las llamadas **no bloquean y no fallan**: cada operación se guarda en una cola
  en disco y se envía apenas hay sesión y red.
- La cola está **separada por juego y por alumno** (`LearnerId`): en un PC
  compartido del colegio, lo pendiente de un alumno solo se envía cuando ese
  mismo alumno vuelve a jugar.
- Sin red, se reintenta después de cada heartbeat; si el juego se cierra, se
  envía en la próxima sesión.
- Al iniciar la sesión el SDK descarga el estado de los logros (`Synced`).
  Desde ahí puedes consultar `IsUnlocked` / el progreso conocido.
- El aviso **Unlocked** llega una sola vez por logro y jugador, cuando el
  servidor confirma un desbloqueo nuevo. La app de Boly ya muestra su propio
  aviso (ver abajo); úsalo para efectos dentro del juego.
- Un `api_name` con formato inválido se descarta con un error en la consola.
  Uno con formato válido pero que no existe en el juego aparece como
  `[Boly] El logro "..." no existe en este juego`.
- **En el editor** no se envía nada: se registra en la consola y un `Unlock`
  dispara el aviso de desbloqueo localmente para probar el popup.
- Para volver a probar un desbloqueo real con su cuenta, la persona usa
  **Borrar mi progreso de prueba** en la página de logros de boly.cl.

### El aviso de Boly (SDK 0.3+)

Cuando el servidor confirma un desbloqueo, la **app de Boly** muestra un aviso
tipo Steam encima del juego, abajo a la derecha: ícono, "¡Logro
desbloqueado!", nombre y un sonido corto. El juego no tiene que dibujar nada.

- Funciona solo: el SDK le avisa a la app por una carpeta que la app pasa en
  `-boly_events_dir` (spec `PROTOCOL.md` §5.1). No hay nada que programar.
- `OnUnlocked` sigue disponible para efectos **dentro** del juego (una
  animación, desbloquear un objeto). No hace falta un popup propio.
- **Pantalla completa sin bordes.** Sobre un juego en pantalla completa
  *exclusiva* ninguna ventana se ve, y el aviso tampoco:

  | Motor | Modo de pantalla completa que muestra el aviso |
  |---|---|
  | Unity | *Fullscreen Window* (el default de Windows); no *Exclusive Fullscreen* |
  | Godot | *Fullscreen*; no *Exclusive Fullscreen* |
  | Unreal | *Windowed Fullscreen* (el default de UE5); no *Fullscreen* |
  | GameMaker | Ventana o pantalla completa sin bordes |

- **GameMaker:** el aviso requiere **Game Options ▸ Windows ▸ General ▸
  Disable file system sandbox**. Con el sandbox activo, GameMaker no puede
  escribir fuera de su área de guardado y el aviso no aparece. El juego sigue
  funcionando igual.
- El verificador lo revisa en el escenario 6 ("Notifies the Boly app of the
  unlock").

### Buenas prácticas

- Llama en el **evento** que corresponde (nivel terminado, respuesta correcta),
  no en `Update`/`_process`/Step: cada llamada es una operación en la cola.
- Para totales que cambian seguido (puntaje, estrellas), llama `SetProgress`
  solo cuando el valor cambia, o al terminar el nivel.
- No condiciones el gameplay a que un logro se haya enviado.
- No guardes una copia propia de "logros desbloqueados": consulta al SDK.

---

## 5. Referencia por motor

### 5.1 Unity (C#)

**Instalar**

1. Copia la carpeta `cl.boly.sdk` a `Packages/cl.boly.sdk` del proyecto, para
   que quede `Packages/cl.boly.sdk/package.json`. **Conserva los `.meta`.**
2. No agregues nada a la escena: el SDK se crea solo
   (`RuntimeInitializeOnLoadMethod`) y persiste entre escenas.
3. Opcional: **Boly ▸ Settings** crea `Assets/Resources/BolySettings.asset`.

| Ajuste (`BolySettings`) | Default | Uso |
|---|---|---|
| `enabledInBuilds` | `true` | Desactívalo solo en builds que no van a Boly. |
| `sceneOnReady` | `-1` | Índice de escena a cargar cuando la sesión queda lista (flujo "escena de carga → juego"). `-1` = no cargar nada. |

**API** (`using Boly;`)

| Miembro | Tipo | Descripción |
|---|---|---|
| `BolySDK.Version` | `const string` | `"0.4.0"` |
| `BolySDK.IsReady` | `bool` | Sesión validada (en el editor, de inmediato). |
| `BolySDK.OnReady` | `event Action` | Una vez, con el primer heartbeat válido. Si te suscribes tarde no se dispara: revisa `IsReady` antes. |
| `BolySDK.OnSessionEnded` | `event Action<BolyEndReason>` | Justo antes de cerrar el juego. |
| `BolySDK.Session` | `BolySession` | `GameId` (int), `SessionId` (string, null en editor), `LearnerId` (string seudónimo), `SubscriptionAccess` (bool), `IsEditor` (bool). |
| `BolySDK.ServerNow` | `DateTime` (UTC) | Hora del servidor; antes del primer heartbeat, la hora local en UTC. |
| `BolyEndReason` | `enum` | `MissingKey`, `Rejected`, `Unreachable` |
| `BolySDK.Achievements.Unlock(string apiName)` | `void` | |
| `BolySDK.Achievements.Increment(string apiName, int amount = 1)` | `void` | `amount` > 0 |
| `BolySDK.Achievements.SetProgress(string apiName, int value)` | `void` | `value` ≥ 0 |
| `BolySDK.Achievements.OnUnlocked` | `event Action<BolyAchievementState>` | Desbloqueo nuevo confirmado. |
| `BolySDK.Achievements.OnSynced` / `IsSynced` | `event Action` / `bool` | Llegó el estado inicial. |
| `BolySDK.Achievements.IsUnlocked(string apiName)` | `bool` | Según el estado conocido. |
| `BolySDK.Achievements.TryGetState(string apiName, out BolyAchievementState s)` | `bool` | `s.ApiName`, `s.Current`, `s.Target`, `s.Unlocked`. |
| `BolySDK.Achievements.PendingCount` | `int` | Operaciones sin confirmar. |

**Constantes** (`BolyAchievements.cs`, generado por boly.cl):

```csharp
namespace Boly
{
    public static class BolyAchievements
    {
        /// <summary>Nivel 5 completo</summary>
        public const string NIVEL_5_COMPLETO = "NIVEL_5_COMPLETO";
    }
}
```

**Ejemplo completo**

```csharp
using Boly;
using UnityEngine;

public class GameBootstrap : MonoBehaviour
{
    void Awake()
    {
        if (BolySDK.IsReady) StartGameplay();
        else BolySDK.OnReady += StartGameplay;

        BolySDK.OnSessionEnded += reason => SaveSystem.SaveNow();
        BolySDK.Achievements.OnUnlocked += state => AchievementPopup.Show(state.ApiName);
    }

    void OnDestroy()
    {
        BolySDK.OnReady -= StartGameplay;
    }

    void StartGameplay() { /* menú principal, primer nivel, etc. */ }
}

// En el código del juego, donde ocurre cada cosa:
BolySDK.Achievements.Unlock(BolyAchievements.NIVEL_5_COMPLETO);
BolySDK.Achievements.Increment(BolyAchievements.RESPONDER_100);
BolySDK.Achievements.SetProgress(BolyAchievements.ESTRELLAS_50, totalStars);
```

**Notas Unity**

- Desuscribe los eventos en `OnDestroy` si el objeto puede destruirse; los
  eventos son estáticos.
- La cola vive en `Application.persistentDataPath/boly/`.
- Carga escenas con `SceneManager.LoadSceneAsync`.
- No uses `Application.wantsToQuit` para impedir el cierre.

---

### 5.2 Godot 4 (GDScript)

**Instalar**

1. Copia `addons/boly_sdk` a `res://addons/boly_sdk`.
2. Activa el plugin (Proyecto ▸ Configuración ▸ Plugins ▸ Boly SDK) o edita
   `project.godot`, agregando las entradas sin borrar las que ya existan:

   ```ini
   [autoload]
   Boly="*res://addons/boly_sdk/boly.gd"

   [editor_plugins]
   enabled=PackedStringArray("res://addons/boly_sdk/plugin.cfg")
   ```

3. Opcional, para el flujo "escena de carga → juego":

   ```ini
   [boly]
   scene_on_ready="res://ruta/a/MainGame.tscn"
   ```

El autoload corre con `PROCESS_MODE_ALWAYS` (late aunque el árbol esté en
pausa) y sobrevive a `change_scene_to_file()`.

**API** (autoload `Boly`)

| Miembro | Tipo | Descripción |
|---|---|---|
| `Boly.VERSION` | `const String` | `"0.4.0"` |
| `Boly.is_ready` | `bool` | Sesión validada (en el editor, en el frame siguiente al arranque). |
| `Boly.session_ready` | `signal` | Una vez. Si conectas tarde, revisa `is_ready` antes. |
| `Boly.session_ended(reason: EndReason)` | `signal` | Justo antes de cerrar. |
| `Boly.EndReason` | `enum` | `MISSING_KEY`, `REJECTED`, `UNREACHABLE` |
| `Boly.game_id` / `session_id` / `learner_id` | `int` / `String` / `String` | Datos de la sesión (`""` en el editor). |
| `Boly.subscription_access` / `is_editor` | `bool` | |
| `Boly.server_now_unix()` | `float` | Hora del servidor en segundos Unix (UTC). |
| `Boly.unlock_achievement(api_name: String)` | `void` | |
| `Boly.increment_achievement(api_name: String, amount: int = 1)` | `void` | `amount` > 0 |
| `Boly.set_achievement_progress(api_name: String, value: int)` | `void` | `value` ≥ 0 |
| `Boly.achievement_unlocked(api_name: String, current: int, target: int)` | `signal` | Desbloqueo nuevo confirmado. |
| `Boly.achievements_synced` / `achievements_in_sync` | `signal` / `bool` | Llegó el estado inicial. |
| `Boly.is_achievement_unlocked(api_name)` | `bool` | |
| `Boly.get_achievement(api_name)` | `Dictionary` | `{"current", "target", "unlocked"}`, o `{}` si no se conoce. |
| `Boly.pending_achievements()` | `int` | Operaciones sin confirmar. |

**Constantes** (`boly_achievements.gd`, generado por boly.cl):

```gdscript
class_name BolyAchievements
extends RefCounted

## Nivel 5 completo
const NIVEL_5_COMPLETO := "NIVEL_5_COMPLETO"
```

**Ejemplo completo**

```gdscript
extends Node

func _ready() -> void:
	if Boly.is_ready:
		_start_gameplay()
	else:
		Boly.session_ready.connect(_start_gameplay, CONNECT_ONE_SHOT)
	Boly.session_ended.connect(func(_reason): SaveSystem.save_now())
	Boly.achievement_unlocked.connect(func(api_name, _current, _target): $AchievementPopup.show_for(api_name))

func _start_gameplay() -> void:
	pass  # menú principal, primer nivel, etc.

# En el código del juego:
#   Boly.unlock_achievement(BolyAchievements.NIVEL_5_COMPLETO)
#   Boly.increment_achievement(BolyAchievements.RESPONDER_100)
#   Boly.set_achievement_progress(BolyAchievements.ESTRELLAS_50, total_stars)
```

**Notas Godot**

- La cola vive en `user://boly/`.
- Exporta con un preset "Windows Desktop"; el addon se incluye solo.
- Prefiere `ResourceLoader.load_threaded_request` para escenas pesadas.

---

### 5.3 Unreal Engine 5 (C++ y Blueprint)

**Instalar**

1. Copia `BolySDK` a `Plugins/BolySDK` del proyecto.
2. Regenera los archivos del proyecto y compila. El plugin queda activo.
3. Para usarlo desde C++, agrega el módulo a `Source/<Juego>/<Juego>.Build.cs`:

   ```csharp
   PublicDependencyModuleNames.AddRange(new string[] { "BolySDK" });
   ```

   Solo-Blueprint no necesita esto, pero un proyecto sin carpeta `Source/` no
   compila plugins C++: pregunta a la persona antes de convertirlo.
4. Opcional, flujo "mapa de carga → nivel principal" en
   `Config/DefaultGame.ini` (o Project Settings ▸ Plugins ▸ Boly SDK):

   ```ini
   [/Script/BolySDK.BolySettings]
   LevelOnReady=/Game/Ruta/MainLevel.MainLevel
   ```

   `bEnabledInBuilds=True` es el default.

`UBolySubsystem` es un `UGameInstanceSubsystem`: se crea solo y persiste entre
niveles. En Blueprint: **Get Game Instance Subsystem (Boly Subsystem)**;
categorías *Boly* y *Boly | Achievements*.

**API** (`#include "BolySubsystem.h"`)

| Miembro | Tipo | Descripción |
|---|---|---|
| `IsReady()` | `bool` | Sesión validada (en PIE, de inmediato). |
| `OnReady` | delegado dinámico `()` | Una vez. Si te suscribes tarde, revisa `IsReady()`. |
| `OnSessionEnded` | delegado dinámico `(EBolyEndReason Reason)` | Justo antes de cerrar. |
| `EBolyEndReason` | `UENUM` | `MissingKey`, `Rejected`, `Unreachable` |
| `GetGameId()` / `GetSessionId()` / `GetLearnerId()` | `int32` / `FString` / `FString` | Datos de la sesión. |
| `HasSubscriptionAccess()` / `IsEditorSession()` | `bool` | |
| `GetServerNow()` | `FDateTime` (UTC) | Hora del servidor. |
| `UnlockAchievement(const FString& ApiName)` | `void` | |
| `IncrementAchievement(const FString& ApiName, int32 Amount = 1)` | `void` | `Amount` > 0 |
| `SetAchievementProgress(const FString& ApiName, int32 Value)` | `void` | `Value` ≥ 0 |
| `OnAchievementUnlocked` | delegado dinámico `(const FString& ApiName, int32 Current, int32 Target)` | Desbloqueo nuevo confirmado. |
| `OnAchievementsSynced` | delegado dinámico `()` | Llegó el estado inicial. |
| `IsAchievementUnlocked(const FString& ApiName)` | `bool` | |
| `GetAchievementProgress(const FString& ApiName, int32& Current, int32& Target)` | `bool` | `false` si no se conoce. |
| `GetPendingAchievementCount()` | `int32` | Operaciones sin confirmar. |

Los delegados son dinámicos: los handlers C++ deben ser `UFUNCTION()` con la
firma exacta, y se enlazan con `AddDynamic` / `AddUniqueDynamic`.

**Constantes** (`BolyAchievements.h`, generado por boly.cl):

```cpp
#pragma once
#include "CoreMinimal.h"

namespace BolyAchievements
{
	// Nivel 5 completo
	inline constexpr const TCHAR* NIVEL_5_COMPLETO = TEXT("NIVEL_5_COMPLETO");
}
```

**Ejemplo completo**

```cpp
// MyGameInstance.h
UCLASS()
class UMyGameInstance : public UGameInstance
{
	GENERATED_BODY()
public:
	virtual void Init() override;
private:
	UFUNCTION() void StartGameplay();
	UFUNCTION() void HandleSessionEnded(EBolyEndReason Reason);
	UFUNCTION() void HandleAchievementUnlocked(const FString& ApiName, int32 Current, int32 Target);
};

// MyGameInstance.cpp
#include "BolySubsystem.h"
#include "BolyAchievements.h"

void UMyGameInstance::Init()
{
	Super::Init();
	UBolySubsystem* Boly = GetSubsystem<UBolySubsystem>();
	if (Boly->IsReady()) StartGameplay();
	else Boly->OnReady.AddUniqueDynamic(this, &UMyGameInstance::StartGameplay);
	Boly->OnSessionEnded.AddUniqueDynamic(this, &UMyGameInstance::HandleSessionEnded);
	Boly->OnAchievementUnlocked.AddUniqueDynamic(this, &UMyGameInstance::HandleAchievementUnlocked);
}

// En el código del juego (desde un actor):
UBolySubsystem* Boly = GetGameInstance()->GetSubsystem<UBolySubsystem>();
Boly->UnlockAchievement(BolyAchievements::NIVEL_5_COMPLETO);
Boly->IncrementAchievement(BolyAchievements::RESPONDER_100);
Boly->SetAchievementProgress(BolyAchievements::ESTRELLAS_50, TotalStars);
```

**Notas Unreal**

- La cola vive en `Saved/Boly/`.
- *Standalone Game* lanzado desde el editor **no** es PIE: sin `-key` se cierra.
- Usa streaming de niveles o `OpenLevel` sin bloqueos largos del game thread.

---

### 5.4 GameMaker (GML, runtime 2024+)

**Instalar**

1. Crea un **Script** llamado `boly_sdk` con el contenido de
   `scripts/boly_sdk.gml`.
2. Crea un **objeto** `obj_boly` con **Persistent** activado y dos eventos:
   - **Create** = `objects/obj_boly/Create_0.gml`
   - **Async ▸ HTTP** = `objects/obj_boly/Other_62.gml`
3. Pon una instancia de `obj_boly` en la **primera** room del juego.
4. Opcional, flujo "room de carga → juego": en el Creation Code de esa
   instancia, `room_on_ready = rm_main;`.
5. Para el aviso de logros de la app de Boly: **Game Options ▸ Windows ▸
   General ▸ Disable file system sandbox** (ver §4, "El aviso de Boly").

Si no puedes crear assets editando `.yy`/`.yyp` con seguridad, deja el código
listo y pide a la persona que haga estos pasos en el IDE.

**API**

| Función | Retorna | Descripción |
|---|---|---|
| `BOLY_VERSION` | macro | `"0.4.0"` |
| `boly_is_ready()` | `bool` | Sesión validada (desde el IDE, de inmediato). |
| `boly_on_ready(cb)` | — | `cb()` cuando quede lista; si ya lo está, la llama al tiro. |
| `boly_on_session_ended(cb)` | — | `cb(reason)` justo antes de cerrar. |
| `BOLY_END_REASON` | enum | `MISSING_KEY`, `REJECTED`, `UNREACHABLE` |
| `boly_game_id()` / `boly_session_id()` / `boly_learner_id()` | real / string / string | Datos de la sesión. |
| `boly_has_subscription_access()` / `boly_is_editor()` | `bool` | |
| `boly_server_now()` | real | Hora del servidor en segundos Unix (UTC). |
| `boly_achievement_unlock(api_name)` | — | |
| `boly_achievement_increment(api_name, amount = 1)` | — | `amount` > 0 |
| `boly_achievement_set(api_name, value)` | — | `value` ≥ 0 |
| `boly_on_achievement_unlocked(cb)` | — | `cb(api_name, current, target)` en un desbloqueo nuevo. |
| `boly_on_achievements_synced(cb)` | — | `cb()` al llegar el estado inicial (de inmediato si ya llegó). |
| `boly_achievement_is_unlocked(api_name)` | `bool` | |
| `boly_achievement_get(api_name)` | struct | `{ current, target, unlocked }`, o `undefined` si no se conoce. |
| `boly_achievement_pending()` | real | Operaciones sin confirmar. |

Las funciones y variables que empiezan con `__boly_` son internas: no las uses.

**Constantes** (`boly_achievements.gml`, en un Script con ese nombre):

```gml
// Nivel 5 completo
#macro BOLY_ACH_NIVEL_5_COMPLETO "NIVEL_5_COMPLETO"
```

**Ejemplo completo**

```gml
// Create de un objeto controlador (en la primera room, después de obj_boly)
boly_on_ready(function() {
    room_goto(rm_menu);
});
boly_on_session_ended(function(_reason) {
    scr_save_game();
});
boly_on_achievement_unlocked(function(_api_name, _current, _target) {
    instance_create_layer(0, 0, "UI", obj_achievement_popup, { api_name: _api_name });
});

// En el código del juego:
boly_achievement_unlock(BOLY_ACH_NIVEL_5_COMPLETO);
boly_achievement_increment(BOLY_ACH_RESPONDER_100);
boly_achievement_set(BOLY_ACH_ESTRELLAS_50, global.total_stars);
```

**Notas GameMaker**

- "Modo editor" = correr desde el IDE (`GM_build_type == "run"`) sin `-key`.
- La cola es un archivo `boly_achievements_<juego>_<alumno>.json` en el área de
  guardado del juego.
- `obj_boly` debe existir en la primera room y no debe destruirse.

---

## 6. Migrar desde el ParamsCatcher (integración antigua)

Antes del SDK, los juegos usaban un script `ParamsCatcher` que hacía el
heartbeat. Si lo encuentras, **reemplázalo** (no conviven):

| Motor | Integración antigua | Qué hacer |
|---|---|---|
| Unity | `ParamsCatcher.cs` + su GameObject | Bórralos. Si la escena de auth saltaba a otra (`LoadSceneAsync(1)`), usa `sceneOnReady` o quita la escena de auth del build. |
| Godot | `ParamsCatcher.gd` + su nodo | Bórralos. Usa `boly/scene_on_ready` si había salto de escena. |
| Unreal | `ValidationSubsystem.h/.cpp` | Bórralos (y `HTTP`/`Json` del `.Build.cs` si solo eran para eso). Usa `LevelOnReady`. |
| GameMaker | `obj_params_catcher` | Bórralo. Usa `room_on_ready` en la instancia de `obj_boly`. |

Anota antes adónde saltaba la integración antigua al validar, para no perder
el flujo de escenas.

---

## 7. Probar

El modo editor no prueba la integración real. Siempre compila un **build de
Windows** y pásalo por el verificador del kit (`boly-verify-win.exe`), que
simula el servidor de Boly:

```powershell
& "<KIT>\boly-verify-win.exe" --game "<ruta al .exe del build>" --game-id 0 --json
```

Tarda 1–2 minutos y abre y cierra el juego varias veces. Sale con código `0`
solo si todo pasa. Escenarios:

1. Sesión válida: heartbeat a tiempo, header `X-Boly-SDK`, sin `Authorization`.
2. 403 → el juego se cierra.
3. Un fallo de red aislado → el juego sigue.
4. Fallos repetidos → el juego se cierra.
5. Sin `-key` → se cierra sin hacer peticiones.
6. Logros: el verificador desbloquea uno de prueba, corta la red una vez y
   comprueba que se reenvía con el mismo id y que el juego sigue. No hay que
   programar nada para este escenario.
7. Manifiesto: si hay un `boly/achievements.json` junto al `.exe`, lo valida
   (y sus íconos) igual que Boly al subir la build.

Para revisar solo el manifiesto (sin abrir el juego), en la carpeta o en el
zip que se va a subir:

```powershell
& "<KIT>\boly-verify-win.exe" manifest "<carpeta del build o .zip>"
```

| Falla | Causa probable | Arreglo |
|---|---|---|
| "Game sent a heartbeat" | El SDK no está en el build | Unity: paquete en `Packages/`, `enabledInBuilds`; Godot: autoload `Boly`; Unreal: plugin compilado; GameMaker: `obj_boly` en la primera room |
| "No Authorization header" | El juego agrega un token | Quita ese código (o un ParamsCatcher que quedó) |
| "Game quit on 403" / "Repeated failures" | Algo impide cerrar | `Application.wantsToQuit`, o un handler de cierre que se bloquea |
| "Cadence is steady" | El heartbeat se detuvo | Cargas que bloquean el hilo principal; usa carga asíncrona |
| WARN "Identifies the SDK" | Sigue el ParamsCatcher | Termina la migración (§6) |
| Escenario 6 en WARN | SDK anterior a 0.2.0 | Copia el SDK actual del kit |
| WARN "Notifies the Boly app of the unlock" | SDK anterior a 0.3.0 | Copia el SDK actual del kit |
| FAIL "Notifies the Boly app of the unlock" | SDK modificado; en GameMaker, sandbox activo | Copia el SDK sin cambios; en GameMaker desactiva el sandbox de archivos |
| Escenario 6 en FAIL | SDK modificado o error del SDK | Copia el SDK sin cambios; si sigue fallando en Godot/Unreal/GameMaker, repórtalo |
| Escenario 7 en FAIL | `boly/achievements.json` con errores | Corrige lo que indica cada línea (campo y ubicación) |
| Escenario 7 en WARN `icon_missing` | Ruta o mayúsculas distintas | Usa el nombre exacto del archivo; el mensaje sugiere el correcto |

Los argumentos `-api_base`, `-heartbeat_seconds` y `-boly_test_achievement`
existen solo para el verificador (este último solo funciona contra un
servidor local). No los uses en el juego.

---

## 8. Lista de verificación final

- [ ] Motor y versión compatibles; build de Windows (no web).
- [ ] SDK copiado sin modificaciones (Unity: con `.meta`).
- [ ] Integración antigua (`ParamsCatcher`) eliminada, flujo de escenas intacto.
- [ ] El gameplay empieza con `IsReady` / `OnReady`.
- [ ] El progreso se guarda en `OnSessionEnded` (si el juego guarda algo).
- [ ] La partida se carga despues de `OnReady` y todos los datos del jugador
      usan la ruta o las preferencias por alumno del SDK (§9).
- [ ] Sin `-token`, sin `Authorization`, sin id de juego fijo, sin HTTP propio a Boly.
- [ ] Logros: constantes del motor (de boly.cl o generadas desde
      `boly/achievements.json`), llamadas en los eventos correctos, popup en
      `OnUnlocked` (opcional).
- [ ] Si el juego declara sus logros: `boly/` junto al `.exe` en la build.
- [ ] Pantalla completa sin bordes (no exclusiva), para que se vea el aviso de
      Boly. GameMaker: sandbox de archivos desactivado.
- [ ] Build de Windows compilado y verificador con todos los escenarios en PASS.
- [ ] Informe a la persona: archivos cambiados, ruta del `.exe`, resultado del
      verificador y los `api_name` conectados. La subida a boly.cl la hace ella.

## 9. Guardar la partida (SDK 0.4+)

En un PC compartido, varias cuentas de Boly usan la misma cuenta de Windows.
Por eso **todo dato propio del jugador** debe ir a la carpeta que entrega el
SDK. Carga la partida después de `OnReady` y guárdala al cerrar normalmente y
en `OnSessionEnded`. Antes de `OnReady` las funciones devuelven vacío y no
escriben. El primer acceso crea la carpeta.

| Motor | Carpeta | Obtener archivo |
|---|---|---|
| Unity | `persistentDataPath/boly/saves/<alumno>/` | `BolySDK.Saves.PathFor("partida.json")` |
| Godot | `user://boly/saves/<alumno>/` | `Boly.save_path("partida.save")` |
| Unreal | `Saved/Boly/Saves/<alumno>/` | `Boly->GetSavePath(TEXT("partida.json"))` |
| GameMaker | `boly_saves/<alumno>/` | `boly_save_path("partida.ini")` |

`<alumno>` es el `learner_id` estable del primer heartbeat. En el editor es
`editor`; si falta o es inválido es `_sin_alumno` con una advertencia. Las
partidas antiguas compartidas permanecen donde están y el SDK no las lee ni
las mueve automáticamente. Así se empieza de cero al actualizar. Si un juego
necesita recuperar una partida antigua, el desarrollador debe decidir a qué
alumno pertenece antes de copiarla; en un PC escolar no se puede deducir.
Unity ofrece `BolySDK.Saves.ClaimLegacy(rutaAntigua)` como opción explícita
para copiar una vez un archivo o carpeta antigua bajo `persistentDataPath` a
la carpeta del alumno actual. Devuelve `false` si ya fue reclamada, si el
destino existe o si no se pudo copiar. El original permanece intacto.
La partida queda en este PC; el SDK aún no sincroniza partidas en la nube.

### Unity

```csharp
void Empezar()
{
    var archivo = BolySDK.Saves.PathFor("partida.json");
    if (archivo != null && System.IO.File.Exists(archivo))
        Cargar(System.IO.File.ReadAllText(archivo));
}

void Guardar()
{
    var archivo = BolySDK.Saves.PathFor("partida.json");
    if (archivo != null) System.IO.File.WriteAllText(archivo, Serializar());
}

void Awake()
{
    if (BolySDK.IsReady) Empezar(); else BolySDK.OnReady += Empezar;
    BolySDK.OnSessionEnded += _ => Guardar();
}

void OnApplicationQuit() => Guardar();
```

Si el juego usa `PlayerPrefs`, reemplaza **todas** las llamadas por
`BolySDK.Prefs` (`Get/SetInt`, `Get/SetFloat`, `Get/SetString`, `HasKey`,
`DeleteKey`, `DeleteAll`, `Save`). Las claves quedan como
`boly.<learner_id>.<clave>`. `DeleteAll` borra solo las claves de ese alumno.
Antes de `OnReady`, `Get*` entrega el valor por defecto y `Set*` no escribe.
Para Easy Save 3, pasa al asset una ruta del alumno, por ejemplo
`new ES3Settings(BolySDK.Saves.PathFor("partida.es3"))` para las llamadas
`ES3.Save` y `ES3.Load`. Hazlo después de `OnReady` y revisa que el asset no
escriba además en su ruta predeterminada.

### Godot

```gdscript
func _ready() -> void:
    if Boly.is_ready: cargar()
    else: Boly.session_ready.connect(cargar)
    Boly.session_ended.connect(func(_razon): guardar())

func guardar() -> void:
    var ruta := Boly.save_path("partida.save")
    if ruta != "":
        var archivo := FileAccess.open(ruta, FileAccess.WRITE)
        if archivo != null: archivo.store_string(JSON.stringify(partida))
```

`ConfigFile.save` y `ConfigFile.load` también aceptan `Boly.save_path(...)`.

### Unreal

```cpp
UBolySubsystem* Boly = GetGameInstance()->GetSubsystem<UBolySubsystem>();
const FString Path = Boly->GetSavePath(TEXT("partida.json"));
const FString Slot = Boly->GetSaveSlotName(TEXT("Slot1"));
// Slot se pasa a SaveGameToSlot y LoadGameFromSlot (UserIndex = 0).
```

En Blueprint, desde **Get Game Instance Subsystem → Boly Subsystem** usa
`Get Save Directory`, `Get Save Path` o `Get Save Slot Name`. Los slots de
`SaveGameToSlot` viven en `Saved/SaveGames`; el último método los separa con
`Boly_<learner_id>_`.

### GameMaker

```gml
boly_on_ready(function() {
    var _ruta = boly_save_path("partida.ini");
    if (_ruta != "" && file_exists(_ruta)) { /* cargar */ }
});
boly_on_session_ended(function(_razon) {
    var _ruta = boly_save_path("partida.ini");
    if (_ruta != "") { /* guardar */ }
});
```

`boly_save_path` entrega un nombre dentro del área de guardado del juego;
úsalo con `ini_open`, `file_text_open_*` y cualquier extensión de guardado.
Con el sandbox activo, comprueba en el runtime que `directory_create` permita
crear `boly_saves/<alumno>/`. El aviso de logros de la app sigue requiriendo
desactivar el sandbox.
