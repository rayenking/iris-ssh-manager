export function ConnectionsSettings() {
  return (
    <div className="space-y-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
      <h3 className="text-base font-medium text-[var(--color-text-primary)]">Connections</h3>
      <p className="text-sm text-[var(--color-text-muted)]">
        Connection management remains in the existing editor flow. Settings page access is reserved for shell-wide preferences.
      </p>
    </div>
  );
}
