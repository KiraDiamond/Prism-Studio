use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
static STORAGE: Mutex<()> = Mutex::new(());
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkinLibrary {
    pub packs: Vec<SkinPack>,
    pub skins: HashMap<String, StoredSkin>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkinPack {
    pub id: String,
    pub name: String,
    pub skins: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoredSkin {
    pub name: String,
    pub model: String,
    pub texture_id: String,
}

// Ensures we target %APPDATA%\PrismStudio\skins exactly like connection.json
fn get_skins_dir() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA").map_err(|_| "No APPDATA env var")?;
    let dir = PathBuf::from(app_data).join("PrismStudio").join("skins");
    if !dir.exists() { fs::create_dir_all(&dir).map_err(|e| e.to_string())?; }
    Ok(dir)
}

fn get_textures_dir() -> Result<PathBuf, String> {
    let dir = get_skins_dir()?.join("textures");
    if !dir.exists() { fs::create_dir_all(&dir).map_err(|e| e.to_string())?; }
    Ok(dir)
}

fn is_safe_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn validate_png_and_get_hash(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > 1024 * 1024 { return Err("File exceeds 1MB".into()); }
    
    // Actually parse and validate the PNG
    let decoder = png::Decoder::new(bytes);
    let mut reader = decoder.read_info().map_err(|_| "Structurally invalid PNG")?;
    let info = reader.info();
    
    if info.width != 64 || (info.height != 64 && info.height != 32) {
        return Err("Invalid Minecraft skin dimensions (must be 64x64 or 64x32)".into());
    }

    let mut decoded = vec![0; reader.output_buffer_size()];
    reader.next_frame(&mut decoded).map_err(|_| "Corrupted PNG image data")?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

#[tauri::command]
pub fn read_skin_library() -> Result<SkinLibrary, String> {
    let _guard = STORAGE.lock().map_err(|_| "Storage lock failed")?;
    let lib_path = get_skins_dir()?.join("library.json");
    if !lib_path.exists() && lib_path.with_extension("bak").exists() {
        fs::rename(lib_path.with_extension("bak"), &lib_path).map_err(|e| e.to_string())?;
    }
    if lib_path.exists() {
        if fs::metadata(&lib_path).map_err(|e| e.to_string())?.len() > 8_000_000 { return Err("Library too large".into()); }
        let data = fs::read_to_string(lib_path).map_err(|e| e.to_string())?;
        let library: SkinLibrary = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        validate_library(&library)?;
        Ok(library)
    } else {
        Ok(SkinLibrary {
            packs: vec![
                SkinPack { id: "all-old-skins".into(), name: "All Old Skins".into(), skins: vec![] },
                SkinPack { id: "account-skins".into(), name: "Account Skins".into(), skins: vec![] }
            ],
            skins: HashMap::new(),
        })
    }
}

#[tauri::command]
pub fn save_skin_library(library: SkinLibrary) -> Result<(), String> {
    let _guard = STORAGE.lock().map_err(|_| "Storage lock failed")?;
    validate_library(&library)?;
    // Serialized replacement with rollback; not an atomic Windows transaction.
    let lib_path = get_skins_dir()?.join("library.json");
    let temp_path = lib_path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let json = serde_json::to_string(&library).map_err(|e| e.to_string())?;

    let mut temp_file = File::create(&temp_path).map_err(|e| e.to_string())?;
    temp_file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    temp_file.sync_all().map_err(|e| e.to_string())?; // Ensure flushed to disk
    drop(temp_file);

    // Robust replace to bypass Windows lock errors
    if lib_path.exists() {
        let backup_path = lib_path.with_extension("bak");
        let _ = fs::remove_file(&backup_path);
        if fs::rename(&lib_path, &backup_path).is_ok() {
            if let Err(e) = fs::rename(&temp_path, &lib_path) {
                let _ = fs::rename(&backup_path, &lib_path); // Restore on fail
                return Err(e.to_string());
            }
            let _ = fs::remove_file(&backup_path);
        } else {
            // Fallback
            fs::rename(&temp_path, &lib_path).map_err(|e| e.to_string())?;
        }
    } else {
        fs::rename(&temp_path, &lib_path).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn process_and_save_texture(base64_data: String) -> Result<String, String> {
    let _guard = STORAGE.lock().map_err(|_| "Storage lock failed")?;
    if base64_data.len() > 1_400_000 { return Err("Texture input too large".into()); }
    let b64_clean = base64_data.split(',').last().unwrap_or(&base64_data);
    let bytes = BASE64.decode(b64_clean).map_err(|_| "Invalid base64 encoding")?;
    
    let texture_id = validate_png_and_get_hash(&bytes)?;
    let tex_path = get_textures_dir()?.join(format!("{}.png", texture_id));
    
    if !tex_path.exists() {
        let temp_path = tex_path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        let mut f = File::create(&temp_path).map_err(|e| e.to_string())?;
        f.write_all(&bytes).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
        drop(f);
        fs::rename(temp_path, tex_path).map_err(|e| e.to_string())?;
    }
    
    Ok(texture_id)
}

#[tauri::command]
pub fn read_skin_textures_batched(ids: Vec<String>) -> Result<HashMap<String, String>, String> {
    if ids.len() > 128 { return Err("Texture batch too large".into()); }
    let mut result = HashMap::new();
    let dir = get_textures_dir()?;
    
    for id in ids {
        if !is_texture_id(&id) { return Err("Invalid texture ID".into()); }
        let tex_path = dir.join(format!("{}.png", id));
        if let Ok(mut f) = File::open(tex_path) {
            let mut bytes = Vec::new();
            if f.metadata().map_err(|e| e.to_string())?.len() > 1_048_576 { return Err("Texture too large".into()); }
            if f.read_to_end(&mut bytes).is_ok() && validate_png_and_get_hash(&bytes)? == id {
                result.insert(id, format!("data:image/png;base64,{}", BASE64.encode(&bytes)));
            }
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn generate_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn is_texture_id(id: &str) -> bool { id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()) }
fn validate_library(library: &SkinLibrary) -> Result<(), String> {
    // 1. Strict Validation
    if library.packs.len() > 200 { return Err("Maximum pack count exceeded".into()); }
    if library.skins.len() > 10000 { return Err("Maximum skin count exceeded".into()); }
    
    if !library.packs.iter().any(|p| p.id == "all-old-skins") { return Err("Missing All Old Skins".into()); }
    if !library.packs.iter().any(|p| p.id == "account-skins") { return Err("Missing Account Skins".into()); }

    let mut pack_ids = HashSet::new();
    for pack in &library.packs { if !pack_ids.insert(&pack.id) { return Err("Duplicate pack ID".into()); } }
    let mut defined_skins = HashSet::new();
    for (id, skin) in &library.skins {
        if !is_safe_id(id) { return Err(format!("Invalid skin ID: {}", id)); }
        if !is_texture_id(&skin.texture_id) { return Err(format!("Invalid texture ID in skin: {}", id)); }
        if skin.model != "default" && skin.model != "slim" { return Err("Model must be default or slim".into()); }
        if skin.name.trim().is_empty() || skin.name.len() > 240 { return Err("Invalid skin name".into()); }
        defined_skins.insert(id.clone());
    }

    for pack in &library.packs {
        if !is_safe_id(&pack.id) { return Err(format!("Invalid pack ID: {}", pack.id)); }
        if pack.name.trim().is_empty() || pack.name.len() > 240 { return Err("Invalid pack name".into()); }
        
        let mut pack_skins = HashSet::new();
        for skin_id in &pack.skins {
            if !defined_skins.contains(skin_id) { return Err(format!("Pack references missing skin: {}", skin_id)); }
            if !pack_skins.insert(skin_id) { return Err(format!("Duplicate skin {} in pack {}", skin_id, pack.id)); }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn library() -> SkinLibrary {
        SkinLibrary { packs: vec![SkinPack{id:"all-old-skins".into(),name:"All Old Skins".into(),skins:vec![]},SkinPack{id:"account-skins".into(),name:"Account Skins".into(),skins:vec![]}], skins:HashMap::new() }
    }
    #[test]
    fn rejects_invalid_references_and_duplicate_packs() {
        let mut lib=library();assert!(validate_library(&lib).is_ok());
        lib.packs.push(lib.packs[0].clone());assert!(validate_library(&lib).is_err());lib.packs.pop();
        lib.packs[0].skins.push("missing".into());assert!(validate_library(&lib).is_err());
        assert!(!is_texture_id("../texture"));
    }
    #[test]
    fn fully_decodes_png_and_rejects_truncation() {
        let mut bytes=Vec::new();
        {let mut encoder=png::Encoder::new(&mut bytes,64,64);encoder.set_color(png::ColorType::Rgba);encoder.set_depth(png::BitDepth::Eight);let mut writer=encoder.write_header().unwrap();writer.write_image_data(&vec![255;64*64*4]).unwrap();}
        assert!(validate_png_and_get_hash(&bytes).is_ok());
        bytes.truncate(40);assert!(validate_png_and_get_hash(&bytes).is_err());
    }
    #[test]
    fn separate_entries_can_share_texture() {
        let mut lib=library();
        for (id,model) in [("one","slim"),("two","default")] {lib.skins.insert(id.into(),StoredSkin{name:id.into(),model:model.into(),texture_id:"a".repeat(64)});lib.packs[0].skins.push(id.into());}
        assert!(validate_library(&lib).is_ok());
        lib.packs[0].skins.push("one".into());assert!(validate_library(&lib).is_err());
    }
}
