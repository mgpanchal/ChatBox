import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ChatBox',
    short_name: 'ChatBox',
    description: 'Internal company messaging — invite-only, audited, secure.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F4F5F7',
    theme_color: '#2563EB',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    categories: ['business', 'productivity', 'social'],
  };
}
