'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, AlertCircle, Sparkles } from 'lucide-react';
import { api, ApiError, session } from '../../../src/api';

const LENGTH = 6;

export default function LoginOtp() {
  const router = useRouter();
  const params = useSearchParams();
  const number = params.get('number') ?? '';
  const dev = params.get('dev') ?? '';
  const e164 = `+91${number}`;
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [seconds, setSeconds] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const code = digits.join('');
  const complete = code.length === LENGTH && digits.every((d) => d !== '');

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const verify = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.verifyOtp({
        mobileNumber: e164,
        code,
        platform: 'web',
        name: typeof navigator !== 'undefined' ? navigator.userAgent.split(' ')[0] : 'Web',
      });
      session.save(res);
      router.replace('/chat');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Network error';
      setError(msg);
      setDigits(Array(LENGTH).fill(''));
      refs.current[0]?.focus();
      setBusy(false);
    }
  };

  const resend = async () => {
    if (seconds > 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.requestOtp(e164);
      setSeconds(30);
      if (res.devCode) {
        const url = new URL(window.location.href);
        url.searchParams.set('dev', res.devCode);
        window.history.replaceState({}, '', url.toString());
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Network error');
    }
    setBusy(false);
  };

  const masked = number ? `+91 ${number.slice(0, 5)} ${number.slice(5)}` : 'your number';

  return (
    <main style={styles.screen}>
      <div style={styles.card}>
        <button style={styles.back} onClick={() => router.back()}>
          <ArrowLeft size={18} />
        </button>

        <h1 style={styles.h1}>Enter the 6-digit code</h1>
        <p style={styles.sub}>Sent to {masked}. Codes expire in 5 minutes.</p>

        {dev && (
          <div style={styles.devBox}>
            <Sparkles size={14} color="var(--internal)" />
            <span>Dev mode — code is <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{dev}</strong></span>
          </div>
        )}

        <div style={styles.cells}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(r) => {
                refs.current[i] = r;
              }}
              style={{ ...styles.cell, borderColor: d ? 'var(--inverse)' : 'var(--border)' }}
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
                if (e.key === 'Enter' && complete) verify();
              }}
              autoFocus={i === 0}
            />
          ))}
        </div>

        {error && (
          <div style={styles.errorBox}>
            <AlertCircle size={14} color="var(--danger)" />
            <span>{error}</span>
          </div>
        )}

        <button
          style={{ ...styles.cta, opacity: complete && !busy ? 1 : 0.4, cursor: complete && !busy ? 'pointer' : 'not-allowed' }}
          disabled={!complete || busy}
          onClick={verify}
        >
          {busy ? 'Verifying…' : 'Verify and continue'}
        </button>

        <div style={styles.row}>
          <span style={styles.subSmall}>{seconds > 0 ? `Resend in ${seconds}s` : "Didn't get it?"}</span>
          <button
            style={{ ...styles.resend, opacity: seconds > 0 || busy ? 0.4 : 1, cursor: seconds > 0 || busy ? 'not-allowed' : 'pointer' }}
            disabled={seconds > 0 || busy}
            onClick={resend}
          >
            Resend code
          </button>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-xxl)' },
  card: { width: '100%', maxWidth: 440, background: 'var(--card)', borderRadius: 20, padding: 'var(--space-xxxl)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' },
  back: { width: 36, height: 36, borderRadius: '50%', background: 'var(--canvas)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  h1: { fontSize: 26, fontWeight: 700, letterSpacing: -0.4 },
  sub: { color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.55, marginTop: -8 },
  subSmall: { color: 'var(--text-secondary)', fontSize: 13 },
  devBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--internal-soft)', color: 'var(--internal)', fontSize: 12 },
  cells: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 'var(--space-sm)' },
  cell: { width: '100%', aspectRatio: '1 / 1', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--canvas)', textAlign: 'center', fontSize: 20, fontWeight: 700, padding: 0, minWidth: 0 },
  errorBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#FEE4E2', color: 'var(--danger)', fontSize: 13 },
  cta: { height: 48, borderRadius: 'var(--radius-md)', background: 'var(--inverse)', color: 'var(--text-on-inverse)', fontSize: 15, fontWeight: 600 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  resend: { fontSize: 13, fontWeight: 600 },
};
