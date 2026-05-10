import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '../../src/theme';
import { api, ApiError } from '../../src/api';
import { session } from '../../src/session';

const LENGTH = 6;

export default function LoginOtp() {
  const { number, devCode } = useLocalSearchParams<{ number?: string; devCode?: string }>();
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [seconds, setSeconds] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const code = digits.join('');
  const complete = code.length === LENGTH;

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < LENGTH - 1) refs.current[i + 1]?.focus();
    setError(null);
  };

  const onVerify = async () => {
    if (!complete || busy || !number) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.verifyOtp(String(number), code, {
        platform: Platform.OS,
        name: `${Platform.OS} (${Platform.Version})`,
      });
      await session.set(r.accessToken, r.refreshToken);
      router.replace('/(tabs)');
    } catch (e) {
      const msg = e instanceof ApiError ? (e.message || 'Verification failed') : 'Network error';
      setError(msg);
      setBusy(false);
    }
  };

  const onResend = async () => {
    if (seconds > 0 || !number) return;
    try {
      await api.requestOtp(String(number));
      setSeconds(30);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not resend');
    }
  };

  const masked = number ? String(number) : 'your number';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={tokens.color.textPrimary} />
        </Pressable>

        <View style={styles.body}>
          <Text style={styles.h1}>Enter the 6-digit code</Text>
          <Text style={styles.sub}>Sent to {masked}. Codes expire in 5 minutes.</Text>

          <View style={styles.cells}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(r) => {
                  refs.current[i] = r;
                }}
                style={[styles.cell, d ? styles.cellFilled : null]}
                keyboardType="number-pad"
                maxLength={1}
                value={d}
                onChangeText={(v) => setDigit(i, v)}
                onKeyPress={({ nativeEvent }) => {
                  if (nativeEvent.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
                }}
                autoFocus={i === 0}
                editable={!busy}
              />
            ))}
          </View>

          {devCode ? (
            <Text style={styles.devHint}>Dev code: {devCode}</Text>
          ) : null}
          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.cta, (!complete || busy) && styles.ctaDisabled]}
            disabled={!complete || busy}
            onPress={onVerify}
          >
            {busy ? (
              <ActivityIndicator color={tokens.color.textOnInverse} />
            ) : (
              <Text style={styles.ctaText}>Verify and continue</Text>
            )}
          </Pressable>

          <View style={styles.row}>
            <Text style={styles.subSmall}>
              {seconds > 0 ? `Resend in ${seconds}s` : "Didn't get it?"}
            </Text>
            <Pressable disabled={seconds > 0} onPress={onResend}>
              <Text style={[styles.resend, seconds > 0 && styles.resendDisabled]}>Resend code</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.canvas },
  flex: { flex: 1 },
  back: {
    margin: tokens.space.lg, width: 40, height: 40, borderRadius: tokens.radius.full,
    backgroundColor: tokens.color.card, borderWidth: 1, borderColor: tokens.color.border,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1, paddingHorizontal: tokens.space.xxl, gap: tokens.space.xl, paddingTop: tokens.space.lg },
  h1: { color: tokens.color.textPrimary, fontSize: tokens.font.h1, fontWeight: tokens.weight.bold, letterSpacing: -0.4 },
  sub: { color: tokens.color.textSecondary, fontSize: tokens.font.lg, lineHeight: 24 },
  subSmall: { color: tokens.color.textSecondary, fontSize: tokens.font.sm },
  cells: { flexDirection: 'row', gap: tokens.space.sm, justifyContent: 'space-between' },
  cell: {
    flex: 1, aspectRatio: 1,
    borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border,
    backgroundColor: tokens.color.card,
    textAlign: 'center', fontSize: tokens.font.h2, fontWeight: tokens.weight.bold, color: tokens.color.textPrimary,
  },
  cellFilled: { borderColor: tokens.color.inverse },
  cta: {
    height: 52, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.inverse,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: tokens.color.textOnInverse, fontSize: tokens.font.lg, fontWeight: tokens.weight.semibold },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resend: { color: tokens.color.textPrimary, fontSize: tokens.font.sm, fontWeight: tokens.weight.semibold },
  resendDisabled: { color: tokens.color.textTertiary },
  devHint: { color: tokens.color.textTertiary, fontSize: tokens.font.sm, fontStyle: 'italic' },
  error: { color: '#DC2626', fontSize: tokens.font.sm },
});
