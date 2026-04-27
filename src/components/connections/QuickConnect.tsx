import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Zap } from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { tauriApi } from '../../lib/tauri';

export function QuickConnect() {
  const [input, setInput] = useState('');
  const { openTab } = useTerminalStore();
  const { fetchConnections } = useConnectionStore();

  const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      const match = input.trim().match(/^(?:(\w+)@)?([^:]+)(?::(\d+))?$/);
      if (match) {
        const username = match[1] || 'root';
        const hostname = match[2];
        const port = match[3] ? parseInt(match[3], 10) : 22;

        try {
          const tempConn = await tauriApi.createConnection({
            name: `Quick: ${hostname}`,
            hostname,
            username,
            port,
            authMethod: 'password',
          });
          await fetchConnections();
          openTab(tempConn.id, tempConn.name);
          setInput('');
        } catch (err) {
          console.error('Quick connect failed', err);
        }
      }
    }
  };

  return (
    <div className="p-2 border-b border-[var(--color-border)] shrink-0">
      <div className="relative flex items-center">
        <Zap className="absolute left-2 w-4 h-4 text-[var(--color-text-muted)]" />
        <input 
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="user@host:port"
          className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-sm rounded pl-8 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] placeholder-[var(--color-text-muted)]"
        />
      </div>
    </div>
  );
}
