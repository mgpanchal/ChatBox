import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '../../src/theme';
import { Avatar } from '../../src/components/Avatar';
import { api, type ConversationListItem, type SearchResult } from '../../src/api';
import { getSocket, type PresenceEvent } from '../../src/socket';
import { conversationListStore } from '../../src/list-cache';
import { conversationCache } from '../../src/conversation-cache';

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - t) / 1000);
  if (diffSec < 60) return 'now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  const sameDay = new Date(t).toDateString() === new Date(now).toDateString();
  if (sameDay) return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dayDiff = Math.floor((now - t) / (1000 * 60 * 60 * 24));
  if (dayDiff < 7) return new Date(t).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initialsOf(s: string | null | undefined): string {
  if (!s) return '?';
  const parts = s.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default function ChatsTab() {
  const [items, setItems] = useState<ConversationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [globalResults, setGlobalResults] = useState<SearchResult[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');

  const applyList = (r: ConversationListItem[]) => {
    setItems(r);
    const next: Record<string, boolean> = {};
    for (const c of r) if (c.otherUserId) next[c.otherUserId] = !!c.otherOnline;
    setPresence(next);
  };

  const load = async () => {
    try {
      const r = await conversationListStore.refresh();
      applyList(r);
      // Background-prefetch the top 12 chats so opening them is instant.
      for (const c of r.slice(0, 12)) conversationCache.prefetch(c.id).catch(() => {});
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load conversations');
    }
  };

  useEffect(() => {
    // Show cached list instantly, then refresh in background.
    conversationListStore.hydration().then(() => {
      const cached = conversationListStore.get();
      if (cached) applyList(cached);
    });
    const unsubList = conversationListStore.subscribe(applyList);
    load();
    const s = getSocket();
    const onNew = (evt: { conversationId: string; message: any }) => {
      const prev = conversationListStore.get();
      if (!prev) return;
      const idx = prev.findIndex((c) => c.id === evt.conversationId);
      if (idx === -1) { load(); return; }
      const updated = [...prev];
      const m = updated[idx]!;
      updated[idx] = {
        ...m,
        unread: m.unread + 1,
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
      unsubList();
      s.off('message:new', onNew);
      s.off('presence', onPresence);
      s.off('conversation:created', onCreated);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Local instant filter + debounced global FTS search.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setGlobalResults(null); return; }
    const t = setTimeout(() => {
      api.globalSearch(q).then((r) => setGlobalResults(r.results)).catch(() => setGlobalResults(null));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = (items ?? []).filter((c) => {
    if (filter === 'unread' && c.unread === 0) return false;
    if (filter === 'groups' && c.kind === 'direct') return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.title ?? '').toLowerCase().includes(q) || (c.lastMessage?.body ?? '').toLowerCase().includes(q);
  });

  const pinned = filtered.filter((c) => c.pinned);
  const rest = filtered.filter((c) => !c.pinned);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
      </View>
      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={tokens.color.textTertiary} />
        <TextInput
          style={styles.search}
          placeholder="Search"
          placeholderTextColor={tokens.color.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.chipsRow}>
        {(['all', 'unread', 'groups'] as const).map((k) => {
          const active = filter === k;
          const label = k === 'all' ? 'All' : k === 'unread' ? 'Unread' : 'Groups';
          return (
            <Pressable
              key={k}
              onPress={() => setFilter(k)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {!items && !error && (
        <View style={styles.center}><ActivityIndicator /></View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {globalResults && globalResults.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>SEARCH RESULTS · {globalResults.length}</Text>
          {globalResults.map((r) => (
            <Pressable
              key={r.id}
              style={styles.row}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: r.conversation.id } })}
            >
              <Avatar initials={initialsOf(r.conversation.title ?? r.sender.displayName)} photoUrls={r.sender.photoUrls ?? null} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{r.conversation.title ?? r.sender.displayName}</Text>
                  <Text style={styles.rowTime}>{relativeTime(r.createdAt)}</Text>
                </View>
                <Text style={styles.rowPreview} numberOfLines={1}>{r.sender.displayName}: {r.body}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {globalResults === null && items && filtered.length === 0 && (
        <Text style={styles.muted}>{search ? 'No matches.' : 'No conversations yet.'}</Text>
      )}

      {globalResults === null && items && (
        <FlatList
          data={[...(pinned.length ? [{ kind: 'header' as const, label: 'PINNED' }] : []), ...pinned.map((c) => ({ kind: 'row' as const, c })), ...(pinned.length && rest.length ? [{ kind: 'header' as const, label: 'CHATS' }] : []), ...rest.map((c) => ({ kind: 'row' as const, c }))]}
          keyExtractor={(it, i) => it.kind === 'header' ? `h-${it.label}-${i}` : it.c.id}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return <Text style={styles.sectionLabel}>{item.label}</Text>;
            }
            return (
              <Row
                convo={item.c}
                online={item.c.otherUserId ? presence[item.c.otherUserId] ?? false : false}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.c.id } })}
              />
            );
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 96 }}
        />
      )}

      <Pressable style={styles.fab} onPress={() => router.push('/(tabs)/people')}>
        <Feather name="edit" size={22} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

function Row({ convo, online, onPress }: { convo: ConversationListItem; online: boolean; onPress: () => void }) {
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
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      <Avatar
        initials={initials}
        size={54}
        tone={convo.kind === 'announcement' ? 'inverse' : 'default'}
        photoUrls={convo.otherPhotoUrls ?? null}
        online={convo.kind === 'direct' && online}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={styles.rowTitleWrap}>
            <Text style={styles.rowTitle} numberOfLines={1}>{convo.title ?? 'Untitled'}</Text>
            {isConfidential && <Feather name="lock" size={11} color={tokens.color.danger} style={{ marginLeft: 4 }} />}
            {convo.pinned && <Feather name="bookmark" size={11} color={tokens.color.textTertiary} style={{ marginLeft: 4 }} />}
            {convo.muted && <Feather name="bell-off" size={11} color={tokens.color.textTertiary} style={{ marginLeft: 4 }} />}
          </View>
          <Text style={styles.rowTime}>{time}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.rowPreview} numberOfLines={1}>{preview}</Text>
          {convo.unread > 0 && (
            <View style={styles.unread}>
              <Text style={styles.unreadText}>{convo.unread > 99 ? '99+' : convo.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.canvas },
  header: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.sm, paddingBottom: tokens.space.sm },
  sectionLabel: { color: tokens.color.textTertiary, fontSize: 11, fontWeight: tokens.weight.semibold, letterSpacing: 1.2, paddingHorizontal: tokens.space.lg, paddingTop: 14, paddingBottom: 8 },

  chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: tokens.space.lg, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 14, height: 30, borderRadius: 15,
    backgroundColor: tokens.color.card,
    alignItems: 'center', justifyContent: 'center',
  },
  chipActive: { backgroundColor: tokens.color.brandSoft },
  chipText: { color: tokens.color.textSecondary, fontSize: 13, fontWeight: tokens.weight.semibold },
  chipTextActive: { color: tokens.color.brand },

  fab: {
    position: 'absolute', bottom: 20, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: tokens.color.brand,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  title: { color: tokens.color.textPrimary, fontSize: tokens.font.h1, fontWeight: tokens.weight.bold, letterSpacing: -0.4 },
  searchWrap: {
    marginHorizontal: tokens.space.lg, marginBottom: tokens.space.sm,
    height: 38, borderRadius: 19,
    backgroundColor: tokens.color.card,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10,
  },
  search: { flex: 1, color: tokens.color.textPrimary, fontSize: 15 },
  center: { padding: tokens.space.xxxl, alignItems: 'center' },
  error: { color: tokens.color.danger, padding: tokens.space.lg, textAlign: 'center' },
  muted: { color: tokens.color.textTertiary, padding: tokens.space.xxl, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: tokens.space.lg, paddingVertical: 10,
    backgroundColor: tokens.color.canvas,
  },
  rowPressed: { backgroundColor: tokens.color.bubbleOther },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#12B76A', borderWidth: 2.5, borderColor: tokens.color.canvas,
  },
  rowBody: {
    flex: 1, minWidth: 0, gap: 4,
    borderBottomWidth: 0.5, borderBottomColor: tokens.color.border,
    paddingBottom: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.sm },
  rowTitleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { color: tokens.color.textPrimary, fontSize: 17, fontWeight: tokens.weight.semibold, flexShrink: 1 },
  rowTime: { color: tokens.color.textTertiary, fontSize: 12, flexShrink: 0 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.sm },
  rowPreview: { color: tokens.color.textSecondary, fontSize: 14, flex: 1, lineHeight: 18 },
  unread: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 7,
    backgroundColor: tokens.color.brand, alignItems: 'center', justifyContent: 'center',
  },
  unreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: tokens.weight.bold },
});
