import type { Sensitivity } from '../mock';

const palette: Record<Sensitivity, { bg: string; fg: string; label: string }> = {
  public: { bg: 'var(--bubble-other)', fg: 'var(--text-secondary)', label: 'Public' },
  internal: { bg: 'var(--internal-soft)', fg: 'var(--internal)', label: 'Internal' },
  confidential: { bg: 'var(--confidential-soft)', fg: 'var(--confidential)', label: 'Confidential' },
  restricted: { bg: 'var(--inverse)', fg: 'var(--text-on-inverse)', label: 'Restricted' },
};

export function SensitivityBadge({ value }: { value: Sensitivity }) {
  const p = palette[value];
  return (
    <span
      style={{
        background: p.bg,
        color: p.fg,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        padding: '3px 8px',
        borderRadius: 'var(--radius-full)',
        whiteSpace: 'nowrap',
      }}
    >
      {p.label}
    </span>
  );
}
