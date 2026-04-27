import { useUiStore } from '../../stores/uiStore';
import { X, AlertCircle } from 'lucide-react';

export function ErrorToast() {
  const { errorToast, clearErrorToast } = useUiStore();

  if (!errorToast) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-4">
      <div className="flex items-center gap-3 bg-[var(--color-error)] text-white px-4 py-3 rounded shadow-lg">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium">{errorToast}</p>
        <button 
          onClick={clearErrorToast}
          className="ml-2 p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
