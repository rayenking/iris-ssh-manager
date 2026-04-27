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
const CONNECTIONS_STORAGE_KEY = 'iris-ssh-manager.connections';
const GROUPS_STORAGE_KEY = 'iris-ssh-manager.connection-groups';

const memoryBrowserFallback = new Map<string, string>();

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

function readBrowserFallback<T>(key: string, defaultValue: T): T {
  const storage = getBrowserStorage();
  const rawValue = storage?.getItem(key) ?? memoryBrowserFallback.get(key) ?? null;

  if (rawValue === null) {
    return defaultValue;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return defaultValue;
  }
}

function writeBrowserFallback<T>(key: string, value: T) {
  const serializedValue = JSON.stringify(value);
  const storage = getBrowserStorage();

  if (storage) {
    storage.setItem(key, serializedValue);
    return;
  }

  memoryBrowserFallback.set(key, serializedValue);
}

function getNowIso() {
  return new Date().toISOString();
}

function createBrowserId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getBrowserConnections() {
  return readBrowserFallback<Connection[]>(CONNECTIONS_STORAGE_KEY, []);
}

function setBrowserConnections(connections: Connection[]) {
  writeBrowserFallback(CONNECTIONS_STORAGE_KEY, connections);
}

function getBrowserGroups() {
  return readBrowserFallback<ConnectionGroup[]>(GROUPS_STORAGE_KEY, []);
}

function setBrowserGroups(groups: ConnectionGroup[]) {
  writeBrowserFallback(GROUPS_STORAGE_KEY, groups);
}

function createBrowserConnection(data: CreateConnectionInput): Connection {
  const connections = getBrowserConnections();
  const now = getNowIso();

  return {
    id: createBrowserId('connection'),
    name: data.name,
    hostname: data.hostname,
    port: data.port ?? 22,
    username: data.username,
    authMethod: data.authMethod,
    privateKeyPath: data.privateKeyPath,
    groupId: data.groupId,
    colorTag: data.colorTag,
    startupCommand: data.startupCommand,
    connectionCount: 0,
    sortOrder: connections.length,
    createdAt: now,
    updatedAt: now,
  };
}

function updateBrowserConnection(connectionId: string, data: UpdateConnectionInput) {
  const connections = getBrowserConnections();
  const index = connections.findIndex((connection) => connection.id === connectionId);

  if (index === -1) {
    throw new Error('Connection not found.');
  }

  const currentConnection = connections[index];
  const updatedConnection: Connection = {
    ...currentConnection,
    ...data,
    port: data.port ?? currentConnection.port,
    privateKeyPath: data.privateKeyPath ?? currentConnection.privateKeyPath,
    groupId: data.groupId ?? currentConnection.groupId,
    colorTag: data.colorTag ?? currentConnection.colorTag,
    startupCommand: data.startupCommand ?? currentConnection.startupCommand,
    updatedAt: getNowIso(),
  };

  connections[index] = updatedConnection;
  setBrowserConnections(connections);

  return updatedConnection;
}

function duplicateBrowserConnection(connectionId: string) {
  const connections = getBrowserConnections();
  const sourceConnection = connections.find((connection) => connection.id === connectionId);

  if (!sourceConnection) {
    throw new Error('Connection not found.');
  }

  const duplicatedConnection: Connection = {
    ...sourceConnection,
    id: createBrowserId('connection'),
    name: `${sourceConnection.name} Copy`,
    connectionCount: 0,
    sortOrder: connections.length,
    createdAt: getNowIso(),
    updatedAt: getNowIso(),
  };

  connections.push(duplicatedConnection);
  setBrowserConnections(connections);

  return duplicatedConnection;
}

function deleteBrowserConnection(connectionId: string) {
  const connections = getBrowserConnections().filter((connection) => connection.id !== connectionId);
  setBrowserConnections(connections);
}

function createBrowserGroup(data: CreateGroupInput): ConnectionGroup {
  const groups = getBrowserGroups();
  return {
    id: createBrowserId('group'),
    name: data.name,
    color: data.color,
    parentId: data.parentId,
    sortOrder: groups.length,
  };
}

function updateBrowserGroup(groupId: string, data: UpdateGroupInput) {
  const groups = getBrowserGroups();
  const index = groups.findIndex((group) => group.id === groupId);

  if (index === -1) {
    throw new Error('Group not found.');
  }

  const updatedGroup: ConnectionGroup = {
    ...groups[index],
    ...data,
  };

  groups[index] = updatedGroup;
  setBrowserGroups(groups);

  return updatedGroup;
}

