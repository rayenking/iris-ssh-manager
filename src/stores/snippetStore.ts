import { create } from 'zustand';
import type { Snippet, CreateSnippetInput, UpdateSnippetInput } from '../types/snippet';
import { tauriApi } from '../lib/tauri';

const isTauriRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface SnippetState {
  snippets: Snippet[];
  searchQuery: string;
  
  fetchSnippets: () => Promise<void>;
  createSnippet: (data: CreateSnippetInput) => Promise<Snippet>;
  updateSnippet: (id: string, data: UpdateSnippetInput) => Promise<void>;
  deleteSnippet: (id: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
}

export const useSnippetStore = create<SnippetState>((set) => ({
  snippets: [],
  searchQuery: '',

  fetchSnippets: async () => {
    if (!isTauriRuntime) {
      set({ snippets: [] });
      return;
    }

    try {
      const snippets = await tauriApi.listSnippets();
      set({ snippets });
    } catch (error) {
      console.error('Failed to fetch snippets:', error);
      throw error;
    }
  },

  createSnippet: async (data) => {
    if (!isTauriRuntime) {
      throw new Error('Snippet management is only available in the Tauri app.');
    }

    try {
      const newSnippet = await tauriApi.createSnippet(data);
      set((state) => ({ snippets: [...state.snippets, newSnippet] }));
      return newSnippet;
    } catch (error) {
      console.error('Failed to create snippet:', error);
      throw error;
    }
  },

  updateSnippet: async (id, data) => {
    if (!isTauriRuntime) {
      throw new Error('Snippet management is only available in the Tauri app.');
    }

    try {
      const updatedSnippet = await tauriApi.updateSnippet(id, data);
      set((state) => ({
        snippets: state.snippets.map(s => s.id === id ? updatedSnippet : s)
      }));
    } catch (error) {
      console.error('Failed to update snippet:', error);
      throw error;
    }
  },

  deleteSnippet: async (id) => {
    if (!isTauriRuntime) {
      throw new Error('Snippet management is only available in the Tauri app.');
    }

    try {
      await tauriApi.deleteSnippet(id);
      set((state) => ({
        snippets: state.snippets.filter(s => s.id !== id)
      }));
    } catch (error) {
      console.error('Failed to delete snippet:', error);
      throw error;
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
}));
