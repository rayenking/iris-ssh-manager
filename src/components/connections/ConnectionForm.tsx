import { useState, FormEvent, useEffect } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { Connection, AuthMethod, CreateConnectionInput, UpdateConnectionInput } from '../../types/connection';
import { useConnectionStore } from '../../stores/connectionStore';
import { tauriApi } from '../../lib/tauri';

interface Props {
  connection?: Connection | null;
  onClose: () => void;
}

export function ConnectionForm({ connection, onClose }: Props) {
  const { createConnection, updateConnection, groups } = useConnectionStore();
  const [hasKeychainCredential, setHasKeychainCredential] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    hostname: '',
    port: '22',
    username: 'root',
    authMethod: 'password' as AuthMethod,
    password: '',
    privateKeyPath: '',
    groupId: '',
    colorTag: '',
    startupCommand: ''
  });

  useEffect(() => {
    if (connection) {
      setFormData({
        name: connection.name,
        hostname: connection.hostname,
        port: connection.port.toString(),
        username: connection.username,
        authMethod: connection.authMethod,
        password: '',
        privateKeyPath: connection.privateKeyPath || '',
        groupId: connection.groupId || '',
        colorTag: connection.colorTag || '',
        startupCommand: connection.startupCommand || ''
      });
      tauriApi.hasCredential(connection.id).then(setHasKeychainCredential).catch(() => {});
    }
  }, [connection]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.hostname || !formData.username) return;

    const { password, ...rest } = formData;
    const data = {
      ...rest,
      port: parseInt(formData.port, 10) || 22,
      groupId: formData.groupId || undefined,
      privateKeyPath: formData.privateKeyPath || undefined,
      colorTag: formData.colorTag || undefined,
      startupCommand: formData.startupCommand || undefined,
    };

    try {
      let savedId: string;
      if (connection) {
        await updateConnection(connection.id, data as UpdateConnectionInput);
        savedId = connection.id;
      } else {
        const created = await createConnection(data as CreateConnectionInput);
        savedId = created.id;
      }
      if (formData.authMethod === 'password' && password) {
        await tauriApi.storeCredential(savedId, password);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save connection', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] shrink-0">
          <h2 className="text-lg font-medium text-[var(--color-text-primary)]">
            {connection ? 'Edit Connection' : 'New Connection'}
          </h2>
          <button onClick={onClose} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col overflow-y-auto">
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Name *</label>
              <input 
                autoFocus
                required
                type="text" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]" 
              />
            </div>
            
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Hostname *</label>
                <input 
                  required
                  type="text" 
                  value={formData.hostname} 
                  onChange={e => setFormData({...formData, hostname: e.target.value})}
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]" 
                />
              </div>
              <div className="w-24">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Port</label>
                <input 
                  type="number" 
                  value={formData.port} 
                  onChange={e => setFormData({...formData, port: e.target.value})}
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]" 
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Username *</label>
              <input 
                required
                type="text" 
                value={formData.username} 
                onChange={e => setFormData({...formData, username: e.target.value})}
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]" 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Authentication Method</label>
              <select 
                value={formData.authMethod} 
                onChange={e => setFormData({...formData, authMethod: e.target.value as AuthMethod})}
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="password">Password</option>
                <option value="publicKey">Public Key</option>
                <option value="agent">SSH Agent</option>
              </select>
            </div>

            {formData.authMethod === 'password' && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Password</label>
                <input 
                  type="password" 
                  placeholder={hasKeychainCredential ? '••••••••' : 'Enter password'}
                  value={formData.password} 
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]" 
                />
                {hasKeychainCredential && !formData.password && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-[var(--color-text-muted)]">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Saved in keychain</span>
                  </div>
                )}
              </div>
            )}

            {formData.authMethod === 'publicKey' && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Private Key Path</label>
                <input 
                  type="text" 
                  placeholder="~/.ssh/id_rsa"
                  value={formData.privateKeyPath} 
                  onChange={e => setFormData({...formData, privateKeyPath: e.target.value})}
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]" 
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Group</label>
              <select 
                value={formData.groupId} 
                onChange={e => setFormData({...formData, groupId: e.target.value})}
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">None</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Color Tag</label>
                <input 
                  type="text" 
                  placeholder="#ff0000 or var(--color-accent)"
                  value={formData.colorTag} 
                  onChange={e => setFormData({...formData, colorTag: e.target.value})}
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]" 
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Startup Command</label>
              <input 
                type="text" 
                placeholder="e.g., cd /var/www && ls"
                value={formData.startupCommand} 
                onChange={e => setFormData({...formData, startupCommand: e.target.value})}
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]" 
              />
            </div>
          </div>
          
          <div className="p-4 border-t border-[var(--color-border)] flex justify-end gap-3 shrink-0">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] hover:opacity-90 rounded transition-opacity"
            >
              {connection ? 'Save Changes' : 'Create Connection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
