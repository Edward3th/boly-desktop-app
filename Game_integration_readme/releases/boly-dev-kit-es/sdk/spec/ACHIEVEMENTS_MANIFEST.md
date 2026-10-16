# Manifiesto de logros — `boly/achievements.json` (versión 1)

Un juego declara sus logros en un archivo dentro de su build. Cuando el
desarrollador sube la build a boly.cl, Boly lo lee sin descargar el juego
completo:

- crea los logros nuevos como **borradores**, que solo pueden probar el
  desarrollador y los admins;
- los activa cuando se **aprueba** la build.

El manifiesto es la **fuente de verdad**: la lista completa de logros del juego
en esa build.

JSON Schema: [`achievements-1.schema.json`](achievements-1.schema.json)
(publicado en `https://boly.cl/schemas/achievements-1.json`).

## Dónde va

Una carpeta `boly/` junto al ejecutable (o al `index.html`), dentro del zip de
la build:

```
MiJuego.exe
MiJuego_Data/...
boly/achievements.json
boly/icons/nivel_5.png
```

También vale bajo una única carpeta raíz (`MiJuego/boly/achievements.json`).
Más abajo no: Boly busca solo en esos dos niveles.

- Si hay **más de un** `boly/achievements.json`, la build no aplica logros.
- Una build **sin** manifiesto no cambia los logros del juego.

## Formato

```json
{
  "$schema": "https://boly.cl/schemas/achievements-1.json",
  "version": 1,
  "achievements": [
    {
      "api_name": "NIVEL_5_COMPLETO",
      "name": { "es": "Nivel 5 completo", "en": "Level 5 complete" },
      "description": { "es": "Termina el nivel 5", "en": "Finish level 5" },
      "target": 1,
      "hidden": false,
      "icon": "icons/nivel_5.png"
    },
    {
      "api_name": "RESPONDER_100",
      "name": { "es": "Cien respuestas" },
      "description": { "es": "Responde 100 preguntas correctamente" },
      "target": 100
    }
  ]
}
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `$schema` | no | Para que el editor valide y autocomplete. Se ignora. |
| `version` | sí | `1` |
| `achievements` | sí | Arreglo de 0 a 200 logros. **El orden del arreglo es el orden en que se muestran.** |
| `api_name` | sí | `^[A-Z][A-Z0-9_]{0,63}$`, único en el archivo. Es la clave que usa el código (`Unlock("NIVEL_5_COMPLETO")`) y **no cambia nunca**: renombrarlo retira el logro anterior y su progreso no pasa al nuevo. |
| `name` | sí | `{ "es": "...", "en": "..." }`, máximo 80 caracteres por idioma. Basta un idioma: el otro se completa con el mismo texto. |
| `description` | no | Igual que `name`, máximo 300 caracteres. Es lo que ve el jugador: cómo se consigue. |
| `target` | no (default `1`) | Entero de 1 a 1.000.000. `1` = se consigue de una vez; `N` = progreso hasta N. |
| `hidden` | no (default `false`) | Oculto: los jugadores no ven el nombre, la descripción ni el ícono hasta desbloquearlo. |
| `icon` | no | Ruta relativa a la carpeta `boly/`, sin `..`, sin `\` y sin `/` al inicio. |

No se aceptan otros campos. Un campo mal escrito (por ejemplo `"hiden"`) es un
error, para que no se ignore en silencio.

### Íconos

- PNG o JPEG, identificado por su contenido (no por la extensión). Sin SVG, GIF
  ni WebP.
- Cuadrados, de 64×64 a 512×512 píxeles. Se recomienda 256×256.
- Máximo 256 KB cada uno.
- Varios logros pueden usar el mismo archivo.

Un ícono que falta o no cumple estas reglas **no** invalida el manifiesto: ese
logro queda sin ícono y el reporte lo avisa.

## Herramientas

- **Unity:** si existe `<proyecto>/boly/achievements.json` (junto a `Assets/`,
  no dentro), el SDK copia la carpeta junto al `.exe` después de cada build.
- **Godot:** si existe `res://boly/achievements.json`, el SDK copia la carpeta
  junto al ejecutable al exportar. Agrega un archivo vacío `res://boly/.gdignore`
  para que Godot no importe los íconos ni los meta en el `.pck`.
