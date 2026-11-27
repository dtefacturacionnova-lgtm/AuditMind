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
        nc: {
          bg: 'var(--nc-bg)',
          panel: 'var(--nc-panel)',
          line: 'var(--nc-line)',
          'line-strong': 'var(--nc-line-strong)',
          text: 'var(--nc-text)',
          muted: 'var(--nc-muted)',
          accent: 'var(--nc-accent)',
          'accent-hover': 'var(--nc-accent-hover)',
          success: 'var(--nc-success)',
          warning: 'var(--nc-warning)',
          danger: 'var(--nc-danger)',
          hover: 'var(--nc-hover)',
          pressed: 'var(--nc-pressed)',
          'on-accent': 'var(--nc-on-accent)',
        },
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
      // Identidad Nova Criterio (fase 0): claves nuevas con prefijo nc; NO se redefine font-sans ni font-mono (las usan decenas de pantallas).
      // Los colores apuntan a las variables --nc-* de globals.css, que cambian con el tema (claro/oscuro).
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        'nc-display': ['var(--font-space-grotesk)', "'Space Grotesk'", 'system-ui', 'sans-serif'],
        'nc-mono': ['var(--font-jetbrains-mono)', "'JetBrains Mono'", 'ui-monospace', 'monospace'],
        'nc-tagline': ['var(--font-playfair)', "'Playfair Display'", 'Georgia', 'serif'],
      },
      borderRadius: {
        nc: '2px',
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
