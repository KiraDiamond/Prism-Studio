use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{blocking::{Client, multipart}, redirect::Policy};
use serde_json::Value;
use std::{fs, io::Read, path::Path, sync::Mutex, time::{Duration, SystemTime, UNIX_EPOCH}};

const SERVICE: &str = "https://api.minecraftservices.com/minecraft/profile";
const REFRESH: &str = "Your Minecraft session needs refreshing. Sign in or refresh this account in Prism Launcher, then try Apply Skin again.";
static UPLOAD: Mutex<()> = Mutex::new(());

// Deliberately never serialized or logged. Only the Minecraft token is used.
fn credentials(accounts: &Value, name: &str, now: u64) -> Result<(String, String), String> {
    let matches: Vec<_> = accounts["accounts"].as_array().ok_or("Prism accounts could not be read.")?
        .iter().filter(|a| a["profile"]["name"].as_str() == Some(name)).collect();
    if matches.len() != 1 { return Err("Choose a unique Minecraft account in Studio before applying a skin.".into()); }
    let account = matches[0];
    if account["type"] != "MSA" { return Err("Online skins require a Microsoft Minecraft account. Offline accounts cannot upload skins.".into()); }
    let token = account["ygg"]["token"].as_str().filter(|s| !s.is_empty() && *s != "0" && *s != "offline").ok_or(REFRESH)?;
    if account["ygg"]["exp"].as_u64().is_some_and(|exp| exp <= now + 30) { return Err(REFRESH.into()); }
    let id = account["profile"]["id"].as_str().ok_or(REFRESH)?.replace('-', "");
    if id.len() != 32 || !id.bytes().all(|b| b.is_ascii_hexdigit()) { return Err(REFRESH.into()); }
    Ok((token.to_owned(), id))
}

fn check_status(code: u16) -> Result<(), String> {
    match code {
        200..=299 => Ok(()),
        401 => Err(REFRESH.into()),
        403 => Err("Minecraft refused this account's skin change. Check account ownership and permissions in Minecraft.".into()),
        429 => Err("Minecraft is receiving too many requests. Wait a little before trying again.".into()),
        400 => Err("Minecraft rejected this skin. Check its PNG texture and arm model.".into()),
        _ => Err("Minecraft could not complete the skin change. Please try again later.".into()),
    }
}

fn upload(client: &Client, endpoint: &str, token: &str, id: &str, bytes: Vec<u8>, variant: &str) -> Result<(), String> {
    // Verify the authenticated identity before changing anything remotely.
    let response = client.get(endpoint).bearer_auth(token).send().map_err(|_| "Could not reach Minecraft. Check your connection and try again.")?;
    check_status(response.status().as_u16())?;
    let mut body = Vec::new();
    response.take(256_001).read_to_end(&mut body).map_err(|_| "Could not read Minecraft's response.")?;
    if body.len() > 256_000 { return Err("Minecraft returned an unexpected response.".into()); }
    let profile: Value = serde_json::from_slice(&body).map_err(|_| "Minecraft returned an unexpected response.")?;
    if profile["id"].as_str().map(|v| v.replace('-', "").eq_ignore_ascii_case(id)) != Some(true) {
        return Err("The saved session belongs to a different account. Refresh the account in Prism before trying again.".into());
    }
    let part = multipart::Part::bytes(bytes).file_name("skin.png").mime_str("image/png").map_err(|_| "Could not prepare the skin upload.")?;
    let form = multipart::Form::new().text("variant", variant.to_owned()).part("file", part);
    let response = client.post(format!("{endpoint}/skins")).bearer_auth(token).multipart(form).send()
        .map_err(|_| "The upload did not finish. Your skin may have changed; check Minecraft before retrying.")?;
    check_status(response.status().as_u16())
}

