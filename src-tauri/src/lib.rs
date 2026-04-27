use tauri::Manager;

pub mod commands;
pub mod config;
pub mod db;
pub mod keychain;
pub mod ssh;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let db_connection = db::init_db(&app_data_dir).map_err(|error| error.to_string())?;

            app.manage(db::DbState(std::sync::Mutex::new(db_connection)));
            app.manage(ssh::pool::SshPool(ssh::ConnectionPool::new()));

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
            commands::connection::list_connections,
            commands::connection::get_connection,
            commands::connection::create_connection,
            commands::connection::update_connection,
            commands::connection::delete_connection,
            commands::connection::duplicate_connection,
            commands::connection::search_connections,
            commands::connection::list_groups,
            commands::connection::create_group,
            commands::connection::update_group,
            commands::connection::delete_group,
            commands::terminal::ssh_connect,
            commands::terminal::ssh_disconnect,
            commands::terminal::ssh_write,
            commands::terminal::ssh_resize,
            commands::config::parse_ssh_config,
            commands::config::import_ssh_config,
            commands::keychain::store_credential,
            commands::keychain::retrieve_credential,
            commands::keychain::delete_credential,
            commands::keychain::has_credential
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
