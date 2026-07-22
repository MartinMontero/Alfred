// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors

// Windows Job Object orphan-guard for the goose sidecar.
#[cfg(windows)]
mod job_guard;
#[cfg(all(test, windows))]
mod job_guard_tests;

// Born-redacted local telemetry store (opt-in, off by default).
mod telemetry;
#[cfg(test)]
mod telemetry_tests;
#[cfg(test)]
mod vault_path_tests;

// Compiled provider policy (ADR-0008): the holmes-guard agentic seam (every
// goose spawn) and the Direct Chat denylist (the custom_provider_* commands).
mod direct_chat_policy;
#[cfg(test)]
mod direct_chat_policy_tests;
mod guard;
#[cfg(test)]
mod guard_tests;

// The analytical surface (Track 4, D-14 Option A): holmes-core IPC projection —
// render only EmittedEvidencePack; operator-only approval/consent mints.
mod analytical;
#[cfg(test)]
mod analytical_tests;

#[cfg(not(target_os = "android"))]
use keyring::Entry;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use walkdir::WalkDir;


#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AppSettings {
    #[serde(default)]
    pub vault_path: Option<String>,
    /// Telemetry opt-in. None/false = OFF (deny-by-default); only Some(true) enables capture.
    #[serde(default)]
    pub telemetry_enabled: Option<bool>,
}

fn get_config_dir_with_app(app: &AppHandle) -> PathBuf {
    #[cfg(target_os = "android")]
    {
        // On Android, use the app's data directory
        app.path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("/data/data/dev.wecanjustbuildthings.alfred/files"))
            .join("config")
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app; // Unused on desktop
        // Try multiple sources for home directory to handle various launch contexts
        // This is important on Windows where HOME may not be set when launched via protocol handler
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| {
                // Last resort: use dirs crate which handles platform-specific logic
                dirs::home_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| ".".to_string())
            });
        PathBuf::from(home).join(".config").join("alfred")
    }
}



#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlatformInfo {
    pub platform: String,
    pub default_vault_path: Option<String>,
}

#[tauri::command]
fn get_platform_info(app: AppHandle) -> PlatformInfo {
    let platform = if cfg!(target_os = "android") {
        "android".to_string()
    } else if cfg!(target_os = "ios") {
        "ios".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else if cfg!(target_os = "windows") {
        "windows".to_string()
    } else {
        "linux".to_string()
    };

    let default_vault_path = if cfg!(target_os = "android") || cfg!(target_os = "ios") {
        // On mobile, use the app's data directory
        app.path()
            .app_data_dir()
            .ok()
            .map(|p| p.join("Alfred").to_string_lossy().to_string())
    } else {
        // On desktop, use Documents/Alfred
        app.path()
            .document_dir()
            .ok()
            .map(|p| p.join("Alfred").to_string_lossy().to_string())
    };

    PlatformInfo {
        platform,
        default_vault_path,
    }
}

fn get_settings_path(app: &AppHandle) -> PathBuf {
    get_config_dir_with_app(app).join("settings.json")
}

/// Read the configured vault path from settings.json and return it canonicalized.
/// Returns None if no vault is configured or it cannot be resolved.
fn get_configured_vault(app: &AppHandle) -> Option<PathBuf> {
    let settings_path = get_settings_path(app);
    let content = fs::read_to_string(&settings_path).ok()?;
    let settings: AppSettings = serde_json::from_str(&content).ok()?;
    let vault = settings.vault_path?;
    Path::new(&vault).canonicalize().ok()
}

/// Canonicalize a path that may not exist yet: canonicalize the nearest
/// existing ancestor (resolving `..` and symlinks), then re-append the
/// remaining not-yet-existing components after verifying each is a plain
/// name — never `..`, a root, or a prefix.
fn canonicalize_lenient(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return path.canonicalize().map_err(|e| format!("Invalid path: {}", e));
    }
    // Find the nearest existing ancestor (skip the path itself, which doesn't exist)
    let existing_ancestor = path
        .ancestors()
        .skip(1)
        .find(|a| a.exists())
        .ok_or("Invalid path: no existing ancestor directory")?;
    let canonical_ancestor = existing_ancestor
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    // Verify the remaining (non-existent) components are plain names
    let remainder = path
        .strip_prefix(existing_ancestor)
        .map_err(|_| "Invalid path: unable to resolve path components".to_string())?;
    let mut resolved = canonical_ancestor;
    for component in remainder.components() {
        match component {
            std::path::Component::Normal(name) => {
                if name.is_empty() {
                    return Err("Invalid path: empty path component".to_string());
                }
                resolved.push(name);
            }
            std::path::Component::CurDir => {}
            _ => {
                return Err(format!(
                    "Invalid path: unsafe component in '{}'",
                    path.display()
                ));
            }
        }
    }
    Ok(resolved)
}

