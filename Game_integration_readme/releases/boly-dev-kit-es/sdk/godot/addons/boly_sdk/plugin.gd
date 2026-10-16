@tool
extends EditorPlugin

# Al activar el plugin (Proyecto > Configuracion del proyecto > Plugins) se
# registra el autoload "Boly", que se crea antes de la primera escena y
# sobrevive a change_scene_to_file(). No hay que colocar nada en la escena.

const AUTOLOAD_NAME := "Boly"
const AUTOLOAD_PATH := "res://addons/boly_sdk/boly.gd"
const SETTING_SCENE_ON_READY := "boly/scene_on_ready"


func _enable_plugin() -> void:
	add_autoload_singleton(AUTOLOAD_NAME, AUTOLOAD_PATH)

	# Escena opcional que se carga cuando la sesion queda lista.
	if not ProjectSettings.has_setting(SETTING_SCENE_ON_READY):
		ProjectSettings.set_setting(SETTING_SCENE_ON_READY, "")
	ProjectSettings.set_initial_value(SETTING_SCENE_ON_READY, "")
	ProjectSettings.add_property_info({
		"name": SETTING_SCENE_ON_READY,
		"type": TYPE_STRING,
		"hint": PROPERTY_HINT_FILE,
		"hint_string": "*.tscn,*.scn",
	})
	ProjectSettings.save()


func _disable_plugin() -> void:
	remove_autoload_singleton(AUTOLOAD_NAME)
