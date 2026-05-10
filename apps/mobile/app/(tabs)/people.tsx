import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '../../src/theme';
import { Avatar } from '../../src/components/Avatar';
import { api, type DirectoryUser } from '../../src/api';
import { getSocket, type PresenceEvent } from '../../src/socket';
import { directoryStore } from '../../src/list-cache';

function initialsOf(s: string | null | undefined): string {
  if (!s) return '?';
  const parts = s.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default function PeopleTab() {
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
    directoryStore.ensure().catch((e) => { if (!cancelled && !directoryStore.get()) setError(e.message ?? 'Failed to load'); });

    const s = getSocket();
    const onPresence = (evt: PresenceEvent) => {
      setPeople((prev) => prev?.map((p) => (p.id === evt.userId ? { ...p, online: evt.online, lastSeenAt: evt.lastSeenAt ?? p.lastSeenAt } : p)) ?? prev);
    };
    s.on('presence', onPresence);
    return () => { cancelled = true; unsub(); s.off('presence', onPresence); };
  }, []);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const p of people ?? []) if (p.department) set.add(p.department);
    return ['All', ...Array.from(set).sort()];
  }, [people]);

  const filtered = (people ?? []).filter((p) => {
    if (filter !== 'All' && p.department !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.displayName.toLowerCase().includes(q) ||
      p.employeeId.toLowerCase().includes(q) ||
      (p.department ?? '').toLowerCase().includes(q)
    );
  });

  const startDm = async (userId: string) => {
    setBusyId(userId);
    try {
      const r = await api.createDirect(userId);
      router.push({ pathname: '/chat/[id]', params: { id: r.id } });
    } catch (e: any) {
      setError(e.message ?? 'Failed to open DM');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>People</Text>
        <Text style={styles.sub}>{people?.length ?? '…'} employees · invite-only</Text>
      </View>

      <View style={styles.searchWrap}>
        <Feather name="search" size={14} color={tokens.color.textTertiary} />
        <TextInput
          style={styles.search}
          placeholder="Search by name, ID, or department"
          placeholderTextColor={tokens.color.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {departments.map((d) => (
          <Pressable
            key={d}
            onPress={() => setFilter(d)}
            style={[styles.chip, filter === d && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === d && styles.chipTextActive]}>{d}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {error && <Text style={styles.error}>{error}</Text>}
      {!people && !error && <View style={styles.center}><ActivityIndicator /></View>}
      {people && filtered.length === 0 && (
        <Text style={styles.muted}>No matches.</Text>
      )}

      {people && (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: tokens.space.xl }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              disabled={busyId === item.id}
              onPress={() => startDm(item.id)}
            >
              <View style={{ position: 'relative' }}>
                <Avatar initials={initialsOf(item.displayName)} photoUrls={item.photoUrls ?? null} />
                {item.online && <View style={styles.onlineDot} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.title ?? '—'}{item.department ? ` · ${item.department}` : ''}
                </Text>
              </View>
              {busyId === item.id ? (
                <ActivityIndicator size="small" />
              ) : (
                <Feather name="message-circle" size={20} color={tokens.color.textSecondary} />
              )}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.canvas },
  header: { paddingHorizontal: tokens.space.xxl, paddingTop: tokens.space.lg, paddingBottom: tokens.space.sm, gap: 4 },
  title: { color: tokens.color.textPrimary, fontSize: tokens.font.h1, fontWeight: tokens.weight.bold, letterSpacing: -0.4 },
  sub: { color: tokens.color.textSecondary, fontSize: tokens.font.sm },
  searchWrap: {
    marginHorizontal: tokens.space.xxl, marginBottom: tokens.space.sm,
    height: 40, borderRadius: tokens.radius.md, backgroundColor: tokens.color.card,
    borderWidth: 1, borderColor: tokens.color.border,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.space.md, gap: tokens.space.sm,
  },
  search: { flex: 1, color: tokens.color.textPrimary, fontSize: tokens.font.md },
  chipsRow: { paddingHorizontal: tokens.space.xxl, paddingVertical: tokens.space.sm, gap: 6 },
  chip: {
    paddingHorizontal: tokens.space.md, height: 32, borderRadius: tokens.radius.full,
    backgroundColor: tokens.color.card, borderWidth: 1, borderColor: tokens.color.border,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: tokens.color.inverse, borderColor: tokens.color.inverse },
  chipText: { color: tokens.color.textSecondary, fontSize: 12, fontWeight: tokens.weight.semibold },
  chipTextActive: { color: tokens.color.textOnInverse },
  center: { padding: tokens.space.xxxl, alignItems: 'center' },
  error: { color: tokens.color.danger, padding: tokens.space.lg, textAlign: 'center' },
  muted: { color: tokens.color.textTertiary, padding: tokens.space.xxl, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.space.md,
    paddingHorizontal: tokens.space.xxl, paddingVertical: tokens.space.md,
    borderBottomWidth: 1, borderBottomColor: tokens.color.border,
  },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#12B76A', borderWidth: 2, borderColor: tokens.color.canvas,
  },
  name: { color: tokens.color.textPrimary, fontSize: tokens.font.md, fontWeight: tokens.weight.semibold },
  meta: { color: tokens.color.textSecondary, fontSize: tokens.font.sm, marginTop: 2 },
});
