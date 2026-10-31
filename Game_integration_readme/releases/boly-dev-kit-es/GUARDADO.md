# Guardar la partida por alumno (Boly SDK 0.4+)

En un PC compartido, varios alumnos de Boly pueden usar la misma cuenta de
Windows. Si el juego guarda en la ruta normal del motor, comparten partida.
**Carga después de `OnReady` y guarda todos los datos del jugador en la ruta
del SDK.** El guardado al cerrar sigue usando `OnSessionEnded` y el cierre
normal del juego (`OnApplicationQuit` en Unity, `_exit_tree` en Godot,
`EndPlay` en Unreal o Game End en GameMaker). La app solicita un cierre normal
al cerrar sesión y fuerza la salida si el juego no responde.

| Motor | Ruta para un archivo |
|---|---|
| Unity | `BolySDK.Saves.PathFor("partida.json")` |
| Godot | `Boly.save_path("partida.save")` |
| Unreal | `Boly->GetSavePath(TEXT("partida.json"))` |
| GameMaker | `boly_save_path("partida.ini")` |

Unity: reemplaza también **todas** las llamadas a `PlayerPrefs` por
`BolySDK.Prefs` (`Get/SetInt`, `Get/SetFloat`, `Get/SetString`, `HasKey`,
`DeleteKey`, `DeleteAll`, `Save`). `DeleteAll` afecta solo al alumno actual.
Unreal: para `SaveGameToSlot`/`LoadGameFromSlot`, usa el resultado de
`GetSaveSlotName("Slot1")` en Blueprint o C++; separa los slots aunque Unreal
los deje en `Saved/SaveGames`. Si usas un asset de terceros como Easy Save,
ConfigFile u otro, configura su ruta con la función del SDK.

Estas funciones devuelven vacío antes de `OnReady` y registran un error; no
guardes en la ruta compartida como alternativa. La carpeta se crea al primer
uso. En el editor se usa `editor`; si una sesión antigua no entrega
`learner_id`, se usa `_sin_alumno` y se registra una advertencia.

## Qué es un dato del jugador

Todo lo que cambia porque **este** alumno jugó va a la ruta del SDK, en todos
los archivos donde se guarde:

- avance: niveles desbloqueados o completados, mundo actual, checkpoints;
- puntajes, récords, estrellas, monedas, inventario y estadísticas;
- **trofeos, medallas o logros que el juego muestre por su cuenta**, aunque
  también los declare en Boly: los logros de Boly viven en el servidor y ya
  están separados por alumno, pero el contador dentro del juego lee el archivo
  local;
- tutoriales vistos, diálogos ya leídos y perfiles o nombres del jugador.

La configuración del equipo (resolución, calidad gráfica, volumen) puede
quedar compartida, pero **en un archivo aparte**. Si un mismo archivo mezcla
opciones y progreso, todo el archivo es dato del jugador.

## Error común: tener el SDK no basta

Un juego Godot con el SDK 0.4 integrado guardaba `user://progreso.cfg` y
`user://trofeos.cfg` con rutas fijas. Dos alumnos en el mismo PC veían los
trofeos y niveles del otro: Boly mostraba bien los logros de cada uno, pero el
juego leía el mismo archivo para los dos. El SDK solo separa lo que el juego
le pide guardar con `save_path`/`PathFor`; el resto sigue compartido.

La carpeta `boly/` que aparece junto a los datos del juego no prueba nada: el
SDK la crea para su cola de logros. Lo que prueba la separación es que los
archivos del juego estén dentro de `boly/saves/<alumno>/` y en ninguna otra
parte.

## Antes de subir una build

