#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
struct UnrealAsset {
    name: String,
    path: String,      // Relative path e.g. /Game/Folder/Asset
    file_path: String, // Absolute file path
    asset_type: String,
}

#[tauri::command]
fn scan_unreal_project(path: String) -> Result<Vec<UnrealAsset>, String> {
    let content_path = Path::new(&path).join("Content");
    if !content_path.exists() {
        return Err("Content folder not found".to_string());
    }

    let mut assets = Vec::new();

    for entry in WalkDir::new(&content_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "uasset" || ext == "umap" {
                    let file_name = path.file_stem().unwrap().to_string_lossy().to_string();

                    // Determine type based on prefix (heuristic)
                    let asset_type = if ext == "umap" {
                        "Level".to_string()
                    } else if file_name.starts_with("BP_") {
                        "Blueprint".to_string()
                    } else if file_name.starts_with("M_") {
                        "Material".to_string()
                    } else if file_name.starts_with("SM_") {
                        "StaticMesh".to_string()
                    } else if file_name.starts_with("T_") {
                        "Texture".to_string()
                    } else {
                        "Asset".to_string()
                    };

                    // Calculate relative path for UE reference (e.g. /Game/...)
                    if let Ok(relative_path) = path.strip_prefix(&content_path) {
                        let ue_path = format!("/Game/{}", relative_path.to_string_lossy().replace("\\", "/"));
                        // Remove extension for UE path
                        let ue_path_no_ext = ue_path.rsplit_once('.').map(|(a, _)| a).unwrap_or(&ue_path).to_string();

                        assets.push(UnrealAsset {
                            name: file_name,
                            path: ue_path_no_ext,
                            file_path: path.to_string_lossy().to_string(),
                            asset_type,
                        });
                    }
                }
            }
        }
    }

    Ok(assets)
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![scan_unreal_project])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
