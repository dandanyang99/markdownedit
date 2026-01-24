use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TreeNode {
    name: String,
    path: String,
    kind: String, // "file" | "folder"
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<TreeNode>>,
}

fn scan_md_tree(dir: &Path) -> Result<Vec<TreeNode>, String> {
    let rd = match fs::read_dir(dir) {
        Ok(rd) => rd,
        // Skip unreadable directories instead of failing the whole scan.
        Err(_) => return Ok(Vec::new()),
    };

    let mut entries: Vec<_> = rd.filter_map(|e| e.ok()).collect();

    // Stable UX: folders first, then files; name ascending.
    entries.sort_by_key(|e| {
        let ty = e.file_type().ok();
        let is_dir = ty.map(|t| t.is_dir()).unwrap_or(false);
        let name = e.file_name().to_string_lossy().to_lowercase();
        (!is_dir, name)
    });

    let mut out = Vec::new();

    for entry in entries {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            let children = scan_md_tree(&path)?;
            // Keep only folders that contain at least one markdown file (directly or indirectly),
            // matching the PRD "Markdown 工作区" expectation.
            if !children.is_empty() {
                out.push(TreeNode {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    kind: "folder".to_string(),
                    children: Some(children),
                });
            }
        } else if file_type.is_file() {
            let is_md = path
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("md"))
                .unwrap_or(false);

            if is_md {
                out.push(TreeNode {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    kind: "file".to_string(),
                    children: None,
                });
            }
        }
    }

    Ok(out)
}

#[tauri::command]
fn scan_workspace(root: String) -> Result<TreeNode, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err("root is not a directory".to_string());
    }

    let children = scan_md_tree(&root_path)?;
    Ok(TreeNode {
        name: root_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&root)
            .to_string(),
        path: root_path.to_string_lossy().to_string(),
        kind: "folder".to_string(),
        children: Some(children),
    })
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read failed: {e}"))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    // Ensure parent exists for "Save As" into new folder path.
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create_dir_all failed: {e}"))?;
    }
    fs::write(&path, content).map_err(|e| format!("write failed: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan_workspace, read_text_file, write_text_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
