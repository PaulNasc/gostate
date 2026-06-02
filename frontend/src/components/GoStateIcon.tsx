import { useId } from 'react';

interface GoStateIconProps {
  size?: number;
  className?: string;
  /** 'fire' (default, frontend) | 'cyan' (admin) */
  variant?: 'fire' | 'cyan';
}

export default function GoStateIcon({ size = 32, className = '', variant = 'fire' }: GoStateIconProps) {
  const uid = useId().replace(/:/g, '');
  const isViolet = variant === 'cyan';

  const g0 = isViolet ? '#c4b5fd' : '#67e8f9';
  const g1 = isViolet ? '#0891b2' : '#2563eb';
  const bg = '#0b1120';

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
        <linearGradient id={`${uid}-g`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={g0} />
          <stop offset="100%" stopColor={g1} />
        </linearGradient>
        <linearGradient id={`${uid}-s`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={g0} />
          <stop offset="100%" stopColor={g1} />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="13" fill={bg} />
      <rect x="13" y="13" width="38" height="38" rx="11" fill="none" stroke={`url(#${uid}-g)`} strokeWidth="3.5" opacity="0.95" />
      <rect x="20" y="22" width="24" height="5" rx="2.5" fill={`url(#${uid}-s)`} opacity="0.95" />
      <rect x="20" y="30" width="18" height="5" rx="2.5" fill={`url(#${uid}-s)`} opacity="0.78" />
      <rect x="20" y="38" width="12" height="5" rx="2.5" fill={`url(#${uid}-s)`} opacity="0.58" />
    </svg>
  );
}