- **Unreal y GameMaker:** copia la carpeta a mano junto al `.exe` antes de
  comprimir la build.
- **En el editor** (Unity y Godot), reportar un `api_name` que no está en el
  manifiesto muestra un aviso.
- **Verificador del kit:** `boly-verify-win.exe manifest <carpeta o .zip>`
  aplica estas mismas reglas sin subir nada, y `--constants <motor>` genera el
  archivo de constantes. Al probar el juego, el escenario 7 revisa el
  `boly/` que está junto al `.exe`.
- **boly.cl:** "Descargar carpeta boly/" en la página de logros exporta los
  logros que el juego ya tiene, para pasar a este formato.

## Qué hace Boly con el manifiesto

| Momento | Efecto |
|---|---|
| Subida de la build | Se valida. Si tiene errores, la build se sube igual pero no aplica logros: el panel muestra los errores. Si es válido, los `api_name` nuevos se crean como borradores. |
| Build en revisión | Los borradores solo cuentan para el desarrollador del juego y los admins (el SDK los acepta en sus sesiones). Para los demás jugadores no existen. |
| Aprobación | Los borradores se activan. Los logros existentes toman el nombre, la descripción, la meta, `hidden`, el ícono y el orden del manifiesto. Los que ya no aparecen se **retiran** (el progreso de los jugadores se conserva, pero el juego ya no puede avanzarlos). El progreso de prueba sobre los borradores se borra. |
| Rechazo de la build | Los borradores que solo traía esa build se eliminan. |

Mientras un juego gestiona sus logros desde la build, el editor de logros de
boly.cl queda en solo lectura. Desde ahí se puede volver a la edición manual.

### Avisos

No impiden aprobar la build:

- **Bajar `target`:** desbloquea el logro a quienes ya alcanzaron la meta nueva.
- **Subir `target`:** no le quita el logro a quien ya lo tenía.
- **Un `api_name` que desaparece:** el logro se retira.
- **Ícono ausente o inválido:** el logro queda sin ícono.

## Errores

Cada problema del reporte trae un `code`, la ubicación (`path`, por ejemplo
`achievements[2].name.es`) y un mensaje. Son **errores** (el manifiesto no se
aplica):

| `code` | Causa |
|---|---|
| `manifest_multiple` | Hay más de un `boly/achievements.json` en el zip. |
| `manifest_unreadable` | El archivo no se pudo extraer (cifrado, compresión no soportada, corrupto o de más de 256 KB). |
| `manifest_json` | No es JSON válido (o no está en UTF-8). |
| `manifest_shape` | La raíz no es un objeto, falta `achievements` o sobra un campo. |
| `manifest_version` | `version` no es `1`. |
| `too_many_achievements` | Más de 200 logros. |
| `achievement_shape` | Un logro no es un objeto o tiene un campo desconocido. |
| `api_name_invalid` | `api_name` falta o no cumple el formato. |
| `api_name_duplicate` | Dos logros con el mismo `api_name`. |
| `name_invalid` | `name` falta, está vacío o es demasiado largo. |
| `description_invalid` | `description` no es texto válido o es demasiado larga. |
| `target_invalid` | `target` no es un entero de 1 a 1.000.000. |
| `hidden_invalid` | `hidden` no es `true` ni `false`. |
| `icon_path_invalid` | La ruta del ícono sale de `boly/`, usa `\` o no es texto. |
| `zip_index_too_large` | El índice del zip es demasiado grande para buscarle el manifiesto (más de ~100.000 archivos). |

Y **avisos** (el manifiesto sí se aplica):

| `code` | Causa |
|---|---|
| `icon_missing` | El ícono indicado no está en el zip. Si existe con otras mayúsculas, el mensaje lo sugiere. |
| `icon_unreadable` | El ícono no se pudo extraer. |
| `icon_format` | No es PNG ni JPEG. |
| `icon_too_large` | Pesa más de 256 KB. |
| `icon_dimensions` | No es cuadrado o está fuera de 64–512 px. |
