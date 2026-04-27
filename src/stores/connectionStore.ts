import { create } from 'zustand';
import type { Connection, ConnectionGroup, CreateConnectionInput, UpdateConnectionInput, CreateGroupInput, UpdateGroupInput } from '../types/connection';
import { tauriApi } from '../lib/tauri';

interface ConnectionState {
  connections: Connection[];
  groups: ConnectionGroup[];
  selectedId: string | null;
  searchQuery: string;
  
  fetchConnections: () => Promise<void>;
  createConnection: (data: CreateConnectionInput) => Promise<Connection>;
  updateConnection: (id: string, data: UpdateConnectionInput) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  setSelected: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  
  fetchGroups: () => Promise<void>;
  createGroup: (data: CreateGroupInput) => Promise<void>;
  updateGroup: (id: string, data: UpdateGroupInput) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connections: [],
  groups: [],
  selectedId: null,
  searchQuery: '',

  fetchConnections: async () => {
    try {
      const connections = await tauriApi.listConnections();
      set({ connections });
    } catch (error) {
      console.error('Failed to fetch connections:', error);
      throw error;
    }
  },

  createConnection: async (data) => {
    try {
      const newConnection = await tauriApi.createConnection(data);
      set((state) => ({ connections: [...state.connections, newConnection] }));
      return newConnection;
    } catch (error) {
      console.error('Failed to create connection:', error);
      throw error;
    }
  },

  updateConnection: async (id, data) => {
    try {
      const updatedConnection = await tauriApi.updateConnection(id, data);
      set((state) => ({
        connections: state.connections.map(c => c.id === id ? updatedConnection : c)
      }));
    } catch (error) {
      console.error('Failed to update connection:', error);
      throw error;
    }
  },

  deleteConnection: async (id) => {
    try {
      await tauriApi.deleteConnection(id);
      set((state) => ({
        connections: state.connections.filter(c => c.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId
      }));
    } catch (error) {
      console.error('Failed to delete connection:', error);
      throw error;
    }
  },

  setSelected: (id) => set({ selectedId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  fetchGroups: async () => {
    try {
      const groups = await tauriApi.listGroups();
      set({ groups });
    } catch (error) {
      console.error('Failed to fetch groups:', error);
      throw error;
    }
  },

  createGroup: async (data) => {
    try {
      const newGroup = await tauriApi.createGroup(data);
      set((state) => ({ groups: [...state.groups, newGroup] }));
    } catch (error) {
      console.error('Failed to create group:', error);
      throw error;
    }
  },

  updateGroup: async (id, data) => {
    try {
      const updatedGroup = await tauriApi.updateGroup(id, data);
      set((state) => ({
        groups: state.groups.map(g => g.id === id ? updatedGroup : g)
      }));
    } catch (error) {
      console.error('Failed to update group:', error);
      throw error;
    }
  },

  deleteGroup: async (id) => {
    try {
      await tauriApi.deleteGroup(id);
      set((state) => ({
        groups: state.groups.filter(g => g.id !== id)
      }));
    } catch (error) {
      console.error('Failed to delete group:', error);
      throw error;
    }
  }
}));
