import { Channel, invoke } from '@tauri-apps/api/core';
import type { 
  Connection, 
  ConnectionGroup, 
  CreateConnectionInput, 
  UpdateConnectionInput,
  CreateGroupInput,
  UpdateGroupInput,
  ParsedSshHost
} from '../types/connection';
import type { Snippet, CreateSnippetInput, UpdateSnippetInput } from '../types/snippet';
import type { Tunnel, TunnelConfig } from '../types/tunnel';
import type { FileEntry, TransferProgress } from '../types/sftp';

const SETTINGS_STORAGE_PREFIX = 'iris-ssh-manager.settings.';
const memorySettingsFallback = new Map<string, string>();

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function getBrowserStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readFallbackSetting(key: string) {
  const storage = getBrowserStorage();

  if (storage) {
    const value = storage.getItem(`${SETTINGS_STORAGE_PREFIX}${key}`);
    if (value !== null) {
      return value;
    }
  }

  return memorySettingsFallback.get(key) ?? null;
}

function writeFallbackSetting(key: string, value: string) {
  const storage = getBrowserStorage();

  if (storage) {
    storage.setItem(`${SETTINGS_STORAGE_PREFIX}${key}`, value);
    return;
  }

  memorySettingsFallback.set(key, value);
}

function readAllFallbackSettings() {
  const storage = getBrowserStorage();
  const settings: Record<string, string> = {};

  if (storage) {
    for (let index = 0; index < storage.length; index += 1) {
      const storageKey = storage.key(index);

      if (!storageKey || !storageKey.startsWith(SETTINGS_STORAGE_PREFIX)) {
        continue;
      }

      const key = storageKey.slice(SETTINGS_STORAGE_PREFIX.length);
      const value = storage.getItem(storageKey);

      if (value !== null) {
        settings[key] = value;
      }
    }
  }

  memorySettingsFallback.forEach((value, key) => {
    settings[key] = value;
  });

  return settings;
}

export const tauriApi = {
  listConnections: (): Promise<Connection[]> => 
    invoke('list_connections'),
    
  getConnection: (id: string): Promise<Connection> => 
    invoke('get_connection', { id }),
    
  createConnection: (data: CreateConnectionInput): Promise<Connection> => 
    invoke('create_connection', { data }),
    
  updateConnection: (id: string, data: UpdateConnectionInput): Promise<Connection> => 
    invoke('update_connection', { id, data }),
    
  deleteConnection: (id: string): Promise<void> => 
    invoke('delete_connection', { id }),
    
  duplicateConnection: (id: string): Promise<Connection> => 
    invoke('duplicate_connection', { id }),
    
  searchConnections: (query: string): Promise<Connection[]> => 
    invoke('search_connections', { query }),
    
  listGroups: (): Promise<ConnectionGroup[]> => 
    invoke('list_groups'),
    
  createGroup: (data: CreateGroupInput): Promise<ConnectionGroup> => 
    invoke('create_group', { data }),
    
  updateGroup: (id: string, data: UpdateGroupInput): Promise<ConnectionGroup> => 
    invoke('update_group', { id, data }),
    
  deleteGroup: (id: string): Promise<void> => 
    invoke('delete_group', { id }),

  parseSshConfig: (configPath?: string): Promise<ParsedSshHost[]> =>
    invoke('parse_ssh_config', { configPath: configPath ?? null }),

  importSshConfig: (configPath: string | null, hostAliases: string[]): Promise<Connection[]> =>
    invoke('import_ssh_config', { configPath, hostAliases }),

  storeCredential: (connectionId: string, secret: string): Promise<void> =>
    invoke('store_credential', { connectionId, secret }),

  retrieveCredential: (connectionId: string): Promise<string | null> =>
    invoke('retrieve_credential', { connectionId }),

  deleteCredential: (connectionId: string): Promise<void> =>
    invoke('delete_credential', { connectionId }),

  hasCredential: (connectionId: string): Promise<boolean> =>
    invoke('has_credential', { connectionId }),

  sshConnect: (connectionId: string, onData: Channel<number[]>): Promise<string> =>
    invoke('ssh_connect', { connectionId, onData }),

  sshDisconnect: (sessionId: string): Promise<void> =>
    invoke('ssh_disconnect', { sessionId }),

  sshWrite: (sessionId: string, data: number[]): Promise<void> =>
    invoke('ssh_write', { sessionId, data }),

  sshResize: (sessionId: string, cols: number, rows: number): Promise<void> =>
    invoke('ssh_resize', { sessionId, cols, rows }),

  sftpListDir: (sessionId: string, path: string): Promise<FileEntry[]> =>
    invoke('sftp_list_dir', { sessionId, path }),

  sftpDownload: (
    sessionId: string,
    remotePath: string,
    localPath: string,
    onProgress: Channel<TransferProgress>,
  ): Promise<void> => invoke('sftp_download', { sessionId, remotePath, localPath, onProgress }),

  sftpUpload: (
    sessionId: string,
    localPath: string,
    remotePath: string,
    onProgress: Channel<TransferProgress>,
  ): Promise<void> => invoke('sftp_upload', { sessionId, localPath, remotePath, onProgress }),

  sftpMkdir: (sessionId: string, path: string): Promise<void> =>
    invoke('sftp_mkdir', { sessionId, path }),

  sftpDelete: (sessionId: string, path: string): Promise<void> =>
    invoke('sftp_delete', { sessionId, path }),

  sftpRename: (sessionId: string, oldPath: string, newPath: string): Promise<void> =>
    invoke('sftp_rename', { sessionId, old: oldPath, new: newPath }),

  localListDir: (path: string): Promise<FileEntry[]> =>
    invoke('local_list_dir', { path }),

  createTunnel: (sessionId: string, config: TunnelConfig): Promise<string> =>
    invoke('create_tunnel', { sessionId, config }),

  stopTunnel: (tunnelId: string): Promise<void> =>
    invoke('stop_tunnel', { tunnelId }),

  listTunnels: (sessionId: string): Promise<Tunnel[]> =>
    invoke('list_tunnels', { sessionId }),

  // Snippets
  listSnippets: (): Promise<Snippet[]> =>
    invoke('list_snippets'),

  createSnippet: (data: CreateSnippetInput): Promise<Snippet> =>
    invoke('create_snippet', { data }),

  updateSnippet: (id: string, data: UpdateSnippetInput): Promise<Snippet> =>
    invoke('update_snippet', { id, data }),

  deleteSnippet: (id: string): Promise<void> =>
    invoke('delete_snippet', { id }),

  // Settings
  getSetting: (key: string): Promise<string | null> =>
    isTauriRuntime() ? invoke('get_setting', { key }) : Promise.resolve(readFallbackSetting(key)),

  setSetting: (key: string, value: string): Promise<void> =>
    isTauriRuntime()
      ? invoke('set_setting', { key, value })
      : Promise.resolve().then(() => {
          writeFallbackSetting(key, value);
        }),

  getAllSettings: (): Promise<Record<string, string>> =>
    isTauriRuntime() ? invoke('get_all_settings') : Promise.resolve(readAllFallbackSettings()),
};
