'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MessageCircle } from 'lucide-react';
import { api, type DirectoryUser } from '../../../src/api';
import { Avatar } from '../../../src/components/Avatar';
import { initialsOf } from '../../../src/time';
import { getSocket, type PresenceEvent } from '../../../src/socket';
import { directoryStore } from '../../../src/list-cache';

export default function PeoplePage() {
  const router = useRouter();
  const [people, setPeople] = useState<DirectoryUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    directoryStore.hydration().then(() => {
      const cached = directoryStore.get();
      if (cached && !cancelled) setPeople(cached);
    });
    const unsub = directoryStore.subscribe((u) => !cancelled && setPeople(u));
    directoryStore.ensure().catch((e) => !cancelled && !directoryStore.get() && setError(e.message ?? 'Failed to load'));

    const s = getSocket();
    const onPresence = (evt: PresenceEvent) => {
      setPeople((prev) => prev?.map((p) => (p.id === evt.userId ? { ...p, online: evt.online, lastSeenAt: evt.lastSeenAt ?? p.lastSeenAt } : p)) ?? prev);
    };
    s.on('presence', onPresence);
    return () => {
      cancelled = true;
      unsub();
      s.off('presence', onPresence);
    };
  }, []);

  const departments = ['All', ...Array.from(new Set((people ?? []).map((p) => p.department).filter(Boolean) as string[]))];
  const filtered = (people ?? [])
    .filter((p) => filter === 'All' || p.department === filter)
    .filter((p) =>
      !search ||
      p.displayName.toLowerCase().includes(search.toLowerCase()) ||
      p.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      (p.department ?? '').toLowerCase().includes(search.toLowerCase()),
    );

  const startDm = async (userId: string) => {
    setBusyId(userId);
    try {
      const r = await api.createDirect(userId);
      router.push(`/chat/${r.id}`);
    } catch (e: any) {
      setError(e.message ?? 'Failed to open DM');
      setBusyId(null);
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>People</h1>
        <p style={styles.sub}>{people?.length ?? '…'} employees · invite-only</p>
      </header>

      <div style={styles.searchWrap}>
        <Search size={14} color="var(--text-tertiary)" />
        <input
          style={styles.search}
          placeholder="Search by name, ID, or department"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div style={styles.chips}>
        {departments.map((d) => (
          <button
            key={d}
            onClick={() => setFilter(d)}
            style={{
              ...styles.chip,
              background: filter === d ? 'var(--inverse)' : 'var(--card)',
              color: filter === d ? 'var(--text-on-inverse)' : 'var(--text-secondary)',
              borderColor: filter === d ? 'var(--inverse)' : 'var(--border)',
            }}
          >
            {d}
          </button>
        ))}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.list}>
        {!people && <div style={styles.muted}>Loading…</div>}
        {filtered.length === 0 && people && <div style={styles.muted}>No matches.</div>}
        {filtered.map((p, i) => (
          <button
            key={p.id}
            disabled={busyId === p.id}
            onClick={() => startDm(p.id)}
            style={{ ...styles.row, borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            <div style={{ position: 'relative' }}>
              <Avatar initials={initialsOf(p.displayName)} photoUrls={p.photoUrls ?? null} />
              {p.online && <span style={styles.onlineDot} />}
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={styles.name}>{p.displayName}</div>
              <div style={styles.meta}>
                {p.title ?? '—'}{p.department ? ` · ${p.department}` : ''}
              </div>
            </div>
            <MessageCircle size={18} color="var(--text-secondary)" />
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxWidth: 720, width: '100%', margin: '0 auto', padding: '24px' },
  header: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 700, letterSpacing: -0.4 },
  sub: { fontSize: 13, color: 'var(--text-secondary)' },
  searchWrap: { height: 40, borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', marginBottom: 12 },
  search: { flex: 1, fontSize: 14 },
  chips: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  chip: { padding: '6px 12px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: 13, fontWeight: 500 },
  list: { background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', flex: 1, overflowY: 'auto' },
  muted: { padding: 20, color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' },
  error: { padding: 12, background: '#FEE4E2', color: 'var(--danger)', fontSize: 13, borderRadius: 10, marginBottom: 12 },
  row: { width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'transparent' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#12B76A', border: '2px solid var(--card)' },
  name: { fontSize: 15, fontWeight: 600 },
  meta: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
};
