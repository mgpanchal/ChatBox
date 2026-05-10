'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { ArrowUp, Paperclip, MoreHorizontal, Lock, Smile, CornerUpLeft, CornerUpRight, Pencil, Trash2, X, SmilePlus, Check, Users as UsersIcon, LogOut as LeaveIcon, Search as SearchIcon, FileIcon, Download, EyeOff, ChevronDown, Bell, BellOff, Info } from 'lucide-react';
import { api, type AttachmentItem, type ConversationDetail, type ConversationListItem, type ConversationMember, type DirectoryUser, type MessageItem, type SearchResult, type Team, type UploadResponse } from '../../../../src/api';
import { Avatar } from '../../../../src/components/Avatar';
import { SensitivityBadge } from '../../../../src/components/SensitivityBadge';
import { Watermark } from '../../../../src/components/Watermark';
import { MessageTicks, statusOf } from '../../../../src/components/MessageTicks';
import { clockTime, dateKey, dateSeparatorLabel, initialsOf } from '../../../../src/time';
import { getSocket, type ReceiptEvent, type PresenceEvent, type TypingEvent } from '../../../../src/socket';
import { conversationCache } from '../../../../src/conversation-cache';
import { teamsStore, conversationListStore } from '../../../../src/list-cache';
import { meStore } from '../../../../src/me-store';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const EDIT_WINDOW_MIN = 15;

type CachedMe = { id: string; employeeId: string | null; initials: string };
function deriveCachedMe(u: { id: string; profile?: { employeeId?: string | null; displayName?: string | null } | null } | null): CachedMe | null {
  if (!u) return null;
  return {
    id: u.id,
    employeeId: u.profile?.employeeId ?? null,
    initials: initialsOf(u.profile?.displayName),
  };
}

