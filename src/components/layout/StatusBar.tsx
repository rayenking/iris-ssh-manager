import { Moon, Sun, Activity } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { applyTheme } from '../../lib/themes';

export function StatusBar() {
  const { currentTheme, setTheme } = useUiStore();

  const toggleTheme = () => {
    const newTheme = currentTheme === 'dark-minimal' ? 'iris-pink' : 'dark-minimal';
    setTheme(newTheme);
    applyTheme(newTheme);
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
        <span>Iris SSH Manager</span>
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
