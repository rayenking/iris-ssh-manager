export type TabStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type TabKind = 'terminal' | 'local-terminal' | 'files';

interface BaseTab {
  id: string;
  connectionId: string;
  title: string;
  kind: TabKind;
}

export interface TerminalTab extends BaseTab {
  kind: 'terminal';
  status: TabStatus;
  sessionId?: string;
}

export interface LocalTerminalTab extends BaseTab {
  kind: 'local-terminal';
  status: TabStatus;
  sessionId?: string;
}

export interface FileBrowserTab extends BaseTab {
  kind: 'files';
  terminalTabId: string;
}

export type AppTab = TerminalTab | FileBrowserTab | LocalTerminalTab;
