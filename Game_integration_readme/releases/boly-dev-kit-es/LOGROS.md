# Logros en Boly — guía paso a paso

Esta guía explica cómo agregar logros a un juego publicado en Boly. Sirve para
quien desarrolla el juego y para un asistente de IA que trabaje en su proyecto.

Los logros aparecen en el perfil público de cada jugador, en la página del
juego en boly.cl y en el panel del profesor. El juego los reporta con el SDK
de Boly, que ya viene en este kit (`sdk/`).

> **Antes de empezar:** el juego tiene que tener el SDK integrado y pasar el
> verificador. Para eso, sigue `index.html` (o `INSTRUCCIONES_IA.md` si usas
> IA). Los logros son opcionales: sin ellos, el juego funciona igual.

---

## 1. Qué es un logro

| Campo | Qué es | Ejemplo |
|---|---|---|
| `api_name` | La clave que usa el código. Mayúsculas, números y `_`; empieza con letra; hasta 64 caracteres. **No cambia nunca.** | `NIVEL_5_COMPLETO` |
| Nombre | Lo que ve el jugador (español y/o inglés), hasta 80 caracteres | "Nivel 5 completo" |
| Descripción | Cómo se consigue, hasta 300 caracteres (opcional) | "Termina el nivel 5" |
| Meta (`target`) | `1` = se consigue de una vez; `N` = hay que llegar a N | `100` para "Responde 100 preguntas" |
| Oculto | No muestra nombre, descripción ni ícono hasta desbloquearse | Logros sorpresa |
| Ícono | PNG o JPEG cuadrado, de 64 a 512 px, hasta 256 KB (opcional) | `icons/nivel_5.png` |

Un juego puede tener hasta 200 logros.

## 2. Elige cómo definirlos

| | **A. En boly.cl** | **B. En la build** (recomendado) |
|---|---|---|
| Dónde se escriben | Panel de Desarrollador ▸ tu juego ▸ Gestionar logros | Un archivo `boly/achievements.json` dentro de tu proyecto |
| Cuándo se activan | Apenas los guardas | Cuando Boly aprueba la build que los trae |
| Ventaja | No hay que tocar archivos | Los logros siempre coinciden con la build publicada, viven en tu repositorio y una IA puede escribirlos |

Usa una sola forma. Si ya tienes logros en boly.cl y quieres pasar a la B,
mira la sección 5.

---

## 3. Forma B: logros en la build

### 3.1 Crea la carpeta `boly/`

| Motor | Dónde va |
|---|---|
| Unity | `<proyecto>/boly/`, junto a `Assets/` (**no** dentro de `Assets/`) |
| Godot | `res://boly/`, y crea dentro un archivo vacío llamado `.gdignore` |
| Unreal | `<proyecto>/boly/` |
| GameMaker | Una carpeta `boly/` fuera de los assets del proyecto |

```
boly/
├── achievements.json
└── icons/
    ├── nivel_5.png
    └── responder_100.png
```

### 3.2 Escribe `boly/achievements.json`

```json
{
  "$schema": "https://boly.cl/schemas/achievements-1.json",
  "version": 1,
  "achievements": [
    {
      "api_name": "NIVEL_5_COMPLETO",
      "name": { "es": "Nivel 5 completo", "en": "Level 5 complete" },
      "description": { "es": "Termina el nivel 5", "en": "Finish level 5" },
      "icon": "icons/nivel_5.png"
    },
    {
      "api_name": "RESPONDER_100",
      "name": { "es": "Cien respuestas" },
      "description": { "es": "Responde 100 preguntas correctamente" },
      "target": 100,
      "icon": "icons/responder_100.png"
    },
    {
      "api_name": "SECRETO",
      "name": { "es": "El secreto" },
      "hidden": true
    }
  ]
}
```

- **Obligatorios:** `version` (siempre `1`) y, en cada logro, `api_name` y
  `name`. Con un solo idioma en `name` basta: el otro se completa igual.
- **Opcionales:** `description`, `target` (por defecto `1`), `hidden` (por
  defecto `false`) e `icon`.
- **Orden:** los logros se muestran en el mismo orden del arreglo.
- **Ícono:** la ruta es relativa a `boly/` y distingue mayúsculas
  (`icons/Nivel_5.png` ≠ `icons/nivel_5.png`).