export default function Conversation() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [meta, setMeta] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessageItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [me, setMe] = useState<{ id: string; employeeId: string | null; initials: string } | null>(null);
  const [presence, setPresence] = useState<Record<string, { online: boolean; lastSeenAt?: string | null }>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [showMembers, setShowMembers] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ url: string; fileName: string } | null>(null);
  const [forwardSource, setForwardSource] = useState<MessageItem | null>(null);
  const [receiptInspect, setReceiptInspect] = useState<MessageItem | null>(null);
  const [receiptMembers, setReceiptMembers] = useState<ConversationMember[] | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<UploadResponse[]>([]);
  const [uploading, setUploading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [isPinnedAtBottom, setIsPinnedAtBottom] = useState(true);
  const [unreadWhilePinnedUp, setUnreadWhilePinnedUp] = useState(0);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const pinnedRef = useRef(true);
  const loadOlderInflightRef = useRef(false);

  // Hide the conversation id from the URL bar — /chat/<uuid> never appears in
  // history, bookmarks, or screen-share captures.
  useEffect(() => {
    if (typeof window === 'undefined' || !id) return;
    if (window.location.pathname !== '/chat') {
      window.history.replaceState({ chatId: id }, '', '/chat');
    }
  }, [id]);

  const markRead = useCallback(
    (lastMessageId: string | undefined) => {
      if (!lastMessageId || !id) return;
      getSocket().emit('conversation:read', { conversationId: id, upToMessageId: lastMessageId });
    },
    [id],
  );

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    setLoadError(null);
    setSendError(null);
    setReplyTo(null);
    setEditingId(null);

    const cached = conversationCache.get(id);
    if (cached) {
      setMeta(cached.meta);
      setMessages(cached.messages);
      setHasMore(cached.pagination.hasMore);
      setOlderError(cached.pagination.failureCount >= 3);
      const initialPres: typeof presence = {};
      for (const mem of cached.meta.members) {
        initialPres[mem.userId] = { online: mem.online, lastSeenAt: mem.lastSeenAt };
      }
      setPresence(initialPres);
    } else {
      setMeta(null);
      setMessages(null);
      setHasMore(true);
      setOlderError(false);
    }
    setIsPinnedAtBottom(true);
    pinnedRef.current = true;
    setUnreadWhilePinnedUp(0);
    const cachedMe = deriveCachedMe(meStore.get());
    if (cachedMe) setMe(cachedMe);

    const hadCache = !!cached;

    // Reflect muted state from the conversation list cache.
    const list = conversationListStore.get();
    const fromList = list?.find((c) => c.id === id);
    setIsMuted(!!fromList?.muted);

    teamsStore.hydration().then(() => {
      const t = teamsStore.get();
      if (t) setTeams(t);
    });
    teamsStore.ensure().then(setTeams).catch(() => {});
    const mePromise: Promise<CachedMe> = (async () => {
      const u = await meStore.ensure();
      return deriveCachedMe(u)!;
    })();

    Promise.all([conversationCache.prefetch(id), mePromise])
      .then(([entry, who]) => {
        if (cancelled) return;
        const m = entry.meta;
        const msgs = entry.messages;
        setMeta(m);
        setMessages(msgs);
        setHasMore(entry.pagination.hasMore);
        setMe(who);
        const initialPres: typeof presence = {};
        for (const mem of m.members) {
          initialPres[mem.userId] = { online: mem.online, lastSeenAt: mem.lastSeenAt };
        }
        setPresence(initialPres);

        const last = msgs[msgs.length - 1];
        if (last && !last.self) markRead(last.id);

        for (const msg of msgs) {
          if (!msg.self && !msg.receipts.find((r) => r.userId === who.id && r.deliveredAt)) {
            getSocket().emit('message:delivered', { messageId: msg.id });
          }
        }
      })
      .catch((e) => {
        if (!cancelled && !hadCache) setLoadError(e.message ?? 'Failed to load');
      });

    const unsubCache = conversationCache.subscribe((cid, entry) => {
      if (cid !== id || cancelled) return;
      setHasMore(entry.pagination.hasMore);
      setOlderError(entry.pagination.failureCount >= 3);
    });
    return () => {
      cancelled = true;
      unsubCache();
    };
  }, [id, markRead]);

  // Mirror local state changes back into the cache. Don't reset pagination —
  // updateMessages preserves hasMore/oldestLoadedAt; only fresh fetches set them.
  useEffect(() => {
    if (!id || !meta || !messages) return;
    const entry = conversationCache.get(id);
    if (!entry) {
      // First write: seed with full state.
      conversationCache.set(id, meta, messages, hasMore);
      return;
    }
    if (entry.messages !== messages || entry.meta !== meta) {
      conversationCache.updateMessages(id, () => messages);
    }
  }, [id, meta, messages, hasMore]);

  useEffect(() => {
    const s = getSocket();

    const onNew = (evt: { conversationId: string; message: MessageItem }) => {
      if (evt.conversationId !== id) return;
      setMessages((prev) => {
        if (!prev) return prev;
        if (prev.some((m) => m.id === evt.message.id)) return prev;
        return [...prev, { ...evt.message, self: false }];
      });
      s.emit('message:delivered', { messageId: evt.message.id });
      if (pinnedRef.current) {
        markRead(evt.message.id);
      } else {
        setUnreadWhilePinnedUp((n) => n + 1);
      }
    };

    const onReceipt = (evt: ReceiptEvent) => {
      if (evt.conversationId !== id) return;
      setMessages((prev) =>
        prev?.map((m) => {
          if (m.id !== evt.messageId) return m;
          const others = m.receipts.filter((r) => r.userId !== evt.userId);
          return { ...m, receipts: [...others, { userId: evt.userId, deliveredAt: evt.deliveredAt, readAt: evt.readAt }] };
        }) ?? prev,
      );
    };

    const onReaction = (evt: { conversationId: string; messageId: string; userId: string; emoji: string; action: 'added' | 'removed' }) => {
      if (evt.conversationId !== id) return;
      setMessages((prev) =>
        prev?.map((m) => {
          if (m.id !== evt.messageId) return m;
          if (evt.action === 'added') {
            if (m.reactions.some((r) => r.userId === evt.userId && r.emoji === evt.emoji)) return m;
            return { ...m, reactions: [...m.reactions, { userId: evt.userId, emoji: evt.emoji }] };
          }
          return { ...m, reactions: m.reactions.filter((r) => !(r.userId === evt.userId && r.emoji === evt.emoji)) };
        }) ?? prev,
      );
    };

    const onEdited = (evt: { conversationId: string; messageId: string; body: string; editedAt: string }) => {
      if (evt.conversationId !== id) return;
      setMessages((prev) => prev?.map((m) => (m.id === evt.messageId ? { ...m, body: evt.body, editedAt: evt.editedAt } : m)) ?? prev);
    };

    const onDeleted = (evt: { conversationId: string; messageId: string }) => {
      if (evt.conversationId !== id) return;
      setMessages((prev) => prev?.map((m) => (m.id === evt.messageId ? { ...m, deleted: true, body: null } : m)) ?? prev);
    };

    const onPresence = (evt: PresenceEvent) => {
      setPresence((prev) => ({
        ...prev,
        [evt.userId]: { online: evt.online, lastSeenAt: evt.lastSeenAt ?? prev[evt.userId]?.lastSeenAt ?? null },
      }));
    };

    const onTyping = (evt: TypingEvent) => {
      if (evt.conversationId !== id) return;
      if (evt.userId === me?.id) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (evt.typing) next[evt.userId] = Date.now();
        else delete next[evt.userId];
        return next;
      });
      if (evt.typing) {
        setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            if (next[evt.userId] && Date.now() - next[evt.userId]! >= 4000) delete next[evt.userId];
            return next;
          });
        }, 4500);
      }
    };

    s.on('message:new', onNew);
    s.on('message:receipt', onReceipt);
    s.on('message:reaction', onReaction);
    s.on('message:edited', onEdited);
    s.on('message:deleted', onDeleted);
    s.on('presence', onPresence);
    s.on('typing', onTyping);
    return () => {
      s.off('message:new', onNew);
      s.off('message:receipt', onReceipt);
      s.off('message:reaction', onReaction);
      s.off('message:edited', onEdited);
      s.off('message:deleted', onDeleted);
      s.off('presence', onPresence);
      s.off('typing', onTyping);
    };
  }, [id, markRead, me?.id]);

  // Auto-scroll only when user is pinned at the bottom (not reading history).
  useEffect(() => {
    if (!threadRef.current) return;
    if (!pinnedRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, typingUsers]);

  // Track whether user is at the bottom + trigger loadOlder near top.
  useEffect(() => {
    const el = threadRef.current;
    if (!el || !id) return;

    const PREFETCH_THRESHOLD_PX = 600;
    const PINNED_THRESHOLD_PX = 80;

    const tryLoadOlder = async () => {
      if (loadOlderInflightRef.current) return;
      if (!hasMore) return;
      if (el.scrollTop > PREFETCH_THRESHOLD_PX) return;

      const beforeHeight = el.scrollHeight;
      const beforeTop = el.scrollTop;

      loadOlderInflightRef.current = true;
      setLoadingOlder(true);
      try {
        const older = await conversationCache.loadOlder(id);
        if (older.length === 0) {
          setLoadingOlder(false);
          loadOlderInflightRef.current = false;
          return;
        }
        const entry = conversationCache.get(id);
        if (!entry) {
          setLoadingOlder(false);
          loadOlderInflightRef.current = false;
          return;
        }
        // Anchored prepend: commit synchronously so we can measure post-render
        // height before the next paint, then restore scrollTop.
        flushSync(() => {
          setMessages(entry.messages);
          setHasMore(entry.pagination.hasMore);
        });
        if (threadRef.current) {
          const afterHeight = threadRef.current.scrollHeight;
          threadRef.current.scrollTop = beforeTop + (afterHeight - beforeHeight);
        }
        setOlderError(false);
      } catch {
        setOlderError(true);
      } finally {
        setLoadingOlder(false);
        loadOlderInflightRef.current = false;
      }
    };

    let raf = 0;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
      const pinned = distFromBottom < PINNED_THRESHOLD_PX;
      if (pinned !== pinnedRef.current) {
        pinnedRef.current = pinned;
        setIsPinnedAtBottom(pinned);
        if (pinned) setUnreadWhilePinnedUp(0);
      }
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        tryLoadOlder();
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    // First call in case content is already shorter than the prefetch threshold.
    onScroll();
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [id, hasMore, messages]);

  // When messages change, mark read if the new bottom message is now visible
  // (pinned-at-bottom case is handled by onNew; this covers post-loadOlder pin).
  useEffect(() => {
    if (!pinnedRef.current || !messages || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last && !last.self) markRead(last.id);
  }, [messages, markRead]);

  useEffect(() => {
    if (replyTo && composerRef.current) composerRef.current.focus();
  }, [replyTo]);

  // Auto-resize composer to fit content (capped at COMPOSER_MAX_HEIGHT).
  useEffect(() => {
    const ta = composerRef.current;
    if (!ta) return;
    const COMPOSER_MAX = 140;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, COMPOSER_MAX);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > COMPOSER_MAX ? 'auto' : 'hidden';
    if (mirrorRef.current) {
      // wrap follows textarea height; mirror inset:0 follows wrap.
      // Force a layout sync so the mirror's scrollHeight matches.
      mirrorRef.current.scrollTop = ta.scrollTop;
    }
  }, [draft]);

  const onDraftChange = (val: string) => {
    setDraft(val);
    if (!id) return;

    const cursorPos = composerRef.current?.selectionStart ?? val.length;
    const before = val.slice(0, cursorPos);
    const m = before.match(/(?:^|\s)@([\p{L}\d]*)$/u);
    if (m) {
      setMentionQuery(m[1] ?? '');
      setMentionIdx(0);
    } else {
      setMentionQuery(null);
    }

    const s = getSocket();
    if (val && !isTypingRef.current) {
      isTypingRef.current = true;
      s.emit('typing', { conversationId: id, typing: true });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        s.emit('typing', { conversationId: id, typing: false });
      }
    }, 1500);
  };

  const insertMention = (displayName: string) => {
    if (!composerRef.current) return;
    const cursor = composerRef.current.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    const after = draft.slice(cursor);
    const replaced = before.replace(/(?:^|\s)@([\p{L}\d]*)$/u, (full, q, off) => `${full.startsWith(' ') ? ' ' : ''}@${displayName} `);
    const next = replaced + after;
    setDraft(next);
    setMentionQuery(null);
    setTimeout(() => {
      composerRef.current?.focus();
      const pos = replaced.length;
      composerRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const onFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setSendError(null);
    try {
      for (const f of Array.from(files)) {
        const r = await api.uploadFile(f);
        setPendingAttachments((prev) => [...prev, r]);
      }
    } catch (e: any) {
      setSendError(e.message ?? 'Upload failed');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePending = (attId: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const send = async () => {
    const text = draft.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (sending) return;

    if (isTypingRef.current) {
      isTypingRef.current = false;
      getSocket().emit('typing', { conversationId: id!, typing: false });
    }

    const tempId = `tmp-${Date.now()}`;
    const replyId = replyTo?.id ?? null;
    const attIds = pendingAttachments.map((a) => a.id);
    const optimisticAtt: AttachmentItem[] = pendingAttachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      fileName: a.fileName,
      contentType: a.contentType,
      size: a.size,
      url: a.url,
      previewUrl: a.previewUrl ?? null,
      thumbUrl: a.thumbUrl ?? null,
      width: a.width ?? null,
      height: a.height ?? null,
    }));
    const optimistic: MessageItem = {
      id: tempId,
      body: text,
      deleted: false,
      sender: { id: me?.id ?? 'me', displayName: '', employeeId: me?.employeeId ?? null },
      self: true,
      replyToMessageId: replyId,
      replyToPreview: replyTo
        ? { senderName: replyTo.sender.displayName, body: replyTo.body, deleted: replyTo.deleted }
        : null,
      editedAt: null,
      createdAt: new Date().toISOString(),
      reactions: [],
      receipts: [],
      mentions: [],
      attachments: optimisticAtt,
      visibility: 'everyone',
      audienceTeams: [],
      redacted: false,
    };
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setDraft('');
    setReplyTo(null);
    setPendingAttachments([]);
    setSendError(null);
    setSending(true);
    try {
      const msg = await api.sendMessage(id, text, replyId ?? undefined, attIds.length ? attIds : undefined);
      setMessages((prev) => (prev ?? []).map((m) => (m.id === tempId ? msg : m)));
    } catch (e: any) {
      setSendError(e.message ?? 'Failed to send');
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== tempId));
      setDraft(text);
      setPendingAttachments(pendingAttachments);
    }
    setSending(false);
  };

  const toggleReaction = async (m: MessageItem, emoji: string) => {
    if (!me) return;
    setPickerForId(null);
    const has = m.reactions.some((r) => r.userId === me.id && r.emoji === emoji);
    setMessages((prev) =>
      prev?.map((x) => {
        if (x.id !== m.id) return x;
        if (has) return { ...x, reactions: x.reactions.filter((r) => !(r.userId === me.id && r.emoji === emoji)) };
        return { ...x, reactions: [...x.reactions, { userId: me.id, emoji }] };
      }) ?? prev,
    );
    try {
      await api.toggleReaction(id, m.id, emoji);
    } catch {
      setMessages((prev) => prev ?? prev);
    }
  };

  const startEdit = (m: MessageItem) => {
    setEditingId(m.id);
    setEditingDraft(m.body ?? '');
  };

  const saveEdit = async (m: MessageItem) => {
    const text = editingDraft.trim();
    if (!text || text === m.body) {
      setEditingId(null);
      return;
    }
    try {
      const r = await api.editMessage(id, m.id, text);
      setMessages((prev) => prev?.map((x) => (x.id === m.id ? { ...x, body: r.body, editedAt: r.editedAt } : x)) ?? prev);
      setEditingId(null);
    } catch (e: any) {
      setSendError(e.message ?? 'Failed to edit');
      setEditingId(null);
    }
  };

  const deleteMsg = async (m: MessageItem) => {
    if (!confirm('Delete this message for everyone?')) return;
    try {
      await api.deleteMessage(id, m.id);
      setMessages((prev) => prev?.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null } : x)) ?? prev);
    } catch (e: any) {
      setSendError(e.message ?? 'Failed to delete');
    }
  };

  useEffect(() => {
    const q = searchQuery.trim();
    if (!searchOpen || q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      api.searchInConversation(id, q).then((r) => setSearchResults(r.results)).catch(() => setSearchResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [id, searchOpen, searchQuery]);

  const scrollToMessage = async (messageId: string) => {
    setSearchOpen(false);
    setSearchQuery('');
    const tryScroll = () => {
      const el = document.getElementById(`msg-${messageId}`);
      if (!el) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightMessageId(messageId);
      setTimeout(() => setHighlightMessageId((h) => (h === messageId ? null : h)), 1500);
      return true;
    };
    if (tryScroll()) return;
    if (!id) return;
    try {
      await conversationCache.loadAround(id, messageId);
      const entry = conversationCache.get(id);
      if (entry) {
        flushSync(() => {
          setMessages(entry.messages);
          setHasMore(entry.pagination.hasMore);
        });
        // wait one frame so the DOM is painted before scrollIntoView
        requestAnimationFrame(() => tryScroll());
      }
    } catch {}
  };

  if (loadError) return <div style={styles.notfound}><h2 style={{ fontSize: 18, fontWeight: 600 }}>{loadError}</h2></div>;
  if (!meta || !messages) return <div style={styles.notfound}><span style={{ color: 'var(--text-tertiary)' }}>Loading…</span></div>;

  const isConfidential = meta.sensitivity === 'confidential' || meta.sensitivity === 'restricted';
  const titleInitials = initialsOf(meta.title ?? '');

  let presenceLabel: string | null = null;
  if (meta.kind === 'direct') {
    const other = meta.members.find((m) => m.userId !== me?.id);
    if (other) {
      const p = presence[other.userId];
      const isOnline = p?.online ?? other.online;
      const seen = p?.lastSeenAt ?? other.lastSeenAt;
      presenceLabel = isOnline ? 'Online' : seen ? `Last seen ${formatLastSeen(seen)}` : 'Offline';
    }
  } else {
    const onlineCount = meta.members.filter((m) => (presence[m.userId]?.online ?? m.online) && m.userId !== me?.id).length;
    presenceLabel = `${meta.members.length} members · ${onlineCount} online`;
  }

  const typingNames = Object.keys(typingUsers)
    .map((uid) => meta.members.find((m) => m.userId === uid)?.displayName.split(' ')[0])
    .filter(Boolean) as string[];

  type MentionItem =
    | { kind: 'user'; userId: string; displayName: string; employeeId: string | null; photoUrls?: { thumb?: string; sm?: string; md?: string; lg?: string } | null }
    | { kind: 'team'; slug: string; name: string; memberCount: number };

  const isDirect = meta.kind === 'direct';
  const mentionMatches: MentionItem[] =
    mentionQuery !== null && !isDirect
      ? [
          ...teams
            .filter((t) =>
              t.name.toLowerCase().includes((mentionQuery ?? '').toLowerCase()) ||
              t.slug.toLowerCase().includes((mentionQuery ?? '').toLowerCase()),
            )
            .map<MentionItem>((t) => ({ kind: 'team', slug: t.slug, name: t.name, memberCount: t.memberCount })),
          ...meta.members
            .filter((m) => m.userId !== me?.id)
            .filter((m) => m.displayName.toLowerCase().includes((mentionQuery ?? '').toLowerCase()))
            .map<MentionItem>((m) => ({ kind: 'user', userId: m.userId, displayName: m.displayName, employeeId: m.employeeId, photoUrls: m.photoUrls })),
        ].slice(0, 8)
      : [];

  return (
    <>
      <header style={styles.header}>
        <button onClick={() => setShowMembers(true)} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, background: 'transparent', cursor: 'pointer', flex: 1, textAlign: 'left' }}>
          <Avatar
            initials={titleInitials}
            tone={meta.kind === 'announcement' ? 'inverse' : 'default'}
            photoUrls={meta.kind === 'direct' ? meta.members.find((m) => m.userId !== me?.id)?.photoUrls ?? null : null}
            online={meta.kind === 'direct' && presenceLabel === 'Online'}
          />
          <div style={{ minWidth: 0 }}>
            <div style={styles.title}>{meta.title ?? 'Untitled'}</div>
            <div style={styles.headerSubRow}>
              <SensitivityBadge value={meta.sensitivity} />
              <span style={styles.headerSub}>{presenceLabel}</span>
            </div>
          </div>
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            style={styles.iconBtn}
            title={isMuted ? 'Unmute' : 'Mute'}
            onClick={async () => {
              if (!id) return;
              try {
                const next = isMuted ? null : new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 50).toISOString(); // ~50 yrs
                await api.muteConversation(id, next);
                setIsMuted(!isMuted);
              } catch {}
            }}
          >
            {isMuted ? <BellOff size={16} color="var(--text-tertiary)" /> : <Bell size={16} />}
          </button>
          <button style={styles.iconBtn} title="Search in conversation" onClick={() => setSearchOpen(true)}><SearchIcon size={16} /></button>
          <button style={styles.iconBtn} title="Members" onClick={() => setShowMembers(true)}><UsersIcon size={16} /></button>
        </div>
      </header>

      {searchOpen && (
        <div style={styles.searchOverlay}>
          <div style={styles.searchBox}>
            <SearchIcon size={14} color="var(--text-tertiary)" />
            <input
              autoFocus
              style={styles.searchInputOverlay}
              placeholder="Search in conversation"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
            />
            <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} style={styles.iconAction}><X size={14} /></button>
          </div>
          {searchQuery.trim().length >= 2 && (
            <div style={styles.searchResults}>
              {searchResults.length === 0 && <div style={{ padding: 16, color: 'var(--text-tertiary)', fontSize: 13 }}>No matches.</div>}
              {searchResults.map((r) => (
                <button key={r.id} onClick={() => scrollToMessage(r.id)} style={styles.searchResult}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{r.sender.displayName} · {clockTime(r.createdAt)}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.body}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showMembers && (
        <MembersModal
          conversationId={id}
          conversationKind={meta.kind}
          onClose={() => setShowMembers(false)}
          canLeave={meta.kind !== 'direct'}
        />
      )}

      <ImageLightbox image={viewerImage} onClose={() => setViewerImage(null)} />

      {forwardSource && (
        <ForwardModal
          source={forwardSource}
          onClose={() => setForwardSource(null)}
          onForwarded={() => setForwardSource(null)}
        />
      )}

      {receiptInspect && (
        <ReceiptsModal
          message={receiptInspect}
          members={receiptMembers}
          onClose={() => { setReceiptInspect(null); setReceiptMembers(null); }}
        />
      )}

      {isConfidential && (
        <div style={styles.banner}>
          <Lock size={14} color="var(--confidential)" />
          <span>Confidential — screenshots are watermarked and audited. Do not share content outside ChatBox.</span>
        </div>
      )}

      <div
        className="thread-bg"
        style={styles.threadWrap}
        onContextMenu={isConfidential ? (e) => e.preventDefault() : undefined}
        onCopy={isConfidential ? (e) => { e.preventDefault(); } : undefined}
      >
        {isConfidential && me && <Watermark label={`${me.employeeId ?? ''} · ${me.initials}`} />}
        <div
          style={{
            ...styles.thread,
            userSelect: isConfidential ? 'none' : 'auto',
            WebkitUserSelect: isConfidential ? 'none' : 'auto',
          }}
          ref={threadRef}
          onClick={() => setPickerForId(null)}
        >
          {olderError && (
            <div style={styles.olderError}>
              <span>Couldn't load older messages.</span>
              <button
                onClick={async () => {
                  if (!id) return;
                  conversationCache.resetFailure(id);
                  setOlderError(false);
                  setHasMore(true);
                  try { await conversationCache.loadOlder(id); } catch {}
                  const e = conversationCache.get(id);
                  if (e) { setMessages(e.messages); setHasMore(e.pagination.hasMore); }
                }}
                style={styles.olderRetryBtn}
              >
                Retry
              </button>
            </div>
          )}
          {loadingOlder && hasMore && (
            <div style={styles.olderSpinner}>
              <span className="typing-dots"><span /><span /><span /></span>
            </div>
          )}
          {!hasMore && messages.length > 0 && (
            <div style={styles.beginningSentinel}>Beginning of conversation</div>
          )}
          {messages.length === 0 && <div style={styles.muted}>No messages yet. Start the conversation.</div>}
          {(() => {
            const items: React.ReactNode[] = [];
            let prevDateKey: string | null = null;
            let prevSenderId: string | null = null;
            let prevAt = 0;
            for (let i = 0; i < messages.length; i++) {
              const m = messages[i]!;
              const dk = dateKey(m.createdAt);
              const at = new Date(m.createdAt).getTime();
              const newDay = dk !== prevDateKey;
              const sameRun = !newDay && prevSenderId === m.sender.id && at - prevAt < 5 * 60_000;
              const isFirstOfRun = !sameRun;

              if (newDay) {
                items.push(
                  <div key={`d-${dk}`} style={styles.dateSeparator}>
                    <span style={styles.dateChip}>{dateSeparatorLabel(m.createdAt)}</span>
                  </div>,
                );
              }

              items.push(
                <div
                  id={`msg-${m.id}`}
                  key={m.id}
                  style={{
                    borderRadius: 8,
                    marginTop: isFirstOfRun ? 8 : 0,
                    background: highlightMessageId === m.id ? 'var(--brand-soft)' : 'transparent',
                    transition: 'background 0.4s ease',
                  }}>
                  <Bubble
                    m={m}
                    meId={me?.id ?? ''}
                    showAuthor={isFirstOfRun && !m.self && meta.kind !== 'direct'}
                    showAvatar={isFirstOfRun}
                    hideAvatarSlot={meta.kind === 'direct'}
                    memberNames={meta.members.map((mb) => mb.displayName)}
                    onReply={() => setReplyTo(m)}
                    onEdit={() => startEdit(m)}
                    onDelete={() => deleteMsg(m)}
                    onReact={(emoji) => toggleReaction(m, emoji)}
                    editing={editingId === m.id}
                    editingDraft={editingDraft}
                    setEditingDraft={setEditingDraft}
                    onSaveEdit={() => saveEdit(m)}
                    onCancelEdit={() => setEditingId(null)}
                    pickerOpen={pickerForId === m.id}
                    setPickerOpen={(v) => setPickerForId(v ? m.id : null)}
                    onOpenImage={(url, fileName) => setViewerImage({ url, fileName })}
                    onForward={() => setForwardSource(m)}
                    onInfo={() => {
                      setReceiptInspect(m);
                      setReceiptMembers(null);
                      api.listConversationMembers(id).then(setReceiptMembers).catch(() => setReceiptMembers([]));
                    }}
                  />
                </div>,
              );

              prevDateKey = dk;
              prevSenderId = m.sender.id;
              prevAt = at;
            }
            return items;
          })()}
          {typingNames.length > 0 && (
            <div style={styles.typingInline} title={typingLabel(typingNames)}>
              {(() => {
                const firstUid = Object.keys(typingUsers)[0];
                const mem = firstUid ? meta.members.find((mm) => mm.userId === firstUid) : null;
                return mem ? (
                  <Avatar initials={initialsOf(mem.displayName)} size={28} photoUrls={mem.photoUrls ?? null} />
                ) : <div style={{ width: 28, minWidth: 28 }} />;
              })()}
              <span className="typing-dots"><span /><span /><span /></span>
              {meta.kind !== 'direct' && (
                <span style={styles.typingText}>{typingLabel(typingNames)}</span>
              )}
            </div>
          )}
        </div>
        {!isPinnedAtBottom && (
          <button
            style={styles.scrollDownBtn}
            title={unreadWhilePinnedUp > 0 ? `${unreadWhilePinnedUp} new` : 'Jump to latest'}
            onClick={() => {
              const el = threadRef.current;
              if (!el) return;
              el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
              setUnreadWhilePinnedUp(0);
              const last = messages?.[messages.length - 1];
              if (last && !last.self) markRead(last.id);
            }}
          >
            <ChevronDown size={20} color="var(--text-primary)" />
            {unreadWhilePinnedUp > 0 && (
              <span style={styles.scrollDownBadge}>
                {unreadWhilePinnedUp > 99 ? '99+' : unreadWhilePinnedUp}
              </span>
            )}
          </button>
        )}
      </div>

      {sendError && (
        <div style={styles.errStrip}>
          <span>{sendError}</span>
          <button onClick={() => setSendError(null)} style={{ color: 'var(--danger)', fontWeight: 600 }}>Dismiss</button>
        </div>
      )}

      {replyTo && (
        <div style={styles.replyStrip}>
          <CornerUpLeft size={14} color="var(--text-secondary)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Replying to {replyTo.self ? 'yourself' : replyTo.sender.displayName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyTo.deleted ? 'Deleted message' : replyTo.body}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} style={styles.iconAction}><X size={14} /></button>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        {mentionMatches.length > 0 && (
          <div style={styles.mentionPopover}>
            {mentionMatches.map((m, i) => (
              <button
                key={m.kind === 'user' ? `u:${m.userId}` : `t:${m.slug}`}
                onClick={() => insertMention(m.kind === 'user' ? m.displayName : m.name)}
                style={{ ...styles.mentionItem, background: i === mentionIdx ? 'var(--bubble-other)' : 'transparent' }}
              >
                {m.kind === 'team' ? (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 28 }}>
                    <UsersIcon size={14} color="var(--brand)" />
                  </div>
                ) : (
                  <Avatar initials={initialsOf(m.displayName)} size={28} photoUrls={m.photoUrls} />
                )}
                <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.kind === 'team' ? m.name : m.displayName}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {pendingAttachments.length > 0 && (
        <div style={styles.attStrip}>
          {pendingAttachments.map((a) => (
            <div key={a.id} style={styles.attChip}>
              <FileIcon size={14} />
              <span style={{ fontSize: 12, fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fileName}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{(a.size / 1024).toFixed(0)} KB</span>
              <button onClick={() => removePending(a.id)}><X size={12} /></button>
            </div>
          ))}
          {uploading && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Uploading…</span>}
        </div>
      )}

      <div style={styles.composer}>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => onFileSelect(e.target.files)} />
        <div style={styles.composerWrap}>
          <button style={styles.composerIcon} title="Attach" onClick={() => fileInputRef.current?.click()}><Paperclip size={18} /></button>
          <button
            ref={emojiBtnRef}
            style={styles.composerIcon}
            title="Emoji"
            onClick={() => setEmojiOpen((v) => !v)}
          ><Smile size={18} /></button>
          <div style={styles.composerInputArea}>
            <div style={styles.composerMirror} aria-hidden ref={mirrorRef}>
              {draft.length === 0 ? (
                <span style={{ color: 'var(--text-tertiary)' }}>{isConfidential ? 'Message — Confidential' : 'Message'}</span>
              ) : (
                renderHighlightedDraft(draft, meta.members.map((mb) => mb.displayName), teams.map((t) => t.name))
              )}
              {'​'}
            </div>
            <textarea
              ref={composerRef}
              style={styles.composerInput}
            rows={1}
            placeholder=""
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onScroll={(e) => {
              if (mirrorRef.current) {
                mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
              }
            }}
            onKeyDown={(e) => {
              if (mentionMatches.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionMatches.length); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault();
                  const sel = mentionMatches[mentionIdx];
                  if (sel) insertMention(sel.kind === 'team' ? sel.name : sel.displayName);
                  return;
                }
                if (e.key === 'Escape') { setMentionQuery(null); return; }
              }
              if (e.key === 'Backspace' && composerRef.current) {
                const ta = composerRef.current;
                if (ta.selectionStart === ta.selectionEnd && ta.selectionStart !== null) {
                  const cursor = ta.selectionStart;
                  const before = draft.slice(0, cursor);
                  const allNames = [
                    ...meta.members.map((mb) => mb.displayName),
                    ...teams.map((t) => t.name),
                  ].filter(Boolean).sort((a, b) => b.length - a.length);
                  for (const name of allNames) {
                    const withSpace = `@${name} `;
                    const noSpace = `@${name}`;
                    const match = before.endsWith(withSpace) ? withSpace : (before.endsWith(noSpace) ? noSpace : null);
                    if (match) {
                      e.preventDefault();
                      const newCursor = cursor - match.length;
                      const next = draft.slice(0, newCursor) + draft.slice(cursor);
                      onDraftChange(next);
                      setTimeout(() => {
                        ta.focus();
                        ta.setSelectionRange(newCursor, newCursor);
                      }, 0);
                      return;
                    }
                  }
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
              if (e.key === 'Escape' && replyTo) setReplyTo(null);
            }}
          />
          </div>
          <button
            style={{
              ...styles.send,
              transform: (draft.trim() || pendingAttachments.length > 0) ? 'scale(1)' : 'scale(0)',
              opacity: (draft.trim() || pendingAttachments.length > 0) ? 1 : 0,
              width: (draft.trim() || pendingAttachments.length > 0) ? 36 : 0,
              marginLeft: (draft.trim() || pendingAttachments.length > 0) ? 2 : 0,
              cursor: (draft.trim() || pendingAttachments.length > 0) && !sending ? 'pointer' : 'not-allowed',
              pointerEvents: (draft.trim() || pendingAttachments.length > 0) ? 'auto' : 'none',
            }}
            disabled={(!draft.trim() && pendingAttachments.length === 0) || sending}
            onClick={send}
            aria-label="Send"
          >
            <ArrowUp size={16} color="#FFFFFF" />
          </button>
        </div>
      </div>

      {emojiOpen && (
        <EmojiPickerPanel
          anchor={emojiBtnRef.current}
          onPick={(e) => {
            const ta = composerRef.current;
            if (ta) {
              const start = ta.selectionStart ?? draft.length;
              const end = ta.selectionEnd ?? draft.length;
              const next = draft.slice(0, start) + e + draft.slice(end);
              onDraftChange(next);
              requestAnimationFrame(() => {
                ta.focus();
                const pos = start + e.length;
                ta.setSelectionRange(pos, pos);
              });
            } else {
              onDraftChange(draft + e);
            }
          }}
          onClose={() => setEmojiOpen(false)}
        />
      )}
    </>
  );
}

function Bubble(props: {
  m: MessageItem;
  meId: string;
  showAuthor: boolean;
  showAvatar?: boolean;
  hideAvatarSlot?: boolean;
  memberNames?: string[];
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onForward: () => void;
  onInfo: () => void;
  onReact: (emoji: string) => void;
  editing: boolean;
  editingDraft: string;
  setEditingDraft: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  pickerOpen: boolean;
  setPickerOpen: (v: boolean) => void;
  onOpenImage: (url: string, fileName: string) => void;
}) {
  const { m, meId, showAuthor, showAvatar = true, hideAvatarSlot = false, memberNames, onReply, onEdit, onDelete, onForward, onInfo, onReact, editing, editingDraft, setEditingDraft, onSaveEdit, onCancelEdit, pickerOpen, setPickerOpen, onOpenImage } = props;
  const [hovered, setHovered] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen, setPickerOpen]);
  const TRUNCATE_CHARS = 600;
  const [expanded, setExpanded] = useState(false);
  const fullBody = m.body ?? '';
  const isLong = !m.deleted && fullBody.length > TRUNCATE_CHARS;
  const fullyShown = !isLong || expanded;
  const displayBody = fullyShown ? fullBody : smartTruncate(fullBody, TRUNCATE_CHARS);

  const ageMin = (Date.now() - new Date(m.createdAt).getTime()) / 60000;
  const canEdit = m.self && !m.deleted && ageMin < EDIT_WINDOW_MIN && !m.id.startsWith('tmp-');
  const canDelete = m.self && !m.deleted && !m.id.startsWith('tmp-');
  const canInteract = !m.deleted && !m.id.startsWith('tmp-');

  const groupedReactions = m.reactions.reduce<Record<string, string[]>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji]!.push(r.userId);
    return acc;
  }, {});

  if (m.redacted) {
    const teamLabel = m.audienceTeams.length > 0 ? m.audienceTeams.map((t) => t.name).join(' & ') : 'a private group';
    return (
      <div style={{ ...styles.msgRow, justifyContent: 'flex-start' }}>
        <Avatar initials={initialsOf(m.sender.displayName)} size={28} photoUrls={m.sender.photoUrls} />
        <div style={{ ...styles.bubbleWrap, alignItems: 'flex-start' }}>
          <span style={styles.author}>{m.sender.displayName}</span>
          <div style={{
            padding: '10px 14px',
            borderRadius: 16,
            borderBottomLeftRadius: 6,
            background: 'var(--canvas)',
            border: '1px dashed var(--border-strong)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontStyle: 'italic',
            fontSize: 13,
          }}>
            <EyeOff size={14} />
            <span>Private message — only {teamLabel} can read</span>
          </div>
          <span style={styles.time}>{clockTime(m.createdAt)}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ ...styles.msgRow, justifyContent: m.self ? 'flex-end' : 'flex-start' }}
    >
      {!m.self && !hideAvatarSlot && (showAvatar ? <Avatar initials={initialsOf(m.sender.displayName)} size={28} photoUrls={m.sender.photoUrls} /> : <div style={{ width: 28, minWidth: 28 }} />)}
      <div
        ref={wrapRef}
        style={{ ...styles.bubbleWrap, alignItems: m.self ? 'flex-end' : 'flex-start' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          if (!pickerOpen) setHovered(false);
        }}
      >
        {showAuthor && <span style={{ ...styles.author, color: authorColor(m.sender.id) }}>{m.sender.displayName}</span>}
        {m.visibility === 'restricted' && m.audienceTeams.length > 0 && !m.deleted && !editing && (
          <div style={styles.audiencePill}>
            <Lock size={8} />
            <span>{m.audienceTeams.map((t) => t.name).join(' · ')} only</span>
          </div>
        )}

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: m.self ? 'flex-end' : 'flex-start' }}>
          <div
            style={{
              ...styles.bubble,
              background: m.self ? 'var(--bubble-self)' : 'var(--card)',
              color: m.self ? 'var(--text-on-inverse)' : 'var(--text-primary)',
              border: m.self ? 'none' : '1px solid var(--border)',
              borderBottomRightRadius: m.self ? 6 : 16,
              borderBottomLeftRadius: m.self ? 16 : 6,
              fontStyle: m.deleted ? 'italic' : undefined,
              opacity: m.deleted ? 0.6 : 1,
            }}
          >
            {m.replyToPreview && (
              <div
                style={{
                  ...styles.quote,
                  borderLeftColor: m.self ? 'rgba(255,255,255,0.4)' : 'var(--brand)',
                  background: m.self ? 'rgba(255,255,255,0.1)' : 'var(--canvas)',
                  color: m.self ? 'rgba(255,255,255,0.9)' : 'var(--text-secondary)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600 }}>{m.replyToPreview.senderName}</div>
                <div style={{ fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {m.replyToPreview.deleted ? 'Deleted message' : m.replyToPreview.body}
                </div>
              </div>
            )}

            {editing ? (
              <div>
                <textarea
                  autoFocus
                  value={editingDraft}
                  onChange={(e) => setEditingDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onSaveEdit();
                    }
                    if (e.key === 'Escape') onCancelEdit();
                  }}
                  rows={Math.min(6, editingDraft.split('\n').length || 1)}
                  style={styles.editArea}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                  <button onClick={onCancelEdit} style={{ ...styles.smallBtn, color: 'rgba(255,255,255,0.7)' }}>Cancel</button>
                  <button onClick={onSaveEdit} style={{ ...styles.smallBtn, background: 'rgba(255,255,255,0.2)' }}>
                    <Check size={12} /> Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                {m.attachments.length > 0 && (
                  <AttachmentGrid
                    attachments={m.attachments}
                    self={m.self}
                    onOpenImage={onOpenImage}
                  />
                )}
                <span style={styles.bodyText}>
                  {m.deleted ? 'This message was deleted' : <RenderBody body={displayBody} self={m.self} memberNames={memberNames} />}
                  {isLong && !fullyShown && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(true); } }}
                      style={{
                        color: m.self ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)',
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >
                      {' Read more'}
                    </span>
                  )}
                  <span style={{ ...styles.time, color: m.self ? 'rgba(255,255,255,0.65)' : 'var(--text-tertiary)' }}>
                    {clockTime(m.createdAt)}
                    {m.editedAt && !m.deleted && ' · edited'}
                    {m.self && (
                      <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
                        <MessageTicks status={statusOf(m)} color="rgba(255,255,255,0.65)" />
                      </span>
                    )}
                  </span>
                </span>
              </>
            )}
          </div>

          {hovered && canInteract && !editing && (
            <div style={{ ...styles.actionBar, [m.self ? 'right' : 'left']: 0 }}>
              <button onClick={() => setPickerOpen(!pickerOpen)} style={styles.actionBtn} title="React"><SmilePlus size={14} /></button>
              <button onClick={onReply} style={styles.actionBtn} title="Reply"><CornerUpLeft size={14} /></button>
              {!m.deleted && <button onClick={onForward} style={styles.actionBtn} title="Forward"><CornerUpRight size={14} /></button>}
              {canEdit && <button onClick={onEdit} style={styles.actionBtn} title="Edit"><Pencil size={14} /></button>}
              {m.self && m.receipts.length > 0 && (
                <button onClick={onInfo} style={styles.actionBtn} title="Read receipts"><Info size={14} /></button>
              )}
              {canDelete && <button onClick={onDelete} style={{ ...styles.actionBtn, color: 'var(--danger)' }} title="Delete"><Trash2 size={14} /></button>}
            </div>
          )}

          {pickerOpen && (
            <div style={{ ...styles.picker, [m.self ? 'right' : 'left']: 0 }} onClick={(e) => e.stopPropagation()}>
              {QUICK_REACTIONS.map((emoji) => (
                <button key={emoji} onClick={() => { onReact(emoji); setPickerOpen(false); }} style={styles.pickerBtn}>{emoji}</button>
              ))}
            </div>
          )}
        </div>

        {Object.keys(groupedReactions).length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            {Object.entries(groupedReactions).map(([emoji, users]) => {
              const mine = users.includes(meId);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  style={{ ...styles.reactionPill, ...(mine ? styles.reactionPillMine : {}) }}
                >
                  <span style={{ fontSize: 13 }}>{emoji}</span>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{users.length}</span>
                </button>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

function smartTruncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  const lastNewline = cut.lastIndexOf('\n');
  const breakAt = Math.max(lastSpace, lastNewline);
  return (breakAt > maxLen * 0.7 ? cut.slice(0, breakAt) : cut) + '…';
}

const AUTHOR_PALETTE = ['#1B91F1', '#1FA855', '#B250B9', '#DD3859', '#708A26', '#0EA5A4', '#D946EF', '#EA580C'];
function authorColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AUTHOR_PALETTE[h % AUTHOR_PALETTE.length]!;
}

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1').replace(/\/v1\/?$/, '');
function absUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
  return url;
}

function AttachmentGrid({
  attachments, self, onOpenImage,
}: {
  attachments: AttachmentItem[];
  self: boolean;
  onOpenImage: (url: string, fileName: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
      {attachments.map((a) =>
        a.kind === 'image' ? (
          <button
            key={a.id}
            onClick={(e) => { e.stopPropagation(); onOpenImage(absUrl(a.url), a.fileName); }}
            style={{ display: 'block', padding: 0, background: 'transparent', cursor: 'zoom-in', border: 'none' }}
          >
            <img src={absUrl(a.previewUrl ?? a.url)} alt={a.fileName} style={{ display: 'block', maxWidth: 320, maxHeight: 240, borderRadius: 8, objectFit: 'cover' }} />
          </button>
        ) : (
          <a key={a.id} href={absUrl(a.url)} target="_blank" rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
              background: self ? 'rgba(255,255,255,0.12)' : 'var(--canvas)',
              border: self ? '1px solid rgba(255,255,255,0.18)' : '1px solid var(--border)',
              color: 'inherit', textDecoration: 'none', maxWidth: 320,
            }}>
            <FileIcon size={16} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fileName}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{(a.size / 1024).toFixed(0)} KB</div>
            </div>
            <Download size={14} />
          </a>
        ),
      )}
    </div>
  );
}

