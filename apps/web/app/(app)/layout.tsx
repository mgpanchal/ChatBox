'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, Users, Bell, Shield, LogOut, User, Lock } from 'lucide-react';
import { api, session, type Me } from '../../src/api';
import { initialsOf } from '../../src/time';
import { getSocket, disconnectSocket } from '../../src/socket';
import { Logo } from '../../src/components/Logo';
import { meStore, hydrateMeStore } from '../../src/me-store';
import { conversationCache, hydrateConversationCache } from '../../src/conversation-cache';
import { conversationListStore, directoryStore, teamsStore } from '../../src/list-cache';
import { requestPersistentStorage } from '../../src/idb';

const items = [
  { href: '/chat', label: 'Chats', icon: MessageSquare, adminOnly: false },
  { href: '/people', label: 'People', icon: Users, adminOnly: false },
  { href: '/activity', label: 'Activity', icon: Bell, adminOnly: false },
  { href: '/admin', label: 'Admin', icon: Shield, adminOnly: true },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('chatbox.access')) {
      router.replace('/login');
      return;
    }

    requestPersistentStorage().catch(() => {});
    hydrateMeStore().then(() => {
      const cachedMe = meStore.get();
      if (cachedMe && !cancelled) {
        setMe(cachedMe);
        setLoaded(true);
        getSocket();
      }
    });
    hydrateConversationCache().catch(() => {});
    conversationListStore.hydration().catch(() => {});
    directoryStore.hydration().catch(() => {});
    teamsStore.hydration().catch(() => {});

    meStore.ensure()
      .then((u) => {
        if (!cancelled) {
          setMe(u);
          setLoaded(true);
          getSocket();
        }
      })
      .catch(() => {
        session.clear();
        router.replace('/login');
      });
    const unsub = meStore.subscribe((u) => {
      if (!cancelled) setMe(u);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [router]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const setTitle = (count: number) => {
      if (typeof document === 'undefined') return;
      document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ChatBox` : 'ChatBox';
    };
    const refresh = async () => {
      try {
        const convos = await api.listConversations();
        if (cancelled) return;
        const total = convos.reduce((s, c) => s + c.unread, 0);
        setTitle(total);
      } catch {}
    };
    refresh();
    const s = getSocket();
    const onSignal = () => refresh();
    s.on('message:new', onSignal);
    s.on('mention', onSignal);
    s.on('conversation:created', onSignal);
    s.on('message:deleted', onSignal);

    const interval = setInterval(refresh, 30000);
    const onVisibility = () => { if (!document.hidden) refresh(); };
    const onUnreadChange = () => refresh();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('chatbox:unread-change', onUnreadChange);

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const onIncoming = (evt: { conversationId: string; message: any }) => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (!document.hidden) return;
      if (evt.message.self) return;

      const senderName = evt.message.sender?.displayName ?? 'New message';
      const body = evt.message.redacted
        ? '🔒 Private message'
        : (evt.message.body ?? (evt.message.attachments?.length ? '📎 Attachment' : ''));
      const payload = {
        title: senderName,
        body: body || 'New message',
        icon: '/icon.svg',
        tag: evt.conversationId,
        conversationId: evt.conversationId,
      };

      try {
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'show-notification', payload });
        } else {
          const n = new Notification(payload.title, {
            body: payload.body,
            icon: payload.icon,
            tag: payload.tag,
            silent: false,
          });
          n.onclick = () => {
            window.focus();
            window.location.href = `/chat/${evt.conversationId}`;
            n.close();
          };
          setTimeout(() => n.close(), 6000);
        }
      } catch {}
    };
    s.on('message:new', onIncoming);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('chatbox:unread-change', onUnreadChange);
      s.off('message:new', onSignal);
      s.off('message:new', onIncoming);
      s.off('mention', onSignal);
      s.off('conversation:created', onSignal);
      s.off('message:deleted', onSignal);
      setTitle(0);
    };
  }, [loaded]);

  if (!loaded) {
    return <BootSplash onSignOut={() => { meStore.clear(); conversationCache.clear(); session.clear(); router.replace('/login'); }} />;
  }

  const initials = initialsOf(me?.profile?.displayName);

  return (
    <div style={styles.shell}>
      <aside style={styles.rail}>
        <div style={styles.logo}>
          <Logo size={40} />
        </div>
        <nav style={styles.nav}>
          {items.filter((it) => !it.adminOnly || me?.isAdmin).map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + '/');
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                style={{
                  ...styles.navItem,
                  background: active ? 'var(--brand-soft)' : 'transparent',
                  color: active ? 'var(--brand)' : 'var(--text-secondary)',
                }}
                title={it.label}
              >
                <Icon size={18} />
              </Link>
            );
          })}
        </nav>
        <div style={styles.bottom}>
          <button
            style={styles.navItem}
            title="Sign out"
            onClick={() => {
              disconnectSocket();
              meStore.clear();
              conversationCache.clear();
              session.clear();
              router.replace('/login');
            }}
          >
            <LogOut size={18} color="var(--text-secondary)" />
          </button>
          <Link href="/you" style={styles.avatar} title={`${me?.profile?.displayName} · ${me?.profile?.employeeId}`}>
            {me?.profile?.photoUrls?.thumb ? (
              <img src={me.profile.photoUrls.thumb} alt={initials} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <span style={styles.avatarText}>{initials}</span>
            )}
          </Link>
        </div>
      </aside>
      <div style={styles.main}>{children}</div>
    </div>
  );
}

function BootSplash({ onSignOut }: { onSignOut: () => void }) {
  // Animate fake progress so the user sees motion. Real apps key this off
  // hydration completion, but for our 3 stores it's <500ms — animation does the work.
  const [pct, setPct] = useState(8);
  useEffect(() => {
    const t = setInterval(() => {
      setPct((p) => {
        if (p >= 92) return p;
        const step = p < 60 ? 6 : p < 80 ? 3 : 1;
        return Math.min(92, p + step);
      });
    }, 120);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={splashStyles.screen}>
      <div style={splashStyles.center}>
        <div style={splashStyles.logoWrap}>
          <Logo size={64} />
        </div>
        <div style={splashStyles.title}>Loading your chats <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>[{pct}%]</span></div>
        <div style={splashStyles.barTrack}>
          <div style={{ ...splashStyles.barFill, width: `${pct}%` }} />
        </div>
        <div style={splashStyles.eMeta}>
          <Lock size={13} color="var(--text-tertiary)" />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Enterprise-grade security</span>
        </div>
      </div>
      <button style={splashStyles.logoutBtn} onClick={onSignOut}>Log out</button>
    </div>
  );
}

const splashStyles: Record<string, React.CSSProperties> = {
  screen: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: 'var(--canvas)', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 0 80px',
  },
  center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 },
  logoWrap: { opacity: 0.55 },
  title: { fontSize: 17, color: 'var(--text-primary)', fontWeight: 500 },
  barTrack: { width: 240, height: 3, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', background: 'var(--brand)', transition: 'width 0.18s ease', borderRadius: 999 },
  eMeta: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 },
  logoutBtn: {
    padding: '10px 28px', borderRadius: 999, border: '1px solid var(--border)',
    background: 'var(--card)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500,
    cursor: 'pointer',
  },
};

const styles: Record<string, React.CSSProperties> = {
  shell: { display: 'flex', height: '100vh', background: 'var(--canvas)' },
  rail: { width: 64, minWidth: 64, background: 'var(--card)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 16 },
  logo: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  nav: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, flex: 1 },
  navItem: { width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s, color 0.15s' },
  bottom: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: '50%', background: 'var(--inverse)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'var(--text-on-inverse)', fontSize: 12, fontWeight: 600 },
  main: { flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' },
};
