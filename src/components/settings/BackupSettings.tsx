import { useState } from 'react';
import { Download, Upload, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import { tauriApi } from '../../lib/tauri';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

export function BackupSettings() {
  const [exportIncludePasswords, setExportIncludePasswords] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [exportMessage, setExportMessage] = useState('');

  const [importFile, setImportFile] = useState<string | null>(null);
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importPreview, setImportPreview] = useState<{ connectionsCount: number; groupsCount: number; snippetsCount: number; settingsCount: number; hasCredentials: boolean } | null>(null);
  const [importConnections, setImportConnections] = useState(true);
  const [importSnippets, setImportSnippets] = useState(true);
  const [importSettingsFlag, setImportSettingsFlag] = useState(true);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');

  const handleExport = async () => {
    try {
      setExportStatus('idle');
      const json = await tauriApi.exportData(exportIncludePasswords, exportIncludePasswords ? exportPassphrase : undefined);

      const filePath = await save({
        defaultPath: `iris-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (!filePath) return;

      await writeTextFile(filePath, json);
      setExportStatus('success');
      setExportMessage(`Saved to ${filePath}`);
    } catch (err) {
      setExportStatus('error');
      setExportMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleFileSelect = async () => {
    try {
      const filePath = await open({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      });

      if (!filePath) return;

      const text = await readTextFile(filePath as string);
      setImportFile(text);
      setImportStatus('idle');
      setImportMessage('');

      const preview = await tauriApi.previewImport(text);
      setImportPreview(preview);
    } catch (err) {
      setImportStatus('error');
      setImportMessage(err instanceof Error ? err.message : String(err));
      setImportPreview(null);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;

    try {
      setImportStatus('idle');
      const result = await tauriApi.importData(
        importFile,
        importPreview?.hasCredentials ? importPassphrase || null : null,
        importConnections,
        importSnippets,
        importSettingsFlag,
      );
      setImportStatus('success');
      setImportMessage(result);
      setImportFile(null);
      setImportPreview(null);
    } catch (err) {
      setImportStatus('error');
      setImportMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">Export</h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          Export all connections, groups, snippets, and settings to a backup file.
        </p>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={exportIncludePasswords}
            onChange={(e) => setExportIncludePasswords(e.target.checked)}
            className="rounded"
          />
          Include passwords (encrypted with passphrase)
        </label>

        {exportIncludePasswords && (
          <div className="relative">
            <input
              type={showPassphrase ? 'text' : 'password'}
              value={exportPassphrase}
              onChange={(e) => setExportPassphrase(e.target.value)}
              placeholder="Encryption passphrase (min 4 chars)"
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 pr-10 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassphrase(!showPassphrase)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleExport}
          disabled={exportIncludePasswords && exportPassphrase.length < 4}
          className="inline-flex items-center gap-2 rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export Backup
        </button>

        {exportStatus !== 'idle' && (
          <div className={`flex items-center gap-2 text-xs ${exportStatus === 'success' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
            {exportStatus === 'success' ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {exportMessage}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--color-border)] pt-6 space-y-4">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">Import</h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          Import connections, snippets, and settings from a backup file.
        </p>

        <button
          type="button"
          onClick={handleFileSelect}
          className="inline-flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
        >
          <Upload className="h-4 w-4" />
          Select Backup File
        </button>

        {importPreview && (
          <div className="space-y-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3">
            <p className="text-xs font-medium text-[var(--color-text-primary)]">Backup contents:</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-[var(--color-text-secondary)]">
              <span>{importPreview.connectionsCount} connections</span>
              <span>{importPreview.groupsCount} groups</span>
              <span>{importPreview.snippetsCount} snippets</span>
              <span>{importPreview.settingsCount} settings</span>
            </div>
            {importPreview.hasCredentials && (
              <p className="text-xs text-[var(--color-accent)]">Contains encrypted passwords</p>
            )}

            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] cursor-pointer">
                <input type="checkbox" checked={importConnections} onChange={(e) => setImportConnections(e.target.checked)} className="rounded" />
                Import connections & groups
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] cursor-pointer">
                <input type="checkbox" checked={importSnippets} onChange={(e) => setImportSnippets(e.target.checked)} className="rounded" />
                Import snippets
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] cursor-pointer">
                <input type="checkbox" checked={importSettingsFlag} onChange={(e) => setImportSettingsFlag(e.target.checked)} className="rounded" />
                Import settings
              </label>
            </div>

            {importPreview.hasCredentials && (
              <input
                type="password"
                value={importPassphrase}
                onChange={(e) => setImportPassphrase(e.target.value)}
                placeholder="Decryption passphrase"
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            )}

            <button
              type="button"
              onClick={handleImport}
              className="inline-flex items-center gap-2 rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
          </div>
        )}

        {importStatus !== 'idle' && (
          <div className={`flex items-center gap-2 text-xs ${importStatus === 'success' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
            {importStatus === 'success' ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {importMessage}
          </div>
        )}
      </div>
    </div>
  );
}
