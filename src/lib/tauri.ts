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
};
