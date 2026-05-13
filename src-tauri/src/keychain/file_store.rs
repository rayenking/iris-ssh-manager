use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static FILE_STORE: std::sync::OnceLock<Mutex<FileCredentialStore>> = std::sync::OnceLock::new();

struct FileCredentialStore {
    path: PathBuf,
    cache: Option<HashMap<String, String>>,
}

impl FileCredentialStore {
    fn new(app_data_dir: &Path) -> Self {
        Self {
            path: app_data_dir.join("credentials.json"),
            cache: None,
        }
    }

    fn load(&mut self) -> Result<&mut HashMap<String, String>, String> {
        if self.cache.is_none() {
            let map = if self.path.exists() {
                let bytes = std::fs::read(&self.path)
                    .map_err(|e| format!("Failed to read credentials file: {e}"))?;
                serde_json::from_slice::<HashMap<String, String>>(&bytes)
                    .map_err(|e| format!("Failed to parse credentials: {e}"))?
            } else {
                HashMap::new()
            };
            self.cache = Some(map);
        }
        Ok(self.cache.as_mut().expect("cache initialized above"))
    }

    fn save(&self) -> Result<(), String> {
        let empty = HashMap::new();
        let map = self.cache.as_ref().unwrap_or(&empty);
        let bytes = serde_json::to_vec(map)
            .map_err(|e| format!("Failed to serialize credentials: {e}"))?;

        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;

            let tmp = self.path.with_extension("json.tmp");
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(&tmp)
                .map_err(|e| e.to_string())?;
            f.write_all(&bytes).map_err(|e| e.to_string())?;
            f.sync_all().map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &self.path).map_err(|e| e.to_string())?;
        }

        #[cfg(not(unix))]
        {
            std::fs::write(&self.path, &bytes)
                .map_err(|e| format!("Failed to write credentials file: {e}"))?;
        }

        Ok(())
    }
}

pub fn init(app_data_dir: &Path) -> Result<(), String> {
    let store = FileCredentialStore::new(app_data_dir);
    FILE_STORE
        .set(Mutex::new(store))
        .map_err(|_| "File store already initialized".to_string())
}

pub fn store_credential(connection_id: &str, secret: &str) -> Result<(), String> {
    let store = FILE_STORE.get().ok_or("File store not initialized")?;
    let mut store = store.lock().map_err(|e| e.to_string())?;
    let map = store.load()?;
    map.insert(connection_id.to_string(), secret.to_string());
    store.save()
}

pub fn retrieve_credential(connection_id: &str) -> Result<Option<String>, String> {
    let store = FILE_STORE.get().ok_or("File store not initialized")?;
    let mut store = store.lock().map_err(|e| e.to_string())?;
    let map = store.load()?;
    Ok(map.get(connection_id).cloned())
}

pub fn delete_credential(connection_id: &str) -> Result<(), String> {
    let store = FILE_STORE.get().ok_or("File store not initialized")?;
    let mut store = store.lock().map_err(|e| e.to_string())?;
    let map = store.load()?;
    map.remove(connection_id);
    store.save()
}

pub fn has_credential(connection_id: &str) -> bool {
    let Some(store) = FILE_STORE.get() else {
        return false;
    };
    let Ok(mut store) = store.lock() else {
        return false;
    };
    let Ok(map) = store.load() else {
        return false;
    };
    map.contains_key(connection_id)
}
