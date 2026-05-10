type Props = {
  size?: number;
  color?: string;
  bg?: string;
  className?: string;
};

export function Logo({ size = 32, color = '#2563EB', bg = '#FFFFFF' }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="ChatBox"
    >
      <path
        fill={color}
        d="M32 4 C16.5 4 4 16 4 31 C4 39 8 46 14 51 L11 60 L21 56 C24 57 28 58 32 58 C47.5 58 60 46 60 31 C60 16 47.5 4 32 4 Z"
      />
      <circle cx="20" cy="32" r="3.5" fill={bg} />
      <circle cx="32" cy="32" r="3.5" fill={bg} />
      <circle cx="44" cy="32" r="3.5" fill={bg} />
    </svg>
  );
}

export function LogoWordmark({ size = 24 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Logo size={size} />
      <span style={{ fontWeight: 700, letterSpacing: -0.3, fontSize: size * 0.66 }}>ChatBox</span>
    </span>
  );
}
