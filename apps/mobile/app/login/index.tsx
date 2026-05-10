import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '../../src/theme';
import { api, ApiError } from '../../src/api';

export default function LoginPhone() {
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[6-9]\d{9}$/.test(number);

  const onSubmit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const e164 = `+91${number}`;
    try {
      const r = await api.requestOtp(e164);
      router.push({ pathname: '/login/otp', params: { number: e164, devCode: r.devCode ?? '' } });
    } catch (e) {
      const msg = e instanceof ApiError ? (e.message || 'Request failed') : 'Network error. Check that the API is reachable.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Feather name="message-square" size={20} color={tokens.color.textOnInverse} />
          </View>
          <Text style={styles.kicker}>CHATBOX</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.h1}>Sign in</Text>
          <Text style={styles.sub}>
            Your company's secure messenger. Enter the mobile number registered with your employer.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Mobile number</Text>
            <View style={styles.inputRow}>
              <View style={styles.cc}>
                <Text style={styles.ccText}>+91</Text>
              </View>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                placeholder="98765 43210"
                placeholderTextColor={tokens.color.textTertiary}
                maxLength={10}
                value={number}
                onChangeText={(t) => { setNumber(t); setError(null); }}
                autoFocus
                editable={!busy}
              />
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
          </View>

          <Pressable
            style={[styles.cta, (!valid || busy) && styles.ctaDisabled]}
            disabled={!valid || busy}
            onPress={onSubmit}
          >
            {busy ? (
              <ActivityIndicator color={tokens.color.textOnInverse} />
            ) : (
              <>
                <Text style={styles.ctaText}>Send code</Text>
                <Feather name="arrow-right" size={18} color={tokens.color.textOnInverse} />
              </>
            )}
          </Pressable>

          <View style={styles.note}>
            <Feather name="lock" size={14} color={tokens.color.textSecondary} />
            <Text style={styles.noteText}>
              Invite-only. If your number isn't recognised, contact your admin.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.canvas },
  flex: { flex: 1 },
  header: { paddingHorizontal: tokens.space.xxl, paddingTop: tokens.space.lg, flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm },
  logoMark: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: tokens.color.inverse,
    alignItems: 'center', justifyContent: 'center',
  },
  kicker: { color: tokens.color.textPrimary, fontSize: tokens.font.sm, fontWeight: tokens.weight.bold, letterSpacing: 2 },
  body: { flex: 1, paddingHorizontal: tokens.space.xxl, paddingTop: tokens.space.xxxl, gap: tokens.space.xl },
  h1: { color: tokens.color.textPrimary, fontSize: tokens.font.hero, fontWeight: tokens.weight.bold, letterSpacing: -0.5 },
  sub: { color: tokens.color.textSecondary, fontSize: tokens.font.lg, lineHeight: 24 },
  field: { gap: tokens.space.sm },
  label: { color: tokens.color.textSecondary, fontSize: tokens.font.sm, fontWeight: tokens.weight.medium },
  inputRow: { flexDirection: 'row', gap: tokens.space.sm },
  cc: {
    paddingHorizontal: tokens.space.lg,
    height: 52,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.card,
    borderWidth: 1, borderColor: tokens.color.border,
    justifyContent: 'center', alignItems: 'center',
  },
  ccText: { fontSize: tokens.font.lg, color: tokens.color.textPrimary, fontWeight: tokens.weight.semibold },
  input: {
    flex: 1, height: 52,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.card,
    borderWidth: 1, borderColor: tokens.color.border,
    paddingHorizontal: tokens.space.lg,
    fontSize: tokens.font.lg, color: tokens.color.textPrimary,
    letterSpacing: 0.4,
  },
  error: { color: '#DC2626', fontSize: tokens.font.sm, marginTop: 4 },
  cta: {
    height: 52, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.inverse,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.space.sm,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: tokens.color.textOnInverse, fontSize: tokens.font.lg, fontWeight: tokens.weight.semibold },
  note: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm, paddingTop: tokens.space.sm },
  noteText: { color: tokens.color.textSecondary, fontSize: tokens.font.sm, flex: 1 },
});
