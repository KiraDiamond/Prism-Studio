use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};

static STORAGE: Mutex<()> = Mutex::new(());

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cape {
    id: String,
    account: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapePreview {
    id: String,
    account: String,
    name: String,
    texture: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapeList {
    capes: Vec<CapePreview>,
    unreadable: usize,
}

fn directory() -> Result<PathBuf, String> {
    let dir = PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA is unavailable")?)
        .join("PrismStudioTest").join("capes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn safe_id(id: &str) -> bool {
    uuid::Uuid::parse_str(id).is_ok()
}

fn cape_paths(id: &str) -> Result<(PathBuf, PathBuf), String> {
    if !safe_id(id) { return Err("Invalid cape ID".into()); }
    let dir = directory()?;
    Ok((dir.join(format!("{id}.json")), dir.join(format!("{id}.png"))))
}

pub(crate) fn validate_png(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > 500 * 1024 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Choose a cape PNG under 500 KB.".into());
    }
    let mut reader = png::Decoder::new(bytes).read_info().map_err(|_| "Invalid cape PNG")?;
    let info = reader.info();
    if info.width == 0 || info.width % 64 != 0 || info.height.checked_mul(2) != Some(info.width) {
        return Err("Cape width must be a multiple of 64 and height half the width.".into());
    }
    if reader.output_buffer_size() > 64 * 1024 * 1024 { return Err("Cape image is too large.".into()); }
    let mut decoded = vec![0; reader.output_buffer_size()];
    reader.next_frame(&mut decoded).map_err(|_| "Damaged cape PNG")?;
    Ok(())
}

fn preview(cape: Cape) -> Result<CapePreview, String> {
    let (_, png_path) = cape_paths(&cape.id)?;
    let bytes = fs::read(png_path).map_err(|e| e.to_string())?;
    validate_png(&bytes)?;
    Ok(CapePreview {
        id: cape.id, account: cape.account, name: cape.name,
        texture: format!("data:image/png;base64,{}", STANDARD.encode(bytes)),
    })
}

#[tauri::command]
pub fn list_capes() -> Result<CapeList, String> {
    let _guard = STORAGE.lock().map_err(|_| "Cape storage unavailable")?;
    let mut capes = Vec::new();
    let mut unreadable = 0;
    for entry in fs::read_dir(directory()?).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") { continue; }
        let result = fs::read(&path)
            .map_err(|e| e.to_string())
            .and_then(|data| {
                if data.len() > 2048 { return Err("Saved cape information is damaged.".into()); }
                serde_json::from_slice::<Cape>(&data).map_err(|_| "Saved cape information is damaged.".into())
            })
            .and_then(preview);
        match result { Ok(cape) => capes.push(cape), Err(_) => unreadable += 1 }
    }
    capes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(CapeList { capes, unreadable })
}

#[tauri::command]
pub fn add_cape(account: String, name: String, base64_data: String) -> Result<CapePreview, String> {
    let _guard = STORAGE.lock().map_err(|_| "Cape storage unavailable")?;
    if account.is_empty() || account.len() > 32 { return Err("Choose a Minecraft account first.".into()); }
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 60 { return Err("Cape name must be 1 to 60 characters.".into()); }
    if base64_data.len() > 700_000 { return Err("Cape PNG exceeds 500 KB.".into()); }
    let encoded = base64_data.split_once(',').map(|(_, data)| data).unwrap_or(&base64_data);
    let bytes = STANDARD.decode(encoded).map_err(|_| "Could not read cape PNG")?;
    validate_png(&bytes)?;
    let cape = Cape { id: uuid::Uuid::new_v4().to_string(), account, name: name.into() };
    let (metadata_path, png_path) = cape_paths(&cape.id)?;
    fs::write(&png_path, &bytes).map_err(|e| e.to_string())?;
    if let Err(error) = fs::write(&metadata_path, serde_json::to_vec(&cape).map_err(|e| e.to_string())?) {
        let _ = fs::remove_file(&png_path);
        return Err(error.to_string());
    }
    preview(cape)
}

#[tauri::command]
pub fn rename_cape(id: String, name: String) -> Result<(), String> {
    let _guard = STORAGE.lock().map_err(|_| "Cape storage unavailable")?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 60 { return Err("Cape name must be 1 to 60 characters.".into()); }
    let (metadata_path, _) = cape_paths(&id)?;
    let mut cape: Cape = serde_json::from_slice(&fs::read(&metadata_path).map_err(|e| e.to_string())?)
        .map_err(|_| "Saved cape information is damaged.")?;
    cape.name = name.into();
    fs::write(metadata_path, serde_json::to_vec(&cape).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_cape(id: String) -> Result<(), String> {
    let _guard = STORAGE.lock().map_err(|_| "Cape storage unavailable")?;
    let (metadata_path, png_path) = cape_paths(&id)?;
    fs::remove_file(metadata_path).map_err(|e| e.to_string())?;
    fs::remove_file(png_path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::validate_png;

    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().unwrap();
            writer.write_image_data(&vec![0; (width * height * 4) as usize]).unwrap();
        }
        bytes
    }

    #[test]
    fn validates_wynntils_cape_dimensions_and_image_data() {
        assert!(validate_png(&png(64, 32)).is_ok());
        assert!(validate_png(&png(128, 64)).is_ok());
        assert!(validate_png(&png(64, 64)).is_err());
        assert!(validate_png(&png(65, 32)).is_err());
        assert!(validate_png(b"not a png").is_err());
    }
}
