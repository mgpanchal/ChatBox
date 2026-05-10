import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, FlatList, ActivityIndicator,
  Modal, Alert, Animated, ScrollView, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { tokens } from '../../src/theme';
import { Avatar } from '../../src/components/Avatar';
import { SensitivityBadge } from '../../src/components/SensitivityBadge';
import { Watermark } from '../../src/components/Watermark';
import { RenderBody } from '../../src/components/RenderBody';
import { EmojiPickerSheet } from '../../src/components/EmojiPickerSheet';
import { api, API_BASE, type ConversationDetail, type MessageItem, type Me, type ConversationMember, type UploadResponse, type AttachmentItem, type SearchResult } from '../../src/api';
import { conversationCache } from '../../src/conversation-cache';
import { meStore } from '../../src/me-store';
import { sendQueue } from '../../src/send-queue';
import { isOnline, subscribeNetwork } from '../../src/use-network';

const ORIGIN = API_BASE.replace(/\/v1\/?$/, '');
function abs(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${ORIGIN}${url}`;
  return url;
}
import { getSocket, type ReceiptEvent, type TypingEvent } from '../../src/socket';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const EDIT_WINDOW_MIN = 15;
const PAGE_SIZE = 50;

// ---------- helpers ----------
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  const now = new Date();
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 90) return 'last seen just now';
  if (diffSec < 3600) return `last seen ${Math.floor(diffSec / 60)} min ago`;
  const sameDay = new Date(t).toDateString() === now.toDateString();
  const time = new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `last seen today at ${time}`;
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (new Date(t).toDateString() === yest.toDateString()) return `last seen yesterday at ${time}`;
  const dayDiff = Math.floor((Date.now() - t) / 86400000);
  if (dayDiff < 7) return `last seen ${new Date(t).toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`;
  return `last seen ${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}
function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dateSeparatorLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: diffDays >= 365 ? 'numeric' : undefined });
}
function initialsOf(s: string | null | undefined): string {
  if (!s) return '?';
  const parts = s.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
function statusOf(m: MessageItem): 'pending' | 'sent' | 'delivered' | 'read' {
  if (!m.self) return 'sent';
  if (m.id.startsWith('temp-')) return 'pending';
  const others = m.receipts.filter((r) => !!r.userId);
  if (others.length === 0) return 'sent';
  if (others.every((r) => r.readAt)) return 'read';
  if (others.some((r) => r.deliveredAt)) return 'delivered';
  return 'sent';
}
function Ticks({ status, color }: { status: 'pending' | 'sent' | 'delivered' | 'read'; color: string }) {
  if (status === 'pending') return <Feather name="clock" size={11} color={color} style={{ marginLeft: 3 }} />;
  if (status === 'read') {
    return (
      <View style={{ flexDirection: 'row', marginLeft: 3 }}>
        <Feather name="check" size={12} color="#5BA9FA" />
        <Feather name="check" size={12} color="#5BA9FA" style={{ marginLeft: -6 }} />
      </View>
    );
  }
  if (status === 'delivered') {
    return (
      <View style={{ flexDirection: 'row', marginLeft: 3 }}>
        <Feather name="check" size={12} color={color} />
        <Feather name="check" size={12} color={color} style={{ marginLeft: -6 }} />
      </View>
    );
  }
  return <Feather name="check" size={12} color={color} style={{ marginLeft: 3 }} />;
}

const AUTHOR_PALETTE = ['#1B91F1', '#1FA855', '#B250B9', '#DD3859', '#708A26', '#0EA5A4', '#D946EF', '#EA580C'];
function authorColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AUTHOR_PALETTE[h % AUTHOR_PALETTE.length]!;
}

