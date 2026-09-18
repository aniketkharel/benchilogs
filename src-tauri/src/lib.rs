mod repairs;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Apply the bundled shop icon to the running window as well as the executable.
            if let (Some(window), Some(icon)) =
                (app.get_webview_window("main"), app.default_window_icon())
            {
                window.set_icon(icon.clone())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            repairs::list_repairs,
            repairs::create_repair,
            repairs::update_repair,
            repairs::delete_repair,
            repairs::set_repair_timer,
            repairs::list_on_hold_repairs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