/// Validates that a path is within the allowed vault directory.
/// Returns the canonicalized path if valid, or an error if path traversal is detected.
fn validate_vault_path(path: &str, vault_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    let vault = Path::new(vault_path);

    let canonical_path = canonicalize_lenient(path)?;

    // F1 (beta.1 smoke): the vault itself may not exist yet — first-run vault
    // creation calls create_folder(path == vault). The old unconditional
    // vault.canonicalize() here failed every fresh install. Both sides now
    // resolve under the same lenient-but-strict rules, so the containment
    // check below holds identically for existing and to-be-created vaults.
    let canonical_vault = canonicalize_lenient(vault)
        .map_err(|e| format!("Invalid vault path: {}", e))?;

    // Check if the path starts with the vault path
    if !canonical_path.starts_with(&canonical_vault) {
        return Err(format!("Access denied: path '{}' is outside the vault directory", path.display()));
    }

    Ok(canonical_path)
}

/// Check if a path is within the config directory (for settings, not vault files)
#[allow(dead_code)]
fn is_config_path(path: &str, app: &AppHandle) -> bool {
    let path = Path::new(path);
    let config_dir = get_config_dir_with_app(app);
    
    if let (Ok(canonical_path), Ok(canonical_config)) = (path.canonicalize(), config_dir.canonicalize()) {
        canonical_path.starts_with(&canonical_config)
    } else {
        false
    }
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = get_settings_path(&app);
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let config_dir = get_config_dir_with_app(&app);
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let path = get_settings_path(&app);
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    name: String,
    path: String,
    #[serde(rename = "isDirectory")]
    is_directory: bool,
    children: Option<Vec<FileEntry>>,
}

// Asset entry for embedded files (images, audio, video, PDF)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AssetEntry {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub relative_path: String,
}

// Supported asset extensions
const IMAGE_EXTENSIONS: &[&str] = &["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"];
const AUDIO_EXTENSIONS: &[&str] = &["flac", "m4a", "mp3", "ogg", "wav", "webm", "3gp"];
const VIDEO_EXTENSIONS: &[&str] = &["mkv", "mov", "mp4", "ogv", "webm"];
const PDF_EXTENSIONS: &[&str] = &["pdf"];
const DOCUMENT_EXTENSIONS: &[&str] = &["docx", "xlsx", "pptx"];

fn is_viewable_extension(name: &str) -> bool {
    let name_lower = name.to_lowercase();
    if let Some(dot_pos) = name_lower.rfind('.') {
        let ext = &name_lower[dot_pos + 1..];
        IMAGE_EXTENSIONS.contains(&ext)
            || PDF_EXTENSIONS.contains(&ext)
            || DOCUMENT_EXTENSIONS.contains(&ext)
    } else {
        false
    }
}

