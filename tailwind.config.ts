import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#7F77DD',
        'primary-hover': '#6B63CC',
        'primary-muted': 'rgba(127,119,221,0.15)',
        editor: {
          bg: '#111111',
          surface: '#1A1A1A',
          panel: '#222222',
          border: '#2A2A2A',
          'border-subtle': '#1F1F1F',
          text: '#E5E5E5',
          'text-muted': '#888888',
          'text-subtle': '#555555',
        },
      },
    },
  },
} satisfies Config;
