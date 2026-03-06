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

  const g0 = isViolet ? '#a5b4fc' : '#00e5ff';
  const g1 = isViolet ? '#7c3aed' : '#9d00ff';
  const bg  = '#0a0e2a';

  /*
    Symbol concept: "run & verify"
    ─────────────────────────────
    Outer ring: open arc (like a progress/run indicator), gap at bottom-right
    Inner shape: bold checkmark — confirms test passed

    All coordinates on a 64×64 canvas, centre at (32, 32).

    Arc: r=24, strokeWidth=5, runs from 135° to 45° clockwise (300° sweep, 60° gap)
    Check: two line segments forming ✓, stroke-only, rounded caps
      - left leg:  (19, 32) → (27, 41)
      - right leg: (27, 41) → (45, 22)
  */

  // Arc path: large arc from 135° to 45° (300° sweep, clockwise)
  // Polar → cartesian: x = cx + r·cos(θ), y = cy + r·sin(θ)
  // 135° = top-left gap start,  45° = top-right gap end
  // arc from 135° CW to 45° = 300° sweep (going the long way round)
  const cx = 32, cy = 32, r = 24;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const sx = cx + r * Math.cos(toRad(135)); // start x ≈ 14.97
  const sy = cy + r * Math.sin(toRad(135)); // start y ≈ 48.97  (bottom-left)
  const ex = cx + r * Math.cos(toRad(45));  // end x   ≈ 48.97
  const ey = cy + r * Math.sin(toRad(45));  // end y   ≈ 48.97  (bottom-right)
  // large-arc-flag=1 because 300° > 180°, sweep-flag=1 (clockwise)
  const arcPath = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-label="goState logo"
    >
      <defs>
        {/* Main top-to-bottom gradient */}
        <linearGradient id={`${uid}-g`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor={g0} />
          <stop offset="100%" stopColor={g1} />
        </linearGradient>
        {/* Diagonal variant for the check to give depth */}
        <linearGradient id={`${uid}-c`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={g0} />
          <stop offset="100%" stopColor={g1} />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="64" height="64" rx="13" fill={bg} />

      {/* ── Open arc ring — "run indicator" ── */}
      <path
        d={arcPath}
        fill="none"
        stroke={`url(#${uid}-g)`}
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      {/* ── Checkmark — "test passed" ── */}
      {/* Left leg: small downward stroke */}
      <polyline
        points="19,32 27,41 45,22"
        fill="none"
        stroke={`url(#${uid}-c)`}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
