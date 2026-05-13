import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal, Plus, FolderTree, Code2 } from "lucide-react";
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
import { CodeReviewPanel } from "./components/review/CodeReviewPanel";
import { ReviewDiffTab } from "./components/review/ReviewDiffTab";
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

const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 420;
const MAX_REVIEW_DIFF_WIDTH = 1000;

function clampPanelWidth(width: number) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
}

function clampReviewDiffWidth(width: number) {
  return Math.min(MAX_REVIEW_DIFF_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
}

type ResizablePanel = "snippets" | "explorer" | "code-review" | "review-diff";

function App() {
  const {
    currentTheme,
    snippetsOpen,
    explorerOpen,
    codeReviewOpen,
    snippetsWidth,
    explorerWidth,
    codeReviewWidth,
    reviewDiffWidth,
    setSnippetsWidth,
    setExplorerWidth,
    setCodeReviewWidth,
    setReviewDiffWidth,
    toggleExplorer,
    toggleSnippets,
    importDialogOpen,
    setImportDialogOpen,
    settingsOpen,
    editorFile,
    reviewDiffFile,
    toggleCommandPalette,
  } = useUiStore();
  const { tabs, activeTabId, openLocalTab } = useTerminalStore();
  const splitTrees = useSplitStore((state) => state.splitTrees);
  const { loadSettings, keybindings, theme } = useSettingsStore();
  const [editingConnection, setEditingConnection] = useState<Connection | null | undefined>(undefined);
  const [activeResizePanel, setActiveResizePanel] = useState<ResizablePanel | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  const handlePanelResizeStart = useCallback((panel: ResizablePanel, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setActiveResizePanel(panel);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const shellRect = shellRef.current?.getBoundingClientRect();

      if (!shellRect) {
        return;
      }

      const nextWidth = clampPanelWidth(moveEvent.clientX - shellRect.left);

      if (panel === "snippets") {
        setSnippetsWidth(nextWidth);
        return;
      }

      if (panel === "code-review") {
        setCodeReviewWidth(nextWidth);
        return;
      }

      if (panel === "review-diff") {
        setReviewDiffWidth(clampReviewDiffWidth(shellRect.right - moveEvent.clientX));
        return;
      }

      setExplorerWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setActiveResizePanel(null);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [setCodeReviewWidth, setExplorerWidth, setReviewDiffWidth, setSnippetsWidth]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    applyTheme(theme || currentTheme);
  }, [currentTheme, theme]);

  useEffect(() => {
    return initGlobalKeybindings(keybindings);
  }, [keybindings]);

  useEffect(() => {
    registerShortcut("command-palette", toggleCommandPalette);
    return () => unregisterShortcut("command-palette");
  }, [toggleCommandPalette]);

  useEffect(() => {
    const handleOpenSettings = () => {
      useUiStore.getState().setSettingsOpen(true);
    };

    registerShortcut("open-settings", handleOpenSettings);

    return () => unregisterShortcut("open-settings");
  }, []);

  useEffect(() => {
    registerShortcut("local-terminal", openLocalTab);
    return () => unregisterShortcut("local-terminal");
  }, [openLocalTab]);

  useEffect(() => {
    registerShortcut("toggle-snippets", toggleSnippets);
    return () => unregisterShortcut("toggle-snippets");
  }, [toggleSnippets]);

  useEffect(() => {
    registerShortcut("toggle-explorer", toggleExplorer);
    return () => unregisterShortcut("toggle-explorer");
  }, [toggleExplorer]);

  useEffect(() => {
    const handleOpenImportConfig = () => {
      useUiStore.getState().setImportDialogOpen(true);
    };

    registerShortcut("open-import-config", handleOpenImportConfig);

    return () => unregisterShortcut("open-import-config");
  }, []);

  useEffect(() => {
    const handleOpenSftp = () => {
      const { activeTabId, tabs, openFileBrowserTab } = useTerminalStore.getState();
      const activeTerminalTab = tabs.find(
        (tab): tab is Extract<(typeof tabs)[number], { kind: "terminal" }> =>
          tab.kind === "terminal" && tab.id === activeTabId,
      );

      if (!activeTerminalTab?.sessionId) {
        return;
      }

      openFileBrowserTab(activeTerminalTab.id, activeTerminalTab.connectionId, activeTerminalTab.title);
    };

    registerShortcut("open-sftp", handleOpenSftp);

    return () => unregisterShortcut("open-sftp");
  }, []);

  useEffect(() => {
    const handleNewConnection = () => {
      window.dispatchEvent(new CustomEvent("open-connection-form", { detail: { connection: null } }));
    };

    registerShortcut("new-connection", handleNewConnection);

    return () => unregisterShortcut("new-connection");
  }, []);

  useEffect(() => {
    const handleCloseTab = () => {
      const { activeTabId, closeTab } = useTerminalStore.getState();

      if (!activeTabId) {
        return;
      }

      closeTab(activeTabId);
    };

    registerShortcut("close-tab", handleCloseTab);

    return () => unregisterShortcut("close-tab");
  }, []);

  useEffect(() => {
    const handleOpen = (e: CustomEvent) => setEditingConnection(e.detail?.connection || null);
    const handleClose = () => setEditingConnection(undefined);
    window.addEventListener("open-connection-form", handleOpen as EventListener);
    window.addEventListener("close-connection-form", handleClose as EventListener);
    return () => {
      window.removeEventListener("open-connection-form", handleOpen as EventListener);
      window.removeEventListener("close-connection-form", handleClose as EventListener);
    };
  }, []);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-sans antialiased">
      <TitleBar />

      <div
        ref={shellRef}
        className={`flex flex-1 min-h-0 ${activeResizePanel ? "cursor-col-resize select-none" : ""}`}
      >
        <div
          className={`overflow-hidden flex flex-col bg-[var(--color-bg-secondary)] ${
            activeResizePanel === "snippets" ? "" : "transition-[width] duration-200"
          }`}
          style={{ width: snippetsOpen ? snippetsWidth : 0 }}
        >
          {snippetsOpen && <SnippetManager />}
        </div>
        {snippetsOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize snippets panel"
            onMouseDown={(event) => handlePanelResizeStart("snippets", event)}
            className="relative w-px shrink-0 cursor-col-resize bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)] before:absolute before:inset-y-0 before:-inset-x-1 before:content-['']"
          />
        )}

        <div
          className={`overflow-hidden flex flex-col bg-[var(--color-bg-secondary)] ${
            activeResizePanel === "explorer" ? "" : "transition-[width] duration-200"
          }`}
          style={{ width: explorerOpen ? explorerWidth : 0 }}
        >
          {explorerOpen && <FileExplorer />}
        </div>
        {explorerOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize explorer panel"
            onMouseDown={(event) => handlePanelResizeStart("explorer", event)}
            className="relative w-px shrink-0 cursor-col-resize bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)] before:absolute before:inset-y-0 before:-inset-x-1 before:content-['']"
          />
        )}

        <div
          className={`overflow-hidden flex flex-col bg-[var(--color-bg-secondary)] ${
            activeResizePanel === "code-review" ? "" : "transition-[width] duration-200"
          }`}
          style={{ width: codeReviewOpen ? codeReviewWidth : 0 }}
        >
          {codeReviewOpen && <CodeReviewPanel />}
        </div>
        {codeReviewOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize code review panel"
            onMouseDown={(event) => handlePanelResizeStart("code-review", event)}
            className="relative w-px shrink-0 cursor-col-resize bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)] before:absolute before:inset-y-0 before:-inset-x-1 before:content-['']"
          />
        )}

        <div className="flex h-full min-w-0 flex-1">
          <div className="flex h-full min-w-0 flex-1 flex-col">
            {activeTab ? (
              <div className="relative flex-1 min-h-0 overflow-hidden">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`absolute inset-0 flex flex-col ${activeTabId === tab.id ? "" : "hidden"}`}
                  >
                    {tab.kind === "terminal" || tab.kind === "local-terminal" ? (
                      splitTrees[tab.id] ? <SplitContainer node={splitTrees[tab.id]} tabId={tab.id} /> : null
                    ) : tab.kind === "files" ? (() => {
                      const terminalTab = tabs.find(
                        (candidate): candidate is Extract<(typeof tabs)[number], { kind: "terminal" }> =>
                          candidate.kind === "terminal" && candidate.id === tab.terminalTabId,
                      );

                      if (!terminalTab?.sessionId) {
                        return (
                          <div className="flex h-full items-center justify-center bg-[var(--color-bg-primary)] p-4 text-sm text-[var(--color-text-muted)]">
                            Connect the terminal tab first to open SFTP.
                          </div>
                        );
                      }

                      return <FileBrowser connectionTitle={terminalTab.title} sessionId={terminalTab.sessionId} />;
                    })() : tab.kind === "review-diff" ? (
                      <ReviewDiffTab tab={tab} />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
                <div className="w-full max-w-3xl rounded-[28px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/70 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-6 text-center">
                    <img src="/assets/logo.png" alt="" className="h-16 w-16" draggable={false} />
                    <div className="space-y-2">
                      <h1 className="text-3xl font-light tracking-[0.08em] text-[var(--color-text-primary)]">Welcome to IrisX</h1>
                      <p className="text-sm text-[var(--color-text-secondary)]">Launch a local shell, open a saved SSH connection, or start by adding a new connection.</p>
                    </div>
                    <div className="grid w-full gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent("open-connection-form", { detail: { connection: null } }))}
                        className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:bg-[var(--color-hover)]"
                      >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]">
                          <Plus className="h-4 w-4" />
                        </div>
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">New Connection</div>
                        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">Save a new SSH target for quick access.</div>
                      </button>

                      <button
                        type="button"
                        onClick={openLocalTab}
                        className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:bg-[var(--color-hover)]"
                      >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]">
                          <Terminal className="h-4 w-4" />
                        </div>
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">Local Terminal</div>
                        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">Open a shell on this machine right away.</div>
                      </button>

                      <button
                        type="button"
                        onClick={toggleCommandPalette}
                        className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:bg-[var(--color-hover)]"
                      >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]">
                          <FolderTree className="h-4 w-4" />
                        </div>
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">Command Palette</div>
                        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">Browse actions, snippets, and saved connections with Ctrl+K.</div>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
                      <Code2 className="h-3.5 w-3.5" />
                      <span>Explorer and Snippets now live as resizable utility panels on the left.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <StatusBar />
          </div>

          {reviewDiffFile && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize review diff panel"
                onMouseDown={(event) => handlePanelResizeStart("review-diff", event)}
                className="relative w-px shrink-0 cursor-col-resize bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)] before:absolute before:inset-y-0 before:-inset-x-1 before:content-['']"
              />
              <div className="flex h-full shrink-0 overflow-hidden bg-[var(--color-bg-secondary)]" style={{ width: reviewDiffWidth }}>
                <ReviewDiffTab
                  tab={{
                    id: 'review-panel-diff',
                    connectionId: 'local',
                    title: reviewDiffFile.path.split(/[\\/]/).pop() || reviewDiffFile.path,
                    kind: 'review-diff',
                    terminalTabId: 'review-panel',
                    filePath: reviewDiffFile.path,
                    repoRoot: reviewDiffFile.repoRoot,
                    preview: true,
                  }}
                />
              </div>
            </>
          )}
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