#[tauri::command]
pub async fn apply_skin(skin_id: String, profile: String, model: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = UPLOAD.try_lock().map_err(|_| "A skin upload is already in progress.")?;
        let variant = match model.as_str() { "default" => "classic", "slim" => "slim", _ => return Err("Choose Classic or Slim arms.".into()) };
        let library = crate::skins::read_skin_library()?;
        let skin = library.skins.get(&skin_id).ok_or("This skin is no longer in your library.")?;
        let textures = crate::skins::read_skin_textures_batched(vec![skin.texture_id.clone()])?;
        let encoded = textures.get(&skin.texture_id).ok_or("The original skin PNG is missing. Import it again.")?;
        let bytes = STANDARD.decode(encoded.rsplit(',').next().unwrap_or(encoded)).map_err(|_| "The saved skin texture is damaged.")?;
        if crate::skins::validate_png_and_get_hash(&bytes)? != skin.texture_id { return Err("The skin file changed on disk. Import it again before applying.".into()); }
        let file = fs::File::open(Path::new(&crate::settings().root).join("accounts.json")).map_err(|_| REFRESH)?;
        let mut data = Vec::new();file.take(8_000_001).read_to_end(&mut data).map_err(|_| REFRESH)?;
        if data.len() > 8_000_000 { return Err("Prism's account file is too large to read safely.".into()); }
        let accounts: Value = serde_json::from_slice(&data).map_err(|_| REFRESH)?;
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        let (token, id) = credentials(&accounts, &profile, now)?;
        let client = Client::builder().https_only(true).redirect(Policy::none()).timeout(Duration::from_secs(30)).build()
            .map_err(|_| "Could not initialize the secure connection to Minecraft.")?;
        upload(&client, SERVICE, &token, &id, bytes, variant)
    }).await.map_err(|_| "The skin upload stopped unexpectedly. Please try again.")?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn account_selection_rejects_offline_expired_and_ambiguous_sessions() {
        let mut data = json!({"accounts":[{"type":"MSA","profile":{"name":"Player","id":"0123456789abcdef0123456789abcdef"},"ygg":{"token":"test-only","exp":1000}}]});
        assert!(credentials(&data, "Player", 100).is_ok());
        assert!(credentials(&data, "Other", 100).is_err());
        assert!(credentials(&data, "Player", 1000).is_err());
        data["accounts"][0]["type"] = json!("Offline");assert!(credentials(&data,"Player",100).is_err());
        data["accounts"][0]["type"] = json!("MSA");let duplicate=data["accounts"][0].clone();data["accounts"].as_array_mut().unwrap().push(duplicate);
        assert!(credentials(&data,"Player",100).is_err());
    }
    #[test]
    fn only_successful_http_status_is_success() {
        for code in [200,204] { assert!(check_status(code).is_ok()); }
        for code in [302,400,401,403,429,500] { assert!(check_status(code).is_err()); }
    }
    #[test]
    fn sends_original_png_and_variant_after_identity_check() {
        use std::{net::TcpListener, io::Write};
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint=format!("http://{}/minecraft/profile",listener.local_addr().unwrap());
        let worker=std::thread::spawn(move||{
            for stage in 0..2 {
                let (mut stream,_)=listener.accept().unwrap();stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
                let mut request=Vec::new();let mut byte=[0];
                while !request.ends_with(b"\r\n\r\n"){stream.read_exact(&mut byte).unwrap();request.push(byte[0]);}
                let headers=String::from_utf8(request).unwrap();
                assert!(headers.to_lowercase().contains("authorization: bearer test-only"));
                if stage==0 {
                    assert!(headers.starts_with("GET /minecraft/profile "));
                    let body=r#"{"id":"0123456789abcdef0123456789abcdef"}"#;
                    write!(stream,"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
                }else{
                    assert!(headers.starts_with("POST /minecraft/profile/skins "));
                    let length=headers.lines().find_map(|line|line.to_lowercase().strip_prefix("content-length: ").and_then(|s|s.parse::<usize>().ok())).unwrap();
                    let mut body=vec![0;length];stream.read_exact(&mut body).unwrap();let text=String::from_utf8_lossy(&body);
                    assert!(text.contains("name=\"variant\"\r\n\r\nslim"));
                    assert!(text.contains("filename=\"skin.png\""));assert!(text.contains("ORIGINAL-PNG"));
                    write!(stream,"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n").unwrap();
                }
            }
        });
        let client=Client::builder().redirect(Policy::none()).timeout(Duration::from_secs(5)).build().unwrap();
        let result=upload(&client,&endpoint,"test-only","0123456789abcdef0123456789abcdef",b"ORIGINAL-PNG".to_vec(),"slim");
        worker.join().unwrap();assert!(result.is_ok());
    }
}
