BOLY - KIT DE INTEGRACION DE JUEGOS
===================================

1. Abre  index.html  en tu navegador web (doble clic).
   Es una guia interactiva, paso a paso. Siguela.
   (La guia tiene un boton para cambiar entre Espanol e Ingles.)

2. El SDK de Boly que agregas a tu juego esta en la carpeta  sdk/
   (una carpeta por motor: unity / godot / unreal / gamemaker, cada una con
   su README.md). Reemplaza al antiguo script ParamsCatcher: no lo uses en
   juegos nuevos.

3. boly-verify-win.exe  prueba tu build final en Windows -- la guia (Paso 4)
   explica exactamente como ejecutarlo. Ejecutalo desde ESTA carpeta.

4. Si usas un asistente de IA (Claude Code, Cursor, etc.), abrelo en la
   carpeta de tu juego y pidele que lea y siga  INSTRUCCIONES_IA.md  de este
   kit: integra el SDK, compila y prueba el build con el verificador.

5. No hay que configurar ningun id de juego: Boly lo asigna cuando se crea tu
   juego y el launcher se lo pasa al ejecutable al arrancar.

Dudas? Contacta a tu referente en Boly.
