import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Discord-inspired dark theme
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: '#5865F2',
          hover: '#4752C4',
        },
        secondary: {
          DEFAULT: '#4F545C',
          hover: '#686D73',
        },
        success: '#3BA55C',
        warning: '#FAA61A',
        danger: '#ED4245',
        // Chat colors
        'chat-bg': '#36393F',
        'chat-hover': '#32353B',
        'sidebar-bg': '#2F3136',
        'channel-bg': '#202225',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      // Typography plugin customization for dark theme
      typography: {
        DEFAULT: {
          css: {
            color: '#dcddde',
            maxWidth: 'none',
            h1: { color: '#ffffff', fontWeight: '700', fontSize: '2.25em' },
            h2: { color: '#ffffff', fontWeight: '600', fontSize: '1.5em' },
            h3: { color: '#ffffff', fontWeight: '600', fontSize: '1.25em' },
            h4: { color: '#ffffff', fontWeight: '600' },
            strong: { color: '#ffffff' },
            a: { color: '#5865F2', textDecoration: 'underline' },
            code: { color: '#e3e5e8', backgroundColor: '#2f3136', padding: '0.2em 0.4em', borderRadius: '3px' },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            pre: { backgroundColor: '#2f3136', color: '#e3e5e8' },
            blockquote: { borderLeftColor: '#5865F2', color: '#b9bbbe' },
            hr: { borderColor: '#4f545c' },
            'ul > li::marker': { color: '#b9bbbe' },
            'ol > li::marker': { color: '#b9bbbe' },
            th: { color: '#ffffff' },
            td: { borderBottomColor: '#4f545c' },
          },
        },
        invert: {
          css: {
            '--tw-prose-body': '#dcddde',
            '--tw-prose-headings': '#ffffff',
            '--tw-prose-links': '#5865F2',
            '--tw-prose-bold': '#ffffff',
            '--tw-prose-code': '#e3e5e8',
            '--tw-prose-quotes': '#b9bbbe',
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
