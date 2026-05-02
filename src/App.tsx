import { useEffect, useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { TabBar } from "./components/layout/TabBar";
import { StatusBar } from "./components/layout/StatusBar";
import { ErrorToast } from "./components/layout/ErrorToast";
import { ConnectionForm } from "./components/connections/ConnectionForm";
import { FileBrowser } from "./components/sftp/FileBrowser";
import { SplitContainer } from "./components/terminal/SplitContainer";
import { CommandPalette } from "./components/layout/CommandPalette";
import { SnippetManager } from "./components/snippets/SnippetManager";
import { ImportDialog } from "./components/connections/ImportDialog";
import { FileExplorer } from "./components/explorer/FileExplorer";
import { FileEditor } from "./components/explorer/FileEditor";
import { useUiStore } from "./stores/uiStore";
import { useTerminalStore } from "./stores/terminalStore";
import { useSplitStore } from "./stores/splitStore";
import { useSettingsStore } from "./stores/settingsStore";
import { applyTheme } from "./lib/themes";
import { initGlobalKeybindings, registerShortcut, unregisterShortcut } from "./lib/keybindings";
import type { Connection } from "./types/connection";
import { SettingsPage } from "./components/settings/SettingsPage";
import { UpdateNotification } from "./components/layout/UpdateNotification";
import { TitleBar } from "./components/layout/TitleBar";

function App() {
  const {
    currentTheme,
    snippetsOpen,
    explorerOpen,
    toggleExplorer,
    toggleSnippets,
    importDialogOpen,
    setImportDialogOpen,
    settingsOpen,
    editorFile,
    toggleCommandPalette,
    setSidebarCollapsed,
  } = useUiStore();
  const { tabs, activeTabId } = useTerminalStore();
  const splitTrees = useSplitStore((state) => state.splitTrees);
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
    const handleOpenSettings = () => {
      useUiStore.getState().setSettingsOpen(true);
    };

    registerShortcut('open-settings', handleOpenSettings);

    return () => unregisterShortcut('open-settings');
  }, []);

  useEffect(() => {
    const handleLocalTerminal = () => useTerminalStore.getState().openLocalTab();
    registerShortcut('local-terminal', handleLocalTerminal);
    return () => unregisterShortcut('local-terminal');
  }, []);

  useEffect(() => {
    registerShortcut('toggle-snippets', toggleSnippets);

    return () => unregisterShortcut('toggle-snippets');
  }, [toggleSnippets]);

  useEffect(() => {
    registerShortcut('toggle-explorer', toggleExplorer);

    return () => unregisterShortcut('toggle-explorer');
  }, [toggleExplorer]);

  useEffect(() => {
    const handleOpenImportConfig = () => {
      useUiStore.getState().setImportDialogOpen(true);
    };

    registerShortcut('open-import-config', handleOpenImportConfig);

    return () => unregisterShortcut('open-import-config');
  }, []);

  useEffect(() => {
    const handleOpenSftp = () => {
      const { activeTabId, tabs, openFileBrowserTab } = useTerminalStore.getState();
      const activeTerminalTab = tabs.find(
        (tab): tab is Extract<(typeof tabs)[number], { kind: 'terminal' }> =>
          tab.kind === 'terminal' && tab.id === activeTabId,
      );

      if (!activeTerminalTab?.sessionId) {
        return;
      }

      openFileBrowserTab(activeTerminalTab.id, activeTerminalTab.connectionId, activeTerminalTab.title);
    };

    registerShortcut('open-sftp', handleOpenSftp);

    return () => unregisterShortcut('open-sftp');
  }, []);

  useEffect(() => {
    const handleNewConnection = () => {
      window.dispatchEvent(new CustomEvent('open-connection-form', { detail: { connection: null } }));
    };

    registerShortcut('new-connection', handleNewConnection);

    return () => unregisterShortcut('new-connection');
  }, []);

  useEffect(() => {
    const handleCloseTab = () => {
      const { activeTabId, closeTab } = useTerminalStore.getState();

      if (!activeTabId) {
        return;
      }

      closeTab(activeTabId);
    };

    registerShortcut('close-tab', handleCloseTab);

    return () => unregisterShortcut('close-tab');
  }, []);

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
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-sans antialiased">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
      <Sidebar />
      
      {snippetsOpen && (
        <div className="w-[300px] border-r border-[var(--color-border)] z-10 flex flex-col bg-[var(--color-bg-secondary)]">
          <SnippetManager />
        </div>
      )}

      {explorerOpen && (
        <div className="w-[280px] border-r border-[var(--color-border)] z-10 flex flex-col bg-[var(--color-bg-secondary)]">
          <FileExplorer />
        </div>
      )}

      <div className="flex-1 flex min-w-0 h-full">
        <div className="flex-1 flex flex-col h-full min-w-0">
        <TabBar />
        {activeTab ? (
          <div className="relative flex-1 min-h-0 overflow-hidden">
            {tabs.map((tab) => (
                <div
                key={tab.id}
                className={`absolute inset-0 flex flex-col ${activeTabId === tab.id ? '' : 'hidden'}`}
              >
                {tab.kind === 'terminal' || tab.kind === 'local-terminal' ? (
                  splitTrees[tab.id] ? <SplitContainer node={splitTrees[tab.id]} tabId={tab.id} /> : null
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
            <div className="text-[var(--color-text-muted)] text-center flex flex-col items-center gap-6">
              <img src="/assets/cover.png" alt="Iris SSH Manager" className="max-w-md w-full rounded-lg opacity-90" draggable={false} />
              <div className="flex flex-col items-center gap-2">
                <img src="/assets/logo.png" alt="" className="h-10 w-10" draggable={false} />
                <h1 className="text-2xl font-light tracking-wide text-[var(--color-text-secondary)]">
                  Welcome to Iris
                </h1>
              </div>
              <p className="text-sm">Select a connection to start</p>
              <p className="text-xs opacity-50">Press Ctrl+K or Cmd+K for command palette</p>
            </div>
          </div>
        )}
        <StatusBar />
        </div>

        {editorFile && <FileEditor />}
      </div>
       
      </div>
      <ImportDialog isOpen={importDialogOpen} onClose={() => setImportDialogOpen(false)} />
      {settingsOpen && <SettingsPage />}
      <ErrorToast />
      <CommandPalette />
      <UpdateNotification />
      
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
