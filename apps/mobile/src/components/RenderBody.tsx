import { Text, Linking } from 'react-native';
import { tokens } from '../theme';

type Token =
  | { kind: 'mention'; start: number; end: number; name: string }
  | { kind: 'url'; start: number; end: number; href: string; display: string }
  | { kind: 'email'; start: number; end: number; addr: string }
  | { kind: 'codeblock'; start: number; end: number; code: string }
  | { kind: 'codeinline'; start: number; end: number; code: string }
  | { kind: 'bold'; start: number; end: number; inner: string }
  | { kind: 'italic'; start: number; end: number; inner: string }
  | { kind: 'strike'; start: number; end: number; inner: string };

function trimTrailingUrlPunct(url: string): string {
  const m = url.match(/[.,;:!?'"\]}]+$/);
  return m ? url.slice(0, url.length - m[0].length) : url;
}

function jumboEmojiCount(s: string): number {
  const trimmed = s.trim();
  if (!trimmed || trimmed.length > 12) return 0;
  const seg: any = (Intl as any).Segmenter ? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }) : null;
  let count = 0;
  if (seg) {
    for (const _g of seg.segment(trimmed)) {
      count += 1;
      if (count > 3) return 0;
    }
  } else {
    count = [...trimmed].length;
    if (count > 3) return 0;
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

  // Code block ```...```
  const codeBlockRe = /```([\s\S]+?)```/g;
  for (let m: RegExpExecArray | null; (m = codeBlockRe.exec(body)) !== null; ) {
    if (!free(m.index, m.index + m[0].length)) continue;
    tokens.push({ kind: 'codeblock', start: m.index, end: m.index + m[0].length, code: m[1]! });
    claim(m.index, m.index + m[0].length);
  }
  // Inline code `...`
  const codeInlineRe = /`([^`\n]+?)`/g;
  for (let m: RegExpExecArray | null; (m = codeInlineRe.exec(body)) !== null; ) {
    if (!free(m.index, m.index + m[0].length)) continue;
    tokens.push({ kind: 'codeinline', start: m.index, end: m.index + m[0].length, code: m[1]! });
    claim(m.index, m.index + m[0].length);
  }
  // URLs
  const urlRe = /https?:\/\/[^\s<>"'`]+/gu;
  for (let m: RegExpExecArray | null; (m = urlRe.exec(body)) !== null; ) {
    if (!free(m.index, m.index + m[0].length)) continue;
    const url = trimTrailingUrlPunct(m[0]);
    if (!url) continue;
    tokens.push({ kind: 'url', start: m.index, end: m.index + url.length, href: url, display: url });
    claim(m.index, m.index + url.length);
  }
  // Emails
  const emailRe = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  for (let m: RegExpExecArray | null; (m = emailRe.exec(body)) !== null; ) {
    if (!free(m.index, m.index + m[0].length)) continue;
    tokens.push({ kind: 'email', start: m.index, end: m.index + m[0].length, addr: m[0] });
    claim(m.index, m.index + m[0].length);
  }
  // Mentions
  const sortedNames = [...memberNames].filter(Boolean).sort((a, b) => b.length - a.length);
  const escapedNames = sortedNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const namesAlt = escapedNames.length > 0 ? `${escapedNames.join('|')}|` : '';
  const mentionRe = new RegExp(`@(${namesAlt}[\\p{L}\\d][\\p{L}\\d]{0,40})(?=\\s|[.!?,]|$)`, 'gu');
  for (let m: RegExpExecArray | null; (m = mentionRe.exec(body)) !== null; ) {
    if (!free(m.index, m.index + m[0].length)) continue;
    tokens.push({ kind: 'mention', start: m.index, end: m.index + m[0].length, name: m[1]! });
    claim(m.index, m.index + m[0].length);
  }
  // Markdown
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

type Props = {
  body: string;
  self: boolean;
  memberNames?: string[];
  baseStyle: any;
};

export function RenderBody({ body, self, memberNames = [], baseStyle }: Props) {
  const jumbo = jumboEmojiCount(body);
  if (jumbo > 0) {
    const size = jumbo === 1 ? 28 : jumbo === 2 ? 24 : 22;
    return <Text style={[baseStyle, { fontSize: size, lineHeight: size + 6 }]}>{body}</Text>;
  }
  const tokens = tokenize(body, memberNames);
  const linkColor = self ? '#FFFFFF' : tokens_brand_color();
  const out: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.start > cursor) out.push(body.slice(cursor, t.start));
    const k = `${t.kind}-${t.start}`;
    switch (t.kind) {
      case 'url':
        out.push(
          <Text
            key={k}
            style={{ color: linkColor, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(t.href).catch(() => {})}
          >
            {t.display}
          </Text>,
        );
        break;
      case 'email':
        out.push(
          <Text
            key={k}
            style={{ color: linkColor, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(`mailto:${t.addr}`).catch(() => {})}
          >
            {t.addr}
          </Text>,
        );
        break;
      case 'mention':
        out.push(
          <Text key={k} style={{
            color: self ? '#FFFFFF' : tokens_brand_color(),
            fontWeight: '600',
          }}>
            @{t.name}
          </Text>,
        );
        break;
      case 'codeblock':
        out.push(
          <Text key={k} style={{
            fontFamily: 'monospace', fontSize: 13,
            backgroundColor: self ? 'rgba(255,255,255,0.12)' : 'rgba(11,11,15,0.06)',
          }}>{'\n' + t.code + '\n'}</Text>,
        );
        break;
      case 'codeinline':
        out.push(
          <Text key={k} style={{
            fontFamily: 'monospace', fontSize: 13,
            backgroundColor: self ? 'rgba(255,255,255,0.18)' : 'rgba(11,11,15,0.06)',
          }}>{` ${t.code} `}</Text>,
        );
        break;
      case 'bold':
        out.push(<Text key={k} style={{ fontWeight: '700' }}>{t.inner}</Text>);
        break;
      case 'italic':
        out.push(<Text key={k} style={{ fontStyle: 'italic' }}>{t.inner}</Text>);
        break;
      case 'strike':
        out.push(<Text key={k} style={{ textDecorationLine: 'line-through' }}>{t.inner}</Text>);
        break;
    }
    cursor = t.end;
  }
  if (cursor < body.length) out.push(body.slice(cursor));
  return <Text style={baseStyle}>{out}</Text>;
}

function tokens_brand_color(): string {
  return tokens.color.brand ?? '#2563EB';
}
