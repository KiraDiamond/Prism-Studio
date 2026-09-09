use std::{fs, path::PathBuf, sync::Mutex};
static WRITE_LOCK: Mutex<()> = Mutex::new(());
fn file() -> PathBuf { super::settings_file().with_file_name("preferences.json") }
fn valid(view: &str) -> bool { matches!(view, "grid" | "compact" | "list") }
#[tauri::command]
pub fn get_instance_library_view() -> Result<Option<String>, String> {
    let path=file();
    if !path.exists() { return Ok(None); }
    let value:serde_json::Value=serde_json::from_slice(&fs::read(path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    Ok(value.get("instanceLibraryView").map(|v|v.as_str().filter(|s|valid(s)).unwrap_or("grid").to_string()))
}
#[tauri::command]
pub fn set_instance_library_view(view: String) -> Result<(), String> {
    if !valid(&view) { return Err("Invalid instance layout".into()); }
    let _guard=WRITE_LOCK.lock().map_err(|e|e.to_string())?;
    let path=file();
    let mut value=if path.exists(){serde_json::from_slice::<serde_json::Value>(&fs::read(&path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?}else{serde_json::json!({})};
    let object=value.as_object_mut().ok_or("Invalid preferences file")?;
    object.insert("instanceLibraryView".into(),view.into());
    fs::create_dir_all(path.parent().unwrap()).map_err(|e|e.to_string())?;
    let temporary=path.with_extension(format!("{}.tmp",uuid::Uuid::new_v4()));
    fs::write(&temporary,serde_json::to_vec_pretty(&value).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    if let Err(e)=fs::rename(&temporary,&path){let _=fs::remove_file(temporary);return Err(e.to_string());}Ok(())
}
#[cfg(test)]
mod tests { #[test] fn accepts_only_supported_layouts(){for v in ["grid","compact","list"]{assert!(super::valid(v));}for v in ["","table","GRID"]{assert!(!super::valid(v));}} }
