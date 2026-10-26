# Guardar la partida por alumno (Boly SDK 0.4+)

En un PC compartido, varios alumnos de Boly pueden usar la misma cuenta de
Windows. Si el juego guarda en la ruta normal del motor, comparten partida.
**Carga después de `OnReady` y guarda todos los datos del jugador en la ruta
del SDK.** El guardado al cerrar sigue usando `OnSessionEnded` y el cierre
normal del juego.

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

Ejecuta el verificador con `--only 8` después de jugar lo suficiente para que
se guarde una partida. Abre el juego dos veces, con alumnos simulados A y B, y
lista los archivos modificados fuera de las carpetas de Boly. En Unity revisa
también `PlayerPrefs` en el registro. El resultado es **WARN**, porque un juego
puede escribir configuración de video o logs legítimos fuera de la partida.
Revisa cada ruta para confirmar que no contiene progreso del jugador.

La referencia completa y ejemplos de los cuatro motores están en
`sdk/BOLY_SDK.md`, sección 9.
