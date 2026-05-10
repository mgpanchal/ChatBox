import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '../../src/theme';
import { Avatar } from '../../src/components/Avatar';
import { api, type ConversationListItem, type MentionItem } from '../../src/api';
import { getSocket } from '../../src/socket';
import { conversationListStore } from '../../src/list-cache';

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - t) / 1000);
  if (diffSec < 60) return 'now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initialsOf(s: string | null | undefined): string {
  if (!s) return '?';
  const parts = s.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

type Section =
  | { kind: 'header'; key: string; title: string; icon: any; sub?: string }
  | { kind: 'mention'; key: string; m: MentionItem }
  | { kind: 'convo'; key: string; c: ConversationListItem }
  | { kind: 'muted'; key: string; text: string };

export default function ActivityTab() {
  const [convos, setConvos] = useState<ConversationListItem[] | null>(null);
  const [mentions, setMentions] = useState<MentionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    try {
      const [c, m] = await Promise.all([conversationListStore.refresh(), api.myMentions()]);
      setConvos(c);
      setMentions(m);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    }
  };

  useEffect(() => {
    let cancelled = false;
    conversationListStore.hydration().then(() => {
      const cached = conversationListStore.get();
      if (cached && !cancelled) setConvos(cached);
    });
    const unsub = conversationListStore.subscribe((c) => !cancelled && setConvos(c));
    refresh();
    const s = getSocket();
    const onNew = () => refresh();
    const onMention = () => api.myMentions().then(setMentions).catch(() => {});
    s.on('message:new', onNew);
    s.on('mention', onMention);
    return () => { cancelled = true; unsub(); s.off('message:new', onNew); s.off('mention', onMention); };
  }, []);

  const onRefresh = async () => { setRefreshing(true); await refresh(); setRefreshing(false); };

  const openMention = async (mn: MentionItem) => {
    try { await api.ackMention(mn.id); } catch {}
    router.push({ pathname: '/chat/[id]', params: { id: mn.conversation.id } });
  };

  const ackAll = async () => {
    try { await api.ackAllMentions(); await refresh(); } catch {}
  };

  const announcements = (convos ?? []).filter((c) => c.kind === 'announcement');
  const unreadDms = (convos ?? []).filter((c) => c.kind === 'direct' && c.unread > 0);
  const unreadChannels = (convos ?? []).filter((c) => c.kind === 'channel' && c.unread > 0);
  const unreadMentions = (mentions ?? []).filter((m) => !m.acknowledgedAt);

  const sections: Section[] = [];
  // Mentions
  sections.push({ kind: 'header', key: 'h-mentions', title: 'Mentions', icon: 'at-sign' });
  if ((mentions ?? []).length === 0) {
    sections.push({ kind: 'muted', key: 'm-empty', text: 'No mentions yet.' });
  } else {
    for (const m of mentions ?? []) sections.push({ kind: 'mention', key: `m-${m.id}`, m });
  }
  // Announcements
  sections.push({ kind: 'header', key: 'h-anno', title: 'Announcements', icon: 'volume-2' });
  if (announcements.length === 0) {
    sections.push({ kind: 'muted', key: 'a-empty', text: 'No announcement channels.' });
  } else {
    for (const c of announcements) sections.push({ kind: 'convo', key: `a-${c.id}`, c });
  }
  // Unread
  sections.push({ kind: 'header', key: 'h-unread', title: 'Unread DMs & channels', icon: 'message-square' });
  if (unreadDms.length === 0 && unreadChannels.length === 0) {
    sections.push({ kind: 'muted', key: 'u-empty', text: "You're all caught up." });
  } else {
    for (const c of [...unreadDms, ...unreadChannels]) sections.push({ kind: 'convo', key: `u-${c.id}`, c });
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Activity</Text>
          {unreadMentions.length > 0 && (
            <Text style={styles.sub}>{unreadMentions.length} unread mention{unreadMentions.length === 1 ? '' : 's'}</Text>
          )}
        </View>
        {unreadMentions.length > 0 && (
          <Pressable style={styles.markAll} onPress={ackAll}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {!convos && !mentions && !error && (
        <View style={styles.center}><ActivityIndicator /></View>
      )}

      {(convos || mentions) && (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.key}
          contentContainerStyle={{ paddingBottom: tokens.space.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <View style={styles.sectionHeader}>
                  <Feather name={item.icon} size={14} color={tokens.color.textSecondary} />
                  <Text style={styles.sectionTitle}>{item.title}</Text>
                </View>
              );
            }
            if (item.kind === 'muted') {
              return <Text style={styles.muted}>{item.text}</Text>;
            }
            if (item.kind === 'mention') {
              const m = item.m;
              const unread = !m.acknowledgedAt;
              return (
                <Pressable
                  style={[styles.row, unread && { backgroundColor: tokens.color.brandSoft }]}
                  onPress={() => openMention(m)}
                >
                  <Avatar initials={initialsOf(m.message.senderName)} photoUrls={m.message.senderPhotoUrls ?? null} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle}>
                      {m.message.senderName}
                      <Text style={{ color: tokens.color.textSecondary, fontWeight: '500' }}> · {m.conversation.title ?? 'DM'}</Text>
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={2}>
                      {m.message.deleted ? 'This message was deleted' : m.message.body}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.time}>{relativeTime(m.message.createdAt)}</Text>
                    {unread && (
                      <View style={styles.newPill}>
                        <Text style={styles.newPillText}>NEW</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            }
            // convo
            const c = item.c;
            const sub = c.lastMessage
              ? c.lastMessage.self
                ? `You: ${c.lastMessage.body}`
                : `${c.lastMessage.senderName}: ${c.lastMessage.body}`
              : 'No messages yet';
            return (
              <Pressable
                style={styles.row}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
              >
                <Avatar
                  initials={initialsOf(c.title ?? '')}
                  tone={c.kind === 'announcement' ? 'inverse' : 'default'}
                  photoUrls={c.otherPhotoUrls ?? null}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle}>{c.title ?? 'Untitled'}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.time}>{c.lastMessage ? relativeTime(c.lastMessage.createdAt) : ''}</Text>
                  {c.unread > 0 && (
                    <View style={styles.unread}>
                      <Text style={styles.unreadText}>{c.unread > 99 ? '99+' : c.unread}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.canvas },
  header: { flexDirection: 'row', paddingHorizontal: tokens.space.xxl, paddingTop: tokens.space.lg, paddingBottom: tokens.space.sm, alignItems: 'center', gap: tokens.space.md },
  title: { color: tokens.color.textPrimary, fontSize: tokens.font.h1, fontWeight: tokens.weight.bold, letterSpacing: -0.4 },
  sub: { color: tokens.color.textSecondary, fontSize: tokens.font.sm, marginTop: 4 },
  markAll: {
    paddingHorizontal: tokens.space.md, height: 36, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.card, borderWidth: 1, borderColor: tokens.color.border,
    alignItems: 'center', justifyContent: 'center',
  },
  markAllText: { color: tokens.color.textPrimary, fontSize: 13, fontWeight: tokens.weight.semibold },
  center: { padding: tokens.space.xxxl, alignItems: 'center' },
  error: { color: tokens.color.danger, padding: tokens.space.lg, textAlign: 'center' },
  muted: { color: tokens.color.textTertiary, padding: tokens.space.xl, textAlign: 'center', fontSize: tokens.font.sm },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm,
    paddingHorizontal: tokens.space.xxl, paddingTop: tokens.space.lg, paddingBottom: tokens.space.sm,
  },
  sectionTitle: { color: tokens.color.textSecondary, fontSize: 12, fontWeight: tokens.weight.semibold, letterSpacing: 1.2, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.space.md,
    paddingHorizontal: tokens.space.xxl, paddingVertical: tokens.space.md,
    borderBottomWidth: 1, borderBottomColor: tokens.color.border,
  },
  rowTitle: { color: tokens.color.textPrimary, fontSize: tokens.font.md, fontWeight: tokens.weight.semibold },
  rowSub: { color: tokens.color.textSecondary, fontSize: tokens.font.sm, marginTop: 2 },
  time: { color: tokens.color.textTertiary, fontSize: 12 },
  newPill: { marginTop: 4, paddingHorizontal: 6, height: 18, borderRadius: 9, backgroundColor: tokens.color.brand, alignItems: 'center', justifyContent: 'center' },
  newPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: tokens.weight.bold, letterSpacing: 0.4 },
  unread: { marginTop: 4, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: tokens.color.inverse, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: tokens.color.textOnInverse, fontSize: 11, fontWeight: tokens.weight.bold },
});
