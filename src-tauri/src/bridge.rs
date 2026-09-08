use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, fs, path::{Path, PathBuf}, process::{Command, Stdio}};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings { pub root: String, pub executable: String }

impl Default for Settings {
    fn default() -> Self {
        Self {
            root: PathBuf::from(std::env::var_os("APPDATA").unwrap_or_default()).join("PrismLauncher").to_string_lossy().into(),
            executable: PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default()).join("Programs/PrismLauncher/prismlauncher.exe").to_string_lossy().into(),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String, pub name: String, pub version: String, pub loader: String,
    pub icon: Option<String>, pub last_launch: u64, pub playtime: u64, pub group: String,
}
#[derive(Serialize, Clone)]
pub struct Account { pub name: String, pub active: bool }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub instances: Vec<Instance>, pub accounts: Vec<Account>, pub settings: Settings,
    pub warnings: Vec<String>, pub executable_found: bool,
}
#[derive(Serialize)]
pub struct Mod { pub name: String, pub enabled: bool, pub size: u64 }

pub fn parse_ini(text: &str) -> HashMap<String, String> {
    text.lines().filter_map(|line| {
        let line = line.trim_start_matches('\u{feff}').trim();
        if line.starts_with(['#', ';', '[']) { return None; }
        let (key, value) = line.split_once('=')?;
        let value = value.trim();
        let value = if value.starts_with('"') && value.ends_with('"') && value.len() >= 2 { &value[1..value.len()-1] } else {value};
        let mut result = String::new();
        let mut chars = value.chars();
        while let Some(ch) = chars.next() {
            if ch != '\\' { result.push(ch); continue; }
            match chars.next() {
                Some('n') => result.push('\n'), Some('r') => result.push('\r'), Some('t') => result.push('\t'),
                Some('\\') => result.push('\\'), Some('"') => result.push('"'),
                Some(other) => {result.push('\\'); result.push(other);}, None => result.push('\\'),
            }
        }
        Some((key.trim().into(),result))
    }).collect()
}

fn json_file(path: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("Cannot read {}: {e}", path.file_name().unwrap_or_default().to_string_lossy()))?;
    serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e|format!("Invalid JSON in {}: {e}",path.file_name().unwrap_or_default().to_string_lossy()))
}

fn configured_dir(root: &Path, key: &str, fallback: &str) -> PathBuf {
    let cfg = parse_ini(&fs::read_to_string(root.join("prismlauncher.cfg")).unwrap_or_default());
    let p = PathBuf::from(cfg.get(key).map(String::as_str).filter(|s| !s.is_empty()).unwrap_or(fallback));
    if p.is_absolute() {p} else {root.join(p)}
}

pub fn instance_path(settings: &Settings, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.starts_with('.') || id.contains(['/', '\\', ':', '\0']) {return Err("Invalid instance ID".into());}
    let parent = configured_dir(Path::new(&settings.root),"InstanceDir","instances").canonicalize().map_err(|_|"Prism's instances folder was not found")?;
    let child = parent.join(id).canonicalize().map_err(|_|"Instance no longer exists")?;
    if !child.starts_with(&parent) || !child.join("instance.cfg").is_file() {return Err("Invalid instance folder".into());}
    Ok(child)
}

fn icon_data(root: &Path, key: &str) -> Option<String> {
    if key.is_empty() || key.contains(['/', '\\', ':']) || key.starts_with('.') {return None;}
    let dir = configured_dir(root,"IconsDir","icons");
    for (ext,mime) in [("png","image/png"),("jpg","image/jpeg"),("jpeg","image/jpeg"),("webp","image/webp")] {
        let file = dir.join(format!("{key}.{ext}"));
        let Ok(metadata)=fs::metadata(&file) else {continue;};
        if metadata.len() > 2_000_000 {continue;}
        if let Ok(data)=fs::read(file) {return Some(format!("data:{mime};base64,{}",STANDARD.encode(data)));}
    }
    None
}

pub fn read_library(settings: Settings) -> Result<Library, String> {
    let root = Path::new(&settings.root);
    let dir = configured_dir(root,"InstanceDir","instances");
    let entries = fs::read_dir(&dir).map_err(|e|format!("Cannot open Prism library at {}: {e}",dir.display()))?;
    let mut warnings = Vec::new();
    let mut instances = Vec::new();
    let groups = json_file(&dir.join("instgroups.json")).unwrap_or(Value::Null);
    for entry in entries.flatten() {
        if !entry.path().join("instance.cfg").is_file() {continue;}
        let id = entry.file_name().to_string_lossy().to_string();
        let instance_dir = match instance_path(&settings,&id) {Ok(p)=>p,Err(e)=>{warnings.push(format!("{id}: {e}")); continue;}};
        let cfg = match fs::read_to_string(instance_dir.join("instance.cfg")) {Ok(t)=>parse_ini(&t),Err(_)=>{warnings.push(format!("Could not read {id}"));continue;}};
        let pack = json_file(&instance_dir.join("mmc-pack.json")).unwrap_or(Value::Null);
        let components = pack["components"].as_array().cloned().unwrap_or_default();
        let version = components.iter().find(|c|c["uid"]=="net.minecraft").and_then(|c|c["version"].as_str()).unwrap_or("Unknown").into();
        let loader = [("net.neoforged","NeoForge"),("net.minecraftforge","Forge"),("net.fabricmc.fabric-loader","Fabric"),("org.quiltmc.quilt-loader","Quilt")].into_iter().find(|(uid,_)|components.iter().any(|c|c["uid"]==*uid)).map(|(_,name)|name).unwrap_or("Vanilla").into();
        let group = groups["groups"].as_object().and_then(|g|g.iter().find(|(_,v)|v["instances"].as_array().is_some_and(|ids|ids.iter().any(|i|i.as_str()==Some(&id))))).map(|(k,_)|k.clone()).unwrap_or_default();
        instances.push(Instance {name:cfg.get("name").cloned().unwrap_or_else(||id.clone()),id,version,loader,
            icon:icon_data(root,cfg.get("iconKey").map(String::as_str).unwrap_or("default")),
            last_launch:cfg.get("lastLaunchTime").and_then(|v|v.parse().ok()).unwrap_or(0),
            playtime:cfg.get("totalTimePlayed").and_then(|v|v.parse().ok()).unwrap_or(0),group});
    }
    instances.sort_by(|a,b|b.last_launch.cmp(&a.last_launch));
    let accounts = match json_file(&root.join("accounts.json")) {
        Ok(data)=>data["accounts"].as_array().map(|a|a.iter().filter_map(|a|Some(Account{name:a["profile"]["name"].as_str()?.into(),active:a["active"].as_bool().unwrap_or(false)})).collect()).unwrap_or_default(),
        Err(_)=>{warnings.push("Accounts could not be read. Sign in using Prism, then refresh.".into());Vec::new()}
    };
    let executable_found = Path::new(&settings.executable).is_file();
    Ok(Library{instances,accounts,settings,warnings,executable_found})
}

