# Instrucciones para un asistente de IA: integrar y probar el SDK de Boly

Este archivo es para un asistente de IA (Claude Code, Cursor, etc.) que trabaja
**dentro del proyecto de un juego**. Tu tarea es integrar el **SDK de Boly** en
ese juego, compilar un ejecutable de Windows y comprobarlo con el verificador
del kit. Síguelo en orden.

> Para la persona: abre tu asistente de IA en la carpeta de tu juego y escríbele:
> *"Lee `<RUTA DEL KIT>/INSTRUCCIONES_IA.md` y síguelo para integrar Boly en este proyecto."*

`<KIT>` es la carpeta donde está este archivo. Contiene:

| Ruta | Qué es |
|---|---|
| `sdk/unity/cl.boly.sdk/` | SDK para Unity 2021.3+ (paquete UPM) |
| `sdk/godot/addons/boly_sdk/` | SDK para Godot 4 (addon) |
| `sdk/unreal/BolySDK/` | SDK para Unreal 5 (plugin C++) |
| `sdk/gamemaker/` | SDK para GameMaker 2024+ (código GML) |
| `sdk/BOLY_SDK.md` | Referencia completa del SDK (API de los 4 motores, logros, reglas): **léela antes de empezar** |
| `LOGROS.md` | Guía paso a paso de logros (boly.cl o `boly/achievements.json` en la build) |
| `sdk/<motor>/README.md` | Instalación y API de cada motor (resumen) |
| `boly-verify-win.exe` | Verificador: prueba el build contra un servidor Boly simulado |
| `index.html` | La misma guía para humanos |

## Qué hace el SDK (contexto)

La app de escritorio de Boly abre el juego con `-game_id <n> -key <hex>`. El SDK
lee esos argumentos, valida la sesión contra el API de Boly, envía un heartbeat
cada ~60 s y **cierra el juego** si la sesión es revocada (otro equipo abrió la
misma cuenta, se perdió el acceso o no hay conexión). Se inicia solo antes de la
primera escena y sobrevive a los cambios de escena. Dentro del editor, sin
`-key`, no contacta a Boly y queda listo de inmediato.

## Reglas

1. **No edites los archivos del SDK.** Cópialos tal cual (en Unity, con sus `.meta`).
   Todo lo que el juego necesita se hace desde su propio código.
2. No leas ni uses `-token`. No agregues un header `Authorization` a nada de Boly.
3. No configures ningún id de juego: el SDK lo recibe en `-game_id`.
4. No subas nada a boly.cl ni a ningún servidor: la publicación la hace la persona.
5. Detente y pregunta a la persona si:
   - el motor o su versión no está soportado (Unity < 2021.3, Godot 3, Unreal 4,
     GameMaker anterior a 2024),
   - el juego es un build web (WebGL / HTML5): **ese tipo de juego no usa el SDK**,
   - no puedes compilar el ejecutable desde la línea de comandos,
   - el verificador falla y no encuentras la causa tras dos intentos.

## Paso 0: reconocer el proyecto

- Identifica el motor y su versión:
  - Unity: `ProjectSettings/ProjectVersion.txt`
  - Godot: `project.godot` (`config/features`)
  - Unreal: el `.uproject` (`EngineAssociation`)
  - GameMaker: el `.yyp`
- Busca una integración antigua de Boly: `ParamsCatcher.cs`, `ParamsCatcher.gd`,
  `ValidationSubsystem.h/.cpp` u `obj_params_catcher`. Si existe, anota en qué
  escena/nivel/room está y adónde salta al validar (ej. `LoadSceneAsync(1)`,
  `change_scene_to_file(...)`, `OpenLevel("...")`, `room_goto(...)`). Vas a
  **reemplazarla** por el SDK.
- Encuentra dónde empieza el gameplay (menú principal, primer nivel, etc.).

## Paso 1: instalar el SDK

### Unity
1. Copia `<KIT>/sdk/unity/cl.boly.sdk` a `Packages/cl.boly.sdk` del proyecto.
2. Si había un `ParamsCatcher.cs`: bórralo junto con su GameObject. Si el juego
   usaba una AuthScene que saltaba a otra escena, o elimina la AuthScene de
   Build Settings, o crea `Assets/Resources/BolySettings.asset` (menú
   **Boly ▸ Settings**) con `sceneOnReady` = índice de la escena principal.

