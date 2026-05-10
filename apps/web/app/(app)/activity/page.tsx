'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AtSign, Megaphone, MessageSquare } from 'lucide-react';
import { api, type ConversationListItem, type MentionItem } from '../../../src/api';
import { initialsOf, relativeTime } from '../../../src/time';
import { Avatar } from '../../../src/components/Avatar';
import { getSocket } from '../../../src/socket';
import { conversationListStore } from '../../../src/list-cache';

export default function ActivityPage() {
  const router = useRouter();
  const [convos, setConvos] = useState<ConversationListItem[] | null>(null);
  const [mentions, setMentions] = useState<MentionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    conversationListStore.refresh().then(setConvos).catch((e) => setError(e.message ?? 'Failed to load'));
    api.myMentions().then(setMentions).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    conversationListStore.hydration().then(() => {
      const c = conversationListStore.get();
      if (c && !cancelled) setConvos(c);
    });
    const unsub = conversationListStore.subscribe((c) => !cancelled && setConvos(c));
    refresh();
    const s = getSocket();
    const onNew = () => refresh();
    const onMention = () => api.myMentions().then(setMentions).catch(() => {});
    s.on('message:new', onNew);
    s.on('mention', onMention);
    return () => {
      cancelled = true;
      unsub();
      s.off('message:new', onNew);
      s.off('mention', onMention);
    };
  }, []);

  const announcements = (convos ?? []).filter((c) => c.kind === 'announcement');
  const unreadDms = (convos ?? []).filter((c) => c.kind === 'direct' && c.unread > 0);
  const unreadChannels = (convos ?? []).filter((c) => c.kind === 'channel' && c.unread > 0);
  const unreadMentions = (mentions ?? []).filter((m) => !m.acknowledgedAt);

  const openMention = async (m: MentionItem) => {
    try {
      await api.ackMention(m.id);
    } catch {}
    router.push(`/chat/${m.conversation.id}`);
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Activity</h1>
          {unreadMentions.length > 0 && <p style={styles.sub}>{unreadMentions.length} unread mention{unreadMentions.length === 1 ? '' : 's'}</p>}
        </div>
        {unreadMentions.length > 0 && (
          <button
            style={styles.markAll}
            onClick={async () => {
              await api.ackAllMentions();
              await refresh();
            }}
          >
            Mark all read
          </button>
        )}
      </header>

      {error && <div style={styles.error}>{error}</div>}
      {!convos && <div style={styles.muted}>Loading…</div>}

      {convos && (
        <>
          <Section title="Mentions" icon={AtSign}>
            {(mentions ?? []).length === 0 && <div style={styles.muted}>No mentions yet.</div>}
            {(mentions ?? []).map((m, i, arr) => (
              <button
                key={m.id}
                onClick={() => openMention(m)}
                style={{
                  ...styles.row,
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  background: m.acknowledgedAt ? 'transparent' : 'var(--brand-soft)',
                }}
              >
                <Avatar initials={initialsOf(m.message.senderName)} photoUrls={m.message.senderPhotoUrls ?? null} />
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={styles.rowTitle}>
                    {m.message.senderName} · <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{m.conversation.title ?? 'DM'}</span>
                  </div>
                  <div style={styles.rowSub}>{m.message.deleted ? 'This message was deleted' : m.message.body}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={styles.time}>{relativeTime(m.message.createdAt)}</span>
                  {!m.acknowledgedAt && <span style={styles.unread}>NEW</span>}
                </div>
              </button>
            ))}
          </Section>

          <Section title="Announcements" icon={Megaphone}>
            {announcements.length === 0 && <div style={styles.muted}>No announcement channels.</div>}
            {announcements.map((c) => (
              <ConvoRow key={c.id} convo={c} />
            ))}
          </Section>

          <Section title="Unread DMs & channels" icon={MessageSquare}>
            {unreadDms.length === 0 && unreadChannels.length === 0 && <div style={styles.muted}>You're all caught up.</div>}
            {[...unreadDms, ...unreadChannels].map((c) => (
              <ConvoRow key={c.id} convo={c} />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <Icon size={14} color="var(--text-secondary)" />
        <span style={styles.sectionTitle}>{title}</span>
      </div>
      <div style={styles.card}>{children}</div>
    </section>
  );
}

function ConvoRow({ convo }: { convo: ConversationListItem }) {
  const initials = initialsOf(convo.title ?? '');
  const sub = convo.lastMessage
    ? convo.lastMessage.self
      ? `You: ${convo.lastMessage.body}`
      : `${convo.lastMessage.senderName}: ${convo.lastMessage.body}`
    : 'No messages yet';
  return (
    <Link href={`/chat/${convo.id}`} replace style={styles.row}>
      <Avatar initials={initials} tone={convo.kind === 'announcement' ? 'inverse' : 'default'} photoUrls={convo.otherPhotoUrls ?? null} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.rowTitle}>{convo.title ?? 'Untitled'}</div>
        <div style={styles.rowSub}>{sub}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span style={styles.time}>{convo.lastMessage ? relativeTime(convo.lastMessage.createdAt) : ''}</span>
        {convo.unread > 0 && <span style={styles.unread}>{convo.unread}</span>}
      </div>
    </Link>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 720, width: '100%', margin: '0 auto', padding: 24, overflowY: 'auto' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 700, letterSpacing: -0.4 },
  sub: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 },
  markAll: { fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer' },
  error: { padding: 12, background: '#FEE4E2', color: 'var(--danger)', fontSize: 13, borderRadius: 10, marginBottom: 12 },
  muted: { padding: 16, color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' },
  section: { marginBottom: 24 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: 600, letterSpacing: 1.2, color: 'var(--text-tertiary)', textTransform: 'uppercase' },
  card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' },
  row: { width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' },
  rowTitle: { fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowSub: { fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 },
  time: { fontSize: 11, color: 'var(--text-tertiary)' },
  unread: { minWidth: 18, height: 18, padding: '0 6px', borderRadius: 9, background: 'var(--inverse)', color: 'var(--text-on-inverse)', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
};
