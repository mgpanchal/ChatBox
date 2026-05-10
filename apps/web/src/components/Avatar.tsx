export type PhotoUrls = { thumb?: string; sm?: string; md?: string; lg?: string } | null | undefined;

type Props = {
  initials: string;
  size?: number;
  tone?: 'default' | 'inverse';
  photoUrl?: string | null;
  photoUrls?: PhotoUrls;
  online?: boolean;
};

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1').replace(/\/v1\/?$/, '');
function abs(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
  return url;
}

function pickVariant(size: number, urls: PhotoUrls): string | null {
  if (!urls) return null;
  if (size <= 64 && urls.thumb) return urls.thumb;
  if (size <= 128 && urls.sm) return urls.sm;
  if (size <= 256 && urls.md) return urls.md;
  return urls.lg ?? urls.md ?? urls.sm ?? urls.thumb ?? null;
}

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

const ONLINE_GREEN = '#12B76A';

export function Avatar({ initials, size = 36, tone = 'default', photoUrl, photoUrls, online }: Props) {
  const url = pickVariant(size, photoUrls) ?? photoUrl ?? null;
  const ringPad = online ? 3 : 0;
  const innerSize = size - ringPad * 2;

  let inner: React.ReactNode;
  if (url) {
    inner = (
      <img
        src={abs(url)}
        alt={initials}
        width={innerSize}
        height={innerSize}
        loading="lazy"
        decoding="async"
        style={{
          width: innerSize,
          height: innerSize,
          minWidth: innerSize,
          borderRadius: '50%',
          objectFit: 'cover',
          background: 'var(--bubble-other)',
        }}
      />
    );
  } else {
    const isInverse = tone === 'inverse';
    const bg = isInverse ? 'var(--inverse)' : colorFor(initials);
    inner = (
      <div
        style={{
          width: innerSize,
          height: innerSize,
          minWidth: innerSize,
          borderRadius: '50%',
          background: bg,
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: innerSize * 0.38,
          fontWeight: 600,
          letterSpacing: 0.2,
        }}
      >
        {initials}
      </div>
    );
  }

  if (online) {
    return (
      <div
        style={{
          width: size,
          height: size,
          minWidth: size,
          borderRadius: '50%',
          padding: ringPad - 1.5,
          border: `2px solid ${ONLINE_GREEN}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        {inner}
      </div>
    );
  }
  return <>{inner}</>;
}
