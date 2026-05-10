'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Search, Edit3, Lock, Bookmark, BellOff } from 'lucide-react';
import { api, type ConversationListItem, type SearchResult } from '../../../src/api';
import { Avatar } from '../../../src/components/Avatar';
import { initialsOf, relativeTime } from '../../../src/time';
import { getSocket, type PresenceEvent } from '../../../src/socket';
import { conversationCache, hydrateConversationCache } from '../../../src/conversation-cache';
import { conversationListStore } from '../../../src/list-cache';

const sections: { title: string; filter: (c: ConversationListItem) => boolean }[] = [
  { title: 'PINNED', filter: (c) => c.pinned },
  { title: 'CHANNELS', filter: (c) => c.kind === 'channel' && !c.pinned },
  { title: 'ANNOUNCEMENTS', filter: (c) => c.kind === 'announcement' && !c.pinned },
  { title: 'DIRECT MESSAGES', filter: (c) => c.kind === 'direct' && !c.pinned },
];

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const activeId = params?.id;
  const [items, setItems] = useState<ConversationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const applyList = (r: ConversationListItem[]) => {
      if (cancelled) return;
      setItems(r);
      const next: Record<string, boolean> = {};
      for (const c of r) if (c.otherUserId) next[c.otherUserId] = !!c.otherOnline;
      setPresence(next);
    };
    hydrateConversationCache().catch(() => {});
    conversationListStore.hydration().then(() => {
      const cached = conversationListStore.get();
      if (cached) applyList(cached);
    });
    const unsubList = conversationListStore.subscribe(applyList);
    const load = () =>
      conversationListStore
        .refresh()
        .then((r) => {
          if (cancelled) return;
          for (const c of r.slice(0, 12)) {
            conversationCache.prefetch(c.id).catch(() => {});
          }
        })
        .catch((e) => !cancelled && setError(e.message ?? 'Failed to load conversations'));

    load();

    const s = getSocket();
    const onNew = (evt: { conversationId: string; message: any }) => {
      const prev = conversationListStore.get();
      if (!prev) return;
      const idx = prev.findIndex((c) => c.id === evt.conversationId);
      if (idx === -1) {
        load();
        return;
      }
      const updated = [...prev];
      const me = updated[idx]!;
      updated[idx] = {
        ...me,
        unread: me.id === activeId ? 0 : me.unread + 1,
        lastMessage: {
          id: evt.message.id,
          body: evt.message.body ?? '',
          createdAt: evt.message.createdAt,
          senderName: evt.message.sender?.displayName ?? 'Unknown',
          self: false,
        },
        updatedAt: evt.message.createdAt,
      };
      conversationListStore.set(updated);
    };
    const onPresence = (evt: PresenceEvent) => {
      setPresence((prev) => ({ ...prev, [evt.userId]: evt.online }));
    };
    const onCreated = () => load();
    s.on('message:new', onNew);
    s.on('presence', onPresence);
    s.on('conversation:created', onCreated);
    return () => {
      cancelled = true;
      unsubList();
      s.off('message:new', onNew);
      s.off('presence', onPresence);
      s.off('conversation:created', onCreated);
    };
  }, [activeId]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(() => {
      api.globalSearch(q).then((r) => setSearchResults(r.results)).catch(() => setSearchResults(null));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <>
      <aside style={styles.sidebar}>
        <div style={styles.header}>
          <h1 style={styles.title}>Chats</h1>
          <div style={styles.headerActions}>
            <button style={styles.iconBtn} title="New chat" onClick={() => router.push('/people')}><Edit3 size={16} /></button>
          </div>
        </div>

        <div style={styles.searchWrap}>
          <Search size={14} color="var(--text-tertiary)" />
          <input
            style={styles.searchInput}
            placeholder="Search messages and chats"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={styles.list}>
          {searchResults !== null ? (
            <div style={{ marginBottom: 12 }}>
              <div style={styles.sectionLabel}>SEARCH RESULTS · {searchResults.length}</div>
              {searchResults.length === 0 && <div style={styles.muted}>No matches.</div>}
              {searchResults.map((r) => (
                <Link key={r.id} href={`/chat/${r.conversation.id}`} replace style={styles.row} onClick={() => setSearch('')}>
                  <Avatar initials={initialsOf(r.conversation.title ?? r.sender.displayName)} photoUrls={r.sender.photoUrls ?? null} />
                  <div style={styles.rowBody}>
                    <div style={styles.rowTop}>
                      <span style={styles.rowTitle}>{r.conversation.title ?? r.sender.displayName}</span>
                      <span style={styles.rowTime}>{relativeTime(r.createdAt)}</span>
                    </div>
                    <div style={styles.rowBottom}>
                      <span style={styles.rowPreview}>{r.sender.displayName}: {r.body}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <>
              {!items && !error && <div style={styles.muted}>Loading…</div>}
              {error && <div style={{ ...styles.muted, color: 'var(--danger)' }}>{error}</div>}
              {items && items.length === 0 && <div style={styles.muted}>No conversations yet.</div>}

              {items &&
                sections.map((section) => {
                  const filtered = items.filter(section.filter);
                  if (!filtered.length) return null;
                  return (
                    <div key={section.title} style={{ marginBottom: 12 }}>
                      <div style={styles.sectionLabel}>{section.title}</div>
                      {filtered.map((c) => (
                        <Row key={c.id} convo={c} active={c.id === activeId} online={c.otherUserId ? presence[c.otherUserId] ?? false : false} />
                      ))}
                    </div>
                  );
                })}
            </>
          )}
        </div>
      </aside>
      <section style={styles.main}>{children}</section>
    </>
  );
}

function Row({ convo, active, online }: { convo: ConversationListItem; active: boolean; online: boolean }) {
  const isConfidential = convo.sensitivity === 'confidential' || convo.sensitivity === 'restricted';
  const initials = initialsOf(convo.title ?? '');
  const preview = convo.lastMessage
    ? convo.lastMessage.self
      ? `You: ${convo.lastMessage.body}`
      : convo.kind === 'direct'
        ? convo.lastMessage.body
        : `${convo.lastMessage.senderName.split(' ')[0]}: ${convo.lastMessage.body}`
    : 'No messages yet';
  const time = convo.lastMessage ? relativeTime(convo.lastMessage.createdAt) : relativeTime(convo.updatedAt);

  return (
    <Link
      href={`/chat/${convo.id}`}
      replace
      style={{ ...styles.row, background: active ? 'var(--bubble-other)' : 'transparent' }}
      onMouseEnter={() => conversationCache.prefetch(convo.id).catch(() => {})}
      onFocus={() => conversationCache.prefetch(convo.id).catch(() => {})}
    >
      <Avatar
        initials={initials}
        tone={convo.kind === 'announcement' ? 'inverse' : 'default'}
        photoUrls={convo.otherPhotoUrls ?? null}
        online={convo.kind === 'direct' && online}
      />
      <div style={styles.rowBody}>
        <div style={styles.rowTop}>
          <div style={styles.rowTitleWrap}>
            <span style={styles.rowTitle}>{convo.title ?? 'Untitled'}</span>
            {isConfidential && <Lock size={11} color="var(--confidential)" />}
            {convo.pinned && <Bookmark size={11} color="var(--text-tertiary)" />}
            {convo.muted && <BellOff size={11} color="var(--text-tertiary)" />}
          </div>
          <span style={styles.rowTime}>{time}</span>
        </div>
        <div style={styles.rowBottom}>
          <span style={styles.rowPreview}>{preview}</span>
          {convo.unread > 0 && <span style={styles.unread}>{convo.unread}</span>}
        </div>
      </div>
    </Link>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: { width: 320, minWidth: 320, background: 'var(--card)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: '20px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: 700, letterSpacing: -0.3 },
  headerActions: { display: 'flex', gap: 6 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' },
  searchWrap: { margin: '0 16px 12px', height: 36, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' },
  searchInput: { flex: 1, fontSize: 13 },
  list: { flex: 1, overflowY: 'auto', padding: '0 8px 16px' },
  muted: { padding: '20px', color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' },
  sectionLabel: { fontSize: 10, fontWeight: 600, letterSpacing: 1.2, color: 'var(--text-tertiary)', padding: '12px 12px 6px' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, transition: 'background 0.12s' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#12B76A', border: '2px solid var(--card)' },
  rowBody: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  rowTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  rowTitleWrap: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexShrink: 1 },
  rowTitle: { fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowTime: { fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 },
  rowBottom: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  rowPreview: { fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  unread: { minWidth: 18, height: 18, padding: '0 6px', borderRadius: 9, background: 'var(--inverse)', color: 'var(--text-on-inverse)', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--canvas)', position: 'relative' },
};
