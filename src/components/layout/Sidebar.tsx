import { ConnectionList } from '../connections/ConnectionList';

export function Sidebar() {
  return (
    <div className="flex h-full w-full flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <div className="shrink-0 border-b border-[var(--color-border)] p-3" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <ConnectionList />
      </div>
    </div>
  );
}
