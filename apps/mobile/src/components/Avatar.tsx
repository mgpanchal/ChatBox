import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { tokens } from '../theme';
import { API_BASE } from '../api';

const ORIGIN = API_BASE.replace(/\/v1\/?$/, '');

function abs(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${ORIGIN}${url}`;
  return url;
}

export type PhotoUrls = { thumb?: string; sm?: string; md?: string; lg?: string } | null | undefined;

type Props = {
  initials: string;
  size?: number;
  tone?: 'default' | 'inverse';
  photoUrls?: PhotoUrls;
  online?: boolean;
};

const AVATAR_PALETTE = [
  '#E11D48', '#F97316', '#D97706', '#65A30D', '#16A34A', '#059669',
  '#0891B2', '#0284C7', '#2563EB', '#4F46E5', '#7C3AED', '#9333EA',
  '#C026D3', '#DB2777', '#BE185D', '#B91C1C', '#EA580C', '#CA8A04',
  '#15803D', '#0D9488', '#0E7490', '#1D4ED8', '#6D28D9', '#A21CAF',
  '#9F1239', '#475569',
];

function colorFor(initials: string): string {
  const ch = (initials || '?').trim().toUpperCase().charCodeAt(0);
  if (ch >= 65 && ch <= 90) return AVATAR_PALETTE[ch - 65]!;
  return AVATAR_PALETTE[Math.abs(ch) % AVATAR_PALETTE.length]!;
}

function pickVariant(size: number, urls: PhotoUrls): string | null {
  if (!urls) return null;
  if (size <= 64 && urls.thumb) return urls.thumb;
  if (size <= 128 && urls.sm) return urls.sm;
  if (size <= 256 && urls.md) return urls.md;
  return urls.lg ?? urls.md ?? urls.sm ?? urls.thumb ?? null;
}

const ONLINE_GREEN = '#12B76A';

export function Avatar({ initials, size = 44, tone = 'default', photoUrls, online }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = pickVariant(size, photoUrls);

  // When online, draw a green ring around the inner circle.
  // ringPad is the gap between ring and inner circle for the halo look.
  const ringPad = online ? 3 : 0;
  const innerSize = size - ringPad * 2;

  const inner = (() => {
    if (url && !imgFailed) {
      return (
        <Image
          source={abs(url)}
          style={{ width: innerSize, height: innerSize, borderRadius: innerSize / 2, backgroundColor: tokens.color.bubbleOther }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          onError={() => setImgFailed(true)}
        />
      );
    }
    const isInverse = tone === 'inverse';
    const bg = isInverse ? tokens.color.inverse : colorFor(initials);
    return (
      <View
        style={[
          styles.base,
          { width: innerSize, height: innerSize, borderRadius: innerSize / 2, backgroundColor: bg },
        ]}
      >
        <Text style={[styles.text, { color: '#FFFFFF', fontSize: innerSize * 0.36 }]}>{initials}</Text>
      </View>
    );
  })();

  if (online) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          padding: ringPad - 1.5, // border absorbs 1.5
          borderWidth: 2,
          borderColor: ONLINE_GREEN,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
        }}
      >
        {inner}
      </View>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: tokens.weight.semibold, letterSpacing: 0.2 },
});