### Godot 4
1. Copia `<KIT>/sdk/godot/addons/boly_sdk` a `res://addons/boly_sdk`.
2. Activa el plugin en `project.godot`:
   ```ini
   [autoload]
   Boly="*res://addons/boly_sdk/boly.gd"

   [editor_plugins]
   enabled=PackedStringArray("res://addons/boly_sdk/plugin.cfg")
   ```
   (Si la sección ya existe, agrega la entrada sin borrar las otras.)
3. Si había un `ParamsCatcher.gd`: bórralo junto con su nodo. Para conservar un
   flujo AuthScene → escena principal, agrega en `project.godot`:
   ```ini
   [boly]
   scene_on_ready="res://ruta/a/MainGame.tscn"
   ```

### Unreal 5
1. Copia `<KIT>/sdk/unreal/BolySDK` a `Plugins/BolySDK`.
2. Si el proyecto es solo-Blueprint (sin carpeta `Source/`), necesita una clase
   C++ para compilar plugins: pregunta a la persona antes de convertirlo.
3. Si había un `ValidationSubsystem.h/.cpp`: bórralos. Si arrancaba en un mapa de
   autenticación que abría otro nivel, configura en `Config/DefaultGame.ini`:
   ```ini
   [/Script/BolySDK.BolySettings]
   LevelOnReady=/Game/Ruta/MainLevel.MainLevel
   ```

### GameMaker
1. Crea el Script `boly_sdk` con el contenido de `<KIT>/sdk/gamemaker/scripts/boly_sdk.gml`.
2. Crea el objeto `obj_boly` con **Persistent** activado, evento **Create** =
   `objects/obj_boly/Create_0.gml`, evento **Async ▸ HTTP** = `objects/obj_boly/Other_62.gml`.
3. Coloca una instancia de `obj_boly` en la **primera** room.
4. Para el aviso de logros de la app de Boly: en **Game Options ▸ Windows ▸
   General**, activa **Disable file system sandbox** (si no puedes editarlo,
   pídeselo a la persona).
5. Si había un `obj_params_catcher`: bórralo. Para conservar un flujo de room de
   arranque, en el Creation Code de la instancia de `obj_boly` escribe
   `room_on_ready = rm_main;`.

Si no puedes crear assets de GameMaker editando los archivos `.yy`/`.yyp` con
seguridad, deja el código listo y pide a la persona que haga estos pasos en el IDE.

### En todos los motores

Copia también `<KIT>/sdk/BOLY_SDK.md` a `docs/BOLY_SDK.md` del proyecto (crea
`docs/` si no existe). Si el proyecto tiene un archivo de instrucciones para
asistentes (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`…), pregunta a la persona
si quiere agregar la línea que sugiere el inicio de `BOLY_SDK.md`, para que
futuras sesiones de IA respeten la integración.

## Paso 2: conectar el juego al SDK

Haz que el gameplay empiece cuando la sesión esté lista, y que el progreso se
guarde cuando termine (el SDK cierra el juego justo después):

| Motor | Listo | Termina la sesión |
|---|---|---|
| Unity | `if (BolySDK.IsReady) X(); else BolySDK.OnReady += X;` | `BolySDK.OnSessionEnded += razon => Guardar();` |
| Godot | `if Boly.is_ready: x() else: Boly.session_ready.connect(x)` | `Boly.session_ended.connect(func(_r): guardar())` |
| Unreal | `UBolySubsystem::IsReady()` / `OnReady` (delegado dinámico) | `OnSessionEnded(EBolyEndReason)` |
| GameMaker | `boly_on_ready(function() { ... })` | `boly_on_session_ended(function(_r) { ... })` |

- Si el juego no tiene progreso que guardar, no hace falta `OnSessionEnded`.
- Las cargas largas deben ser **asíncronas** (`LoadSceneAsync`, etc.): una carga
  que bloquea el hilo principal muchos segundos detiene el heartbeat.
- Unity: no devuelvas `false` en `Application.wantsToQuit`; eso impide que el SDK cierre el juego.

Comprueba que el proyecto compila dentro del editor (Unity/Godot: sin errores
en consola; Unreal: compila el módulo) antes de seguir.

## Paso 2b: logros (opcional)

Solo si la persona quiere logros. Lee primero `<KIT>/LOGROS.md`: es la guía
completa (las dos formas de definirlos, el formato del archivo, cómo probarlos
y qué pasa al publicar). Lo esencial:

- Los logros los define la persona, de una de dos formas. Pregúntale cuál
  usa; no inventes logros ni `api_name`.
  - **En boly.cl** (Panel de Desarrollador ▸ su juego ▸ Gestionar logros): ahí
    descarga el archivo de constantes de su motor. Pídele ese archivo.
  - **En la build** (recomendado para juegos nuevos): un archivo
    `boly/achievements.json` con sus íconos en `boly/icons/`. Si la persona te
    describe los logros, escribe tú el archivo según `sdk/BOLY_SDK.md` §4
    ("Dónde nacen"): ahí está el formato y dónde va la carpeta en cada motor
    (Unity: raíz del proyecto; Godot: `res://boly/` con un `.gdignore` vacío;
    Unreal y GameMaker: se copia a mano junto al `.exe`). Valídalo y genera las
    constantes con:
    ```powershell
    & "<KIT>\boly-verify-win.exe" manifest "<carpeta con boly/>" --constants <unity|godot|unreal|gamemaker> --out "<carpeta de scripts>"
    ```
    Si un ícono que la persona nombró no existe, déjalo sin ícono y avísale.
