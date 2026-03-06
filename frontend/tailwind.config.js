/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0d14',
        surface: { 1: '#111827', 2: '#1a2035', 3: '#222b40' },
        border: '#2a3352',
        primary: { DEFAULT: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        muted: '#64748b',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { DEFAULT: '8px', lg: '12px', xl: '16px' },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.4)',
        glow: '0 0 20px rgba(59,130,246,0.15)',
      },
    },
  },
  plugins: [],
};
