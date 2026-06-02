/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: {
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        border: 'var(--border)',
        primary: {
          DEFAULT: 'var(--primary)',
          50: 'var(--primary-50)',
          100: 'var(--primary-100)',
          200: 'var(--primary-200)',
          300: 'var(--primary-300)',
          400: 'var(--primary-400)',
          500: 'var(--primary)',
          600: 'var(--primary)',
          700: 'var(--primary-hover)',
          800: 'var(--primary-hover)',
          900: 'var(--primary-hover)',
        },
        // Map blue tailwind classes to our custom crimson primary variables
        blue: {
          50: 'var(--primary-50)',
          100: 'var(--primary-100)',
          200: 'var(--primary-200)',
          300: 'var(--primary-300)',
          400: 'var(--primary-400)',
          500: 'var(--primary)',
          600: 'var(--primary)',
          700: 'var(--primary-hover)',
          800: 'var(--primary-hover)',
          900: 'var(--primary-hover)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        muted: 'var(--text-muted)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { DEFAULT: '8px', lg: '12px', xl: '16px' },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.4)',
        glow: 'var(--shadow-glow)',
      },
    },
  },
  plugins: [],
};
