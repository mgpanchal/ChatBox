import { MessageSquare } from 'lucide-react';

export default function ChatEmpty() {
  return (
    <div style={styles.empty}>
      <div style={styles.icon}>
        <MessageSquare size={28} color="var(--text-secondary)" />
      </div>
      <h2 style={styles.h}>Pick a conversation</h2>
      <p style={styles.p}>
        Select a channel or direct message from the sidebar to start reading. New messages will appear here in real time.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 40,
    textAlign: 'center',
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  h: { fontSize: 18, fontWeight: 600 },
  p: { fontSize: 14, color: 'var(--text-secondary)', maxWidth: 360, lineHeight: 1.55 },
};
