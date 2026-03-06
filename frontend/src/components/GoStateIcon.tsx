import { useId } from 'react';

interface GoStateIconProps {
  size?: number;
  className?: string;
  /** 'blue' (default, frontend) | 'violet' (admin) */
  variant?: 'blue' | 'violet';
}

export default function GoStateIcon({ size = 32, className = '', variant = 'blue' }: GoStateIconProps) {
  const uid = useId().replace(/:/g, '');

  const isViolet = variant === 'violet';
  const primary  = isViolet ? '#7c3aed' : '#3b62f6';
  const light    = isViolet ? '#a78bfa' : '#6b8ff8';
  const bgFrom   = isViolet ? '#13103a' : '#0e1a3a';
  const bgTo     = isViolet ? '#1e1060' : '#122050';

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
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={bgFrom} />
          <stop offset="100%" stopColor={bgTo} />
        </linearGradient>
        <linearGradient id={`${uid}-icon`} x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={primary} />
        </linearGradient>
      </defs>

      {/* Rounded square background */}
      <rect width="64" height="64" rx="14" fill={`url(#${uid}-bg)`} />

      {/*
        State-flow icon: two curved arrows forming a cycle/transition loop.
        Top arrow curves right→down, bottom arrow curves left→up.
        Represents "state transitions" — the core concept of goState.
      */}

      {/* Top arc: left-to-right, clockwise */}
      <path
        d="M 14 26 C 14 16 28 11 38 16"
        stroke={`url(#${uid}-icon)`}
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Top arrowhead pointing right/down */}
      <polyline
        points="34,12 39,17 34,22"
        stroke={`url(#${uid}-icon)`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Bottom arc: right-to-left, clockwise (completing the cycle) */}
      <path
        d="M 50 38 C 50 48 36 53 26 48"
        stroke={`url(#${uid}-icon)`}
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Bottom arrowhead pointing left/up */}
      <polyline
        points="30,52 25,47 30,42"
        stroke={`url(#${uid}-icon)`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