pub fn launch_args(settings: &Settings, library: &Library, id: &str, profile: &str, server: &str) -> Result<Vec<String>,String> {
    if !library.instances.iter().any(|i|i.id==id) {return Err("Instance not found. Refresh your library.".into());}
    if !library.accounts.iter().any(|a|a.name==profile) {return Err("Choose a valid Prism account before launching.".into());}
    if server.len()>253 || !server.chars().all(|c|c.is_ascii_alphanumeric() || ".-_:[]".contains(c)) {return Err("Enter a server hostname, optionally followed by :port.".into());}
    let mut args=vec!["--dir".into(),settings.root.clone(),"--launch".into(),id.into(),"--profile".into(),profile.into()];
    if !server.is_empty() {args.extend(["--server".into(),server.into()]);}
    Ok(args)
}

pub fn run_prism(settings: &Settings, args: &[String]) -> Result<u32,String> {
    let exe = Path::new(&settings.executable);
    if !exe.is_file() || !exe.file_name().unwrap_or_default().to_string_lossy().eq_ignore_ascii_case("prismlauncher.exe") {return Err("Select a valid prismlauncher.exe in Connection settings.".into());}
    let mut command=Command::new(exe);
    command.args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)] {use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
    let mut child=command.spawn().map_err(|e|format!("Prism could not start: {e}"))?;
    let pid=child.id();
    std::thread::spawn(move||{let _=child.wait();});
    Ok(pid)
}

pub fn read_mods(settings: &Settings, id: &str) -> Result<Vec<Mod>,String> {
    let instance=instance_path(settings,id)?;
    let game=if instance.join(".minecraft").is_dir(){instance.join(".minecraft")}else{instance.join("minecraft")};
    let dir=game.join("mods");
    if !dir.exists(){return Ok(Vec::new());}
    let mut mods=Vec::new();
    for entry in fs::read_dir(dir).map_err(|e|e.to_string())?.flatten() {
        let name=entry.file_name().to_string_lossy().to_string();
        if !(name.ends_with(".jar") || name.ends_with(".jar.disabled")) {continue;}
        mods.push(Mod{enabled:!name.ends_with(".disabled"),size:entry.metadata().map(|m|m.len()).unwrap_or(0),name});
    }
    mods.sort_by_key(|m|m.name.to_lowercase());
    Ok(mods)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn ini_preserves_values() {
        let cfg=parse_ini("[General]\nname=Hello=world\nnotes=one\\ntwo\nroot=C:\\Games\\Prism");
        assert_eq!(cfg["name"],"Hello=world");assert_eq!(cfg["notes"],"one\ntwo");assert_eq!(cfg["root"],"C:\\Games\\Prism");
    }
    #[test] fn library_projects_only_safe_account_fields_and_validates_launches() {
        let root=std::env::temp_dir().join(format!("prism-studio-test-{}",std::process::id()));
        let instance=root.join("instances/pack (1)");fs::create_dir_all(&instance).unwrap();
        fs::write(instance.join("instance.cfg"),"name=My Pack\ntotalTimePlayed=3600").unwrap();
        fs::write(instance.join("mmc-pack.json"),r#"{"components":[{"uid":"net.minecraft","version":"1.21.1"},{"uid":"net.fabricmc.fabric-loader","version":"0.16.0"}]}"#).unwrap();
        fs::write(root.join("accounts.json"),r#"{"accounts":[{"active":true,"msa":{"token":"SECRET"},"profile":{"name":"Player"}}]}"#).unwrap();
        let settings=Settings{root:root.to_string_lossy().into(),executable:"prismlauncher.exe".into()};
        let library=read_library(settings.clone()).unwrap();
        assert_eq!(library.instances[0].name,"My Pack");assert_eq!(library.instances[0].loader,"Fabric");
        assert!(!serde_json::to_string(&library).unwrap().contains("SECRET"));
        assert_eq!(launch_args(&settings,&library,"pack (1)","Player","play.wynncraft.com").unwrap()[3],"pack (1)");
        assert!(launch_args(&settings,&library,"pack (1)","Unknown","").is_err());
        assert!(launch_args(&settings,&library,"pack (1)","Player","--bad stuff").is_err());
        assert!(instance_path(&settings,"../accounts.json").is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
