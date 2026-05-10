import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { tokens } from '../../src/theme';
import { Avatar } from '../../src/components/Avatar';
import { api, type Me, type DeviceItem } from '../../src/api';
import { session } from '../../src/session';
import { disconnectSocket } from '../../src/socket';
import { meStore } from '../../src/me-store';
import { conversationCache } from '../../src/conversation-cache';
import { conversationListStore, directoryStore, teamsStore } from '../../src/list-cache';

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initialsOf(s: string | null | undefined): string {
  if (!s) return '?';
  const parts = s.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default function YouTab() {
  const [me, setMe] = useState<Me | null>(null);
  const [devices, setDevices] = useState<DeviceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const refresh = async () => {
    try {
      const [u, d] = await Promise.all([meStore.refresh(), api.myDevices()]);
      setMe(u);
      setDevices(d);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    }
  };

  useEffect(() => {
    let cancelled = false;
    meStore.hydration().then(() => {
      const cached = meStore.get();
      if (cached && !cancelled) setMe(cached);
    });
    const unsub = meStore.subscribe((u) => !cancelled && setMe(u));
    refresh();
    return () => { cancelled = true; unsub(); };
  }, []);

  const onChangePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to change your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setUploadingPhoto(true);
    try {
      // Resize to max 512×512 to keep upload small
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      const r = await api.uploadProfilePhoto({
        uri: resized.uri,
        name: 'avatar.jpg',
        type: 'image/jpeg',
      });
      setMe((prev) => prev ? { ...prev, profile: prev.profile ? { ...prev.profile, photoUrls: r.photoUrls } : prev.profile } : prev);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Try again');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onRemovePhoto = () => {
    Alert.alert('Remove your profile photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removeProfilePhoto();
            setMe((prev) => prev ? { ...prev, profile: prev.profile ? { ...prev.profile, photoUrls: null } : prev.profile } : prev);
          } catch (e: any) {
            Alert.alert('Failed', e.message ?? 'Try again');
          }
        },
      },
    ]);
  };

  const onSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const refresh = session.getRefresh();
    if (refresh) { try { await api.logout(refresh); } catch {} }
    disconnectSocket();
    // Wipe local caches so the next user starts clean.
    meStore.clear();
    conversationListStore.clear();
    directoryStore.clear();
    teamsStore.clear();
    await conversationCache.clear();
    await session.clear();
    router.replace('/login');
  };

  const initials = me?.profile?.displayName
    ? initialsOf(me.profile.displayName)
    : '?';
  const masked = me?.mobileNumber ? `${me.mobileNumber.slice(0, 3)} ••••• ${me.mobileNumber.slice(-3)}` : '';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: tokens.space.xxxl }}>
        {error && <Text style={styles.error}>{error}</Text>}
        {!me && !error && <View style={styles.center}><ActivityIndicator /></View>}

        {me && (
          <>
            <View style={styles.header}>
              <View style={{ position: 'relative' }}>
                <Avatar
                  initials={initials}
                  size={80}
                  tone="inverse"
                  photoUrls={me.profile?.photoUrls ?? null}
                />
                <Pressable
                  style={styles.cameraBtn}
                  onPress={onChangePhoto}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Feather name="camera" size={14} color="#FFFFFF" />
                  )}
                </Pressable>
              </View>
              <Text style={styles.name}>{me.profile?.displayName ?? '—'}</Text>
              <Text style={styles.meta}>
                {[me.profile?.title, me.profile?.department].filter(Boolean).join(' · ') || 'Employee'}
              </Text>
              <View style={styles.idRow}>
                {me.profile?.employeeId && (
                  <View style={styles.idChip}><Text style={styles.idChipText}>{me.profile.employeeId}</Text></View>
                )}
                <View style={styles.idChip}><Text style={styles.idChipText}>{masked}</Text></View>
                {me.isAdmin && (
                  <View style={[styles.idChip, { backgroundColor: '#FEF3C7', borderColor: '#FEF3C7' }]}>
                    <Text style={[styles.idChipText, { color: '#92400E' }]}>ADMIN</Text>
                  </View>
                )}
                {me.profile?.photoUrls && (
                  <Pressable style={[styles.idChip, { borderColor: tokens.color.danger }]} onPress={onRemovePhoto}>
                    <Feather name="trash-2" size={10} color={tokens.color.danger} />
                    <Text style={[styles.idChipText, { color: tokens.color.danger, marginLeft: 4 }]}>Remove photo</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <Section title="Devices" sub={devices ? `${devices.length} active · max 50` : undefined}>
              {!devices ? (
                <View style={{ padding: 16, alignItems: 'center' }}><ActivityIndicator /></View>
              ) : devices.length === 0 ? (
                <Item icon="smartphone" label="No active devices" />
              ) : (
                devices.map((d, i) => (
                  <Item
                    key={d.id}
                    icon={d.platform === 'web' ? 'monitor' : 'smartphone'}
                    label={d.name ?? `${d.platform} device`}
                    sub={`Last active ${relativeTime(d.lastSeenAt)} · added ${relativeTime(d.createdAt)}`}
                    last={i === devices.length - 1}
                  />
                ))
              )}
            </Section>

            <Section title="Privacy & security">
              <Item icon="lock" label="App lock" sub="Coming soon" />
              <Item icon="eye-off" label="Screenshot policy" sub="Detected and audited in Confidential channels" />
              <Item icon="shield" label="Active sessions" sub={`${devices?.length ?? 0} device${devices?.length === 1 ? '' : 's'}`} last />
            </Section>

            <Section title="Notifications">
              <Item icon="bell" label="Push notifications" sub="Coming soon" last />
            </Section>

            <Pressable style={styles.signOut} onPress={onSignOut} disabled={signingOut}>
              {signingOut ? <ActivityIndicator color={tokens.color.danger} /> : (
                <>
                  <Feather name="log-out" size={18} color={tokens.color.danger} />
                  <Text style={styles.signOutText}>Sign out</Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
        {sub && <Text style={styles.sectionSub}>{sub}</Text>}
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Item({ icon, label, sub, last }: { icon: any; label: string; sub?: string; last?: boolean }) {
  return (
    <View style={[styles.item, !last && styles.itemBorder]}>
      <View style={styles.itemIcon}>
        <Feather name={icon} size={18} color={tokens.color.textPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemLabel}>{label}</Text>
        {sub && <Text style={styles.itemSub}>{sub}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.canvas },
  center: { padding: tokens.space.xxxl, alignItems: 'center' },
  error: { color: tokens.color.danger, padding: tokens.space.lg, textAlign: 'center' },
  header: { alignItems: 'center', paddingTop: tokens.space.xl, paddingBottom: tokens.space.xl, gap: tokens.space.sm, paddingHorizontal: tokens.space.lg },
  cameraBtn: {
    position: 'absolute', bottom: -2, right: -2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: tokens.color.inverse,
    borderWidth: 2, borderColor: tokens.color.canvas,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { color: tokens.color.textPrimary, fontSize: tokens.font.h2, fontWeight: tokens.weight.bold, marginTop: tokens.space.md },
  meta: { color: tokens.color.textSecondary, fontSize: tokens.font.md },
  idRow: { flexDirection: 'row', gap: 6, marginTop: tokens.space.sm, flexWrap: 'wrap', justifyContent: 'center' },
  idChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: tokens.space.md, paddingVertical: 5,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.color.card,
    borderWidth: 1, borderColor: tokens.color.border,
  },
  idChipText: { color: tokens.color.textPrimary, fontSize: tokens.font.xs, fontWeight: tokens.weight.semibold, letterSpacing: 0.3 },
  section: { marginTop: tokens.space.lg, paddingHorizontal: tokens.space.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: tokens.space.sm },
  sectionTitle: { color: tokens.color.textTertiary, fontSize: 11, fontWeight: tokens.weight.semibold, letterSpacing: 1.2 },
  sectionSub: { color: tokens.color.textTertiary, fontSize: 11 },
  card: { backgroundColor: tokens.color.card, borderRadius: tokens.radius.lg, borderWidth: 1, borderColor: tokens.color.border, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.md, paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.md },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: tokens.color.border },
  itemIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: tokens.color.canvas, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { color: tokens.color.textPrimary, fontSize: tokens.font.md, fontWeight: tokens.weight.medium },
  itemSub: { color: tokens.color.textSecondary, fontSize: tokens.font.sm, marginTop: 2 },
  signOut: {
    marginHorizontal: tokens.space.xxl, marginTop: tokens.space.xl,
    height: 52, borderRadius: tokens.radius.lg, backgroundColor: tokens.color.card,
    borderWidth: 1, borderColor: tokens.color.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.space.sm,
  },
  signOutText: { color: tokens.color.danger, fontSize: tokens.font.md, fontWeight: tokens.weight.semibold },
});
