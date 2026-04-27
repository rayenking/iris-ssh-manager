import { useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { TabBar } from "./components/layout/TabBar";
import { StatusBar } from "./components/layout/StatusBar";
import { ErrorToast } from "./components/layout/ErrorToast";
import { useUiStore } from "./stores/uiStore";
import { applyTheme } from "./lib/themes";

function App() {
  const { currentTheme } = useUiStore();

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full min-w-0">
        <TabBar />
        <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
          <div className="text-[var(--color-text-muted)] text-center flex flex-col items-center gap-4">
            <h1 className="text-2xl font-light tracking-wide text-[var(--color-text-secondary)]">
              Welcome to Iris
            </h1>
            <p className="text-sm">Select a connection from the sidebar to start</p>
          </div>
        </div>
        <StatusBar />
      </div>
      <ErrorToast />
    </div>
  );
}

export default App;

