interface GoStateIconProps {
  size?: number;
  className?: string;
}

/**
 * goState brand logo — two interlocking rounded squares with internal grid structure.
 *
 * Design: "Scalable Logo Assets Kit" — chain-link interlock of a white upper-left square
 * and an orange lower-right square. Each square has internal bars forming a maze/circuit pattern.
 *
 * The interlock is achieved via SVG draw-order:
 *   Layer 1 (behind): White right-side segment
 *   Layer 2 (middle): Full orange square + bars
 *   Layer 3 (front):  White remaining segments + bars
 */
export default function GoStateIcon({ size = 32, className = '' }: GoStateIconProps) {
  const sw = 7;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-label="goState logo"
    >
      {/* ── Background ── */}
      <rect width="100" height="100" rx="20" fill="#09090b" />

      {/* ================================================================
          LAYER 1 — White square: RIGHT SIDE (goes BEHIND orange)
          This includes the right edge that crosses behind orange's top edge
          ================================================================ */}
      <path
        d="M 48,7 Q 58,7 58,17 V 48"
        stroke="#ffffff"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* ================================================================
          LAYER 2 — Orange square (FULL) + internal bars
          Drawn on top of white's right side → orange covers crossing 1
          ================================================================ */}

      {/* Orange outer frame */}
      <path
        d="M 55,42 H 83 Q 93,42 93,52 V 83 Q 93,93 83,93 H 55 Q 42,93 42,83 V 55 Q 42,42 55,42 Z"
        stroke="#ff3e00"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Orange internal vertical bar (left side of orange square) */}
      <line
        x1="56" y1="54" x2="56" y2="80"
        stroke="#ff3e00"
        strokeWidth={sw}
        strokeLinecap="round"
      />

      {/* Orange internal horizontal bar (bottom of orange square) */}
      <line
        x1="66" y1="70" x2="82" y2="70"
        stroke="#ff3e00"
        strokeWidth={sw}
        strokeLinecap="round"
      />

      {/* ================================================================
          LAYER 3 — White square: REMAINING SIDES (goes IN FRONT of orange)
          This includes the bottom edge that crosses in front of orange's left edge
          ================================================================ */}

      {/* White outer frame — bottom-right corner through bottom, left, top-left, top */}
      <path
        d="M 58,48 Q 58,58 48,58 H 17 Q 7,58 7,48 V 17 Q 7,7 17,7 H 48"
        stroke="#ffffff"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* White internal horizontal bar — upper (wider) */}
      <line
        x1="19" y1="28" x2="46" y2="28"
        stroke="#ffffff"
        strokeWidth={sw}
        strokeLinecap="round"
      />

      {/* White internal horizontal bar — lower (shorter) */}
      <line
        x1="19" y1="40" x2="38" y2="40"
        stroke="#ffffff"
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </svg>
  );
}
