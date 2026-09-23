use std::fs;
use std::path::PathBuf;
use std::process::Command;

/// Spawn a local CI CLI (Claude Code / Codex / Grok Build / OpenCode) and return stdout.
#[tauri::command]
fn spawn_ci(command: String, args: Vec<String>, cwd: Option<String>) -> Result<String, String> {
    let mut cmd = Command::new(&command);
    cmd.args(&args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("failed to spawn `{command}`: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!(
            "`{command}` exited with {}: {}\n{}",
            output.status, stdout, stderr
        ))
    }
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read_file({path}): {e}"))
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("mkdir for {path}: {e}"))?;
        }
    }
    fs::write(&path, contents).map_err(|e| format!("write_file({path}): {e}"))
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    let entries = fs::read_dir(&path).map_err(|e| format!("list_dir({path}): {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("list_dir entry: {e}"))?;
        names.push(entry.file_name().to_string_lossy().to_string());
    }
    names.sort();
    Ok(names)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            spawn_ci,
            read_file,
            write_file,
            list_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