fn is_embeddable_extension(ext: &str) -> bool {
    let ext_lower = ext.to_lowercase();
    IMAGE_EXTENSIONS.contains(&ext_lower.as_str())
        || AUDIO_EXTENSIONS.contains(&ext_lower.as_str())
        || VIDEO_EXTENSIONS.contains(&ext_lower.as_str())
        || PDF_EXTENSIONS.contains(&ext_lower.as_str())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchMatch {
    line: usize,
    content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    path: String,
    name: String,
    matches: Vec<SearchMatch>,
}

fn build_file_tree(path: &Path) -> Vec<FileEntry> {
    let mut entries: Vec<FileEntry> = Vec::new();

    if let Ok(read_dir) = fs::read_dir(path) {
        let mut items: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();
        items.sort_by(|a, b| {
            let a_is_dir = a.path().is_dir();
            let b_is_dir = b.path().is_dir();
            match (a_is_dir, b_is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.file_name().cmp(&b.file_name()),
            }
        });

        for item in items {
            let item_path = item.path();
            let name = item.file_name().to_string_lossy().to_string();

            // Skip hidden files and folders
            if name.starts_with('.') {
                continue;
            }

            let is_dir = item_path.is_dir();

            // Only include markdown files, viewable files (images, PDFs, documents), and directories
            if !is_dir && !name.ends_with(".md") && !is_viewable_extension(&name) {
                continue;
            }

            let children = if is_dir {
                Some(build_file_tree(&item_path))
            } else {
                None
            };

            entries.push(FileEntry {
                name,
                path: item_path.to_string_lossy().to_string(),
                is_directory: is_dir,
                children,
            });
        }
    }

    entries
}

#[tauri::command]
fn list_files(path: String) -> Result<Vec<FileEntry>, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }
    Ok(build_file_tree(path))
}

