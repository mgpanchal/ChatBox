import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../theme';

export type Sensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

const palette: Record<Sensitivity, { bg: string; fg: string; label: string }> = {
  public: { bg: tokens.color.bubbleOther, fg: tokens.color.textSecondary, label: 'Public' },
  internal: { bg: tokens.color.internalSoft, fg: tokens.color.internal, label: 'Internal' },
  confidential: { bg: tokens.color.confidentialSoft, fg: tokens.color.confidential, label: 'Confidential' },
  restricted: { bg: tokens.color.inverse, fg: tokens.color.textOnInverse, label: 'Restricted' },
};

export function SensitivityBadge({ value }: { value: Sensitivity }) {
  const p = palette[value];
  return (
    <View style={[styles.badge, { backgroundColor: p.bg }]}>
      <Text style={[styles.text, { color: p.fg }]}>{p.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: tokens.space.sm,
    paddingVertical: 2,
    borderRadius: tokens.radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: tokens.font.xs,
    fontWeight: tokens.weight.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