- Agrega el archivo de constantes al proyecto y llama al SDK donde ocurre cada
  logro (ej. al terminar el nivel 5):

| Motor | Archivo de constantes | Desbloquear | Sumar | Fijar progreso | Aviso de desbloqueo |
|---|---|---|---|---|---|
| Unity | `BolyAchievements.cs` | `BolySDK.Achievements.Unlock(BolyAchievements.X)` | `.Increment(…, n)` | `.SetProgress(…, v)` | `BolySDK.Achievements.OnUnlocked` |
| Godot | `boly_achievements.gd` | `Boly.unlock_achievement(BolyAchievements.X)` | `increment_achievement(…, n)` | `set_achievement_progress(…, v)` | señal `Boly.achievement_unlocked` |
| Unreal | `BolyAchievements.h` | `Boly->UnlockAchievement(BolyAchievements::X)` | `IncrementAchievement(…, N)` | `SetAchievementProgress(…, V)` | delegado `OnAchievementUnlocked` |
| GameMaker | `boly_achievements.gml` (Script) | `boly_achievement_unlock(BOLY_ACH_X)` | `boly_achievement_increment(…, n)` | `boly_achievement_set(…, v)` | `boly_on_achievement_unlocked(cb)` |

- El progreso nunca baja y nunca pasa la meta; el aviso de desbloqueo llega una
  sola vez por logro y jugador.
- No agregues reintentos ni guardado propio: el SDK ya encola en disco y
  reintenta sin contar dos veces.
- No hace falta un popup propio: la app de Boly muestra un aviso tipo Steam
  encima del juego. Para que se vea, el juego tiene que usar pantalla completa
  **sin bordes** (no exclusiva); detalles en `LOGROS.md`, sección 6. Si el
  juego usa pantalla completa exclusiva, avísale a la persona.

## Paso 3: compilar un ejecutable de Windows

Usa la línea de comandos si el motor lo permite (rutas de ejemplo; búscalas en
el equipo):

- **Unity** (compila las escenas activas en Build Settings):
  ```powershell
  & "C:\Program Files\Unity\Hub\Editor\<versión>\Editor\Unity.exe" -batchmode -quit `
    -projectPath "<proyecto>" -buildWindows64Player "<proyecto>\Build\Juego.exe" -logFile "<proyecto>\build.log"
  ```
  Si falla, revisa `build.log` (busca `error CS`).
- **Godot** (necesita un preset de exportación "Windows Desktop" y las plantillas de exportación instaladas):
  ```powershell
  godot --headless --path "<proyecto>" --export-release "Windows Desktop" "<proyecto>\Build\Juego.exe"
  ```
- **Unreal**:
  ```powershell
  & "<UE>\Engine\Build\BatchFiles\RunUAT.bat" BuildCookRun -project="<proyecto>\Juego.uproject" `
    -platform=Win64 -clientconfig=Shipping -build -cook -stage -pak -archive -archivedirectory="<proyecto>\Build"
  ```
- **GameMaker**: pide a la persona que compile desde el IDE (**Build ▸ Create Executable**,
  tipo *Package as Zip* o carpeta) y te diga dónde quedó el `.exe`.