function deleteBrowserGroup(groupId: string) {
  setBrowserGroups(getBrowserGroups().filter((group) => group.id !== groupId));

  const updatedConnections = getBrowserConnections().map((connection) =>
    connection.groupId === groupId ? { ...connection, groupId: undefined, updatedAt: getNowIso() } : connection,
  );
  setBrowserConnections(updatedConnections);
}

function searchBrowserConnections(query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return getBrowserConnections();
  }

  const groupsById = new Map(getBrowserGroups().map((group) => [group.id, group]));

  return getBrowserConnections().filter((connection) => {
    const group = connection.groupId ? groupsById.get(connection.groupId) : null;
    const searchableValues = [
      connection.name,
      connection.hostname,
      connection.username,
      connection.colorTag,
      connection.privateKeyPath,
      connection.startupCommand,
      group?.name,
    ]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.toLowerCase());

    return searchableValues.some((value) => value.includes(normalizedQuery));
  });
}

export const tauriApi = {
  listConnections: (): Promise<Connection[]> =>
    isTauriRuntime() ? invoke('list_connections') : Promise.resolve(getBrowserConnections()),
    
  getConnection: (id: string): Promise<Connection> =>
    isTauriRuntime()
      ? invoke('get_connection', { id })
      : Promise.resolve(getBrowserConnections().find((connection) => connection.id === id) as Connection),
    
  createConnection: (data: CreateConnectionInput): Promise<Connection> =>
    isTauriRuntime()
      ? invoke('create_connection', { data })
      : Promise.resolve().then(() => {
          const newConnection = createBrowserConnection(data);
          setBrowserConnections([...getBrowserConnections(), newConnection]);
          return newConnection;
        }),
    
  updateConnection: (id: string, data: UpdateConnectionInput): Promise<Connection> =>
    isTauriRuntime()
      ? invoke('update_connection', { id, data })
      : Promise.resolve().then(() => updateBrowserConnection(id, data)),
    
  deleteConnection: (id: string): Promise<void> =>
    isTauriRuntime()
      ? invoke('delete_connection', { id })
      : Promise.resolve().then(() => deleteBrowserConnection(id)),
    
  duplicateConnection: (id: string): Promise<Connection> =>
    isTauriRuntime()
      ? invoke('duplicate_connection', { id })
      : Promise.resolve().then(() => duplicateBrowserConnection(id)),
    
  searchConnections: (query: string): Promise<Connection[]> =>
    isTauriRuntime()
      ? invoke('search_connections', { query })
      : Promise.resolve(searchBrowserConnections(query)),
    
  listGroups: (): Promise<ConnectionGroup[]> =>
    isTauriRuntime() ? invoke('list_groups') : Promise.resolve(getBrowserGroups()),
    
  createGroup: (data: CreateGroupInput): Promise<ConnectionGroup> =>
    isTauriRuntime()
      ? invoke('create_group', { data })
      : Promise.resolve().then(() => {
          const newGroup = createBrowserGroup(data);
          setBrowserGroups([...getBrowserGroups(), newGroup]);
          return newGroup;
        }),
    
  updateGroup: (id: string, data: UpdateGroupInput): Promise<ConnectionGroup> =>
    isTauriRuntime()
      ? invoke('update_group', { id, data })
      : Promise.resolve().then(() => updateBrowserGroup(id, data)),
    
  deleteGroup: (id: string): Promise<void> =>
    isTauriRuntime()
      ? invoke('delete_group', { id })
      : Promise.resolve().then(() => deleteBrowserGroup(id)),

  parseSshConfig: (configPath?: string): Promise<ParsedSshHost[]> =>
    isTauriRuntime()
      ? invoke('parse_ssh_config', { configPath: configPath ?? null })
      : Promise.resolve([]),

  importSshConfig: (configPath: string | null, hostAliases: string[]): Promise<Connection[]> =>
    isTauriRuntime()
      ? invoke('import_ssh_config', { configPath, hostAliases })
      : Promise.resolve([]),

  storeCredential: (connectionId: string, secret: string): Promise<void> =>
    isTauriRuntime()
      ? invoke('store_credential', { connectionId, secret })
      : Promise.resolve(),

  retrieveCredential: (connectionId: string): Promise<string | null> =>
    isTauriRuntime()
      ? invoke('retrieve_credential', { connectionId })
      : Promise.resolve(null),

  deleteCredential: (connectionId: string): Promise<void> =>
    isTauriRuntime()
      ? invoke('delete_credential', { connectionId })
      : Promise.resolve(),

  hasCredential: (connectionId: string): Promise<boolean> =>
    isTauriRuntime()
      ? invoke('has_credential', { connectionId })
      : Promise.resolve(false),

  sshConnect: (connectionId: string, onData: Channel<number[]>): Promise<string> =>
    isTauriRuntime()
      ? invoke('ssh_connect', { connectionId, onData })
      : Promise.reject(new Error('SSH connections are only available in the Tauri app.')),

  sshDisconnect: (sessionId: string): Promise<void> =>
    isTauriRuntime()
      ? invoke('ssh_disconnect', { sessionId })
      : Promise.resolve(),

  sshWrite: (sessionId: string, data: number[]): Promise<void> =>
    isTauriRuntime()
      ? invoke('ssh_write', { sessionId, data })
      : Promise.resolve(),

  sshResize: (sessionId: string, cols: number, rows: number): Promise<void> =>
    isTauriRuntime()
      ? invoke('ssh_resize', { sessionId, cols, rows })
      : Promise.resolve(),

  sftpListDir: (sessionId: string, path: string): Promise<FileEntry[]> =>
    isTauriRuntime()
      ? invoke('sftp_list_dir', { sessionId, path })
      : Promise.resolve([]),

  sftpDownload: (
    sessionId: string,
    remotePath: string,
    localPath: string,
    onProgress: Channel<TransferProgress>,
  ): Promise<void> =>
    isTauriRuntime()
      ? invoke('sftp_download', { sessionId, remotePath, localPath, onProgress })
      : Promise.resolve(),

  sftpUpload: (
    sessionId: string,
    localPath: string,
    remotePath: string,
    onProgress: Channel<TransferProgress>,
  ): Promise<void> =>
    isTauriRuntime()
      ? invoke('sftp_upload', { sessionId, localPath, remotePath, onProgress })
      : Promise.resolve(),

  sftpMkdir: (sessionId: string, path: string): Promise<void> =>
    isTauriRuntime() ? invoke('sftp_mkdir', { sessionId, path }) : Promise.resolve(),

  sftpDelete: (sessionId: string, path: string): Promise<void> =>
    isTauriRuntime() ? invoke('sftp_delete', { sessionId, path }) : Promise.resolve(),

  sftpRename: (sessionId: string, oldPath: string, newPath: string): Promise<void> =>
    isTauriRuntime() ? invoke('sftp_rename', { sessionId, old: oldPath, new: newPath }) : Promise.resolve(),

  localListDir: (path: string): Promise<FileEntry[]> =>
    isTauriRuntime() ? invoke('local_list_dir', { path }) : Promise.resolve([]),

  createTunnel: (sessionId: string, config: TunnelConfig): Promise<string> =>
    isTauriRuntime()
      ? invoke('create_tunnel', { sessionId, config })
      : Promise.reject(new Error('Tunnels are only available in the Tauri app.')),

  stopTunnel: (tunnelId: string): Promise<void> =>
    isTauriRuntime() ? invoke('stop_tunnel', { tunnelId }) : Promise.resolve(),

  listTunnels: (sessionId: string): Promise<Tunnel[]> =>
    isTauriRuntime() ? invoke('list_tunnels', { sessionId }) : Promise.resolve([]),

  // Snippets
  listSnippets: (): Promise<Snippet[]> =>
    isTauriRuntime() ? invoke('list_snippets') : Promise.resolve([]),

  createSnippet: (data: CreateSnippetInput): Promise<Snippet> =>
    isTauriRuntime()
      ? invoke('create_snippet', { data })
      : Promise.reject(new Error('Snippet management is only available in the Tauri app.')),

  updateSnippet: (id: string, data: UpdateSnippetInput): Promise<Snippet> =>
    isTauriRuntime()
      ? invoke('update_snippet', { id, data })
      : Promise.reject(new Error('Snippet management is only available in the Tauri app.')),

  deleteSnippet: (id: string): Promise<void> =>
    isTauriRuntime()
      ? invoke('delete_snippet', { id })
      : Promise.resolve(),

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
