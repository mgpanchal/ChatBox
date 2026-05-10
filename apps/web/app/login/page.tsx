'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, AlertCircle } from 'lucide-react';
import { api, ApiError } from '../../src/api';
import { Logo } from '../../src/components/Logo';

export default function LoginPhone() {
  const router = useRouter();
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[6-9]\d{9}$/.test(number);
  const e164 = `+91${number}`;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.requestOtp(e164);
      const params = new URLSearchParams({ number, ...(res.devCode ? { dev: res.devCode } : {}) });
      router.push(`/login/otp?${params.toString()}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Network error';
      setError(msg);
      setBusy(false);
    }
  };

  return (
    <main style={styles.screen}>
      <div style={styles.card}>
        <div style={styles.header}>
          <Logo size={36} />
          <span style={styles.kicker}>CHATBOX</span>
        </div>

        <h1 style={styles.h1}>Sign in</h1>
        <p style={styles.sub}>
          Your company's secure messenger. Enter the mobile number registered with your employer.
        </p>

        <label style={styles.label}>Mobile number</label>
        <div style={styles.inputRow}>
          <div style={styles.cc}>+91</div>
          <input
            style={styles.input}
            inputMode="numeric"
            placeholder="98765 43210"
            maxLength={10}
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoFocus
          />
        </div>

        {error && (
          <div style={styles.errorBox}>
            <AlertCircle size={14} color="var(--danger)" />
            <span>{error}</span>
          </div>
        )}

        <button
          style={{ ...styles.cta, opacity: valid && !busy ? 1 : 0.4, cursor: valid && !busy ? 'pointer' : 'not-allowed' }}
          disabled={!valid || busy}
          onClick={submit}
        >
          {busy ? 'Sending…' : 'Send code'}
          {!busy && <ArrowRight size={18} />}
        </button>

        <div style={styles.note}>
          <Lock size={14} color="var(--text-secondary)" />
          <span>Invite-only. If your number isn't recognised, contact your admin.</span>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-xxl)', background: 'var(--canvas)' },
  card: { width: '100%', maxWidth: 440, background: 'var(--card)', borderRadius: 20, padding: 'var(--space-xxxl)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' },
  header: { display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' },
  logoMark: { width: 32, height: 32, borderRadius: 8, background: 'var(--inverse)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12, fontWeight: 700, letterSpacing: 2 },
  h1: { fontSize: 32, fontWeight: 700, letterSpacing: -0.5 },
  sub: { color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.55, marginTop: -8 },
  label: { fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' },
  inputRow: { display: 'flex', gap: 'var(--space-sm)', marginTop: -8 },
  cc: { height: 48, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--canvas)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600 },
  input: { flex: 1, height: 48, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 15, letterSpacing: 0.4, minWidth: 0 },
  errorBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#FEE4E2', color: 'var(--danger)', fontSize: 13 },
  cta: { height: 48, borderRadius: 'var(--radius-md)', background: 'var(--inverse)', color: 'var(--text-on-inverse)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)', fontSize: 15, fontWeight: 600 },
  note: { display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--text-secondary)', fontSize: 13 },
};
