import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f0f5',
          100: '#e0e0eb',
          200: '#c1c1d7',
          300: '#a2a2c3',
          400: '#8383af',
          500: '#6366f1',
          600: '#5052c1',
          700: '#3d3e91',
          800: '#2a2b61',
          900: '#171731',
        },
        secondary: {
          50: '#f5f0f5',
          100: '#ebe0eb',
          200: '#d7c1d7',
          300: '#c3a2c3',
          400: '#af83af',
          500: '#8b5cf6',
          600: '#6f4ac6',
          700: '#533896',
          800: '#372666',
          900: '#1b1336',
        },
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};

export default config;
