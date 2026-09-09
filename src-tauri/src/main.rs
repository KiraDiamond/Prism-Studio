#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod bridge;
mod skins;
mod preferences;
use bridge::{Settings,Library,Mod};
use std::{fs,path::PathBuf};

fn settings_file()->PathBuf {PathBuf::from(std::env::var_os("APPDATA").unwrap_or_default()).join("PrismStudio/connection.json")}
fn settings()->Settings {fs::read(settings_file()).ok().and_then(|data|serde_json::from_slice(&data).ok()).unwrap_or_default()}

#[tauri::command]
async fn library()->Result<Library,String> {
    tauri::async_runtime::spawn_blocking(||bridge::read_library(settings())).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn get_settings()->Settings {settings()}
#[tauri::command]
async fn save_connection(root:String,executable:String)->Result<Library,String> {
    tauri::async_runtime::spawn_blocking(move||{
        let config=Settings{root,executable};
        let library=bridge::read_library(config.clone())?;
        if !library.executable_found || !PathBuf::from(&config.executable).file_name().unwrap_or_default().to_string_lossy().eq_ignore_ascii_case("prismlauncher.exe") {
            return Err("Select an existing prismlauncher.exe.".into());
        }
        let file=settings_file();
        fs::create_dir_all(file.parent().unwrap()).map_err(|e|e.to_string())?;
        fs::write(&file,serde_json::to_vec_pretty(&config).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
        Ok(library)
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn launch(id:String,profile:String,server:String)->Result<String,String> {
    tauri::async_runtime::spawn_blocking(move||{
        let config=settings();
        let library=bridge::read_library(config.clone())?;
        bridge::instance_path(&config,&id)?;
        let args=bridge::launch_args(&config,&library,&id,&profile,&server)?;
        bridge::run_prism(&config,&args)?;
        Ok("Launch request sent to Prism. Authentication or download prompts may appear there.".into())
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn open_prism(id:Option<String>)->Result<(),String> {
    tauri::async_runtime::spawn_blocking(move||{
        let config=settings();
        let mut args=vec!["--dir".into(),config.root.clone()];
        if let Some(id)=id {bridge::instance_path(&config,&id)?;args.extend(["--show".into(),id]);}
        bridge::run_prism(&config,&args)?;Ok(())
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn mods(id:String)->Result<Vec<Mod>,String> {
    tauri::async_runtime::spawn_blocking(move||bridge::read_mods(&settings(),&id)).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn open_folder(id:String)->Result<(),String> {
    tauri::async_runtime::spawn_blocking(move||{
        let folder=bridge::instance_path(&settings(),&id)?;
        let mut child=std::process::Command::new("explorer.exe").arg(folder).spawn().map_err(|e|e.to_string())?;
        std::thread::spawn(move||{let _=child.wait();});Ok(())
    }).await.map_err(|e|e.to_string())?
}
fn main() {
    // Diagnostic mode uses the exact production reader and never includes authentication tokens.
    if let Some(output)=std::env::args().skip_while(|a|a!="--diagnose").nth(1) {
        let result=bridge::read_library(settings());
        let _=fs::write(output,serde_json::to_vec(&result).unwrap());return;
    }
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![library,get_settings,save_connection,launch,open_prism,mods,open_folder,skins::read_skin_library,skins::save_skin_library,skins::process_and_save_texture,skins::read_skin_textures_batched,skins::generate_uuid,preferences::get_instance_library_view,preferences::set_instance_library_view])
        .run(tauri::generate_context!()).expect("Prism Studio could not start");
}
