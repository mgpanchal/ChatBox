'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Smartphone, Monitor, Lock, Eye, Shield, Bell, LogOut, Camera, Trash2 } from 'lucide-react';
import { api, session, type DeviceItem, type Me } from '../../../src/api';
import { Avatar } from '../../../src/components/Avatar';
import { initialsOf, relativeTime } from '../../../src/time';
import { disconnectSocket } from '../../../src/socket';
import { PhotoCropModal } from '../../../src/components/PhotoCropModal';
import { meStore } from '../../../src/me-store';
import { conversationCache } from '../../../src/conversation-cache';

export default function YouPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => meStore.refresh().then(setMe).catch((e) => setError(e.message ?? 'Failed'));

  useEffect(() => {
    Promise.all([meStore.ensure(), api.myDevices()])
      .then(([u, d]) => {
        setMe(u);
        setDevices(d);
      })
      .catch((e) => setError(e.message ?? 'Failed to load'));
    const unsub = meStore.subscribe((u) => {
      if (u) setMe(u);
    });
    return unsub;
  }, []);

  const onPhotoSelect = (file: File | null) => {
    if (!file) return;
    setCropFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onCropSave = async (blob: Blob) => {
    setUploading(true);
    try {
      const f = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      await api.uploadProfilePhoto(f);
      await refresh();
      setCropFile(null);
    } catch (e: any) {
      alert(e.message ?? 'Upload failed');
    }
    setUploading(false);
  };

  const removePhoto = async () => {
    if (!confirm('Remove your profile photo?')) return;
    try {
      await api.removeProfilePhoto();
      await refresh();
    } catch (e: any) {
      alert(e.message ?? 'Failed to remove');
    }
  };

  if (error) return <div style={styles.muted}>{error}</div>;
  if (!me) return <div style={styles.muted}>Loading…</div>;

  return (
    <div style={styles.page}>
      <div style={styles.profile}>
        <div style={{ position: 'relative' }}>
          <Avatar initials={initialsOf(me.profile?.displayName)} size={64} tone="inverse" photoUrls={me.profile?.photoUrls ?? null} />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Change photo"
            disabled={uploading}
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'var(--inverse)',
              border: '2px solid var(--card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              opacity: uploading ? 0.5 : 1,
            }}
          >
            <Camera size={12} color="var(--text-on-inverse)" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => onPhotoSelect(e.target.files?.[0] ?? null)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={styles.name}>{me.profile?.displayName ?? '—'}</div>
          <div style={styles.sub}>{me.profile?.title ? `${me.profile.title} · ` : ''}{me.profile?.department ?? '—'}</div>
          <div style={styles.chips}>
            <span style={styles.chip}>{me.profile?.employeeId ?? '—'}</span>
            <span style={styles.chip}>{maskNumber(me.mobileNumber)}</span>
            {me.isAdmin && <span style={{ ...styles.chip, background: '#FEF3C7', color: '#92400E' }}>ADMIN</span>}
            {me.profile?.photoUrls && (
              <button onClick={removePhoto} style={{ ...styles.chip, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <Trash2 size={11} /> Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      <Section title="Devices" sub={`${devices.length} active · max 50 per account`}>
        {devices.length === 0 && <Item icon={Smartphone} label="No active devices" />}
        {devices.map((d) => (
          <Item
            key={d.id}
            icon={d.platform === 'web' ? Monitor : Smartphone}
            label={d.name ?? `${d.platform} device`}
            sub={`Last active ${relativeTime(d.lastSeenAt)} · added ${relativeTime(d.createdAt)}`}
          />
        ))}
      </Section>

      <Section title="Privacy & security">
        <Item icon={Lock} label="App lock" sub="Coming soon" />
        <Item icon={Eye} label="Screenshot policy" sub="Detected and audited in Confidential channels" />
        <Item icon={Shield} label="Active sessions" sub={`${devices.length} device${devices.length === 1 ? '' : 's'}`} />
      </Section>

      <Section title="Notifications">
        <Item icon={Bell} label="Push notifications" sub="Coming soon" />
      </Section>

      <button
        style={styles.signOut}
        onClick={() => {
          disconnectSocket();
          meStore.clear();
          conversationCache.clear();
          session.clear();
          router.replace('/login');
        }}
      >
        <LogOut size={16} color="var(--danger)" />
        Sign out
      </button>

      {cropFile && (
        <PhotoCropModal
          file={cropFile}
          onClose={() => setCropFile(null)}
          onSave={onCropSave}
        />
      )}
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>{title.toUpperCase()}</span>
        {sub && <span style={styles.sectionSub}>{sub}</span>}
      </div>
      <div style={styles.card}>{children}</div>
    </section>
  );
}

function Item({ icon: Icon, label, sub }: { icon: any; label: string; sub?: string }) {
  return (
    <div style={styles.item}>
      <div style={styles.itemIcon}><Icon size={18} color="var(--text-primary)" /></div>
      <div style={{ flex: 1 }}>
        <div style={styles.itemLabel}>{label}</div>
        {sub && <div style={styles.itemSub}>{sub}</div>}
      </div>
    </div>
  );
}

function maskNumber(n: string): string {
  return n.length < 6 ? n : `${n.slice(0, 3)} ••••• ${n.slice(-3)}`;
}

const styles: Record<string, React.CSSProperties> = {
  page: { flex: 1, overflowY: 'auto', padding: 32, maxWidth: 720, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },
  muted: { padding: 24, color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' },
  profile: { display: 'flex', alignItems: 'center', gap: 16, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 },
  name: { fontSize: 20, fontWeight: 700, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 },
  chips: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  chip: { padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 11, fontWeight: 600, letterSpacing: 0.3 },
  section: {},
  sectionHeader: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' },
  sectionTitle: { fontSize: 11, fontWeight: 600, letterSpacing: 1.2, color: 'var(--text-tertiary)' },
  sectionSub: { fontSize: 11, color: 'var(--text-tertiary)' },
  card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' },
  item: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' },
  itemIcon: { width: 32, height: 32, borderRadius: 8, background: 'var(--canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  itemLabel: { fontSize: 14, fontWeight: 500 },
  itemSub: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
  signOut: { display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--danger)', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
};
