import { useState, useEffect, useRef } from 'react';
import { Connection } from '../../types/connection';
import { useTerminalStore } from '../../stores/terminalStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { tauriApi } from '../../lib/tauri';
import { Copy, Edit, Trash2 } from 'lucide-react';

interface Props {
  connection: Connection;
}

export function ConnectionCard({ connection }: Props) {
  const { openTab } = useTerminalStore();
  const { selectedId, setSelected, fetchConnections, deleteConnection } = useConnectionStore();
  const isSelected = selectedId === connection.id;
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleDoubleClick = () => {
    openTab(connection.id, connection.name);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setContextMenu(null);
    window.dispatchEvent(new CustomEvent('open-connection-form', { detail: { connection } }));
  };

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setContextMenu(null);
    try {
      await tauriApi.duplicateConnection(connection.id);
      await fetchConnections();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setContextMenu(null);
    if (window.confirm(`Are you sure you want to delete ${connection.name}?`)) {
      await deleteConnection(connection.id);
    }
  };

  const statusColor = 'var(--color-text-muted)';

  return (
    <>
      <div 
        onClick={() => setSelected(connection.id)}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className={`relative flex items-center p-2 mx-2 my-1 cursor-pointer rounded transition-colors ${
          isSelected ? 'bg-[var(--color-hover)]' : 'hover:bg-[var(--color-bg-tertiary)]'
        }`}
      >
        {connection.colorTag && (
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/4 rounded-r" 
            style={{ backgroundColor: connection.colorTag }}
          />
        )}
        <div className="w-2 h-2 rounded-full mx-3 shrink-0" style={{ backgroundColor: statusColor }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
            {connection.name}
          </div>
          <div className="text-xs text-[var(--color-text-muted)] truncate flex justify-between">
            <span>{connection.username}@{connection.hostname}:{connection.port}</span>
            {connection.lastConnectedAt && <span>Last: {new Date(connection.lastConnectedAt).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>
      
      {contextMenu && (
        <div 
          ref={menuRef}
          className="fixed z-50 w-48 py-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={handleEdit} className="w-full px-4 py-2 text-sm text-left flex items-center text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]">
            <Edit className="w-4 h-4 mr-2" /> Edit
          </button>
          <button onClick={handleDuplicate} className="w-full px-4 py-2 text-sm text-left flex items-center text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]">
            <Copy className="w-4 h-4 mr-2" /> Duplicate
          </button>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button onClick={handleDelete} className="w-full px-4 py-2 text-sm text-left flex items-center text-[var(--color-error)] hover:bg-[var(--color-hover)]">
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </button>
        </div>
      )}
    </>
  );
}
