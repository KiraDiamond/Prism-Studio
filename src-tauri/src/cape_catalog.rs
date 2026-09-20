use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::{blocking::Client, redirect::Policy};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, SystemTime},
};

const CAPE_URL: &str = "https://athena.wynntils.com/capes/get/";
const MAX_DOWNLOAD: u64 = 700 * 1024;
const MAX_CACHE: u64 = 32 * 1024 * 1024;
static CACHE: Mutex<()> = Mutex::new(());

fn valid_sha1(sha: &str) -> bool {
    sha.len() == 40 && sha.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn cache_directory() -> Result<PathBuf, String> {
    let directory = PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA is unavailable")?)
        .join("PrismStudioTest")
        .join("cape-cache");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn read_cached(path: &Path) -> Option<Vec<u8>> {
    let bytes = fs::read(path).ok()?;
    super::capes::validate_png(&bytes).ok()?;
    Some(bytes)
}

fn trim_cache(directory: &Path, keep: &Path) {
    let mut entries = match fs::read_dir(directory) {
        Ok(entries) => entries.filter_map(Result::ok).filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            if !metadata.is_file() { return None; }
            Some((entry.path(), metadata.len(), metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH)))
        }).collect::<Vec<_>>(),
        Err(_) => return,
    };
    let mut total = entries.iter().map(|(_, size, _)| size).sum::<u64>();
    entries.sort_by_key(|(_, _, modified)| *modified);
    for (path, size, _) in entries {
        if total <= MAX_CACHE { break; }
        if path == keep { continue; }
        if fs::remove_file(path).is_ok() { total = total.saturating_sub(size); }
    }
}

fn download(sha: &str) -> Result<Vec<u8>, String> {
    let client = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .user_agent("Prism Studio/0.2.0")
        .build()
        .map_err(|_| "Could not prepare the cape download.")?;
    let mut response = client.get(format!("{CAPE_URL}{sha}"))
        .send().map_err(|_| "Could not reach the Wynntils cape catalog.")?;
    if !response.status().is_success() { return Err("Wynntils did not return this cape.".into()); }
    if response.content_length().is_some_and(|length| length > MAX_DOWNLOAD) {
        return Err("Catalog cape exceeds the app's save limit.".into());
    }
    let mut bytes = Vec::new();
    response.by_ref().take(MAX_DOWNLOAD + 1).read_to_end(&mut bytes)
        .map_err(|_| "Could not read the catalog cape.")?;
    if bytes.len() as u64 > MAX_DOWNLOAD { return Err("Catalog cape exceeds the app's save limit.".into()); }
    if bytes.starts_with(b"GIF8") { return Err("Animated catalog capes are preview-only for now.".into()); }
    super::capes::validate_png(&bytes)?;
    Ok(bytes)
}

#[tauri::command]
pub async fn fetch_catalog_cape(sha: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !valid_sha1(&sha) { return Err("Invalid catalog cape ID.".into()); }
        let _guard = CACHE.lock().map_err(|_| "Cape cache unavailable")?;
        let directory = cache_directory()?;
        let path = directory.join(format!("{sha}.png"));
        let bytes = if let Some(bytes) = read_cached(&path) {
            bytes
        } else {
            let bytes = download(&sha)?;
            let temporary = directory.join(format!("{sha}.tmp"));
            fs::write(&temporary, &bytes).map_err(|error| error.to_string())?;
            if path.exists() { fs::remove_file(&path).map_err(|error| error.to_string())?; }
            fs::rename(&temporary, &path).map_err(|error| {
                let _ = fs::remove_file(&temporary);
                error.to_string()
            })?;
            trim_cache(&directory, &path);
            bytes
        };
        Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
    }).await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::valid_sha1;

    #[test]
    fn accepts_only_lowercase_sha1_identifiers() {
        assert!(valid_sha1("0ead25e56a2c995c8ecc486a37aa2d62b73497cf"));
        assert!(!valid_sha1("0EAD25E56A2C995C8ECC486A37AA2D62B73497CF"));
        assert!(!valid_sha1("../0ead25e56a2c995c8ecc486a37aa2d62b73497cf"));
        assert!(!valid_sha1("not-a-sha"));
    }
}
