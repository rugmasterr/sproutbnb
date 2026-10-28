import type { Config } from 'tailwindcss';

/** Every themed colour is an RGB triplet CSS variable (see globals.css) so `/alpha` works. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  // Dark-only theme. `dark:` variants are never needed; kept for compatibility.
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', md: '1.5rem', lg: '2rem' }, screens: { '2xl': '1240px' } },
    extend: {
      colors: {
        // ---- surfaces (legacy names kept; re-valued for the dark BNB theme)
        bg: v('bg'),
        raised: v('raised'),
        card: v('card'),
        line: { DEFAULT: v('line'), 2: v('line-2') },
        fg: v('fg'),
        muted: v('muted'),
        faint: v('faint'),
        // ---- accent = BNB yellow
        accent: { DEFAULT: v('accent'), hi: v('accent-hi'), deep: v('accent-deep') },
        'accent-fg': v('accent-fg'),
        'accent-wash': 'rgb(var(--accent) / 0.10)',
        glow: v('glow'),
        seal: v('seal'),
        gold: v('gold'),
        up: v('up'),
        down: v('down'),
        // ---- ink scale (near-black, faint warm/green tint)
        ink: { DEFAULT: v('bg'), 2: v('raised'), 3: v('card'), 4: v('ink-4') },
        // ---- bamboo green (growth / up / bamboo motifs). Legacy shades kept.
        bamboo: {
          DEFAULT: v('bamboo'),
          hi: v('bamboo-hi'),
          deep: v('bamboo-deep'),
          900: '#0C2318',
          700: '#1F6B43',
          500: '#2EBD6B',
        },
        shoot: { 300: '#7CE3A0' },
        leaf: { 200: '#B6F0C8' },
        paper: '#F4EEDC',
        soil: '#5A4628',
      },
      fontFamily: {
        // Latin = Geist; CJK glyphs fall through to Noto Sans SC.
        display: ['var(--font-geist-sans)', 'var(--font-noto-sans-sc)', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        sans: ['var(--font-geist-sans)', 'var(--font-noto-sans-sc)', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'var(--font-noto-sans-sc)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        cjk: ['var(--font-noto-sans-sc)', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      fontSize: {
        kicker: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.1em' }],
      },
      letterSpacing: {
        tightest: '-0.055em',
        tighter: '-0.04em',
        tight: '-0.025em',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.375rem', '3xl': '1.75rem' },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--accent) / 0.35), 0 10px 40px -10px rgb(var(--accent) / 0.55)',
        'glow-sm': '0 0 18px -4px rgb(var(--accent) / 0.6)',
        'glow-green': '0 0 0 1px rgb(var(--bamboo) / 0.35), 0 10px 40px -10px rgb(var(--bamboo) / 0.5)',
        lift: '0 24px 60px -20px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(.22,.8,.2,1)' },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(16px)', filter: 'blur(8px)' },
          '100%': { opacity: '1', transform: 'none', filter: 'none' },
        },
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
        sway: { '0%,100%': { transform: 'rotate(-1.2deg)' }, '50%': { transform: 'rotate(1.2deg)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        grow: { '0%': { transform: 'scaleY(0)' }, '100%': { transform: 'scaleY(1)' } },
        blink: { '50%': { opacity: '0.35' } },
        pulseRing: { '0%': { transform: 'scale(1)', opacity: '0.7' }, '100%': { transform: 'scale(2.8)', opacity: '0' } },
        drift: { '0%': { backgroundPosition: '0% 0' }, '100%': { backgroundPosition: '100% 0' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
      },
      animation: {
        rise: 'rise .9s cubic-bezier(.22,.8,.2,1) both',
        'fade-up': 'fadeUp .45s cubic-bezier(.22,.8,.2,1) both',
        sway: 'sway 6s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        grow: 'grow 1.2s cubic-bezier(.22,.8,.2,1) both',
        blink: 'blink 2.4s ease-in-out infinite',
        'pulse-ring': 'pulseRing 1.6s ease-out infinite',
        drift: 'drift 8s ease-in-out infinite alternate',
      },
    },
  },
  plugins: [],
};

export default config;