function ForwardModal({
  source, onClose, onForwarded,
}: {
  source: MessageItem;
  onClose: () => void;
  onForwarded: () => void;
}) {
  const [convos, setConvos] = useState<ConversationListItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.listConversations().then(setConvos).catch(() => setConvos([]));
  }, []);

  const sendTo = async (cid: string) => {
    setBusy(cid);
    try {
      await api.sendMessage(cid, source.body ?? '', undefined, source.attachments.map((a) => a.id));
      onForwarded();
    } catch (e: any) {
      alert(e.message ?? 'Forward failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div onClick={onClose} style={modalBackdrop}>
      <div onClick={(e) => e.stopPropagation()} style={modalDialog}>
        <div style={modalHeader}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Forward to…</span>
          <button onClick={onClose} style={iconClose}><X size={18} /></button>
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '0 16px 12px' }}>
          {(source.body && source.body.trim()) || `${source.attachments.length} attachment(s)`}
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto', padding: '0 8px 12px' }}>
          {!convos ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div> :
            convos.map((c) => (
              <button
                key={c.id}
                onClick={() => sendTo(c.id)}
                disabled={busy === c.id}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <Avatar initials={initialsOf(c.title ?? '')} size={36} photoUrls={c.otherPhotoUrls ?? null} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.title ?? 'Untitled'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.kind === 'direct' ? 'Direct' : c.kind}</div>
                </div>
                {busy === c.id ? <span style={{ fontSize: 12 }}>Sending…</span> : <ArrowUp size={14} color="var(--text-secondary)" />}
              </button>
            ))
          }
        </div>
      </div>
    </div>
  );
}