- **Campos desconocidos:** no se aceptan. Un campo mal escrito, como
  `"hiden"`, es un error.
- **Validación en el editor:** con la línea `$schema`, VS Code y otros
  editores autocompletan y marcan errores mientras escribes.

### 3.3 Revisa el archivo y genera las constantes

Desde la carpeta de este kit (PowerShell):

```powershell
.\boly-verify-win.exe manifest "<carpeta que contiene boly/>" --constants unity --out "<carpeta de scripts del juego>"
```

- Cambia `unity` por `godot`, `unreal` o `gamemaker` según tu motor.
- El comando revisa el archivo y los íconos con las mismas reglas que usa Boly
  al subir la build, y escribe el **archivo de constantes**
  (`BolyAchievements.cs`, `boly_achievements.gd`, `BolyAchievements.h` o
  `boly_achievements.gml`).
- Agrega ese archivo al proyecto. No lo edites a mano: si cambias los logros,
  vuelve a generarlo.

### 3.4 Reporta los logros desde el código

Llama al SDK en el momento en que ocurre cada logro (al terminar el nivel, al
responder bien), nunca en cada frame:

| Motor | Desbloquear | Sumar al progreso | Fijar el progreso | Aviso de desbloqueo (popup) |
|---|---|---|---|---|
| Unity | `BolySDK.Achievements.Unlock(BolyAchievements.NIVEL_5_COMPLETO)` | `.Increment(BolyAchievements.RESPONDER_100)` | `.SetProgress(…, total)` | `BolySDK.Achievements.OnUnlocked` |
| Godot | `Boly.unlock_achievement(BolyAchievements.NIVEL_5_COMPLETO)` | `Boly.increment_achievement(…)` | `Boly.set_achievement_progress(…, total)` | señal `Boly.achievement_unlocked` |
| Unreal | `Boly->UnlockAchievement(BolyAchievements::NIVEL_5_COMPLETO)` | `IncrementAchievement(…)` | `SetAchievementProgress(…, Total)` | delegado `OnAchievementUnlocked` |
| GameMaker | `boly_achievement_unlock(BOLY_ACH_NIVEL_5_COMPLETO)` | `boly_achievement_increment(…)` | `boly_achievement_set(…, total)` | `boly_on_achievement_unlocked(cb)` |

- **Sumar** es para contar eventos: `+1` en cada acierto.
- **Fijar** es para cuando el juego ya lleva un total, como las estrellas
  acumuladas.
- El progreso nunca baja ni pasa la meta.
- Las llamadas no bloquean el juego. Si no hay conexión, se guardan en disco y
  se envían después, sin contar dos veces.
- **En el editor** (modo Play, F5 o PIE) no se envía nada a Boly:
  - Un desbloqueo dispara el aviso localmente, para que pruebes tu popup.
  - Unity y Godot muestran un aviso si el código usa un `api_name` que no está
    en `boly/achievements.json`.

### 3.5 Compila y revisa la build

- **Unity:** al compilar, el SDK copia `boly/` junto al `.exe`
  automáticamente.
- **Godot:** al exportar, el SDK copia `boly/` junto al ejecutable
  automáticamente.
- **Unreal y GameMaker:** copia la carpeta `boly/` a mano junto al `.exe` antes
  de comprimir.

Pasa el verificador como siempre:

```powershell
.\boly-verify-win.exe --game "<ruta al .exe>" --game-id 0
```

El escenario 7 revisa el `boly/` que está junto al `.exe`. Después de
comprimir la build, revisa también el zip que vas a subir:

```powershell
.\boly-verify-win.exe manifest "<ruta a build.zip>"
```

### 3.6 Sube la build y prueba los borradores

1. Sube el zip en **boly.cl ▸ Panel de Desarrollador ▸ tu juego ▸ Builds**.
2. En el historial de builds, la columna **Logros** muestra lo que Boly
   encontró. Con **Ver detalle** ves los errores, los avisos y qué cambiaría
   al aprobar la build.
3. Mientras la build está en revisión, los logros nuevos son **borradores**:
   solo tú y los administradores de Boly los ven.
