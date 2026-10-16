# Guía de integración del ParamsCatcher (setup de escenas)

> El `gameId` se deja en **0**. No lo edites: el launcher de Boly lo sobrescribe
> con `-game_id` al arrancar el juego, así que un valor fijo se ignora igual. El id
> real lo asigna la plataforma cuando se crea el juego (al subir el primer build
> desde *Publicar un nuevo juego*) y queda visible en la URL del panel:
> `boly.cl/developer/games/<game_id>/builds`.

> Importante: el validador debe **persistir entre escenas** para poder hacer
> heartbeat. Los scripts de esta carpeta ya resuelven la persistencia **en
> codigo**
> - **Unity** → `DontDestroyOnLoad` (adjuntar a un GameObject raiz).
> - **Godot** → el nodo se reparenta solo a `/root` (adjuntar a un nodo HIJO de
>   la primera escena, no al nodo raiz de la escena).
> - **Unreal** → es un `UGameInstanceSubsystem` con `FTSTicker` (se auto-crea;
>   no hay que colocar nada en la escena).
> - **GameMaker** → un objeto con la casilla **Persistent** activada + un time
>   source **global**; sobrevive a `room_goto()` y sigue latiendo entre rooms.

> Overrides SOLO para pruebas: los scripts aceptan `-api_base <origin>` (apuntar el
> heartbeat a otro host, p.ej. el mock local del `verifier/`) y `-heartbeat_seconds <n>`
> (acortar el intervalo). El launcher de producción **nunca** los envía, así que el
> comportamiento en producción no cambia. Ver [`verifier/`](../verifier/).

# 🧩 Cómo integrarlo en Unity

**1. Preparar el proyecto Unity**

* Crear una escena inicial (ej: Bootstrap o AuthScene)
* Agregar un GameObject vacío
* Adjuntar este script (ParamsCatcher)
* Asegurarte que **esa escena sea la primera en Build Settings**

**2. Configurar escenas**

* Escena 0 → Validación (esta)
* Escena 1 → Juego principal

Build Index:
0 → AuthScene
1 → MainGame

**🚀 Cómo integrarlo en Godot**

**1. Crear escena de arranque**

* Crear una escena (ej: AuthScene.tscn)
* Agregar un **nodo hijo** tipo `Node` (NO el nodo raíz de la escena) y
  adjuntarle este script — el script se reparenta solo a `/root` para sobrevivir
  al cambio de escena. (Alternativa: registrarlo como Autoload; también funciona.)

**2. Configurar escena principal**

Cambia esta línea:

get\_tree().change\_scene\_to\_file("res://MainGame.tscn")

por la ruta real de tu juego.

**🧩 Cómo integrarlo en Unreal**

**1. Habilitar módulo HTTP**

En tu .Build.cs:

PublicDependencyModuleNames.AddRange(new string[] {
 "Core",
 "CoreUObject",
 "Engine",
 "InputCore",
 "HTTP",
 "Json",
 "JsonUtilities"
});

**2. Agregar el subsystem**

* Añade `ValidationSubsystem.h` / `.cpp` al proyecto y compila.
* **No hay que colocar nada en la escena**: un `UGameInstanceSubsystem` se
  auto-crea junto con el GameInstance y persiste entre niveles, así que el
  heartbeat corre solo durante toda la sesión.

**3. Configurar mapa de arranque**

* Edit → Project Settings → Maps & Modes
* Startup Map → AuthMap (tu mapa inicial; el subsystem valida y luego hace
  `OpenLevel("MainLevel")`)

**4. Crear flujo de escenas**

AuthMap → (validación) → MainLevel

**🧩 Cómo integrarlo en GameMaker**

**1. Crear el objeto validador**

* Crea un objeto (ej. `obj_params_catcher`) y **activa la casilla `Persistent`** en
  sus propiedades (así sobrevive a los cambios de room).
* Pega el código de `ParamsCatcherGAMEMAKER.md` en los eventos que indica el archivo:
  el bloque **CREATE EVENT** en el evento `Create`, y el bloque **ASYNC - HTTP EVENT**
  en el evento `Async > HTTP`.

**2. Colocarlo en la primera room**

* Crea una room de arranque (ej. `rm_auth`), coloca una instancia de
  `obj_params_catcher`, y ponla **primera en el Room Manager** (arriba del todo).

**3. Configurar la room principal**

Cambia esta línea del evento Async:

room\_goto(rm\_main)

por la room real de tu juego. El objeto es Persistent y el heartbeat corre sobre un
time source global, así que el heartbeat sigue latiendo después del `room_goto`.

**4. Crear flujo de rooms**

rm\_auth → (validación) → rm\_main