function ReceiptsModal({
  message, members, onClose,
}: {
  message: MessageItem;
  members: ConversationMember[] | null;
  onClose: () => void;
}) {
  const map = new Map(message.receipts.map((r) => [r.userId, r]));
  const rows = (members ?? []).filter((mm) => mm.userId !== message.sender.id);
  const read = rows.filter((m) => map.get(m.userId)?.readAt);
  const delivered = rows.filter((m) => map.get(m.userId)?.deliveredAt && !map.get(m.userId)?.readAt);
  const pending = rows.filter((m) => !map.get(m.userId)?.deliveredAt);

  const Section = ({ label, list }: { label: string; list: ConversationMember[] }) => (
    list.length > 0 ? (
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 600, letterSpacing: 1.2, padding: '0 4px', marginBottom: 6 }}>
          {label.toUpperCase()} · {list.length}
        </div>
        {list.map((m) => {
          const r = map.get(m.userId);
          const ts = r?.readAt ?? r?.deliveredAt;
          return (
            <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px' }}>
              <Avatar initials={initialsOf(m.displayName)} size={32} photoUrls={m.photoUrls ?? null} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.displayName}</div>
                {ts && <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>}
              </div>
            </div>
          );
        })}
      </div>
    ) : null
  );

  return (
    <div onClick={onClose} style={modalBackdrop}>
      <div onClick={(e) => e.stopPropagation()} style={modalDialog}>
        <div style={modalHeader}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Message info</span>
          <button onClick={onClose} style={iconClose}><X size={18} /></button>
        </div>
        <div style={{ maxHeight: 480, overflowY: 'auto', padding: '0 16px 16px' }}>
          {!members ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div> : (
            <>
              <Section label="Read by" list={read} />
              <Section label="Delivered to" list={delivered} />
              <Section label="Not yet delivered" list={pending} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(11,11,15,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
};
const modalDialog: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 480,
  maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
};
const modalHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 16px 12px',
};
const iconClose: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer',
};

