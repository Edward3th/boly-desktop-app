@tool
extends EditorExportPlugin

# Logros declarados en la build (spec/ACHIEVEMENTS_MANIFEST.md): la carpeta
# res://boly/ (con un archivo .gdignore para que Godot no importe los iconos
# ni los meta en el .pck) se copia junto al ejecutable al exportar. Asi el zip
# que se sube a boly.cl siempre lleva los logros de esa build.

const SOURCE := "res://boly"

var _export_dir := ""


func _get_name() -> String:
	return "BolySDK"


func _export_begin(_features: PackedStringArray, _is_debug: bool, path: String, _flags: int) -> void:
	var absolute := path if path.is_absolute_path() else ProjectSettings.globalize_path("res://").path_join(path)
	_export_dir = absolute.get_base_dir()


func _export_end() -> void:
	var source := ProjectSettings.globalize_path(SOURCE)
	if _export_dir == "" or not FileAccess.file_exists(source.path_join("achievements.json")):
		return
	var target := _export_dir.path_join("boly")
	# Sin restos de una exportacion anterior (un icono borrado no debe viajar)
	if DirAccess.dir_exists_absolute(target):
		_remove_folder(target)
	_copy_folder(source, target)
	print("[Boly] boly/achievements.json copiado junto al ejecutable: %s" % target)


func _copy_folder(from: String, to: String) -> void:
	DirAccess.make_dir_recursive_absolute(to)
	var dir := DirAccess.open(from)
	if dir == null:
		push_error("[Boly] No se pudo leer %s" % from)
		return
	for file in dir.get_files():
		# Metadatos de Godot y del sistema, no van a Boly
		if file == ".gdignore" or file.ends_with(".import") or file.ends_with(".uid"):
			continue
		DirAccess.copy_absolute(from.path_join(file), to.path_join(file))
	for sub in dir.get_directories():
		_copy_folder(from.path_join(sub), to.path_join(sub))


func _remove_folder(path: String) -> void:
	var dir := DirAccess.open(path)
	if dir == null:
		return
	for file in dir.get_files():
		DirAccess.remove_absolute(path.path_join(file))
	for sub in dir.get_directories():
		_remove_folder(path.path_join(sub))
	DirAccess.remove_absolute(path)
