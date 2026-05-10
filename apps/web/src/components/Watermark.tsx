export function Watermark({ label }: { label: string }) {
  const cells = Array.from({ length: 80 });
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        transform: 'rotate(-22deg) scale(1.6)',
        zIndex: 1,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 24,
          padding: 24,
        }}
      >
        {cells.map((_, i) => (
          <span
            key={i}
            style={{
              color: 'var(--text-primary)',
              opacity: 0.04,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.4,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
