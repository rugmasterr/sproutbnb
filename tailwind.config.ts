import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', md: '1.5rem' }, screens: { '2xl': '1240px' } },
    extend: {
      colors: {
        bg: v('bg'),
        raised: v('raised'),
        card: v('card'),
        line: v('line'),
        fg: v('fg'),
        muted: v('muted'),
        faint: v('faint'),
        accent: v('accent'),
        'accent-fg': v('accent-fg'),
        seal: v('seal'),
        gold: v('gold'),
        up: v('up'),
        down: v('down'),
        bamboo: { 900: '#0E2A1B', 700: '#1F6B43', 500: '#2F8F57' },
        shoot: { 300: '#7CC36E' },
        leaf: { 200: '#A8DC7A' },
        paper: '#F4EEDC',
        ink: '#141613',
        soil: '#6B4F2A',
      },
      fontFamily: {
        display: ['var(--font-display)', 'var(--font-cjk-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-ui)', 'var(--font-cjk-sans)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { xl: '0.9rem', '2xl': '1.25rem' },
      keyframes: {
        rise: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
        sway: { '0%,100%': { transform: 'rotate(-1.2deg)' }, '50%': { transform: 'rotate(1.2deg)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        grow: { '0%': { transform: 'scaleY(0)' }, '100%': { transform: 'scaleY(1)' } },
      },
      animation: {
        rise: 'rise .5s cubic-bezier(.2,.7,.2,1) both',
        sway: 'sway 6s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        grow: 'grow 1.2s cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
