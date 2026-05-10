import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../theme';

type Props = { label: string };

export function Watermark({ label }: Props) {
  const rows = Array.from({ length: 14 });
  const cols = Array.from({ length: 4 });
  return (
    <View pointerEvents="none" style={styles.layer}>
      {rows.map((_, r) => (
        <View key={r} style={styles.row}>
          {cols.map((__, c) => (
            <Text key={c} style={styles.text}>
              {label}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ rotate: '-22deg' }, { scale: 1.4 }],
    justifyContent: 'space-around',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  text: {
    color: tokens.color.textPrimary,
    opacity: 0.05,
    fontSize: tokens.font.xs,
    fontWeight: tokens.weight.semibold,
    letterSpacing: 0.4,
  },
});