1. Busca en el proyecto todo acceso al almacenamiento del motor y cámbialo a
   la ruta del SDK. Solo pueden quedar rutas de logs, caché o configuración
   del equipo:

   | Motor | Busca |
   |---|---|
   | Unity | `PlayerPrefs`, `Application.persistentDataPath`, `File.`, `StreamWriter`, `ES3.` |
   | Godot | `user://` en `FileAccess`, `ConfigFile`, `ResourceSaver`, `DirAccess` |
   | Unreal | `SaveGameToSlot`/`LoadGameFromSlot` con nombres fijos, `ProjectSavedDir` |
   | GameMaker | `ini_open`, `file_text_open_*`, `buffer_save`, `buffer_load` con nombres fijos |

2. Revisa dónde carga cada archivo. Si un autoload, `Awake` o `_ready` lee la
   partida al iniciar, muévelo a `OnReady`: antes de eso la ruta del SDK
   está vacía.
3. Haz la prueba con dos cuentas (abajo). Es **obligatoria**: el verificador
   abre el juego sin jugarlo, así que no ve los archivos que el juego escribe
   al ganar un trofeo o pasar un nivel.

Una build que muestre a un alumno el avance o los trofeos de otro no cumple la
integración, aunque el verificador pase.

## Prueba con dos cuentas

Usa la app de Boly en un mismo PC, con dos cuentas de alumno A y B:

1. Con A, juega hasta tener avance y al menos un trofeo o marcador del juego.
   Cierra el juego.
2. Con B, abre el juego: debe empezar desde cero, sin niveles ni trofeos de A.
   Consigue algo distinto y cierra.
3. Vuelve a A: debe ver exactamente su avance, ni más ni menos.
4. Abre la carpeta de datos del juego y confirma que cada archivo de progreso
   está en `boly/saves/<alumno>/`, con una carpeta por alumno:

   | Motor | Carpeta de datos en Windows |
   |---|---|
   | Unity | `%USERPROFILE%\AppData\LocalLow\<compañía>\<producto>\`, y `PlayerPrefs` en `HKCU\Software\<compañía>\<producto>` (las claves del alumno empiezan por `boly.<alumno>.`) |
   | Godot | `%APPDATA%\Godot\app_userdata\<nombre del proyecto>\`, o `%APPDATA%\<nombre>\` si el proyecto usa una carpeta de usuario propia |
   | Unreal | `%LOCALAPPDATA%\<proyecto>\Saved\` (la del SDK es `Saved\Boly\Saves\<alumno>\`) |
   | GameMaker | `%LOCALAPPDATA%\<nombre del juego>\` (la del SDK es `boly_saves\<alumno>\`) |

   Un archivo con progreso fuera de esa carpeta es un error, aunque el juego
   parezca funcionar.

## Partidas anteriores

El SDK no mueve ni borra las partidas antiguas, cuyo dueño se desconoce. Un
juego actualizado empieza con una partida nueva por alumno. Si necesitas
recuperar una partida anterior, decide a qué alumno pertenece antes de copiarla
a su carpeta. En un PC de colegio no se puede inferir el dueño.
En Unity puedes llamar explícitamente a
`BolySDK.Saves.ClaimLegacy(rutaAntigua)` después de `OnReady`; copia una sola
vez un archivo o carpeta antigua bajo `persistentDataPath` y deja el original.

La partida permanece **solo en ese PC**. Cambiar de PC no sincroniza el avance.
Cada juego debe recompilarse con el SDK 0.4 y cambiar sus llamadas de guardado
para tener separación.

## Comprobar la integración

Ejecuta el verificador con `--only 8` además de la prueba con dos cuentas.
Abre el juego dos veces, con alumnos simulados A y B, y lista los archivos
modificados fuera de las carpetas de Boly. En Unity revisa también
`PlayerPrefs` en el registro. El resultado es **WARN**, porque un juego puede
escribir configuración de video o logs legítimos fuera de la partida. Revisa
cada ruta: si alguna contiene progreso, trofeos o perfiles del jugador, corrígela.
Un WARN "No files or PlayerPrefs changed" solo significa que el juego no guardó
durante la prueba automática; no confirma la separación.

La referencia completa y ejemplos de los cuatro motores están en
`sdk/BOLY_SDK.md`, sección 9.
