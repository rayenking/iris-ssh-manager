import { useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { ConnectionCard } from './ConnectionCard';
import { GroupFolder } from './GroupFolder';

export function ConnectionList() {
  const { connections, groups, fetchConnections, fetchGroups, searchQuery } = useConnectionStore();

  useEffect(() => {
    fetchConnections();
    fetchGroups();
  }, [fetchConnections, fetchGroups]);

  const filteredConnections = connections.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || 
           c.hostname.toLowerCase().includes(q) ||
           c.username.toLowerCase().includes(q);
  });

  const ungrouped = filteredConnections.filter(c => !c.groupId);
  const grouped = groups.map(g => ({
    group: g,
    connections: filteredConnections.filter(c => c.groupId === g.id)
  })).filter(g => g.connections.length > 0 || !searchQuery);

  if (filteredConnections.length === 0 && groups.length === 0) {
    return (
      <div className="text-[var(--color-text-muted)] text-sm p-4 text-center mt-4">
        {searchQuery ? 'No matching connections' : 'No connections found'}
      </div>
    );
  }

  return (
    <div className="py-2 overflow-y-auto">
      {ungrouped.map(c => (
        <ConnectionCard key={c.id} connection={c} />
      ))}
      {grouped.map(g => (
        <GroupFolder key={g.group.id} group={g.group} count={g.connections.length}>
          {g.connections.map(c => (
            <ConnectionCard key={c.id} connection={c} />
          ))}
        </GroupFolder>
      ))}
    </div>
  );
}
