export type TabStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface TerminalTab {
  id: string;
  connectionId: string;
  title: string;
  status: TabStatus;
}
