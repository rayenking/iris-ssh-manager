import { invoke } from '@tauri-apps/api/core';
import type { 
  Connection, 
  ConnectionGroup, 
  CreateConnectionInput, 
  UpdateConnectionInput,
  CreateGroupInput,
  UpdateGroupInput
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
    invoke('delete_group', { id })
};
