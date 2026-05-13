type KeybindingHandler = () => void;

interface KeybindingRegistry {
  [action: string]: {
    combo: string;
    handler?: KeybindingHandler;
  };
}

const defaultRegistry: KeybindingRegistry = {
  'command-palette': { combo: 'Ctrl+k' },
  'new-connection': { combo: 'Ctrl+n' },
  'close-tab': { combo: 'Ctrl+w' },
  'open-settings': { combo: 'Ctrl+,' },
  'toggle-snippets': { combo: 'Ctrl+Shift+s' },
  'toggle-explorer': { combo: 'Ctrl+Shift+e' },
  'open-import-config': { combo: 'Ctrl+Shift+i' },
  'open-sftp': { combo: 'Ctrl+Shift+f' },
  'local-terminal': { combo: 'Ctrl+Shift+t' },
};

const registry: KeybindingRegistry = {
  ...defaultRegistry,
};

const handlers = new Map<string, KeybindingHandler>();

export function registerShortcut(action: string, handler: KeybindingHandler) {
  handlers.set(action, handler);
}

export function unregisterShortcut(action: string) {
  handlers.delete(action);
}

export function updateShortcutCombo(action: string, combo: string) {
  if (registry[action]) {
    registry[action].combo = combo;
  } else {
    registry[action] = { combo };
  }
}

export function getDefaultBindings(): Record<string, string> {
  const bindings: Record<string, string> = {};
  for (const [action, data] of Object.entries(defaultRegistry)) {
    bindings[action] = data.combo;
  }
  return bindings;
}

export function getCurrentBindings(): Record<string, string> {
  const bindings: Record<string, string> = {};
  for (const [action, data] of Object.entries(registry)) {
    bindings[action] = data.combo;
  }
  return bindings;
}

export function getRegisteredActions(): string[] {
  return Object.keys(defaultRegistry);
}

export function resetShortcutCombo(action: string) {
  const combo = defaultRegistry[action]?.combo;

  if (!combo) {
    return;
  }

  updateShortcutCombo(action, combo);
}

export function resetAllShortcutCombos() {
  for (const [action, data] of Object.entries(defaultRegistry)) {
    updateShortcutCombo(action, data.combo);
  }
}

function parseCombo(combo: string) {
  const parts = combo.toLowerCase().split('+');
  return {
    ctrl: parts.includes('ctrl') || parts.includes('cmd'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts[parts.length - 1],
  };
}

export function initGlobalKeybindings(customBindings: Record<string, string>) {
  for (const [action, combo] of Object.entries(customBindings)) {
    updateShortcutCombo(action, combo);
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      if (e.key.toLowerCase() !== 'k' || (!e.ctrlKey && !e.metaKey)) {
        return;
      }
    }

    const key = e.key.toLowerCase();
    const isCtrlCmd = e.ctrlKey || e.metaKey;

    for (const [action, data] of Object.entries(registry)) {
      const parsed = parseCombo(data.combo);
      
      const matchCtrl = parsed.ctrl ? isCtrlCmd : !isCtrlCmd;
      const matchShift = parsed.shift ? e.shiftKey : !e.shiftKey;
      const matchAlt = parsed.alt ? e.altKey : !e.altKey;
      const matchKey = parsed.key === key;

      if (matchCtrl && matchShift && matchAlt && matchKey) {
        const handler = handlers.get(action);
        if (handler) {
          e.preventDefault();
          handler();
        }
        break;
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}
