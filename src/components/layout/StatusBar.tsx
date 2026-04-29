import { Moon, Sun, Activity, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUpdateChecker } from './UpdateNotification';

export function StatusBar() {
  const { currentTheme, setTheme } = useUiStore();
  const updateTheme = useSettingsStore((state) => state.setTheme);
  const { currentVersion, manualCheck, checking, result } = useUpdateChecker();

  const toggleTheme = () => {
    const newTheme = currentTheme === 'dark-minimal' ? 'iris-pink' : 'dark-minimal';
    setTheme(newTheme);
    updateTheme(newTheme);
  };

  return (
    <div className="h-7 bg-[var(--color-bg-tertiary)] border-t border-[var(--color-border)] flex items-center justify-between px-3 text-xs text-[var(--color-text-muted)] shrink-0 select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 hover:text-[var(--color-text-primary)] transition-colors cursor-pointer">
          <Activity className="w-3.5 h-3.5 text-[var(--color-success)]" />
          <span>Ready</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span>Iris SSH Manager{currentVersion ? ` v${currentVersion}` : ''}</span>
          <button
            onClick={manualCheck}
            disabled={checking}
            className="p-0.5 rounded hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
            title={checking ? 'Checking...' : result === 'up-to-date' ? 'Up to date!' : 'Check for updates'}
          >
            {result === 'up-to-date' ? (
              <Check className="w-3 h-3 text-[var(--color-success)]" />
            ) : result === 'error' ? (
              <AlertCircle className="w-3 h-3 text-[var(--color-error)]" />
            ) : (
              <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
            )}
          </button>
        </div>
        <button 
          onClick={toggleTheme}
          className="flex items-center gap-1.5 hover:text-[var(--color-text-primary)] transition-colors"
          title={`Switch to ${currentTheme === 'dark-minimal' ? 'Iris Pink' : 'Dark Minimal'} theme`}
        >
          {currentTheme === 'dark-minimal' ? (
            <Sun className="w-3.5 h-3.5" />
          ) : (
            <Moon className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
