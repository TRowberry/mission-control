import type { Config } from 'tailwindcss';

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
    },
  },
  plugins: [],
};

export default config;
