use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, path::PathBuf, sync::{LazyLock, Mutex}};
use tauri::{webview::{PageLoadEvent, WebviewWindowBuilder}, Emitter, Manager, WebviewUrl};

struct PendingCape {
    image: String,
    id: String,
}

#[derive(Clone, Serialize)]
struct CapeStatus {
    account: String,
    status: &'static str,
}

static PENDING: LazyLock<Mutex<HashMap<String, PendingCape>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static ACTIVE: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
const PROFILE: &str = "https://account.wynntils.com/profile.php";
const TITLE_PREFIX: &str = "prism-studio-cape:";

fn account_key(account: &str) -> Result<String, String> {
    let account = account.trim();
    if account.is_empty() || account.len() > 32 || !account.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("Choose a Minecraft account first.".into());
    }
    Ok(account.to_ascii_lowercase())
}

fn session_id(key: &str) -> String {
    let digest = Sha256::digest(key.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn session_directory(id: &str) -> Result<PathBuf, String> {
    Ok(PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA is unavailable")?)
        .join("PrismStudioTest").join("wynntils-sessions").join(id))
}

fn emit_status(app: &tauri::AppHandle, account: &str, status: &'static str) {
    let _ = app.emit("wynntils-cape-status", CapeStatus { account: account.into(), status });
}

fn hide_and_restore_focus(window: &tauri::WebviewWindow) {
    let was_visible = window.is_visible().unwrap_or(false);
    let _ = window.hide();
    if was_visible {
        if let Some(main) = window.app_handle().get_webview_window("main") {
            let _ = main.set_focus();
        }
    }
}

fn upload_script(cape: PendingCape) -> Result<String, String> {
    let image = serde_json::to_string(&cape.image).map_err(|e| e.to_string())?;
    let id = serde_json::to_string(&cape.id).map_err(|e| e.to_string())?;
    Ok(format!(r#"(() => {{
      if (location.origin !== 'https://account.wynntils.com' || location.pathname !== '/profile.php') return;
      const image = {image};
      const id = {id};
      const report = result => {{ document.title = 'prism-studio-cape:' + id + ':' + result; }};
      const form = document.querySelector('form#userSettings');
      const input = form?.querySelector('input#upload[type=file]');
      const preview = document.querySelector('#uploaded');
      if (!input || !preview || !window.jQuery) {{ report('error'); return; }}
      try {{
        const bytes = Uint8Array.from(atob(image), char => char.charCodeAt(0));
        const file = new File([bytes], 'prism-studio-cape.png', {{ type: 'image/png' }});
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        const success = (_event, _xhr, settings, data) => {{
          if (new URL(settings.url, location.href).pathname !== '/update.php') return;
          jQuery(document).off('ajaxSuccess', success).off('ajaxError', failure);
          report(data?.result === 'OK' ? 'applied' : 'error');
        }};
        const failure = (_event, _xhr, settings) => {{
          if (new URL(settings.url, location.href).pathname !== '/update.php') return;
          jQuery(document).off('ajaxSuccess', success).off('ajaxError', failure);
          report('error');
        }};
        jQuery(document).on('ajaxSuccess', success).on('ajaxError', failure);
        preview.addEventListener('load', () => {{
          if (input.files.length === 1) form.requestSubmit();
          else report('error');
        }}, {{ once: true }});
        input.dispatchEvent(new Event('change', {{ bubbles: true }}));
      }} catch (_error) {{ report('error'); }}
    }})();"#))
}

#[tauri::command]
pub async fn apply_wynntils_cape(app: tauri::AppHandle, account: String, base64_data: String) -> Result<(), String> {
    let key = account_key(&account)?;
    if base64_data.len() > 700_000 { return Err("Cape PNG exceeds 500 KB.".into()); }
    let encoded = base64_data.split_once(',').map(|(_, data)| data).unwrap_or(&base64_data);
    let bytes = STANDARD.decode(encoded).map_err(|_| "Could not read cape PNG")?;
    crate::capes::validate_png(&bytes)?;
    PENDING.lock().map_err(|_| "Wynntils window is unavailable")?.insert(key.clone(), PendingCape {
        image: STANDARD.encode(bytes), id: uuid::Uuid::new_v4().to_string(),
    });
    emit_status(&app, &account, "checking");
    open_window(app, account, key, true, false)
}

#[tauri::command]
pub async fn open_wynntils_window(app: tauri::AppHandle, account: String) -> Result<(), String> {
    let key = account_key(&account)?;
    open_window(app, account, key, false, true)
}

fn open_window(app: tauri::AppHandle, account: String, key: String, refresh: bool, interactive: bool) -> Result<(), String> {
    let id = session_id(&key);
    let label = format!("wynntils-{id}");
    let url = PROFILE.parse::<tauri::Url>().map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window(&label) {
        if interactive { window.show().map_err(|e| e.to_string())?; window.set_focus().map_err(|e| e.to_string())?; }
        if refresh {
            hide_and_restore_focus(&window);
            window.navigate(url).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let directory = session_directory(&id)?;
    let account_for_load = account.clone();
    let key_for_load = key.clone();
    let account_for_title = account.clone();
    let key_for_title = key.clone();
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url))
        .title(format!("Wynntils · {account} · Prism Studio Test"))
        .inner_size(960.0, 760.0)
        .visible(false)
        .data_directory(directory)
        .on_page_load(move |window, page| {
            if page.event() != PageLoadEvent::Finished { return; }
            let profile = page.url().scheme() == "https"
                && page.url().host_str() == Some("account.wynntils.com")
                && page.url().path() == "/profile.php";
            if !profile {
                if !window.is_visible().unwrap_or(false) {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                emit_status(window.app_handle(), &account_for_load, "login");
                return;
            }
            let account = account_for_load.clone();
            let key = key_for_load.clone();
            let check_window = window.clone();
            let _ = window.eval_with_callback("document.querySelector('#userInfo h1')?.textContent.trim() || ''", move |result| {
                let signed_in = serde_json::from_str::<String>(&result).unwrap_or_default();
                if signed_in.is_empty() {
                    let _ = check_window.show();
                    emit_status(check_window.app_handle(), &account, "login");
                    return;
                }
                if !signed_in.eq_ignore_ascii_case(&account) {
                    let _ = check_window.show();
                    emit_status(check_window.app_handle(), &account, "wrong_account");
                    return;
                }
                emit_status(check_window.app_handle(), &account, "connected");
                if let Some(cape) = PENDING.lock().ok().and_then(|mut pending| pending.remove(&key)) {
                    let id = cape.id.clone();
                    if let Ok(mut active) = ACTIVE.lock() { active.insert(key.clone(), id); }
                    emit_status(check_window.app_handle(), &account, "applying");
                    match upload_script(cape).and_then(|script| check_window.eval(script).map_err(|e| e.to_string())) {
                        Ok(()) => (),
                        Err(_) => {
                            let _ = check_window.show();
                            emit_status(check_window.app_handle(), &account, "error");
                        },
                    }
                } else {
                    hide_and_restore_focus(&check_window);
                }
            });
        })
        .on_document_title_changed(move |window, title| {
            if let Some(value) = title.strip_prefix(TITLE_PREFIX) {
                if let Some((id, outcome)) = value.rsplit_once(':') {
                    let matched = ACTIVE.lock().ok().and_then(|mut active| {
                        if active.get(&key_for_title).map(String::as_str) == Some(id) { active.remove(&key_for_title) } else { None }
                    });
                    if matched.is_some() {
                        if outcome == "applied" { hide_and_restore_focus(&window); }
                        else { let _ = window.show(); }
                        emit_status(window.app_handle(), &account_for_title, if outcome == "applied" { "applied" } else { "error" });
                    }
                }
            }
        })
        .build().map_err(|e| e.to_string())?;
    Ok(())
}