function ImageLightbox({
  image, onClose,
}: {
  image: { url: string; fileName: string } | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!image) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [image, onClose]);
  if (!image) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: '#FFFFFF' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', cursor: 'pointer', padding: 8 }}>
          <X size={22} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 16px' }}>
          {image.fileName}
        </span>
        <a href={image.url} download={image.fileName} target="_blank" rel="noreferrer" style={{ color: '#FFFFFF', padding: 8, display: 'inline-flex' }}>
          <Download size={20} />
        </a>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <img src={image.url} alt={image.fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    </div>
  );
}

function MembersModal({
  conversationId,
  conversationKind,
  onClose,
  canLeave,
}: {
  conversationId: string;
  conversationKind: 'direct' | 'channel' | 'announcement';
  onClose: () => void;
  canLeave: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<ConversationMember[] | null>(null);
  const [me, setMe] = useState<{ id: string; isAdmin: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [allUsers, setAllUsers] = useState<DirectoryUser[] | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = () => api.listConversationMembers(conversationId).then(setMembers).catch(() => {});

  useEffect(() => {
    refresh();
    api.me().then((u) => setMe({ id: u.id, isAdmin: u.isAdmin })).catch(() => {});
  }, [conversationId]);

  const canManage = !!me?.isAdmin && conversationKind !== 'direct';

  const startAdd = async () => {
    setAdding(true);
    if (!allUsers) {
      try { setAllUsers(await api.listUsers()); } catch {}
    }
  };

  const submitAdd = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await api.adminAddMembers(conversationId, [...selected]);
      setSelected(new Set());
      setAdding(false);
      setSearch('');
      await refresh();
    } catch (e: any) {
      alert(e.message ?? 'Failed to add');
    }
    setBusy(false);
  };

  const removeMember = async (userId: string) => {
    if (!confirm('Remove this member from the channel?')) return;
    setBusy(true);
    try {
      await api.adminRemoveMember(conversationId, userId);
      await refresh();
    } catch (e: any) {
      alert(e.message ?? 'Failed to remove');
    }
    setBusy(false);
  };

  const leave = async () => {
    if (!confirm('Leave this conversation?')) return;
    setBusy(true);
    try { await api.leaveConversation(conversationId); router.push('/chat'); }
    catch (e: any) { alert(e.message ?? 'Failed to leave'); setBusy(false); }
  };

  const memberIds = new Set((members ?? []).map((m) => m.userId));
  const candidates = (allUsers ?? [])
    .filter((u) => !memberIds.has(u.id))
    .filter((u) => !search ||
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (u.department ?? '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={modalStyles.backdrop} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{adding ? 'Add members' : `Members (${members?.length ?? '…'})`}</h2>
          <button style={modalStyles.close} onClick={onClose}><X size={18} /></button>
        </div>

        {!adding ? (
          <>
            <div style={modalStyles.body}>
              {!members && <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Loading…</div>}
              {members?.map((m) => (
                <div key={m.userId} style={modalStyles.row}>
                  <div style={{ position: 'relative' }}>
                    <Avatar initials={initialsOf(m.displayName)} photoUrls={m.photoUrls} />
                    {m.online && <span style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#12B76A', border: '2px solid var(--card)' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {m.displayName}{m.isAdmin && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-tertiary)' }}>· admin</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.title ?? '—'}{m.department ? ` · ${m.department}` : ''}</div>
                  </div>
                  {canManage && me?.id !== m.userId ? (
                    <button onClick={() => removeMember(m.userId)} disabled={busy} style={modalStyles.removeBtn} title="Remove from channel">
                      <X size={14} />
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{m.online ? 'Online' : m.lastSeenAt ? `Last seen ${formatLastSeen(m.lastSeenAt)}` : ''}</span>
                  )}
                </div>
              ))}
            </div>
            <div style={modalStyles.footer}>
              {canManage && (
                <button onClick={startAdd} style={modalStyles.addBtn}><UsersIcon size={14} /> Add members</button>
              )}
              <div style={{ flex: 1 }} />
              {canLeave && (
                <button onClick={leave} disabled={busy} style={modalStyles.leaveBtn}><LeaveIcon size={14} /> Leave</button>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: '8px 16px 12px' }}>
              <input
                autoFocus
                placeholder="Search employees by name or department"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', height: 36, padding: '0 12px', borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>
            <div style={modalStyles.body}>
              {!allUsers && <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Loading…</div>}
              {allUsers && candidates.length === 0 && <div style={{ padding: 20, color: 'var(--text-tertiary)', fontSize: 13 }}>No employees match.</div>}
              {candidates.map((u) => {
                const isSel = selected.has(u.id);
                return (
                  <label key={u.id} style={{ ...modalStyles.row, background: isSel ? 'var(--brand-soft)' : 'transparent', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(u.id); else next.delete(u.id);
                        setSelected(next);
                      }}
                    />
                    <Avatar initials={initialsOf(u.displayName)} photoUrls={u.photoUrls ?? null} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{u.displayName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.title ?? '—'}{u.department ? ` · ${u.department}` : ''}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div style={modalStyles.footer}>
              <button onClick={() => { setAdding(false); setSelected(new Set()); setSearch(''); }} style={modalStyles.cancelBtn}>Cancel</button>
              <div style={{ flex: 1 }} />
              <button
                onClick={submitAdd}
                disabled={busy || selected.size === 0}
                style={{ ...modalStyles.addBtn, opacity: busy || selected.size === 0 ? 0.4 : 1, cursor: busy || selected.size === 0 ? 'not-allowed' : 'pointer' }}
              >
                {busy ? 'Adding…' : `Add ${selected.size > 0 ? selected.size + ' ' : ''}selected`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const modalStyles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(11,11,15,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
  modal: { background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' },
  close: { width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' },
  body: { padding: '0 8px 12px', overflowY: 'auto', flex: 1 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10 },
  footer: { padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' },
  leaveBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: '#FEE4E2', color: 'var(--danger)', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  addBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'var(--inverse)', color: 'var(--text-on-inverse)', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  removeBtn: { width: 28, height: 28, borderRadius: 8, background: 'transparent', color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
};

type Token =
  | { kind: 'mention'; start: number; end: number; name: string }
  | { kind: 'url'; start: number; end: number; href: string; display: string }
  | { kind: 'email'; start: number; end: number; addr: string }
  | { kind: 'codeblock'; start: number; end: number; code: string }
  | { kind: 'codeinline'; start: number; end: number; code: string }
  | { kind: 'bold'; start: number; end: number; inner: string }
  | { kind: 'italic'; start: number; end: number; inner: string }
  | { kind: 'strike'; start: number; end: number; inner: string };

function trimTrailingUrlPunct(url: string): { url: string; trailing: string } {
  const re = /[.,;:!?'"\]}]+$/;
  const tail = url.match(re);
  if (!tail) return { url, trailing: '' };
  const trailing = tail[0];
  return { url: url.slice(0, url.length - trailing.length), trailing };
}

// Emoji-only test: returns 1-3 if message is a small emoji-only run, else 0.
function jumboEmojiCount(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;
  if (trimmed.length > 12) return 0;
  let count = 0;
  try {
    const seg = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' });
    for (const _g of seg.segment(trimmed)) {
      count += 1;
      if (count > 3) return 0;
    }
  } catch {
    return 0;
  }
  if (count === 0) return 0;
  if (!/\p{Extended_Pictographic}/u.test(trimmed)) return 0;
  if (/[\p{L}\p{N}]/u.test(trimmed)) return 0;
  return count;
}

function tokenize(body: string, memberNames: string[]): Token[] {
  const tokens: Token[] = [];
  const claimed = new Array<boolean>(body.length).fill(false);
  const claim = (s: number, e: number) => { for (let i = s; i < e; i++) claimed[i] = true; };
  const free = (s: number, e: number) => { for (let i = s; i < e; i++) if (claimed[i]) return false; return true; };

  // 1. Code block ```...``` — atomic, beats everything.
  const codeBlockRe = /```([\s\S]+?)```/g;
  for (let m: RegExpExecArray | null; (m = codeBlockRe.exec(body)) !== null; ) {
    if (!free(m.index, m.index + m[0].length)) continue;
    tokens.push({ kind: 'codeblock', start: m.index, end: m.index + m[0].length, code: m[1]! });
    claim(m.index, m.index + m[0].length);
  }

  // 2. Inline code `...` — single line.
  const codeInlineRe = /`([^`\n]+?)`/g;
  for (let m: RegExpExecArray | null; (m = codeInlineRe.exec(body)) !== null; ) {
    if (!free(m.index, m.index + m[0].length)) continue;
    tokens.push({ kind: 'codeinline', start: m.index, end: m.index + m[0].length, code: m[1]! });
    claim(m.index, m.index + m[0].length);
  }

  // 3. URLs.
  const urlRe = /https?:\/\/[^\s<>"'`]+/gu;
  for (let m: RegExpExecArray | null; (m = urlRe.exec(body)) !== null; ) {
    if (!free(m.index, m.index + m[0].length)) continue;
    const { url } = trimTrailingUrlPunct(m[0]);
    if (!url) continue;
    tokens.push({ kind: 'url', start: m.index, end: m.index + url.length, href: url, display: url });
    claim(m.index, m.index + url.length);
  }

  // 4. Emails.
  const emailRe = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  for (let m: RegExpExecArray | null; (m = emailRe.exec(body)) !== null; ) {
    if (!free(m.index, m.index + m[0].length)) continue;
    tokens.push({ kind: 'email', start: m.index, end: m.index + m[0].length, addr: m[0] });
    claim(m.index, m.index + m[0].length);
  }

  // 5. Mentions — only outside other claimed regions.
  const sortedNames = [...memberNames].filter(Boolean).sort((a, b) => b.length - a.length);
  const escapedNames = sortedNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const namesAlt = escapedNames.length > 0 ? `${escapedNames.join('|')}|` : '';
  const mentionRe = new RegExp(`@(${namesAlt}[\\p{L}\\d][\\p{L}\\d]{0,40})(?=\\s|[.!?,]|$)`, 'gu');
  for (let m: RegExpExecArray | null; (m = mentionRe.exec(body)) !== null; ) {
    if (!free(m.index, m.index + m[0].length)) continue;
    tokens.push({ kind: 'mention', start: m.index, end: m.index + m[0].length, name: m[1]! });
    claim(m.index, m.index + m[0].length);
  }

  // 6. Bold *...*  (?<=^|\s)\*([^\s*][^*\n]*?[^\s*]|[^\s*])\*(?=\s|$|[.,!?'"])
  const fmtRules: Array<{ kind: 'bold' | 'italic' | 'strike'; re: RegExp }> = [
    { kind: 'bold', re: /(^|[\s(])\*([^\s*][^*\n]*?[^\s*]|[^\s*])\*(?=$|[\s.,!?'":)])/g },
    { kind: 'italic', re: /(^|[\s(])_([^\s_][^_\n]*?[^\s_]|[^\s_])_(?=$|[\s.,!?'":)])/g },
    { kind: 'strike', re: /(^|[\s(])~([^\s~][^~\n]*?[^\s~]|[^\s~])~(?=$|[\s.,!?'":)])/g },
  ];
  for (const rule of fmtRules) {
    for (let m: RegExpExecArray | null; (m = rule.re.exec(body)) !== null; ) {
      const lead = m[1] ?? '';
      const inner = m[2] ?? '';
      const matchStart = m.index + lead.length;
      const matchEnd = matchStart + inner.length + 2;
      if (!free(matchStart, matchEnd)) continue;
      tokens.push({ kind: rule.kind, start: matchStart, end: matchEnd, inner });
      claim(matchStart, matchEnd);
    }
  }

  tokens.sort((a, b) => a.start - b.start);
  return tokens;
}

function renderTokens(tokens: Token[], body: string, self: boolean): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  const linkColor = self ? '#FFFFFF' : 'var(--brand)';
  for (const t of tokens) {
    if (t.start > cursor) out.push(body.slice(cursor, t.start));
    const k = `${t.kind}-${t.start}`;
    switch (t.kind) {
      case 'url':
        out.push(
          <a key={k} href={t.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
             style={{ color: linkColor, textDecoration: 'underline', wordBreak: 'break-all' }}>
            {t.display}
          </a>,
        );
        break;
      case 'email':
        out.push(
          <a key={k} href={`mailto:${t.addr}`} onClick={(e) => e.stopPropagation()}
             style={{ color: linkColor, textDecoration: 'underline' }}>
            {t.addr}
          </a>,
        );
        break;
      case 'mention':
        out.push(
          <span key={k} style={{
            display: 'inline-block', padding: '0 4px', borderRadius: 4,
            background: self ? 'rgba(255,255,255,0.18)' : 'var(--brand-soft)',
            color: self ? '#FFFFFF' : 'var(--brand)', fontWeight: 600,
          }}>@{t.name}</span>,
        );
        break;
      case 'codeblock':
        out.push(
          <span key={k} style={{
            display: 'block', margin: '4px 0', padding: '6px 8px', borderRadius: 6,
            background: self ? 'rgba(255,255,255,0.12)' : 'rgba(11,11,15,0.06)',
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
            fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{t.code}</span>,
        );
        break;
      case 'codeinline':
        out.push(
          <span key={k} style={{
            padding: '1px 5px', borderRadius: 4,
            background: self ? 'rgba(255,255,255,0.18)' : 'rgba(11,11,15,0.06)',
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
            fontSize: 13,
          }}>{t.code}</span>,
        );
        break;
      case 'bold':
        out.push(<strong key={k} style={{ fontWeight: 700 }}>{t.inner}</strong>);
        break;
      case 'italic':
        out.push(<em key={k}>{t.inner}</em>);
        break;
      case 'strike':
        out.push(<span key={k} style={{ textDecoration: 'line-through' }}>{t.inner}</span>);
        break;
    }
    cursor = t.end;
  }
  if (cursor < body.length) out.push(body.slice(cursor));
  return out;
}

function RenderBody({ body, self, memberNames = [] }: { body: string; self: boolean; memberNames?: string[] }) {
  const jumbo = jumboEmojiCount(body);
  if (jumbo > 0) {
    const size = jumbo === 1 ? 28 : jumbo === 2 ? 24 : 22;
    return <span style={{ fontSize: size, lineHeight: 1.2 }}>{body}</span>;
  }
  const tokens = tokenize(body, memberNames);
  return <>{renderTokens(tokens, body, self)}</>;
}

function renderHighlightedDraft(text: string, memberNames: string[], teamNames: string[]): React.ReactNode {
  const all = [...memberNames, ...teamNames].filter(Boolean).sort((a, b) => b.length - a.length);
  if (all.length === 0) return text;
  const escaped = all.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`@(${escaped.join('|')}|[\\p{L}\\d][\\p{L}\\d]{0,40})(?=\\s|[.!?,]|$)`, 'gu');
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={`mh-${key++}`} style={{ color: 'var(--brand)' }}>
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function typingLabel(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]} are typing`;
  return `${names[0]} and ${names.length - 1} others are typing`;
}

function formatLastSeen(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles: Record<string, React.CSSProperties> = {
  notfound: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40, textAlign: 'center' },
  header: { height: 64, padding: '0 20px', background: 'var(--card)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#12B76A', border: '2px solid var(--card)' },
  title: { fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  headerSubRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 },
  headerSub: { fontSize: 12, color: 'var(--text-secondary)' },
  iconBtn: { width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  iconAction: { width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' },
  banner: { padding: '10px 20px', background: 'var(--confidential-soft)', color: 'var(--confidential)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 },
  threadWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  thread: { position: 'absolute', inset: 0, overflowY: 'auto', padding: '20px 72px 20px 24px', display: 'flex', flexDirection: 'column', gap: 2, zIndex: 2 },
  dateSeparator: { display: 'flex', justifyContent: 'center', margin: '16px 0 12px' },
  dateChip: { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'var(--card)', color: 'var(--text-secondary)', boxShadow: 'var(--bubble-shadow)', letterSpacing: 0.2 },
  muted: { color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '20px 0' },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  bubbleWrap: { display: 'flex', flexDirection: 'column', gap: 2, maxWidth: '64%' },
  author: { fontSize: 12, fontWeight: 600, marginLeft: 12, marginBottom: 2 },
  audiencePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '1px 6px',
    borderRadius: 999,
    background: 'var(--brand-soft)',
    color: 'var(--brand)',
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    marginBottom: 3,
    whiteSpace: 'nowrap',
    lineHeight: 1.4,
  },
  bubble: { padding: '6px 10px 6px 12px', borderRadius: 12, fontSize: 14, lineHeight: 1.45, wordBreak: 'break-word', whiteSpace: 'pre-wrap', position: 'relative', boxShadow: 'var(--bubble-shadow)' },
  bodyText: { display: 'inline' },
  quote: { borderLeft: '3px solid', borderRadius: 6, padding: '6px 8px', marginBottom: 6, fontSize: 12 },
  time: { fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, lineHeight: 1, whiteSpace: 'nowrap', verticalAlign: 'baseline', position: 'relative', top: 2 },
  typingInline: { display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 6, marginLeft: 0, padding: '4px 12px 4px 0' },
  olderError: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 16px', margin: '4px auto 8px', maxWidth: 360, borderRadius: 999, background: '#FEE4E2', color: 'var(--danger)', fontSize: 12, fontWeight: 500 },
  olderRetryBtn: { fontWeight: 700, color: 'var(--danger)', background: 'transparent', textDecoration: 'underline' },
  olderSpinner: { display: 'flex', justifyContent: 'center', padding: '8px 0' },
  beginningSentinel: { textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', padding: '12px 0 6px', letterSpacing: 0.4, textTransform: 'uppercase' as const },
  scrollDownBtn: { position: 'absolute', bottom: 20, right: 20, width: 42, height: 42, borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(11,11,15,0.14)', cursor: 'pointer', zIndex: 4 },
  scrollDownBadge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, padding: '0 5px', borderRadius: 10, background: 'var(--brand)', color: '#FFFFFF', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card)' },
  typingText: { fontSize: 11, color: 'var(--text-tertiary)' },
  errStrip: { padding: '8px 20px', background: '#FEE4E2', color: 'var(--danger)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  replyStrip: { padding: '10px 16px', background: 'var(--thread-bg)', display: 'flex', alignItems: 'center', gap: 10 },
  composer: { padding: '10px 16px 14px', background: 'var(--thread-bg)', display: 'flex', alignItems: 'flex-end', gap: 6 },
  composerIcon: { width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0, alignSelf: 'flex-end', marginBottom: 2 },
  composerWrap: { flex: 1, display: 'flex', alignItems: 'flex-end', minHeight: 44, borderRadius: 22, background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(11,11,15,0.04)', padding: '2px 4px 2px 4px', gap: 2, overflow: 'hidden' },
  composerInputArea: { flex: 1, position: 'relative', minHeight: 40, overflow: 'hidden' },
  composerMirror: { position: 'absolute', inset: 0, padding: '10px 4px', fontSize: 14, lineHeight: 1.5, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", fontFeatureSettings: 'normal', letterSpacing: 'normal', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflowWrap: 'break-word', overflow: 'hidden', pointerEvents: 'none' },
  composerInput: { position: 'relative', display: 'block', width: '100%', minHeight: 40, maxHeight: 140, padding: '10px 4px', background: 'transparent', border: 'none', fontSize: 14, lineHeight: 1.5, resize: 'none', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", fontFeatureSettings: 'normal', letterSpacing: 'normal', color: 'transparent', caretColor: 'var(--text-primary)', outline: 'none' },
  send: { height: 36, borderRadius: '50%', background: 'var(--brand)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'flex-end', marginBottom: 2, transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.16s ease, width 0.18s ease, margin-left 0.18s ease', overflow: 'hidden' },
  actionBar: { position: 'absolute', top: -32, display: 'flex', gap: 2, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, boxShadow: '0 2px 8px rgba(11,11,15,0.08)', zIndex: 5 },
  actionBtn: { width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' },
  picker: { position: 'absolute', top: -68, display: 'flex', gap: 2, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 24, padding: 4, boxShadow: '0 4px 16px rgba(11,11,15,0.12)', zIndex: 6 },
  pickerBtn: { width: 32, height: 32, borderRadius: 16, fontSize: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  reactionPill: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer' },
  reactionPillMine: { background: 'var(--brand-soft)', borderColor: 'var(--brand)', color: 'var(--brand)' },
  editArea: { width: '100%', minHeight: 36, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 10px', color: 'inherit', fontSize: 14, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' },
  smallBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: 'inherit', cursor: 'pointer' },
  mentionPopover: { position: 'absolute', bottom: 0, left: 12, width: 280, maxWidth: 'calc(100% - 24px)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 -4px 16px rgba(11,11,15,0.12)', overflow: 'hidden', maxHeight: 280, overflowY: 'auto', zIndex: 30 },
  mentionItem: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', textAlign: 'left' },
  mention: { display: 'inline-block', padding: '0 4px', borderRadius: 4, background: 'var(--brand-soft)', color: 'var(--brand)', fontWeight: 600 },
  searchOverlay: { position: 'absolute', top: 64, left: 0, right: 0, zIndex: 20, background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: 12 },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 10 },
  searchInputOverlay: { flex: 1, fontSize: 14, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)' },
  searchResults: { marginTop: 8, maxHeight: 320, overflowY: 'auto', background: 'var(--canvas)', borderRadius: 10 },
  searchResult: { display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  attStrip: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px', background: 'var(--canvas)', borderTop: '1px solid var(--border)' },
  attChip: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 },
};

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️'] },
  { label: 'Gestures', emojis: ['👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👋','🤚','🖐️','✋','🖖','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦿','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','💋','💘','💝','💖','💗','💓','💞','💕','💟','❣️','💔','❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','👁️‍🗨️','🗨️','🗯️','💭','💤'] },
  { label: 'Animals', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🕸️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦣','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'] },
  { label: 'Food', emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊'] },
  { label: 'Activities', emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🎰','🧩'] },
  { label: 'Travel', emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🦯','🦽','🦼','🛴','🚲','🛵','🏍️','🛺','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','💺','🛰️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','⛽','🚧','🚦','🚥','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🏠','🏡','🏘️','🏚️','🏗️','🏭','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🕍','🛕','🕋','⛩️','🛤️','🛣️','🗾','🎑','🏞️','🌅','🌄','🌠','🎇','🎆','🌇','🌆','🏙️','🌃','🌌','🌉','🌁'] },
  { label: 'Objects', emojis: ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','🪧','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'] },
  { label: 'Symbols', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','♾️','💲','💱','™️','©️','®️','〰️','➰','➿','🔚','🔙','🔛','🔝','🔜','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','⬛','⬜','🟧','🟨','🟩','🟦','🟪','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','👁️‍🗨️','💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🎴','🀄'] },
];

function EmojiPickerPanel({ anchor, onPick, onClose }: { anchor: HTMLElement | null; onPick: (e: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const PANEL_W = 340;
  const PANEL_H = 320;

  useEffect(() => {
    const compute = () => {
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      let top = r.top - PANEL_H - 8;
      if (top < 8) top = r.bottom + 8;
      let left = r.left;
      if (left + PANEL_W > window.innerWidth - 8) left = window.innerWidth - PANEL_W - 8;
      if (left < 8) left = 8;
      setPos({ top, left });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
      if (anchor && anchor.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose, anchor]);

  if (typeof document === 'undefined' || !pos) return null;
  const group = EMOJI_GROUPS[tab]!;
  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: PANEL_W, height: PANEL_H, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 28px rgba(11,11,15,0.18)', zIndex: 1000, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.label}
            onClick={() => setTab(i)}
            style={{ flex: '0 0 auto', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: i === tab ? 'var(--brand)' : 'var(--text-secondary)', borderBottom: i === tab ? '2px solid var(--brand)' : '2px solid transparent', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
        {group.emojis.map((e, i) => (
          <button
            key={`${tab}-${i}`}
            onClick={() => onPick(e)}
            style={{ height: 34, fontSize: 20, borderRadius: 6, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'var(--bubble-other)'; }}
            onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {e}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
