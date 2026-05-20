import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F2D4A',
          light: '#1a4a7a',
          50: '#e8f0f9',
          100: '#c5d8ef',
          200: '#9ebce3',
          300: '#77a0d7',
          400: '#5a8cce',
          500: '#3d78c5',
          600: '#3570be',
          700: '#2b64b5',
          800: '#215aab',
          900: '#0F2D4A',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
