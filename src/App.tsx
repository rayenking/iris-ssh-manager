import { useEffect, useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { TabBar } from "./components/layout/TabBar";
import { StatusBar } from "./components/layout/StatusBar";
import { ErrorToast } from "./components/layout/ErrorToast";
import { ConnectionForm } from "./components/connections/ConnectionForm";
import { TerminalView } from "./components/terminal/TerminalView";
import { useUiStore } from "./stores/uiStore";
import { useTerminalStore } from "./stores/terminalStore";
import { applyTheme } from "./lib/themes";
import type { Connection } from "./types/connection";

function App() {
  const { currentTheme } = useUiStore();
  const { tabs, activeTabId } = useTerminalStore();
  const [editingConnection, setEditingConnection] = useState<Connection | null | undefined>(undefined);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

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
      <div className="flex-1 flex flex-col h-full min-w-0">
        <TabBar />
        {activeTab ? (
          <div className="relative flex-1 min-h-0 overflow-hidden">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`absolute inset-0 ${activeTabId === tab.id ? 'block' : 'hidden'}`}
              >
                <TerminalView connectionId={tab.connectionId} tabId={tab.id} />
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
            </div>
          </div>
        )}
        <StatusBar />
      </div>
      <ErrorToast />
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