// ---------- main screen ----------
export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meta, setMeta] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessageItem[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [actionTarget, setActionTarget] = useState<MessageItem | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [unreadWhilePinnedUp, setUnreadWhilePinnedUp] = useState(0);
  const [isPinnedAtBottom, setIsPinnedAtBottom] = useState(true);
  const [pendingAttachments, setPendingAttachments] = useState<UploadResponse[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ url: string; fileName?: string } | null>(null);
  const [online, setOnline] = useState(isOnline());

  // Track network state.
  useEffect(() => {
    const unsub = subscribeNetwork(setOnline);
    return unsub;
  }, []);
  const [forwardSource, setForwardSource] = useState<MessageItem | null>(null);
  const [receiptInspect, setReceiptInspect] = useState<MessageItem | null>(null);
  const [receiptMembers, setReceiptMembers] = useState<ConversationMember[] | null>(null);
  const listRef = useRef<FlatList<any>>(null);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oldestLoadedAtRef = useRef<string | null>(null);
  const pinnedRef = useRef(true);

  const markRead = useCallback((lastMessageId: string | undefined) => {
    if (!lastMessageId || !id) return;
    getSocket().emit('conversation:read', { conversationId: id, upToMessageId: lastMessageId });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;

    // Show cached entry instantly if available — zero spinner, zero network.
    const cached = conversationCache.get(id);
    if (cached) {
      setMeta(cached.meta);
      setMessages(cached.messages);
      setHasMore(cached.pagination.hasMore);
      oldestLoadedAtRef.current = cached.pagination.oldestLoadedAt;
    }
    const cachedMe = meStore.get();
    if (cachedMe) setMe(cachedMe);

    // Refresh in background (hits the network, swaps in fresh data).
    Promise.all([conversationCache.prefetch(id), meStore.ensure()])
      .then(([entry, who]) => {
        if (cancelled) return;
        setMeta(entry.meta);
        setMessages(entry.messages);
        setHasMore(entry.pagination.hasMore);
        oldestLoadedAtRef.current = entry.pagination.oldestLoadedAt;
        setMe(who);
        const last = entry.messages[entry.messages.length - 1];
        if (last && !last.self) markRead(last.id);
        for (const msg of entry.messages) {
          if (!msg.self && !msg.receipts.find((r) => r.userId === who.id && r.deliveredAt)) {
            getSocket().emit('message:delivered', { messageId: msg.id });
          }
        }
      })
      .catch((e) => { if (!cancelled && !cached) setError(e.message ?? 'Failed to load'); });
    return () => { cancelled = true; };
  }, [id, markRead]);

  // Mirror local state changes back into the cache.
  useEffect(() => {
    if (!id || !meta || !messages) return;
    const entry = conversationCache.get(id);
    if (!entry) {
      conversationCache.set(id, meta, messages, hasMore);
    } else if (entry.messages !== messages || entry.meta !== meta) {
      conversationCache.updateMessages(id, () => messages);
    }
  }, [id, meta, messages, hasMore]);

  // Realtime subscriptions
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
      if (pinnedRef.current) markRead(evt.message.id);
      else setUnreadWhilePinnedUp((n) => n + 1);
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
    s.on('typing', onTyping);
    return () => {
      s.off('message:new', onNew);
      s.off('message:receipt', onReceipt);
      s.off('message:reaction', onReaction);
      s.off('message:edited', onEdited);
      s.off('message:deleted', onDeleted);
      s.off('typing', onTyping);
    };
  }, [id, me?.id, markRead]);

  // Cleanup typing on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current && id) getSocket().emit('typing', { conversationId: id, typing: false });
    };
  }, [id]);

  const onDraftChange = (val: string) => {
    setDraft(val);
    // Detect trailing @<query> for mention popover.
    const m = val.match(/(?:^|\s)@([\p{L}\d]{0,40})$/u);
    setMentionQuery(m ? m[1] ?? '' : null);
    if (!id) return;
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

  const insertMention = (name: string) => {
    const text = draft.replace(/(?:^|\s)@([\p{L}\d]{0,40})$/u, (full) => `${full.startsWith(' ') ? ' ' : ''}@${name} `);
    setDraft(text);
    setMentionQuery(null);
  };

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null || !meta || meta.kind === 'direct') return [];
    const q = mentionQuery.toLowerCase();
    return meta.members
      .filter((m) => m.userId !== me?.id)
      .filter((m) => m.displayName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [mentionQuery, meta, me?.id]);

  const send = async () => {
    if (!id || sending) return;
    const text = draft.trim();
    const hasAtt = pendingAttachments.length > 0;
    if (!text && !hasAtt) return;
    const replyId = replyTo?.id;
    setSending(true);
    setDraft('');
    setReplyTo(null);
    const attachmentIds = pendingAttachments.map((a) => a.id);
    setPendingAttachments([]);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      getSocket().emit('typing', { conversationId: id, typing: false });
    }
    const tempId = `temp-${Date.now()}`;
    const attachmentsForOptimistic: AttachmentItem[] = pendingAttachments.map((a) => ({
      id: a.id, kind: a.kind, fileName: a.fileName, contentType: a.contentType, size: a.size,
      url: a.url, previewUrl: a.previewUrl, thumbUrl: a.thumbUrl, width: a.width ?? null, height: a.height ?? null,
    }));
    const optimistic: MessageItem = {
      id: tempId,
      body: text,
      deleted: false,
      sender: { id: me?.id ?? '', displayName: me?.profile?.displayName ?? '', employeeId: me?.profile?.employeeId ?? null, photoUrls: me?.profile?.photoUrls },
      self: true,
      replyToMessageId: replyId ?? null,
      replyToPreview: replyTo
        ? { senderName: replyTo.sender.displayName, body: replyTo.body, deleted: replyTo.deleted }
        : null,
      editedAt: null,
      createdAt: new Date().toISOString(),
      reactions: [],
      receipts: [],
      mentions: [],
      attachments: attachmentsForOptimistic,
      visibility: 'everyone',
      audienceTeams: [],
    };
    setMessages((prev) => (prev ? [...prev, optimistic] : prev));
    try {
      const real = await api.sendMessage(id, text, replyId, attachmentIds);
      setMessages((prev) => (prev ? prev.map((m) => (m.id === tempId ? { ...real, self: true } : m)) : prev));
    } catch (e: any) {
      setError(e.message ?? 'Send failed');
      setMessages((prev) => (prev ? prev.filter((m) => m.id !== tempId) : prev));
      setDraft(text);
      setPendingAttachments(attachmentsForOptimistic.map((a) => ({
        id: a.id, kind: a.kind, fileName: a.fileName, contentType: a.contentType, size: a.size,
        url: a.url, previewUrl: a.previewUrl, thumbUrl: a.thumbUrl, width: a.width ?? null, height: a.height ?? null,
      })));
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets[0]) return;
    await uploadOne(result.assets[0].uri, result.assets[0].fileName ?? 'image.jpg', result.assets[0].mimeType ?? 'image/jpeg');
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to capture photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    await uploadOne(result.assets[0].uri, `photo-${Date.now()}.jpg`, 'image/jpeg');
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    await uploadOne(a.uri, a.name, a.mimeType ?? 'application/octet-stream');
  };

  const uploadOne = async (uri: string, name: string, type: string) => {
    setUploading(true);
    try {
      const r = await api.uploadFile({ uri, name, type });
      setPendingAttachments((prev) => [...prev, r]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Try a different file.');
    } finally {
      setUploading(false);
    }
  };

  const removePending = (attId: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  // Debounced in-conversation search.
  useEffect(() => {
    if (!searchOpen || !id) return;
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      api.searchInConversation(id, q).then((r) => setSearchResults(r.results)).catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [id, searchOpen, searchQuery]);

  const jumpToMessage = (mid: string) => {
    setSearchOpen(false);
    setSearchQuery('');
    const idx = (messages ?? []).findIndex((m) => m.id === mid);
    if (idx === -1) {
      // Not in current window — just open and let user scroll.
      return;
    }
    // inverted FlatList: index in reversedItems = (renderItems.length - 1 - i)
    const renderIdx = renderItems.findIndex((it) => it.kind === 'msg' && it.m.id === mid);
    if (renderIdx === -1) return;
    const reversedIdx = renderItems.length - 1 - renderIdx;
    listRef.current?.scrollToIndex({ index: reversedIdx, animated: true, viewPosition: 0.5 });
  };

  const loadOlder = async () => {
    if (!id || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      await conversationCache.loadOlder(id);
      const entry = conversationCache.get(id);
      if (entry) {
        setMessages(entry.messages);
        setHasMore(entry.pagination.hasMore);
        oldestLoadedAtRef.current = entry.pagination.oldestLoadedAt;
      }
    } catch {
      // silent
    } finally {
      setLoadingOlder(false);
    }
  };

  const startEdit = (m: MessageItem) => {
    setEditingId(m.id);
    setEditingDraft(m.body ?? '');
  };
  const saveEdit = async (m: MessageItem) => {
    const v = editingDraft.trim();
    if (!v || !id) return;
    if (v === m.body) { setEditingId(null); return; }
    try {
      await api.editMessage(id, m.id, v);
      setMessages((prev) => prev?.map((x) => (x.id === m.id ? { ...x, body: v, editedAt: new Date().toISOString() } : x)) ?? prev);
    } catch (e: any) {
      Alert.alert('Edit failed', e.message ?? 'Try again');
    } finally {
      setEditingId(null);
      setEditingDraft('');
    }
  };

  const deleteMsg = (m: MessageItem) => {
    Alert.alert('Delete message', 'Delete for everyone? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await api.deleteMessage(id, m.id);
            setMessages((prev) => prev?.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null } : x)) ?? prev);
          } catch (e: any) {
            Alert.alert('Delete failed', e.message ?? 'Try again');
          }
        },
      },
    ]);
  };

  const toggleReaction = async (m: MessageItem, emoji: string) => {
    if (!id || !me) return;
    const mine = m.reactions.some((r) => r.userId === me.id && r.emoji === emoji);
    setMessages((prev) =>
      prev?.map((x) => {
        if (x.id !== m.id) return x;
        if (mine) return { ...x, reactions: x.reactions.filter((r) => !(r.userId === me.id && r.emoji === emoji)) };
        return { ...x, reactions: [...x.reactions, { userId: me.id, emoji }] };
      }) ?? prev,
    );
    try { await api.toggleReaction(id, m.id, emoji); } catch {}
  };

  // Sort + group messages, render with date separators + sender runs.
  const renderItems = useMemo(() => {
    if (!messages) return [];
    type Item =
      | { kind: 'date'; key: string; label: string }
      | { kind: 'msg'; key: string; m: MessageItem; isFirstOfRun: boolean };
    const items: Item[] = [];
    let prevDateKey: string | null = null;
    let prevSenderId: string | null = null;
    let prevAt = 0;
    for (const m of messages) {
      const dk = dateKey(m.createdAt);
      const at = new Date(m.createdAt).getTime();
      if (dk !== prevDateKey) {
        items.push({ kind: 'date', key: `d-${dk}`, label: dateSeparatorLabel(m.createdAt) });
      }
      const sameRun = dk === prevDateKey && prevSenderId === m.sender.id && at - prevAt < 5 * 60_000;
      items.push({ kind: 'msg', key: m.id, m, isFirstOfRun: !sameRun });
      prevDateKey = dk;
      prevSenderId = m.sender.id;
      prevAt = at;
    }
    return items;
  }, [messages]);

  const reversedItems = useMemo(() => [...renderItems].reverse(), [renderItems]);

  const onScroll = (e: any) => {
    const { contentOffset } = e.nativeEvent;
    // Inverted FlatList: contentOffset.y === 0 means at the visual bottom (newest).
    const pinned = contentOffset.y < 80;
    if (pinned !== pinnedRef.current) {
      pinnedRef.current = pinned;
      setIsPinnedAtBottom(pinned);
      if (pinned) setUnreadWhilePinnedUp(0);
    }
  };

  const onScrollToBottom = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setUnreadWhilePinnedUp(0);
    const last = messages?.[messages.length - 1];
    if (last && !last.self) markRead(last.id);
  };

  const typingNames = Object.keys(typingUsers)
    .map((uid) => meta?.members.find((m) => m.userId === uid)?.displayName?.split(' ')[0])
    .filter(Boolean) as string[];

  if (error && !meta) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={tokens.color.textPrimary} />
        </Pressable>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Couldn't load conversation</Text>
          <Text style={styles.emptySub}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!meta || !messages || !me) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.center}><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }

  const isConfidential = meta.sensitivity === 'confidential' || meta.sensitivity === 'restricted';
  const memberNames = meta.members.map((m) => m.displayName);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={tokens.color.textPrimary} />
          </Pressable>
          <Pressable style={styles.headerCenter} onPress={() => setShowMembers(true)}>
            {(() => {
              const other = meta.kind === 'direct' ? meta.members.find((mm) => mm.userId !== me.id) : null;
              const titleInitials = initialsOf(meta.title ?? '');
              return (
                <Avatar
                  initials={titleInitials}
                  size={40}
                  tone={meta.kind === 'announcement' ? 'inverse' : 'default'}
                  photoUrls={other?.photoUrls ?? null}
                  online={!!other?.online}
                />
              );
            })()}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.headerTitle}>{meta.title ?? 'Untitled'}</Text>
              <View style={styles.headerSubRow}>
                <SensitivityBadge value={meta.sensitivity} />
                <Text style={[styles.headerSub, typingNames.length > 0 && { color: tokens.color.brand, fontStyle: 'italic' }]} numberOfLines={1}>
                  {(() => {
                    if (typingNames.length > 0) {
                      if (meta.kind === 'direct') return 'typing…';
                      if (typingNames.length === 1) return `${typingNames[0]} is typing…`;
                      if (typingNames.length === 2) return `${typingNames[0]} and ${typingNames[1]} are typing…`;
                      return `${typingNames[0]} and ${typingNames.length - 1} others are typing…`;
                    }
                    if (meta.kind === 'direct') {
                      const other = meta.members.find((mm) => mm.userId !== me.id);
                      if (!other) return 'Direct';
                      if (other.online) return 'Online';
                      return formatLastSeen(other.lastSeenAt) ?? 'Offline';
                    }
                    if (meta.kind === 'announcement') return 'Announcement';
                    return `${meta.members.length} members`;
                  })()}
                </Text>
              </View>
            </View>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => setSearchOpen(true)}>
            <Feather name="search" size={20} color={tokens.color.textPrimary} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => setOverflowOpen(true)}>
            <Feather name="more-vertical" size={20} color={tokens.color.textPrimary} />
          </Pressable>
        </View>

        {isConfidential && (
          <View style={styles.banner}>
            <Feather name="lock" size={14} color={tokens.color.confidential} />
            <Text style={styles.bannerText} numberOfLines={2}>
              Confidential — screenshots are watermarked and audited.
            </Text>
          </View>
        )}

        <View style={styles.threadWrap}>
          {isConfidential && me.profile && (
            <Watermark label={`${me.profile.employeeId} · ${initialsOf(me.profile.displayName)}`} />
          )}
          <FlatList
            ref={listRef}
            data={reversedItems}
            inverted
            keyExtractor={(it) => it.key}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              if (item.kind === 'date') {
                return <DateSeparator label={item.label} />;
              }
              return (
                <Bubble
                  m={item.m}
                  meId={me.id}
                  showAvatar={item.isFirstOfRun}
                  showAuthor={item.isFirstOfRun && !item.m.self && meta.kind !== 'direct'}
                  hideAvatarSlot={meta.kind === 'direct'}
                  memberNames={memberNames}
                  onLongPress={() => setActionTarget(item.m)}
                  onReact={(emoji) => toggleReaction(item.m, emoji)}
                  editing={editingId === item.m.id}
                  editingDraft={editingDraft}
                  setEditingDraft={setEditingDraft}
                  onSaveEdit={() => saveEdit(item.m)}
                  onCancelEdit={() => setEditingId(null)}
                  onOpenImage={(a) => setViewerImage({ url: abs(a.url), fileName: a.fileName })}
                />
              );
            }}
            contentContainerStyle={{ paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.md, paddingBottom: tokens.space.md }}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.5}
            onScroll={onScroll}
            scrollEventThrottle={32}
            ListFooterComponent={
              !hasMore && messages.length > 0 ? (
                <Text style={styles.beginningSentinel}>BEGINNING OF CONVERSATION</Text>
              ) : loadingOlder ? (
                <View style={{ padding: 16, alignItems: 'center' }}><ActivityIndicator /></View>
              ) : null
            }
            ListHeaderComponent={
              typingNames.length > 0 ? (
                <View style={styles.typingRow}>
                  <Text style={styles.typingText}>{typingNames.join(', ')} typing…</Text>
                </View>
              ) : null
            }
          />

          {!isPinnedAtBottom && (
            <Pressable style={styles.scrollDownBtn} onPress={onScrollToBottom}>
              <Feather name="chevron-down" size={20} color={tokens.color.textPrimary} />
              {unreadWhilePinnedUp > 0 && (
                <View style={styles.scrollDownBadge}>
                  <Text style={styles.scrollDownBadgeText}>
                    {unreadWhilePinnedUp > 99 ? '99+' : unreadWhilePinnedUp}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        </View>

        {!online && (
          <View style={styles.offlineStrip}>
            <Feather name="wifi-off" size={13} color="#FFFFFF" />
            <Text style={styles.offlineText}>You're offline — messages will send when you reconnect</Text>
          </View>
        )}

        {error && (
          <View style={styles.errStrip}>
            <Text style={styles.errText}>{error}</Text>
            <Pressable onPress={() => setError(null)}><Text style={styles.errDismiss}>Dismiss</Text></Pressable>
          </View>
        )}

        {replyTo && (
          <View style={styles.replyStrip}>
            <Feather name="corner-up-left" size={14} color={tokens.color.textSecondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.replyTitle}>Replying to {replyTo.self ? 'yourself' : replyTo.sender.displayName}</Text>
              <Text style={styles.replyPreview} numberOfLines={1}>
                {replyTo.deleted ? 'Deleted message' : replyTo.body}
              </Text>
            </View>
            <Pressable onPress={() => setReplyTo(null)}>
              <Feather name="x" size={16} color={tokens.color.textSecondary} />
            </Pressable>
          </View>
        )}

        {mentionMatches.length > 0 && (
          <View style={styles.mentionPopover}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }}>
              {mentionMatches.map((m) => (
                <Pressable key={m.userId} style={styles.mentionItem} onPress={() => insertMention(m.displayName)}>
                  <Avatar initials={initialsOf(m.displayName)} size={28} photoUrls={m.photoUrls ?? null} />
                  <Text style={styles.mentionName}>{m.displayName}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {pendingAttachments.length > 0 && (
          <ScrollView horizontal style={styles.attStrip} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
            {pendingAttachments.map((a) => (
              <View key={a.id} style={styles.attChip}>
                {a.kind === 'image' && a.thumbUrl ? (
                  <Image source={abs(a.thumbUrl)} style={{ width: 36, height: 36, borderRadius: 6 }} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={styles.attIcon}>
                    <Feather name="file" size={16} color={tokens.color.textSecondary} />
                  </View>
                )}
                <View style={{ minWidth: 0 }}>
                  <Text style={styles.attName} numberOfLines={1}>{a.fileName}</Text>
                  <Text style={styles.attSize}>{(a.size / 1024).toFixed(0)} KB</Text>
                </View>
                <Pressable onPress={() => removePending(a.id)}>
                  <Feather name="x" size={14} color={tokens.color.textSecondary} />
                </Pressable>
              </View>
            ))}
            {uploading && <ActivityIndicator size="small" />}
          </ScrollView>
        )}

        <Composer
          draft={draft}
          onChange={onDraftChange}
          onSend={send}
          sending={sending}
          uploading={uploading}
          canSendMessage={draft.trim().length > 0 || pendingAttachments.length > 0}
          isConfidential={isConfidential}
          onPickImage={pickImage}
          onTakePhoto={takePhoto}
          onPickFile={pickFile}
          showCameraShortcut={draft.trim().length === 0 && pendingAttachments.length === 0}
        />
      </KeyboardAvoidingView>

      <MembersModal
        visible={showMembers}
        onClose={() => setShowMembers(false)}
        conversationId={id!}
        kind={meta.kind}
        meId={me.id}
      />

      <SearchModal
        visible={searchOpen}
        query={searchQuery}
        onQuery={setSearchQuery}
        results={searchResults}
        onClose={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); }}
        onJump={jumpToMessage}
      />

      <ActionSheet
        target={actionTarget}
        meId={me.id}
        onClose={() => setActionTarget(null)}
        onReply={(m) => { setReplyTo(m); setActionTarget(null); }}
        onReact={(m, emoji) => { toggleReaction(m, emoji); setActionTarget(null); }}
        onEdit={(m) => { startEdit(m); setActionTarget(null); }}
        onDelete={(m) => { setActionTarget(null); deleteMsg(m); }}
        onForward={(m) => { setActionTarget(null); setForwardSource(m); }}
        onInfo={(m) => {
          setActionTarget(null);
          setReceiptInspect(m);
          setReceiptMembers(null);
          if (id) api.listConversationMembers(id).then(setReceiptMembers).catch(() => setReceiptMembers([]));
        }}
      />

      <ForwardModal
        source={forwardSource}
        onClose={() => setForwardSource(null)}
        onForwarded={() => Alert.alert('Forwarded')}
      />

      <ReceiptsModal
        message={receiptInspect}
        members={receiptMembers}
        onClose={() => { setReceiptInspect(null); setReceiptMembers(null); }}
      />

      <ImageViewer
        image={viewerImage}
        onClose={() => setViewerImage(null)}
      />

      <Modal visible={overflowOpen} transparent animationType="fade" onRequestClose={() => setOverflowOpen(false)}>
        <Pressable style={styles.actionBackdrop} onPress={() => setOverflowOpen(false)}>
          <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
            <ActionItem
              icon="users"
              label={meta.kind === 'direct' ? 'Contact info' : `${meta.members.length} members`}
              onPress={() => { setOverflowOpen(false); setShowMembers(true); }}
            />
            <ActionItem
              icon={isMuted ? 'bell' : 'bell-off'}
              label={isMuted ? 'Unmute notifications' : 'Mute notifications'}
              onPress={async () => {
                setOverflowOpen(false);
                if (!id) return;
                const next = isMuted ? null : new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 50).toISOString();
                try { await api.muteConversation(id, next); setIsMuted(!isMuted); } catch {}
              }}
            />
            <ActionItem
              icon="search"
              label="Search"
              onPress={() => { setOverflowOpen(false); setSearchOpen(true); }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ---------- date separator ----------
function DateSeparator({ label }: { label: string }) {
  return (
    <View style={styles.dateSeparator}>
      <View style={styles.dateChip}>
        <Text style={styles.dateChipText}>{label}</Text>
      </View>
    </View>
  );
}

// ---------- Bubble ----------
function Bubble(props: {
  m: MessageItem;
  meId: string;
  showAvatar: boolean;
  showAuthor: boolean;
  hideAvatarSlot: boolean;
  memberNames: string[];
  onLongPress: () => void;
  onReact: (emoji: string) => void;
  editing: boolean;
  editingDraft: string;
  setEditingDraft: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onOpenImage: (a: AttachmentItem) => void;
}) {
  const { m, meId, showAvatar, showAuthor, hideAvatarSlot, memberNames, onLongPress, editing, editingDraft, setEditingDraft, onSaveEdit, onCancelEdit, onOpenImage } = props;
  const status = statusOf(m);
  const isRestricted = m.visibility === 'restricted' && m.audienceTeams.length > 0 && !m.deleted;
  const grouped: Record<string, string[]> = {};
  for (const r of m.reactions) {
    grouped[r.emoji] = grouped[r.emoji] ? [...grouped[r.emoji]!, r.userId] : [r.userId];
  }
  const TRUNCATE_CHARS = 600;
  const fullBody = m.body ?? '';
  const isLong = !m.deleted && fullBody.length > TRUNCATE_CHARS;
  const [expanded, setExpanded] = useState(false);
  const fullyShown = !isLong || expanded;
  const displayBody = fullyShown ? fullBody : (() => {
    const cut = fullBody.slice(0, TRUNCATE_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    const lastNewline = cut.lastIndexOf('\n');
    const breakAt = Math.max(lastSpace, lastNewline);
    return (breakAt > TRUNCATE_CHARS * 0.7 ? cut.slice(0, breakAt) : cut) + '…';
  })();

  return (
    <View style={[styles.msgRow, m.self ? styles.msgRowSelf : null]}>
      {!m.self && !hideAvatarSlot && (showAvatar
        ? <Avatar initials={initialsOf(m.sender.displayName)} size={28} photoUrls={m.sender.photoUrls ?? null} />
        : <View style={{ width: 28, minWidth: 28 }} />)}
      <View style={[styles.bubbleWrap, m.self && styles.bubbleWrapSelf]}>
        {showAuthor && (
          <Text style={[styles.author, { color: authorColor(m.sender.id) }]}>{m.sender.displayName}</Text>
        )}

        {isRestricted && (
          <View style={styles.audiencePill}>
            <Feather name="lock" size={9} color={tokens.color.brand} />
            <Text style={styles.audiencePillText}>
              {m.audienceTeams.map((t) => t.name.toUpperCase()).join(' · ')} ONLY
            </Text>
          </View>
        )}

        <Pressable
          onLongPress={m.redacted ? undefined : onLongPress}
          delayLongPress={220}
          style={[
            styles.bubble,
            m.self ? styles.bubbleSelf : styles.bubbleOther,
            showAvatar && (m.self ? styles.bubbleFirstSelf : styles.bubbleFirstOther),
            m.redacted && { opacity: 0.85 },
          ]}
        >
          {m.replyToPreview && !m.deleted && (
            <View style={[styles.quote, { borderLeftColor: m.self ? 'rgba(255,255,255,0.6)' : tokens.color.brand }]}>
              <Text style={[styles.quoteName, m.self ? styles.textOnSelf : styles.textOnOther]}>
                {m.replyToPreview.senderName}
              </Text>
              <Text style={[styles.quoteBody, m.self ? styles.textOnSelf : styles.textOnOther]} numberOfLines={2}>
                {m.replyToPreview.deleted ? 'Deleted message' : m.replyToPreview.body}
              </Text>
            </View>
          )}

          {!editing && !m.deleted && m.attachments.length > 0 && (
            <AttachmentGrid attachments={m.attachments} self={m.self} onOpenImage={onOpenImage} />
          )}

          {editing ? (
            <View>
              <TextInput
                value={editingDraft}
                onChangeText={setEditingDraft}
                multiline
                autoFocus
                style={styles.editInput}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <Pressable onPress={onCancelEdit}><Text style={styles.editCancel}>Cancel</Text></Pressable>
                <Pressable onPress={onSaveEdit}><Text style={styles.editSave}>Save</Text></Pressable>
              </View>
            </View>
          ) : m.deleted ? (
            <Text style={[styles.bubbleText, m.self ? styles.bubbleTextSelf : styles.bubbleTextOther, { fontStyle: 'italic' }]}>
              This message was deleted
            </Text>
          ) : m.redacted ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="lock" size={13} color={m.self ? 'rgba(255,255,255,0.7)' : tokens.color.textTertiary} />
              <Text style={[styles.bubbleText, m.self ? styles.bubbleTextSelf : styles.bubbleTextOther, { fontStyle: 'italic', opacity: 0.85 }]}>
                Private message — visible only to {m.audienceTeams.length > 0 ? m.audienceTeams.map((t) => t.name).join(', ') : 'restricted audience'}
              </Text>
            </View>
          ) : (
            <View>
              <RenderBody
                body={displayBody}
                self={m.self}
                memberNames={memberNames}
                baseStyle={[styles.bubbleText, m.self ? styles.bubbleTextSelf : styles.bubbleTextOther]}
              />
              {isLong && !fullyShown && (
                <Pressable onPress={() => setExpanded(true)}>
                  <Text style={[styles.bubbleText, m.self ? { color: 'rgba(255,255,255,0.7)' } : { color: tokens.color.textTertiary }]}>
                    Read more
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <View style={styles.metaRow}>
            <Text style={[styles.time, m.self ? styles.timeSelf : styles.timeOther]}>
              {clockTime(m.createdAt)}
              {m.editedAt && !m.deleted ? ' · edited' : ''}
            </Text>
            {m.self && <Ticks status={status} color={m.self ? 'rgba(255,255,255,0.6)' : tokens.color.textTertiary} />}
          </View>
        </Pressable>

        {Object.keys(grouped).length > 0 && (
          <View style={styles.reactionsRow}>
            {Object.entries(grouped).map(([emoji, users]) => {
              const mine = users.includes(meId);
              return (
                <Pressable
                  key={emoji}
                  onPress={() => props.onReact(emoji)}
                  style={[styles.reactionPill, mine && styles.reactionPillMine]}
                >
                  <Text style={{ fontSize: 13 }}>{emoji}</Text>
                  <Text style={[styles.reactionCount, mine && { color: tokens.color.brand }]}>{users.length}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

// ---------- ActionSheet (long-press menu) ----------
function ActionSheet({
  target, meId, onClose, onReply, onReact, onEdit, onDelete, onForward, onInfo,
}: {
  target: MessageItem | null;
  meId: string;
  onClose: () => void;
  onReply: (m: MessageItem) => void;
  onReact: (m: MessageItem, emoji: string) => void;
  onEdit: (m: MessageItem) => void;
  onDelete: (m: MessageItem) => void;
  onForward: (m: MessageItem) => void;
  onInfo: (m: MessageItem) => void;
}) {
  if (!target) return null;
  const canEdit = target.self && !target.deleted &&
    (Date.now() - new Date(target.createdAt).getTime()) < EDIT_WINDOW_MIN * 60_000;
  const canDelete = target.self && !target.deleted;
  const canForward = !target.deleted;
  const canInfo = target.self && target.receipts.length > 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.actionBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.actionReactRow}>
            {QUICK_REACTIONS.map((emoji) => (
              <Pressable key={emoji} onPress={() => onReact(target, emoji)} style={styles.actionReactBtn}>
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.actionDivider} />
          <ActionItem icon="corner-up-left" label="Reply" onPress={() => onReply(target)} />
          {canForward && <ActionItem icon="corner-up-right" label="Forward" onPress={() => onForward(target)} />}
          {canInfo && <ActionItem icon="info" label="Read receipts" onPress={() => onInfo(target)} />}
          {canEdit && <ActionItem icon="edit-2" label="Edit" onPress={() => onEdit(target)} />}
          {canDelete && <ActionItem icon="trash-2" label="Delete" danger onPress={() => onDelete(target)} />}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- Receipts info modal ----------
function ReceiptsModal({
  message, members, onClose,
}: {
  message: MessageItem | null;
  members: ConversationMember[] | null;
  onClose: () => void;
}) {
  if (!message) return null;
  const map = new Map(message.receipts.map((r) => [r.userId, r]));
  const rows = (members ?? []).filter((m) => m.userId !== message.sender.id);
  const read = rows.filter((m) => map.get(m.userId)?.readAt);
  const delivered = rows.filter((m) => map.get(m.userId)?.deliveredAt && !map.get(m.userId)?.readAt);
  const pending = rows.filter((m) => !map.get(m.userId)?.deliveredAt);

  const Section = ({ label, list }: { label: string; list: ConversationMember[] }) => (
    list.length > 0 ? (
      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: tokens.color.textTertiary, fontSize: 11, fontWeight: tokens.weight.semibold, letterSpacing: 1.2, paddingHorizontal: 4, marginBottom: 6 }}>
          {label.toUpperCase()} · {list.length}
        </Text>
        {list.map((m) => {
          const r = map.get(m.userId);
          const ts = r?.readAt ?? r?.deliveredAt;
          return (
            <View key={m.userId} style={styles.memberRow}>
              <Avatar initials={initialsOf(m.displayName)} size={32} photoUrls={m.photoUrls ?? null} />
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.displayName}</Text>
                {ts && <Text style={styles.memberSub}>{new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>}
              </View>
            </View>
          );
        })}
      </View>
    ) : null
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.actionBackdrop} onPress={onClose}>
        <Pressable style={[styles.actionSheet, { maxHeight: '80%' }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Message info</Text>
            <Pressable onPress={onClose}><Feather name="x" size={20} color={tokens.color.textSecondary} /></Pressable>
          </View>
          {!members ? (
            <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator /></View>
          ) : (
            <ScrollView style={{ maxHeight: 480 }}>
              <Section label="Read by" list={read} />
              <Section label="Delivered to" list={delivered} />
              <Section label="Not yet delivered" list={pending} />
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- Forward modal ----------
function ForwardModal({
  source, onClose, onForwarded,
}: {
  source: MessageItem | null;
  onClose: () => void;
  onForwarded: () => void;
}) {
  const [convos, setConvos] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    api.listConversations().then(setConvos).catch(() => setConvos([]));
  }, [source]);

  if (!source) return null;
  const body = source.body ?? '';

  const sendTo = async (cid: string) => {
    setBusy(cid);
    try {
      await api.sendMessage(cid, body, undefined, source.attachments.map((a) => a.id));
      onForwarded();
      onClose();
    } catch (e: any) {
      Alert.alert('Forward failed', e.message ?? 'Try again');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.actionBackdrop} onPress={onClose}>
        <Pressable style={[styles.actionSheet, { maxHeight: '80%' }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Forward to…</Text>
            <Pressable onPress={onClose}><Feather name="x" size={20} color={tokens.color.textSecondary} /></Pressable>
          </View>
          <Text style={{ color: tokens.color.textSecondary, fontSize: 13, marginBottom: 8 }} numberOfLines={2}>
            {body || `${source.attachments.length} attachment(s)`}
          </Text>
          {!convos ? (
            <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator /></View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              {convos.map((c: any) => (
                <Pressable
                  key={c.id}
                  style={styles.memberRow}
                  disabled={busy === c.id}
                  onPress={() => sendTo(c.id)}
                >
                  <Avatar initials={initialsOf(c.title ?? '')} photoUrls={c.otherPhotoUrls ?? null} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.memberName}>{c.title ?? 'Untitled'}</Text>
                    <Text style={styles.memberSub}>{c.kind === 'direct' ? 'Direct' : `${c.kind}`}</Text>
                  </View>
                  {busy === c.id ? <ActivityIndicator size="small" /> : <Feather name="send" size={18} color={tokens.color.textSecondary} />}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- Full-screen image viewer ----------
function ImageViewer({
  image, onClose,
}: {
  image: { url: string; fileName?: string } | null;
  onClose: () => void;
}) {
  if (!image) return null;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewerScreen}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.viewerTopBar}>
            <Pressable onPress={onClose} style={styles.viewerIconBtn}>
              <Feather name="x" size={24} color="#FFFFFF" />
            </Pressable>
            {image.fileName && (
              <Text style={styles.viewerFileName} numberOfLines={1}>{image.fileName}</Text>
            )}
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync(image.url).catch(() => {})}
              style={styles.viewerIconBtn}
            >
              <Feather name="external-link" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
          <Pressable style={{ flex: 1 }} onPress={onClose}>
            <Image
              source={image.url}
              style={{ flex: 1, width: '100%' }}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={120}
            />
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function ActionItem({ icon, label, danger, onPress }: { icon: any; label: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.actionItem} onPress={onPress}>
      <Feather name={icon} size={18} color={danger ? tokens.color.danger : tokens.color.textPrimary} />
      <Text style={[styles.actionItemLabel, danger && { color: tokens.color.danger }]}>{label}</Text>
    </Pressable>
  );
}

// ---------- Members modal ----------
function MembersModal({
  visible, onClose, conversationId, kind, meId,
}: {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  kind: ConversationDetail['kind'];
  meId: string;
}) {
  const [members, setMembers] = useState<ConversationMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMembers(null);
    api.listConversationMembers(conversationId).then(setMembers).catch((e) => setError(e.message ?? 'Failed'));
  }, [visible, conversationId]);

  const onLeave = () => {
    Alert.alert('Leave conversation?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          try { await api.leaveConversation(conversationId); router.replace('/(tabs)'); }
          catch (e: any) { Alert.alert('Failed', e.message ?? 'Try again'); setLeaving(false); }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.actionBackdrop} onPress={onClose}>
        <Pressable style={[styles.actionSheet, { maxHeight: '80%' }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{members ? `${members.length} member${members.length === 1 ? '' : 's'}` : 'Members'}</Text>
            <Pressable onPress={onClose}>
              <Feather name="x" size={20} color={tokens.color.textSecondary} />
            </Pressable>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          {!members && !error ? (
            <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator /></View>
          ) : members ? (
            <ScrollView style={{ maxHeight: 420 }}>
              {members.map((m) => (
                <View key={m.userId} style={styles.memberRow}>
                  <Avatar initials={initialsOf(m.displayName)} size={36} photoUrls={m.photoUrls ?? null} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.memberName}>
                      {m.displayName}
                      {m.userId === meId && <Text style={{ color: tokens.color.textTertiary }}> (you)</Text>}
                      {m.isAdmin && <Text style={{ color: tokens.color.brand, fontSize: 10 }}> · ADMIN</Text>}
                    </Text>
                    <Text style={styles.memberSub} numberOfLines={1}>
                      {m.online ? 'Online' : 'Offline'}{m.title ? ` · ${m.title}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}
          {kind !== 'direct' && (
            <Pressable style={styles.leaveBtn} onPress={onLeave} disabled={leaving}>
              {leaving ? <ActivityIndicator color={tokens.color.danger} /> : (
                <>
                  <Feather name="log-out" size={16} color={tokens.color.danger} />
                  <Text style={styles.leaveBtnText}>Leave</Text>
                </>
              )}
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- Search modal ----------
function SearchModal({
  visible, query, onQuery, results, onClose, onJump,
}: {
  visible: boolean;
  query: string;
  onQuery: (q: string) => void;
  results: SearchResult[];
  onClose: () => void;
  onJump: (msgId: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.canvas }} edges={['top']}>
        <View style={styles.searchBar}>
          <Pressable onPress={onClose}>
            <Feather name="arrow-left" size={22} color={tokens.color.textPrimary} />
          </Pressable>
          <TextInput
            autoFocus
            value={query}
            onChangeText={onQuery}
            placeholder="Search in conversation"
            placeholderTextColor={tokens.color.textTertiary}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => onQuery('')}>
              <Feather name="x" size={18} color={tokens.color.textSecondary} />
            </Pressable>
          )}
        </View>
        <ScrollView style={{ flex: 1 }}>
          {query.trim().length < 2 ? (
            <Text style={styles.muted}>Type at least 2 characters.</Text>
          ) : results.length === 0 ? (
            <Text style={styles.muted}>No matches.</Text>
          ) : (
            results.map((r) => (
              <Pressable key={r.id} style={styles.searchResult} onPress={() => onJump(r.id)}>
                <Text style={styles.searchResultMeta}>
                  {r.sender.displayName} · {clockTime(r.createdAt)}
                </Text>
                <Text style={styles.searchResultBody} numberOfLines={2}>{r.body}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------- Attachment grid in bubble ----------
function AttachmentGrid({
  attachments, self, onOpenImage,
}: {
  attachments: AttachmentItem[];
  self: boolean;
  onOpenImage: (a: AttachmentItem) => void;
}) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <View style={{ gap: 6, marginBottom: attachments.length > 0 ? 6 : 0 }}>
      {attachments.map((a) => {
        if (a.kind === 'image') {
          const ratio = a.width && a.height ? a.width / a.height : 1;
          const w = 220;
          const h = w / ratio;
          return (
            <Pressable key={a.id} onPress={() => onOpenImage(a)}>
              <Image
                source={abs(a.previewUrl ?? a.url)}
                style={{ width: w, height: Math.min(h, 280), borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.06)' }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
              />
            </Pressable>
          );
        }
        return (
          <Pressable
            key={a.id}
            onPress={async () => {
              // Open files inside an in-app browser instead of leaving the app.
              try { await WebBrowser.openBrowserAsync(abs(a.url)); } catch {}
            }}
            style={[styles.fileChip, { backgroundColor: self ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)' }]}
          >
            <Feather name={a.kind === 'video' ? 'film' : a.kind === 'audio' ? 'volume-2' : 'file'} size={20} color={self ? '#FFFFFF' : tokens.color.textPrimary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.fileChipName, { color: self ? '#FFFFFF' : tokens.color.textPrimary }]} numberOfLines={1}>{a.fileName}</Text>
              <Text style={{ color: self ? 'rgba(255,255,255,0.6)' : tokens.color.textTertiary, fontSize: 11 }}>
                {(a.size / 1024).toFixed(0)} KB
              </Text>
            </View>
            <Feather name="download" size={16} color={self ? 'rgba(255,255,255,0.7)' : tokens.color.textSecondary} />
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Composer ----------
function Composer({
  draft, onChange, onSend, sending, uploading, canSendMessage, isConfidential, onPickImage, onTakePhoto, onPickFile, showCameraShortcut,
}: {
  draft: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  uploading: boolean;
  canSendMessage: boolean;
  isConfidential: boolean;
  onPickImage: () => void;
  onTakePhoto: () => void;
  onPickFile: () => void;
  showCameraShortcut: boolean;
}) {
  const sendScale = useRef(new Animated.Value(canSendMessage ? 1 : 0)).current;
  const cameraScale = useRef(new Animated.Value(showCameraShortcut ? 1 : 0)).current;
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    Animated.spring(sendScale, { toValue: canSendMessage ? 1 : 0, useNativeDriver: true, friction: 6, tension: 120 }).start();
  }, [canSendMessage, sendScale]);
  useEffect(() => {
    Animated.spring(cameraScale, { toValue: showCameraShortcut ? 1 : 0, useNativeDriver: true, friction: 6, tension: 140 }).start();
  }, [showCameraShortcut, cameraScale]);

  return (
    <View style={styles.composer}>
      <View style={styles.composerPill}>
        <Pressable style={styles.composerIcon} onPress={() => setAttachOpen(true)} disabled={uploading}>
          {uploading ? <ActivityIndicator size="small" /> : <Feather name="paperclip" size={20} color={tokens.color.textSecondary} />}
        </Pressable>
        <Pressable style={styles.composerIcon} onPress={() => setEmojiOpen(true)}>
          <Feather name="smile" size={20} color={tokens.color.textSecondary} />
        </Pressable>
        <TextInput
          style={styles.composerInput}
          value={draft}
          onChangeText={onChange}
          placeholder={isConfidential ? 'Message — Confidential' : 'Message'}
          placeholderTextColor={tokens.color.textTertiary}
          multiline
          editable={!sending}
        />
        <Animated.View style={{ transform: [{ scale: cameraScale }], opacity: cameraScale, width: showCameraShortcut ? undefined : 0 }}>
          {showCameraShortcut && (
            <Pressable style={styles.composerIcon} onPress={onTakePhoto}>
              <Feather name="camera" size={20} color={tokens.color.textSecondary} />
            </Pressable>
          )}
        </Animated.View>
        <Animated.View style={{ transform: [{ scale: sendScale }], opacity: sendScale }}>
          <Pressable style={styles.send} onPress={onSend} disabled={!canSendMessage || sending}>
            {sending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Feather name="arrow-up" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </Animated.View>
      </View>

      <Modal visible={attachOpen} transparent animationType="fade" onRequestClose={() => setAttachOpen(false)}>
        <Pressable style={styles.actionBackdrop} onPress={() => setAttachOpen(false)}>
          <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
            <ActionItem icon="image" label="Photo from library" onPress={() => { setAttachOpen(false); onPickImage(); }} />
            <ActionItem icon="camera" label="Take photo" onPress={() => { setAttachOpen(false); onTakePhoto(); }} />
            <ActionItem icon="paperclip" label="File" onPress={() => { setAttachOpen(false); onPickFile(); }} />
          </Pressable>
        </Pressable>
      </Modal>

      <EmojiPickerSheet
        visible={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onPick={(e) => onChange(draft + e)}
      />
    </View>
  );
}

// ---------- styles ----------
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.canvas },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.space.xxl, gap: tokens.space.sm },
  emptyTitle: { color: tokens.color.textPrimary, fontSize: tokens.font.xl, fontWeight: tokens.weight.semibold },
  emptySub: { color: tokens.color.textSecondary, fontSize: tokens.font.md, textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm,
    paddingHorizontal: tokens.space.md, paddingTop: tokens.space.xs, paddingBottom: tokens.space.md,
    borderBottomWidth: 1, borderBottomColor: tokens.color.border, backgroundColor: tokens.color.card,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: tokens.color.textPrimary, fontSize: tokens.font.lg, fontWeight: tokens.weight.semibold },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm },
  headerSub: { color: tokens.color.textSecondary, fontSize: tokens.font.xs, flexShrink: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: tokens.radius.full, alignItems: 'center', justifyContent: 'center' },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm,
    paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.sm,
    backgroundColor: tokens.color.confidentialSoft,
  },
  bannerText: { color: tokens.color.confidential, fontSize: tokens.font.sm, flex: 1 },

  threadWrap: { flex: 1, position: 'relative', backgroundColor: '#ECEEF3' },

  dateSeparator: { alignItems: 'center', marginVertical: 14 },
  dateChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  dateChipText: { color: tokens.color.textSecondary, fontSize: 12, fontWeight: tokens.weight.semibold, letterSpacing: 0.3 },

  beginningSentinel: { textAlign: 'center', color: tokens.color.textTertiary, fontSize: 12, fontWeight: tokens.weight.semibold, letterSpacing: 0.4, paddingVertical: 16 },

  typingRow: { paddingHorizontal: 8, paddingVertical: 6 },
  typingText: { color: tokens.color.textTertiary, fontSize: 13, fontStyle: 'italic' },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: tokens.space.sm, marginTop: 4 },
  msgRowSelf: { justifyContent: 'flex-end' },
  bubbleWrap: { maxWidth: '78%' },
  bubbleWrapSelf: { alignItems: 'flex-end' },
  author: { fontSize: tokens.font.xs, marginLeft: tokens.space.sm, marginBottom: 2, fontWeight: tokens.weight.semibold },

  audiencePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
    backgroundColor: tokens.color.brandSoft,
    alignSelf: 'flex-start', marginBottom: 3,
  },
  audiencePillText: { color: tokens.color.brand, fontSize: 10, fontWeight: tokens.weight.semibold, letterSpacing: 0.2 },

  bubble: {
    paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.sm + 2, borderRadius: tokens.radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleSelf: { backgroundColor: tokens.color.bubbleSelf, borderBottomRightRadius: tokens.radius.sm },
  bubbleOther: { backgroundColor: tokens.color.bubbleOther, borderBottomLeftRadius: tokens.radius.sm },
  bubbleFirstSelf: { borderTopRightRadius: tokens.radius.sm },
  bubbleFirstOther: { borderTopLeftRadius: tokens.radius.sm },
  bubbleText: { fontSize: tokens.font.md, lineHeight: 24 },
  bubbleTextSelf: { color: tokens.color.textOnInverse },
  bubbleTextOther: { color: tokens.color.textPrimary },
  textOnSelf: { color: '#FFFFFF' },
  textOnOther: { color: tokens.color.textPrimary },

  quote: {
    borderLeftWidth: 3, paddingHorizontal: 8, paddingVertical: 4,
    marginBottom: 6, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  quoteName: { fontSize: 13, fontWeight: tokens.weight.semibold },
  quoteBody: { fontSize: 13, opacity: 0.9 },

  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginTop: 2 },
  time: { fontSize: 11 },
  timeSelf: { color: 'rgba(255,255,255,0.65)' },
  timeOther: { color: tokens.color.textTertiary },

  reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12,
    backgroundColor: tokens.color.card, borderWidth: 1, borderColor: tokens.color.border,
  },
  reactionPillMine: { backgroundColor: tokens.color.brandSoft, borderColor: tokens.color.brand },
  reactionCount: { fontSize: 12, fontWeight: tokens.weight.semibold, color: tokens.color.textPrimary },

  scrollDownBtn: {
    position: 'absolute', bottom: 16, right: 16,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: tokens.color.card, borderWidth: 1, borderColor: tokens.color.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  scrollDownBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10,
    backgroundColor: tokens.color.brand,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: tokens.color.card,
  },
  scrollDownBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: tokens.weight.bold },

  offlineStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: tokens.space.lg, paddingVertical: 8,
    backgroundColor: '#0B0B0F',
  },
  offlineText: { color: '#FFFFFF', fontSize: 12, fontWeight: tokens.weight.medium, flex: 1 },

  errStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.sm,
    backgroundColor: '#FEE4E2',
  },
  errText: { color: tokens.color.danger, fontSize: tokens.font.sm, flex: 1 },
  errDismiss: { color: tokens.color.danger, fontSize: tokens.font.sm, fontWeight: tokens.weight.semibold },

  replyStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.sm,
    backgroundColor: tokens.color.card, borderTopWidth: 1, borderTopColor: tokens.color.border,
  },
  replyTitle: { color: tokens.color.textSecondary, fontSize: 12, fontWeight: tokens.weight.semibold },
  replyPreview: { color: tokens.color.textTertiary, fontSize: 13 },

  composer: { padding: tokens.space.sm, backgroundColor: tokens.color.card, borderTopWidth: 1, borderTopColor: tokens.color.border },
  composerPill: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 2,
    minHeight: 44, borderRadius: 22,
    backgroundColor: tokens.color.canvas, borderWidth: 1, borderColor: tokens.color.border,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  composerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', marginBottom: 2 },
  composerInput: {
    flex: 1, minHeight: 36, maxHeight: 120,
    paddingHorizontal: 4, paddingVertical: 8,
    fontSize: tokens.font.md, color: tokens.color.textPrimary,
  },
  send: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: tokens.color.brand,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'flex-end', marginBottom: 2,
  },

  editInput: {
    minHeight: 30, padding: 4,
    color: '#FFFFFF',
    fontSize: tokens.font.md, lineHeight: 22,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6,
  },
  editCancel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: tokens.weight.semibold, padding: 4 },
  editSave: { color: '#FFFFFF', fontSize: 12, fontWeight: tokens.weight.bold, padding: 4 },

  actionBackdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.4)', justifyContent: 'flex-end' },
  actionSheet: {
    backgroundColor: tokens.color.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 12, paddingBottom: 28, gap: 4,
  },
  actionReactRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },
  actionReactBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionDivider: { height: 1, backgroundColor: tokens.color.border, marginVertical: 4 },
  actionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 10,
  },
  actionItemLabel: { color: tokens.color.textPrimary, fontSize: tokens.font.md, fontWeight: tokens.weight.medium },

  attStrip: {
    flexGrow: 0,
    paddingVertical: 8,
    backgroundColor: tokens.color.card,
    borderTopWidth: 1, borderTopColor: tokens.color.border,
  },
  attChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10,
    backgroundColor: tokens.color.canvas, borderWidth: 1, borderColor: tokens.color.border,
    minWidth: 160, maxWidth: 220,
  },
  attIcon: { width: 36, height: 36, borderRadius: 6, backgroundColor: tokens.color.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: tokens.color.border },
  attName: { color: tokens.color.textPrimary, fontSize: 12, fontWeight: tokens.weight.semibold },
  attSize: { color: tokens.color.textTertiary, fontSize: 11 },

  fileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 10, marginBottom: 4,
    minWidth: 200,
  },
  fileChipName: { fontSize: 13, fontWeight: tokens.weight.semibold, marginBottom: 2 },

  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 4 },
  modalTitle: { color: tokens.color.textPrimary, fontSize: tokens.font.lg, fontWeight: tokens.weight.bold },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
  },
  memberName: { color: tokens.color.textPrimary, fontSize: tokens.font.md, fontWeight: tokens.weight.semibold },
  memberSub: { color: tokens.color.textSecondary, fontSize: 12, marginTop: 2 },

  leaveBtn: {
    marginTop: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: tokens.radius.lg,
    backgroundColor: '#FEE4E2',
  },
  leaveBtnText: { color: tokens.color.danger, fontWeight: tokens.weight.semibold, fontSize: tokens.font.md },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.sm,
    borderBottomWidth: 1, borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.card,
  },
  searchInput: {
    flex: 1, fontSize: tokens.font.md, color: tokens.color.textPrimary,
    paddingVertical: 4,
  },
  muted: { color: tokens.color.textTertiary, padding: tokens.space.xl, textAlign: 'center', fontSize: tokens.font.sm },
  searchResult: {
    paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.md,
    borderBottomWidth: 1, borderBottomColor: tokens.color.border,
  },
  searchResultMeta: { color: tokens.color.textSecondary, fontSize: 12, fontWeight: tokens.weight.semibold },
  searchResultBody: { color: tokens.color.textPrimary, fontSize: tokens.font.sm, marginTop: 4 },

  error: { color: tokens.color.danger, padding: 12, textAlign: 'center' },

  viewerScreen: { flex: 1, backgroundColor: '#000000' },
  viewerTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, gap: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  viewerIconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  viewerFileName: { color: '#FFFFFF', fontSize: 14, fontWeight: tokens.weight.semibold, flex: 1, textAlign: 'center' },

  mentionPopover: {
    backgroundColor: tokens.color.card,
    borderTopWidth: 1, borderTopColor: tokens.color.border,
  },
  mentionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: tokens.color.border,
  },
  mentionName: { color: tokens.color.textPrimary, fontSize: 14, fontWeight: tokens.weight.medium },
});