#[tauri::command]
fn read_file(path: String, vault_path: Option<String>) -> Result<String, String> {
    // Always validate path is within vault
    let vault = vault_path.ok_or("vault_path is required for read_file")?;
    validate_vault_path(&path, &vault)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String, vault_path: Option<String>) -> Result<(), String> {
    // Always validate path is within vault
    let vault = vault_path.ok_or("vault_path is required for write_file")?;
    validate_vault_path(&path, &vault)?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, data: Vec<u8>, vault_path: Option<String>) -> Result<(), String> {
    // Always validate path is within vault
    let vault = vault_path.ok_or("vault_path is required for write_binary_file")?;
    validate_vault_path(&path, &vault)?;
    // Create parent directories if needed
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_binary_file(path: String, vault_path: Option<String>) -> Result<tauri::ipc::Response, String> {
    // Always validate path is within vault
    let vault = vault_path.ok_or("vault_path is required for read_binary_file")?;
    validate_vault_path(&path, &vault)?;
    // Return a raw IPC response so the frontend receives an ArrayBuffer instead of
    // a JSON number array (huge serialization overhead for large files like PDFs).
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn create_file(path: String, vault_path: Option<String>) -> Result<(), String> {
    // Always validate path is within vault
    let vault = vault_path.ok_or("vault_path is required for create_file")?;
    validate_vault_path(&path, &vault)?;
    let path = Path::new(&path);
    if path.exists() {
        return Err("File already exists".to_string());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, "").map_err(|e| e.to_string())
}

#[tauri::command]
fn create_folder(path: String, vault_path: Option<String>) -> Result<(), String> {
    // Always validate path is within vault
    let vault = vault_path.ok_or("vault_path is required for create_folder")?;
    validate_vault_path(&path, &vault)?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

/// Dynamically extend the plugin-fs scope to include the user's vault directory.
/// Called when the vault path is set so that plugin-fs operations (writeFile, mkdir, etc.)
/// can access the vault. This is the secure alternative to broadening static fs:scope —
/// only the specific vault directory chosen by the user is granted access at runtime.
#[tauri::command]
fn set_vault_scope(app: AppHandle, vault_path: String) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;
    let path = Path::new(&vault_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Vault path does not exist or is not a directory: {}", vault_path));
    }
    // Reject pathological scopes: the filesystem root and the home directory itself.
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Invalid vault path: {}", e))?;
    if canonical.parent().is_none() {
        return Err("Vault path cannot be the filesystem root".to_string());
    }
    if let Some(home) = dirs::home_dir() {
        if let Ok(home_canonical) = home.canonicalize() {
            if canonical == home_canonical {
                return Err("Vault path cannot be the home directory itself".to_string());
            }
        }
    }
    app.fs_scope()
        .allow_directory(path, true)
        .map_err(|e| format!("Failed to add vault to fs scope: {}", e))?;
    println!("[Scope] Added vault to fs scope: {}", vault_path);
    Ok(())
}

#[tauri::command]
fn get_file_modified_time(path: String) -> Result<u64, String> {
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = metadata.modified().map_err(|e| e.to_string())?;
    // Convert to Unix timestamp (seconds since epoch)
    let duration = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    Ok(duration.as_secs())
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn delete_file(path: String, vault_path: Option<String>) -> Result<(), String> {
    // Always validate path is within vault
    let vault = vault_path.ok_or("vault_path is required for delete_file")?;
    validate_vault_path(&path, &vault)?;
    let path = Path::new(&path);
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String, vault_path: Option<String>) -> Result<(), String> {
    // Always validate both paths are within vault
    let vault = vault_path.ok_or("vault_path is required for rename_file")?;
    validate_vault_path(&old_path, &vault)?;
    validate_vault_path(&new_path, &vault)?;
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_file(source: String, dest: String, vault_path: Option<String>) -> Result<(), String> {
    // Always validate both paths are within vault
    let vault = vault_path.ok_or("vault_path is required for copy_file")?;
    validate_vault_path(&source, &vault)?;
    validate_vault_path(&dest, &vault)?;
    let source_path = Path::new(&source);
    let dest_path = Path::new(&dest);

    if source_path.is_dir() {
        // Copy directory recursively
        copy_dir_recursive(source_path, dest_path).map_err(|e| e.to_string())
    } else {
        fs::copy(&source, &dest)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn open_in_default_app(path: String) -> Result<(), String> {
    // Validate the path exists and resolve it to an absolute canonical path before
    // handing it to any external program (prevents injection / opening bogus paths).
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    let canonical = p.canonicalize().map_err(|e| format!("Invalid path: {}", e))?;
    if !canonical.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&canonical)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&canonical)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &canonical.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = canonical;
        return Err("Opening files in the default app is not supported on this platform".to_string());
    }
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    Ok(())
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    let folder = if path.is_file() {
        path.parent().unwrap_or(path)
    } else {
        path
    };

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileStats {
    pub size: u64,
    pub created: u64,
    pub modified: u64,
}

#[tauri::command]
fn get_file_stats(path: String) -> Result<FileStats, String> {
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;

    let size = metadata.len();

    let created = metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Ok(FileStats {
        size,
        created,
        modified,
    })
}

#[tauri::command]
async fn search_files(app: AppHandle, path: String, query: String) -> Result<Vec<SearchResult>, String> {
    const MAX_RESULTS: usize = 50;
    const MAX_MATCHES_PER_FILE: usize = 5;

    // Security: only allow searching within the configured vault
    let vault = get_configured_vault(&app).ok_or("No vault is configured")?;
    let root = Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    if !root.starts_with(&vault) {
        return Err("Access denied: search path is outside the vault directory".to_string());
    }

    let mut results: Vec<SearchResult> = Vec::new();
    let query_lower = query.to_lowercase();

    for entry in WalkDir::new(&root)
        .into_iter()
        // Skip hidden files/directories (e.g. .git, .obsidian) entirely
        .filter_entry(|e| {
            e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.')
        })
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().is_file() && e.path().extension().map(|ext| ext == "md").unwrap_or(false)
        })
    {
        let file_path = entry.path();
        if let Ok(content) = fs::read_to_string(file_path) {
            let mut matches: Vec<SearchMatch> = Vec::new();

            for (line_num, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(&query_lower) {
                    matches.push(SearchMatch {
                        line: line_num + 1,
                        content: line.chars().take(100).collect(),
                    });
                    if matches.len() >= MAX_MATCHES_PER_FILE {
                        break;
                    }
                }
            }

            if !matches.is_empty() {
                results.push(SearchResult {
                    path: file_path.to_string_lossy().to_string(),
                    name: file_path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    matches,
                });
                if results.len() >= MAX_RESULTS {
                    break;
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
async fn list_assets(path: String) -> Result<Vec<AssetEntry>, String> {
    let mut assets: Vec<AssetEntry> = Vec::new();
    let vault_path = Path::new(&path);

    if !vault_path.exists() {
        return Err("Path does not exist".to_string());
    }

    for entry in WalkDir::new(&path)
        .into_iter()
        // Prune hidden files and directories (e.g. .git) instead of descending into them
        .filter_entry(|e| {
            e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.')
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
    {
        let file_path = entry.path();

        // Check if it's an embeddable file type
        if let Some(ext) = file_path.extension() {
            let ext_str = ext.to_string_lossy().to_string();
            if is_embeddable_extension(&ext_str) {
                let name = file_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                let full_path = file_path.to_string_lossy().to_string();

                // Calculate relative path from vault root
                let relative_path = file_path
                    .strip_prefix(vault_path)
                    .unwrap_or(file_path)
                    .to_string_lossy()
                    .to_string();

                assets.push(AssetEntry {
                    name,
                    path: full_path,
                    extension: ext_str.to_lowercase(),
                    relative_path,
                });
            }
        }
    }

    Ok(assets)
}

struct WatcherState {
    watcher: Option<RecommendedWatcher>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self { watcher: None }
    }
}

type SharedWatcherState = Arc<Mutex<WatcherState>>;

#[tauri::command]
fn start_watching(
    app: AppHandle,
    state: tauri::State<'_, SharedWatcherState>,
    path: String,
) -> Result<(), String> {
    let mut watcher_state = state.lock();

    // Stop existing watcher if any
    watcher_state.watcher = None;

    let app_clone = app.clone();
    let watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                // Emit for create, modify, remove events on .md files, viewable files, or directories
                let dominated_by_md = event
                    .paths
                    .iter()
                    .any(|p| p.extension().map(|e| e == "md").unwrap_or(false));

                let dominated_by_viewable = event
                    .paths
                    .iter()
                    .any(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|n| is_viewable_extension(n))
                            .unwrap_or(false)
                    });

                let dominated_by_dir = event.paths.iter().any(|p| p.is_dir());

                if dominated_by_md || dominated_by_viewable || dominated_by_dir {
                    match event.kind {
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                            let _ = app_clone.emit("files-changed", ());
                            // Also emit specific file paths for open tab reload
                            let paths: Vec<String> = event
                                .paths
                                .iter()
                                .filter(|p| p.extension().map(|e| e == "md").unwrap_or(false))
                                .filter_map(|p| p.to_str().map(|s| s.to_string()))
                                .collect();
                            if !paths.is_empty() {
                                let _ = app_clone.emit("file-modified", paths);
                            }
                        }
                        _ => {}
                    }
                }
            }
        },
        Config::default().with_poll_interval(Duration::from_secs(1)),
    )
    .map_err(|e| e.to_string())?;

    watcher_state.watcher = Some(watcher);

    // Start watching the path
    if let Some(ref mut w) = watcher_state.watcher {
        w.watch(Path::new(&path), RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn stop_watching(state: tauri::State<'_, SharedWatcherState>) -> Result<(), String> {
    let mut watcher_state = state.lock();
    watcher_state.watcher = None;
    Ok(())
}

// Keyring commands for secure credential storage (desktop only)
#[cfg(not(target_os = "android"))]
mod keyring_commands {
    use super::*;

    const KEYRING_SERVICE: &str = "dev.wecanjustbuildthings.alfred";

    #[tauri::command]
    pub fn keyring_set(key: String, value: String) -> Result<(), String> {
        let entry = Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
        entry.set_password(&value).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn keyring_get(key: String) -> Result<Option<String>, String> {
        let entry = Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    #[tauri::command]
    pub fn keyring_delete(key: String) -> Result<(), String> {
        let entry = Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

// Android keyring commands using app-private file storage
// Data is stored in the app's private directory which requires root access to read
// Combined with biometric authentication in the UI layer for additional security
#[cfg(target_os = "android")]
mod keyring_commands {
    use sha2::{Sha256, Digest};
    use std::fs;
    use std::path::PathBuf;
    use tauri::Manager;

    fn get_secure_storage_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        
        let secure_dir = data_dir.join(".secure");
        if !secure_dir.exists() {
            fs::create_dir_all(&secure_dir)
                .map_err(|e| format!("Failed to create secure dir: {}", e))?;
        }
        Ok(secure_dir)
    }

    fn get_key_path(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
        let secure_dir = get_secure_storage_path(app)?;
        // Hash the key name using SHA-256 to avoid filesystem issues with special characters
        let mut hasher = Sha256::new();
        hasher.update(key.as_bytes());
        let hash = format!("{:x}", hasher.finalize());
        Ok(secure_dir.join(hash))
    }

    #[tauri::command]
    pub fn keyring_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
        let path = get_key_path(&app, &key)?;
        fs::write(&path, value.as_bytes())
            .map_err(|e| format!("Failed to write secure data: {}", e))
    }

    #[tauri::command]
    pub fn keyring_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
        let path = get_key_path(&app, &key)?;
        if !path.exists() {
            return Ok(None);
        }
        let data = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read secure data: {}", e))?;
        Ok(Some(data))
    }

    #[tauri::command]
    pub fn keyring_delete(app: tauri::AppHandle, key: String) -> Result<(), String> {
        let path = get_key_path(&app, &key)?;
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete secure data: {}", e))?;
        }
        Ok(())
    }
}

// Generic OpenAI-compatible provider proxy commands (bypasses CORS)
// Works with MapleAI Proxy, Ollama, LM Studio, vLLM, or any OpenAI-compatible API.

#[tauri::command]
async fn custom_provider_request(url: String, api_key: String, body: String) -> Result<String, String> {
    // Compiled Direct Chat screen (ADR-0008): the refusal lives here, in the
    // shipped binary, not in strippable webview code.
    direct_chat_policy::ensure_endpoint_allowed(&url, direct_chat_policy::model_from_body(&body).as_deref())?;
    let client = reqwest::Client::new();
    let mut request = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .timeout(Duration::from_secs(120));

    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Server returned {}: {}", status, body));
    }

    response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))
}

#[tauri::command]
async fn custom_provider_stream(
    app: AppHandle,
    request_id: String,
    url: String,
    api_key: String,
    body: String,
) -> Result<(), String> {
    use futures_util::StreamExt;

    // Compiled Direct Chat screen (ADR-0008) — same refusal as the non-streaming path.
    direct_chat_policy::ensure_endpoint_allowed(&url, direct_chat_policy::model_from_body(&body).as_deref())?;
    let client = reqwest::Client::new();
    let mut request = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .timeout(Duration::from_secs(300));

    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Server returned {}: {}", status, body));
    }

    let mut stream = response.bytes_stream();
    let event_name = format!("custom-provider-stream-{}", request_id);

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                    let _ = app.emit(&event_name, text);
                }
            }
            Err(e) => {
                let _ = app.emit(&event_name, format!("__ERROR__:{}", e));
                break;
            }
        }
    }

    // Signal end of stream
    let _ = app.emit(&event_name, "__DONE__");
    Ok(())
}

