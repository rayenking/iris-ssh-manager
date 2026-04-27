export type TabStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type TabKind = 'terminal' | 'files';

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

export interface FileBrowserTab extends BaseTab {
  kind: 'files';
  terminalTabId: string;
}

export type AppTab = TerminalTab | FileBrowserTab;