4. Pruébalos: instala la build en revisión desde la app de Boly y juega. Tus
   desbloqueos de prueba se borran cuando la build se aprueba.
5. Cuando Boly **aprueba** la build, los logros se activan para todos los
   jugadores.

Desde ese momento, el archivo manda. La página de logros en boly.cl queda en
solo lectura, con el aviso "Gestionados por la build".

### 3.7 Cambiar logros más adelante

Edita `boly/achievements.json`, genera de nuevo las constantes si cambiaste
algún `api_name` y sube una build nueva. Al aprobarla:

| Si en el archivo… | Pasa esto |
|---|---|
| Agregas un logro | Se crea |
| Cambias nombre, descripción, ícono, oculto u orden | Se actualiza |
| **Bajas** la meta | Quienes ya la alcanzaron lo desbloquean |
| **Subes** la meta | Nadie pierde el logro que ya tenía |
| Quitas un logro | Se **retira**: los jugadores conservan su progreso, pero el juego ya no puede avanzarlo |
| Cambias un `api_name` | Cuenta como quitar uno y agregar otro: el progreso **no** pasa al nuevo. Evítalo |
| Vuelves a poner un logro retirado | Se reactiva |

Una build **sin** `boly/achievements.json` no cambia los logros. Una build con
el archivo **con errores** tampoco: corrige el archivo y sube otra build.

---

## 4. Forma A: logros en boly.cl

1. Entra a **boly.cl ▸ Panel de Desarrollador ▸ tu juego ▸ Gestionar logros**.
2. Crea cada logro con su nombre, descripción, `api_name`, meta, oculto e
   ícono. Se activan apenas los guardas.
3. En esa misma página, elige tu motor y usa **Descargar constantes**.
   Agrega el archivo al proyecto.
4. Reporta los logros desde el código como en la sección 3.4.
5. Compila, pasa el verificador y sube la build como siempre.
6. Para volver a probar un desbloqueo con tu cuenta, usa **Borrar mi progreso
   de prueba** en la misma página.

## 5. Pasar de la forma A a la B

1. En **Gestionar logros**, usa **Descargar carpeta boly/**. Trae
   `achievements.json` con todos tus logros activos y sus íconos.
2. Descomprímela en el lugar que corresponde a tu motor (sección 3.1).
3. Sigue desde el paso 3.3. Cuando se apruebe la primera build que traiga la
   carpeta, los logros pasan a gestionarse desde la build.

Para volver a editar en boly.cl, usa **Volver a edición manual** en la página
de logros.

---

## 6. Problemas comunes

| Mensaje o síntoma | Causa | Qué hacer |
|---|---|---|
| `icon_missing` … "did you mean …?" | El nombre del ícono no coincide exactamente, por ejemplo en mayúsculas | Usa el nombre exacto que sugiere el mensaje |
| `achievement_shape` … `Unknown field` | Un campo mal escrito | Corrige el nombre del campo |
| `api_name_invalid` | Minúsculas, espacios o tildes en la clave | Solo `A-Z`, `0-9` y `_`, empezando con letra |
| `manifest_multiple` | Hay dos carpetas `boly/` en la build | Deja una sola, junto al `.exe` |
| `icon_dimensions` / `icon_too_large` / `icon_format` | El ícono no cumple las reglas | PNG o JPEG cuadrado, de 64 a 512 px, hasta 256 KB |
| El editor avisa "no está en boly/achievements.json" | El código usa un logro que el archivo no declara | Agrégalo al archivo o corrige el nombre |
| El logro no aparece en boly.cl | La build todavía está en revisión (es un borrador) | Se activa cuando Boly aprueba la build |
| En consola: "El logro … no existe en este juego" | El `api_name` no existe en Boly | Revisa el archivo de constantes o el manifiesto |

## 7. Referencias

- `sdk/BOLY_SDK.md`, sección 4: los logros explicados para un asistente de IA,
  con la API completa de cada motor en la sección 5.
- `sdk/spec/ACHIEVEMENTS_MANIFEST.md`: la especificación completa del archivo,
  con todos los códigos de error.
- `sdk/spec/achievements-1.schema.json`: el JSON Schema del archivo.
- `sdk/<motor>/README.md`: instalación y detalles de cada motor.