#[tauri::command]
async fn custom_provider_list_models(url: String, api_key: String) -> Result<String, String> {
    // Compiled Direct Chat screen (ADR-0008) — endpoint-only (no body/model here).
    direct_chat_policy::ensure_endpoint_allowed(&url, None)?;
    let client = reqwest::Client::new();
    let mut request = client
        .get(&url)
        .header("Content-Type", "application/json")
        .timeout(Duration::from_secs(15));

    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Server returned {}: {}", status, body));
    }

    response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))
}

/// Get any deep link URLs passed as command line arguments
/// On Linux, when the app is launched via xdg-open, the URL is passed as an argument
#[tauri::command]
fn get_deep_link_args() -> Vec<String> {
    let args: Vec<String> = std::env::args().collect();
    let mut deep_links = Vec::new();
    
    // Skip the first arg (program name), check for URLs starting with alfred://
    for arg in args.iter().skip(1) {
        if arg.starts_with("alfred://") {
            deep_links.push(arg.clone());
        }
    }
    
    deep_links
}

// ---------- Telemetry (born-redacted, opt-in, Rust-owned single writer) ----------

fn telemetry_db_path(app: &AppHandle) -> PathBuf {
    get_config_dir_with_app(app).join("telemetry.db")
}

/// The ONLY write path into telemetry.db. Accepts only the typed event shape, so a
/// note body / prompt / key / tool argument cannot be passed. Deny-by-default: when
/// opted out it returns without opening or creating the db, and the write itself
/// goes through the shared `record_gated` gate the cargo tests drive — no decoy.
#[tauri::command]
fn telemetry_record(app: AppHandle, event: telemetry::TelemetryEvent) -> Result<(), String> {
    let settings_json = fs::read_to_string(get_settings_path(&app)).unwrap_or_default();
    if !telemetry::is_enabled_from_settings(&settings_json) {
        return Ok(()); // opted out: telemetry.db is never opened or created
    }
    let dir = get_config_dir_with_app(&app);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = telemetry::open_store(&telemetry_db_path(&app)).map_err(|e| e.to_string())?;
    telemetry::prune(&conn, telemetry::RETENTION_DAYS).map_err(|e| e.to_string())?;
    telemetry::record_gated(&conn, &settings_json, &event)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn telemetry_wipe(app: AppHandle) -> Result<telemetry::WipeResult, String> {
    let path = telemetry_db_path(&app);
    if !path.exists() {
        return Ok(telemetry::WipeResult { rows_before: 0, rows_after: 0, file_bytes: 0 });
    }
    let conn = telemetry::open_store(&path).map_err(|e| e.to_string())?;
    let mut result = telemetry::wipe(&conn).map_err(|e| e.to_string())?;
    drop(conn);
    result.file_bytes = fs::metadata(&path).map(|m| m.len() as i64).unwrap_or(0);
    Ok(result)
}

#[tauri::command]
fn telemetry_metrics(app: AppHandle) -> Result<telemetry::Metrics, String> {
    let path = telemetry_db_path(&app);
    if !path.exists() {
        return Ok(telemetry::Metrics {
            total_events: 0,
            input_tokens: 0,
            output_tokens: 0,
            by_kind: vec![],
            errors: vec![],
        });
    }
    let conn = telemetry::open_store(&path).map_err(|e| e.to_string())?;
    telemetry::metrics(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn telemetry_export(app: AppHandle) -> Result<Vec<telemetry::StoredEvent>, String> {
    let path = telemetry_db_path(&app);
    if !path.exists() {
        return Ok(vec![]);
    }
    let conn = telemetry::open_store(&path).map_err(|e| e.to_string())?;
    telemetry::export_rows(&conn).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // FIRST: on Windows, bind this process (and every child it spawns — notably the
    // goose acp sidecar) to a Job Object the OS destroys on our death. This covers
    // startup-phase crashes too, before any graceful shutdown hook exists.
    #[cfg(windows)]
    job_guard::assign_self_to_kill_on_close_job();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    // Desktop-only plugins
    #[cfg(desktop)]
    {
        // Single instance plugin - ensures only one instance runs
        // When a second instance is launched, it passes args to the first instance
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Focus the main window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
            
            // Check for deep link URLs in args and emit them to the frontend
            for arg in args.iter().skip(1) {
                if arg.starts_with("alfred://") {
                    let _ = app.emit("deep-link-received", arg.clone());
                }
            }
        }))
        // Window state plugin - remembers window position and size
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Updater plugin (W5). Endpoints + pubkey live in tauri.conf.json
        // (plugins.updater). The check/download/install flow is driven from
        // Settings with explicit user consent at each step — never automatic.
        .plugin(tauri_plugin_updater::Builder::new().build());
    }

    // Mobile-only plugins
    #[cfg(mobile)]
    {
        builder = builder
            .plugin(tauri_plugin_haptics::init())
            .plugin(tauri_plugin_biometric::init());
    }

    builder
        .manage(Arc::new(Mutex::new(WatcherState::default())) as SharedWatcherState)
        // Agentic guard seam state: the L1a egress proxy + live goose children.
        .manage(guard::GuardState::default())
        // Register asset protocol to serve local files
        .register_uri_scheme_protocol("asset", |ctx, request| {
            let app = ctx.app_handle();
            let path = request.uri().path();
            // URL decode the path
            let decoded_path = percent_decode_str(path).decode_utf8_lossy().to_string();
            // On Windows, path might start with / before drive letter, remove it
            #[cfg(target_os = "windows")]
            let decoded_path = if decoded_path.starts_with('/')
                && decoded_path.len() > 2
                && decoded_path.chars().nth(2) == Some(':')
            {
                decoded_path[1..].to_string()
            } else {
                decoded_path
            };
            
            // Security: Reject paths with traversal sequences
            if decoded_path.contains("..") {
                return tauri::http::Response::builder()
                    .status(403)
                    .header("Content-Type", "text/plain")
                    .body("Access denied: path traversal detected".as_bytes().to_vec())
                    .unwrap();
            }
            
            // Security: Canonicalize path and verify it doesn't escape expected directories
            let path_obj = Path::new(&decoded_path);
            let canonical = match path_obj.canonicalize() {
                Ok(p) => p,
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap();
                }
            };
            
            // Only allow access to files (not directories) and common media/document types
            if !canonical.is_file() {
                return tauri::http::Response::builder()
                    .status(403)
                    .header("Content-Type", "text/plain")
                    .body("Access denied: not a file".as_bytes().to_vec())
                    .unwrap();
            }

            // Security: Restrict access to files within the vault directory or config directory
            let allowed = {
                let mut is_allowed = false;
                // Check vault path from settings
                if let Some(vault_canonical) = get_configured_vault(&app) {
                    is_allowed = canonical.starts_with(&vault_canonical);
                }
                // Also allow config directory access (for app assets)
                let config_dir = get_config_dir_with_app(&app);
                if let Ok(config_canonical) = config_dir.canonicalize() {
                    if canonical.starts_with(&config_canonical) {
                        is_allowed = true;
                    }
                }
                is_allowed
            };

            if !allowed {
                return tauri::http::Response::builder()
                    .status(403)
                    .header("Content-Type", "text/plain")
                    .body("Access denied: file outside vault".as_bytes().to_vec())
                    .unwrap();
            }

            match fs::read(&canonical) {
                Ok(data) => {
                    // Determine MIME type based on extension
                    let mime = match Path::new(&decoded_path)
                        .extension()
                        .and_then(|e| e.to_str())
                    {
                        Some("png") => "image/png",
                        Some("jpg") | Some("jpeg") => "image/jpeg",
                        Some("gif") => "image/gif",
                        Some("webp") => "image/webp",
                        Some("svg") => "image/svg+xml",
                        Some("bmp") => "image/bmp",
                        Some("avif") => "image/avif",
                        Some("mp3") => "audio/mpeg",
                        Some("wav") => "audio/wav",
                        Some("ogg") => "audio/ogg",
                        Some("flac") => "audio/flac",
                        Some("m4a") => "audio/mp4",
                        Some("webm") => "video/webm",
                        Some("mp4") => "video/mp4",
                        Some("mkv") => "video/x-matroska",
                        Some("mov") => "video/quicktime",
                        Some("ogv") => "video/ogg",
                        Some("pdf") => "application/pdf",
                        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        Some("pptx") => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        _ => "application/octet-stream",
                    };
                    tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "tauri://localhost")
                        .body(data)
                        .unwrap()
                }
                Err(_) => tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap(),
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_files,
            list_assets,
            read_file,
            write_file,
            write_binary_file,
            read_binary_file,
            create_file,
            create_folder,
            set_vault_scope,
            get_file_modified_time,
            file_exists,
            delete_file,
            rename_file,
            copy_file,
            open_in_default_app,
            show_in_folder,
            search_files,
            get_file_stats,
            load_settings,
            save_settings,
            keyring_commands::keyring_set,
            keyring_commands::keyring_get,
            keyring_commands::keyring_delete,
            start_watching,
            stop_watching,
            get_platform_info,
            get_deep_link_args,
            custom_provider_request,
            custom_provider_stream,
            custom_provider_list_models,
            guard::guard_permitted_providers,
            guard::guard_resolve,
            guard::guard_goose_paths,
            guard::guard_spawn_goose,
            guard::guard_goose_write,
            guard::guard_goose_kill,
            guard::guard_goose_kill_all,
            guard::guard_goose_recipe_validate,
            guard::guard_goose_recipe_run,
            analytical::analytical_emit,
            analytical::analytical_preview_approval,
            analytical::analytical_decide_approval,
            analytical::analytical_record_consent,
            analytical::analytical_assess_targeting,
            telemetry_record,
            telemetry_wipe,
            telemetry_metrics,
            telemetry_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
