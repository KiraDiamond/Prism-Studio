use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::sync::Mutex;
use tauri::{webview::{PageLoadEvent, WebviewWindowBuilder}, Manager, WebviewUrl};

struct PendingCape {
    account: String,
    image: String,
}

static PENDING: Mutex<Option<PendingCape>> = Mutex::new(None);
const PROFILE: &str = "https://account.wynntils.com/profile.php";

fn upload_script(cape: PendingCape) -> Result<String, String> {
    let account = serde_json::to_string(&cape.account).map_err(|e| e.to_string())?;
    let image = serde_json::to_string(&cape.image).map_err(|e| e.to_string())?;
    Ok(format!(r#"(() => {{
      if (location.origin !== 'https://account.wynntils.com' || location.pathname !== '/profile.php') return;
      const account = {account};
      const image = {image};
      const signedIn = document.querySelector('#userInfo h1')?.textContent.trim();
      const form = document.querySelector('form#userSettings');
      const input = form?.querySelector('input#upload[type=file]');
      if (!signedIn || !input) return;
      if (signedIn.toLowerCase() !== account.toLowerCase()) {{
        alert('Prism Studio has a cape for ' + account + ', but Wynntils is signed in as ' + signedIn + '. Sign in with the matching account, then press Apply in Prism Studio again.');
        return;
      }}
      try {{
        const binary = atob(image);
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        const file = new File([bytes], 'prism-studio-cape.png', {{ type: 'image/png' }});
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        const preview = document.querySelector('#uploaded');
        preview.addEventListener('load', () => {{
          if (input.files.length === 1) form.requestSubmit();
        }}, {{ once: true }});
        input.dispatchEvent(new Event('change', {{ bubbles: true }}));
      }} catch (error) {{
        alert('Prism Studio could not put the cape on the Wynntils page: ' + error);
      }}
    }})();"#))
}

#[tauri::command]
pub async fn apply_wynntils_cape(app: tauri::AppHandle, account: String, base64_data: String) -> Result<(), String> {
    if account.trim().is_empty() || account.len() > 32 { return Err("Choose a Minecraft account first.".into()); }
    if base64_data.len() > 700_000 { return Err("Cape PNG exceeds 500 KB.".into()); }
    let encoded = base64_data.split_once(',').map(|(_, data)| data).unwrap_or(&base64_data);
    let bytes = STANDARD.decode(encoded).map_err(|_| "Could not read cape PNG")?;
    crate::capes::validate_png(&bytes)?;
    *PENDING.lock().map_err(|_| "Wynntils window is unavailable")? = Some(PendingCape {
        account, image: STANDARD.encode(bytes),
    });

    open_window(app, true)
}

#[tauri::command]
pub async fn open_wynntils_window(app: tauri::AppHandle) -> Result<(), String> {
    open_window(app, false)
}

fn open_window(app: tauri::AppHandle, refresh: bool) -> Result<(), String> {
    let url = PROFILE.parse::<tauri::Url>().map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window("wynntils-capes") {
        if refresh { window.navigate(url).map_err(|e| e.to_string())?; }
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "wynntils-capes", WebviewUrl::External(url))
        .title("Wynntils Capes · Prism Studio Test")
        .inner_size(960.0, 760.0)
        .on_page_load(|window, page| {
            if page.event() != PageLoadEvent::Finished
                || page.url().scheme() != "https"
                || page.url().host_str() != Some("account.wynntils.com")
                || page.url().path() != "/profile.php" { return; }
            let cape = PENDING.lock().ok().and_then(|mut pending| pending.take());
            if let Some(cape) = cape {
                if let Ok(script) = upload_script(cape) { let _ = window.eval(script); }
            }
        })
        .build().map_err(|e| e.to_string())?;
    Ok(())
}
