export interface Snippet {
  id: string;
  name: string;
  command: string;
  category: string | null;
  variables: string | null;
  sortOrder: number | null;
}

export interface CreateSnippetInput {
  name: string;
  command: string;
  category?: string | null;
  variables?: string | null;
  sortOrder?: number | null;
}

export interface UpdateSnippetInput {
  name?: string | null;
  command?: string | null;
  category?: string | null;
  variables?: string | null;
  sortOrder?: number | null;
}
