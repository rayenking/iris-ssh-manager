import { useEffect, useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { TabBar } from "./components/layout/TabBar";
import { StatusBar } from "./components/layout/StatusBar";
import { ErrorToast } from "./components/layout/ErrorToast";
import { ConnectionForm } from "./components/connections/ConnectionForm";
import { FileBrowser } from "./components/sftp/FileBrowser";
import { TerminalView } from "./components/terminal/TerminalView";
import { CommandPalette } from "./components/layout/CommandPalette";
import { SnippetManager } from "./components/snippets/SnippetManager";
import { ImportDialog } from "./components/connections/ImportDialog";
import { useUiStore } from "./stores/uiStore";
import { useTerminalStore } from "./stores/terminalStore";
import { useSettingsStore } from "./stores/settingsStore";
import { applyTheme } from "./lib/themes";
import { initGlobalKeybindings, registerShortcut, unregisterShortcut } from "./lib/keybindings";
import type { Connection } from "./types/connection";
import { SettingsPage } from "./components/settings/SettingsPage";

function App() {
  const { currentTheme, snippetsOpen, toggleSnippets, importDialogOpen, setImportDialogOpen, settingsOpen, toggleCommandPalette, setSidebarCollapsed } = useUiStore();
  const { tabs, activeTabId } = useTerminalStore();
  const { loadSettings, keybindings, sidebarDefaultState, theme } = useSettingsStore();
  const [editingConnection, setEditingConnection] = useState<Connection | null | undefined>(undefined);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setSidebarCollapsed(sidebarDefaultState === 'collapsed');
  }, [setSidebarCollapsed, sidebarDefaultState]);

  useEffect(() => {
    applyTheme(theme || currentTheme);
  }, [currentTheme, theme]);

  useEffect(() => {
    return initGlobalKeybindings(keybindings);
  }, [keybindings]);

  useEffect(() => {
    registerShortcut('command-palette', toggleCommandPalette);
    return () => unregisterShortcut('command-palette');
  }, [toggleCommandPalette]);

  useEffect(() => {
    const handleOpen = (e: CustomEvent) => setEditingConnection(e.detail?.connection || null);
    const handleClose = () => setEditingConnection(undefined);
    window.addEventListener('open-connection-form', handleOpen as EventListener);
    window.addEventListener('close-connection-form', handleClose as EventListener);
    return () => {
      window.removeEventListener('open-connection-form', handleOpen as EventListener);
      window.removeEventListener('close-connection-form', handleClose as EventListener);
    };
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-sans antialiased">
      <Sidebar />
      
      {snippetsOpen && (
        <div className="w-[300px] border-r border-[var(--color-border)] z-10 flex flex-col bg-[var(--color-bg-secondary)] relative">
          <button 
            onClick={toggleSnippets}
            className="absolute top-4 right-4 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            &times;
          </button>
          <SnippetManager />
        </div>
      )}

      <div className="flex-1 flex flex-col h-full min-w-0">
        <TabBar />
        {activeTab ? (
          <div className="relative flex-1 min-h-0 overflow-hidden">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`absolute inset-0 ${activeTabId === tab.id ? 'block' : 'hidden'}`}
              >
                {tab.kind === 'terminal' ? (
                  <TerminalView connectionId={tab.connectionId} tabId={tab.id} />
                ) : (() => {
                  const terminalTab = tabs.find(
                    (candidate): candidate is Extract<(typeof tabs)[number], { kind: 'terminal' }> =>
                      candidate.kind === 'terminal' && candidate.id === tab.terminalTabId,
                  );

                  if (!terminalTab?.sessionId) {
                    return (
                      <div className="flex h-full items-center justify-center bg-[var(--color-bg-primary)] p-4 text-sm text-[var(--color-text-muted)]">
                        Connect the terminal tab first to open SFTP.
                      </div>
                    );
                  }

                  return <FileBrowser connectionTitle={terminalTab.title} sessionId={terminalTab.sessionId} />;
                })()}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
            <div className="text-[var(--color-text-muted)] text-center flex flex-col items-center gap-4">
              <h1 className="text-2xl font-light tracking-wide text-[var(--color-text-secondary)]">
                Welcome to Iris
              </h1>
              <p className="text-sm">Select a connection to start</p>
              <p className="text-xs opacity-50 mt-4">Press Ctrl+K or Cmd+K for command palette</p>
            </div>
          </div>
        )}
        <StatusBar />
      </div>
      
      <ImportDialog isOpen={importDialogOpen} onClose={() => setImportDialogOpen(false)} />
      {settingsOpen && <SettingsPage />}
      <ErrorToast />
      <CommandPalette />
      
      {editingConnection !== undefined && (
        <ConnectionForm 
          connection={editingConnection} 
          onClose={() => setEditingConnection(undefined)} 
        />
      )}
    </div>
  );
}

export default App;
