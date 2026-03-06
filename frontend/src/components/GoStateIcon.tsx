import { useId } from 'react';

interface GoStateIconProps {
  size?: number;
  className?: string;
  /** 'fire' (default, frontend) | 'violet' (admin) */
  variant?: 'fire' | 'violet';
}

export default function GoStateIcon({ size = 32, className = '', variant = 'fire' }: GoStateIconProps) {
  const uid = useId().replace(/:/g, '');

  const isViolet = variant === 'violet';

  // Background: dark warm (fire) or dark cool (violet)
  const bgFrom = isViolet ? '#110d2e' : '#1a0e06';
  const bgTo   = isViolet ? '#1e1060' : '#2d1500';

  // Fire gradient: amber → orange → red
  // Violet gradient: lavender → violet
  const g0 = isViolet ? '#c4b5fd' : '#fbbf24';
  const g1 = isViolet ? '#a78bfa' : '#f97316';
  const g2 = isViolet ? '#7c3aed' : '#dc2626';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-label="goState logo"
    >
      <defs>
        {/* Background */}
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={bgFrom} />
          <stop offset="100%" stopColor={bgTo} />
        </linearGradient>

        {/* Bird / fire gradient — top-left to bottom-right */}
        <linearGradient id={`${uid}-fire`} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={g0} />
          <stop offset="50%"  stopColor={g1} />
          <stop offset="100%" stopColor={g2} />
        </linearGradient>

        {/* Softer glow for wings */}
        <linearGradient id={`${uid}-wing`} x1="8" y1="20" x2="56" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={g0} stopOpacity="0.85" />
          <stop offset="100%" stopColor={g1} stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* Background tile */}
      <rect width="64" height="64" rx="14" fill={`url(#${uid}-bg)`} />

      {/*
        FIREBIRD — minimalist phoenix in flight, ascending to the right.

        Anatomy:
        - Body: slim teardrop swept upward-right
        - Left wing: broad sweep upward (main wing, most prominent)
        - Right wing: shorter echo behind
        - Tail: two flame-strands trailing downward-left
        - Head: small circle / beak tip pointing right

        All strokes rounded, no fills except body silhouette.
        Composed entirely of paths for crispness at any size.
      */}

      {/* === TAIL FLAMES — trailing behind, sweeping down-left === */}
      {/* Main tail strand */}
      <path
        d="M 20 44 C 14 50 10 54 13 58"
        stroke={`url(#${uid}-fire)`}
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      {/* Secondary tail strand */}
      <path
        d="M 23 46 C 18 51 16 56 20 59"
        stroke={`url(#${uid}-fire)`}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
      {/* Tertiary wisp */}
      <path
        d="M 26 47 C 23 52 22 56 25 58"
        stroke={`url(#${uid}-fire)`}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
        opacity="0.4"
      />

      {/* === BODY — slim swept silhouette === */}
      <path
        d="M 20 44 C 24 38 30 30 42 22"
        stroke={`url(#${uid}-fire)`}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* === LEFT WING — broad upward sweep (dominant) === */}
      <path
        d="M 28 36 C 20 26 12 18 10 10 C 18 14 26 18 34 24"
        stroke={`url(#${uid}-wing)`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* === RIGHT WING — shorter, echoes behind === */}
      <path
        d="M 32 32 C 38 22 44 16 50 12 C 46 18 44 24 42 28"
        stroke={`url(#${uid}-wing)`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.7"
      />

      {/* === HEAD + BEAK — small bold circle, beak pointing upper-right === */}
      <circle
        cx="44"
        cy="20"
        r="4"
        fill={`url(#${uid}-fire)`}
      />
      {/* Beak */}
      <path
        d="M 47 17 L 54 13"
        stroke={`url(#${uid}-fire)`}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* === INNER GLOW DOT on body center === */}
      <circle
        cx="31"
        cy="33"
        r="2"
        fill={g0}
        opacity="0.5"
      />
    </svg>
  );
}
