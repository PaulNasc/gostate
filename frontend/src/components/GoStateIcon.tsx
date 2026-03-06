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

  const bgFrom = isViolet ? '#0f0c24' : '#130a00';
  const bgTo   = isViolet ? '#1a1245' : '#1f0e00';

  // Primary fill gradient (body + wing top)
  const c0 = isViolet ? '#e0d4ff' : '#fde68a'; // light tip
  const c1 = isViolet ? '#a78bfa' : '#fb923c'; // mid
  const c2 = isViolet ? '#6d28d9' : '#dc2626'; // dark base

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-label="goState logo"
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={bgFrom} />
          <stop offset="100%" stopColor={bgTo} />
        </linearGradient>

        {/* Main fire gradient — diagonal, warm top to hot base */}
        <linearGradient id={`${uid}-a`} x1="20" y1="10" x2="80" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={c0} />
          <stop offset="45%"  stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>

        {/* Darker variant for tail / depth */}
        <linearGradient id={`${uid}-b`} x1="10" y1="50" x2="60" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={c1} />
          <stop offset="100%" stopColor={c2} stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* Rounded square background */}
      <rect width="100" height="100" rx="22" fill={`url(#${uid}-bg)`} />

      {/*
        ═══════════════════════════════════════════════════
        PHOENIX — filled silhouette, proper bird anatomy
        Viewbox: 100×100

        Layout:
          • Head: top-right area, small rounded teardrop
          • Body: central diagonal mass, thick
          • Upper wing: arches up from body centre, broad
          • Lower wing: fans out below body
          • Tail feathers: 3 flowing plumes bottom-left
        ═══════════════════════════════════════════════════
      */}

      {/* ── TAIL FEATHERS (bottom-left, layered) ── */}
      {/* Feather 1 — outermost, longest */}
      <path
        d="M 30 72 C 20 80 12 88 16 96 C 20 100 26 96 28 88 C 30 82 32 78 36 74 Z"
        fill={`url(#${uid}-b)`}
        opacity="0.9"
      />
      {/* Feather 2 — middle */}
      <path
        d="M 36 70 C 28 76 22 84 28 93 C 32 98 38 93 38 85 C 38 79 40 74 44 70 Z"
        fill={`url(#${uid}-b)`}
        opacity="0.75"
      />
      {/* Feather 3 — innermost */}
      <path
        d="M 44 68 C 38 73 34 80 40 88 C 44 93 50 88 48 81 C 47 76 48 71 52 68 Z"
        fill={`url(#${uid}-b)`}
        opacity="0.6"
      />

      {/* ── LOWER WING (fans downward-right from body) ── */}
      <path
        d="M 42 58
           C 36 64 28 68 18 70
           C 14 71 12 68 15 66
           C 22 62 30 58 36 52
           C 38 50 40 48 42 46
           C 46 54 44 56 42 58 Z"
        fill={`url(#${uid}-a)`}
        opacity="0.85"
      />

      {/* ── UPPER WING (arches high above body) ── */}
      <path
        d="M 48 44
           C 44 34 38 22 28 14
           C 24 11 20 12 20 16
           C 20 20 26 24 32 30
           C 38 36 42 40 46 48
           C 46 48 48 46 48 44 Z"
        fill={`url(#${uid}-a)`}
      />

      {/* ── BODY — central teardrop mass ── */}
      <path
        d="M 44 52
           C 40 44 42 34 50 26
           C 56 20 64 18 70 20
           C 76 22 78 28 74 34
           C 70 40 62 44 56 48
           C 52 50 48 52 44 52 Z"
        fill={`url(#${uid}-a)`}
      />

      {/* ── HEAD — rounded teardrop, top-right ── */}
      <path
        d="M 68 14
           C 64 10 58 10 56 14
           C 54 18 56 24 60 26
           C 64 28 70 26 72 22
           C 74 18 72 16 68 14 Z"
        fill={`url(#${uid}-a)`}
      />

      {/* ── BEAK — small sharp triangle ── */}
      <path
        d="M 72 16 L 82 11 L 76 20 Z"
        fill={c0}
        opacity="0.9"
      />

      {/* ── EYE — dark dot ── */}
      <circle cx="63" cy="18" r="2.2" fill={bgFrom} opacity="0.8" />
    </svg>
  );
}