Prueba siempre un **build**, nunca el modo Play del editor: en el editor el SDK
no contacta a Boly.

## Paso 4: probar con el verificador

Desde la carpeta del kit (PowerShell):

```powershell
& "<KIT>\boly-verify-win.exe" --game "<ruta al .exe del build>" --game-id 0 --json
```

- Tarda ~1-2 minutos. El juego se abre y se cierra varias veces: es normal.
- El código de salida es `0` solo si todo pasa. Con `--json`, revisa `passed` y
  cada `checks[].status` (`pass`, `fail`, `warn`).
- Los 7 escenarios: sesión válida, 403 → cerrar, un fallo de red tolerado, fallos
  repetidos → cerrar, sin `-key` → cerrar sin enviar nada, logros (el
  verificador desbloquea un logro de prueba y comprueba el reintento; no hay que
  programar nada para eso) y el manifiesto `boly/achievements.json` junto al
  `.exe` (se marca SKIP si el juego no declara sus logros en la build). Un
  `WARN` en el escenario 6 indica un SDK anterior sin logros: vuelve a copiar
  el SDK del kit.

| Resultado | Causa probable | Qué hacer |
|---|---|---|
| FAIL "Game sent a heartbeat" | El SDK no está en el build | Unity: paquete en `Packages/` y `enabledInBuilds` activo; Godot: autoload `Boly` registrado; Unreal: plugin compilado; GameMaker: `obj_boly` en la primera room |
| FAIL "No Authorization header" | Código del juego agrega un token | Búscalo y quítalo (o un ParamsCatcher antiguo que quedó) |
| FAIL "Game quit on 403" o "Repeated failures" | Algo impide cerrar | Unity `Application.wantsToQuit`; código que se bloquea dentro de `OnSessionEnded` |
| FAIL "Cadence is steady" | El heartbeat se detuvo | Cargas bloqueantes; usa carga asíncrona |
| WARN "Identifies the SDK" | El build todavía usa ParamsCatcher | Termina el Paso 1 |
| FAIL en "Achievements" | SDK modificado o incompleto | Vuelve a copiar el SDK del kit sin cambios; no envíes logros con tu propio código de red. En Godot, Unreal o GameMaker, si sigue fallando con el SDK del kit, repórtalo a la persona (posible error del SDK) |
| WARN "Notifies the Boly app of the unlock" | SDK anterior a 0.3 | Vuelve a copiar el SDK del kit |
| FAIL "Notifies the Boly app of the unlock" | SDK modificado; en GameMaker, el sandbox de archivos activo | Copia el SDK sin cambios; en GameMaker desactiva el sandbox (Paso 1) |
| FAIL en "Achievement manifest" | `boly/achievements.json` con errores | Corrige cada error en el campo que indica (`achievements[2].target`, etc.) |
| WARN `icon_missing` | Ruta o mayúsculas distintas | Usa el nombre exacto del archivo; el mensaje sugiere el correcto |
| FAIL en un motor nuevo (Godot, Unreal, GameMaker) que no se explica por lo anterior | Posible error del SDK | No lo parches: reporta a la persona la salida del verificador para enviarla a Boly |

Corrige, vuelve a compilar y repite hasta que pase todo.

## Paso 5: empaquetar (opcional)

Si la persona lo pide, crea el zip para subir **desde dentro de la carpeta del
build**, con el `tar` de Windows (no uses `Compress-Archive` de PowerShell):

```powershell
cd "<carpeta del build>"; & "$env:SystemRoot\System32\tar.exe" -a -c -f ..\build.zip *
```

Ojo: `*` al final, **no un punto**. El zip debe contener el `.exe` del juego
y, si el juego declara sus logros, la carpeta `boly/` junto a él. Revisa el zip
final con:

```powershell
& "<KIT>\boly-verify-win.exe" manifest "<ruta al build.zip>"
```

## Informe final

Termina con un resumen para la persona:
- motor y versión, y qué integración antigua quitaste (si había),
- archivos que agregaste o cambiaste,
- dónde quedó el `.exe` (y el zip, si lo creaste),
- el resultado del verificador (los 7 escenarios),
- los logros que conectaste (si hubo), con el `api_name` de cada uno, y si van
  en `boly/achievements.json` o se crean en boly.cl,
- lo que falta: subir el build en **boly.cl ▸ Panel de Desarrollador** (lo hace la persona).
