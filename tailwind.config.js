/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#121212',
          secondary: '#1a1a1a',
          tertiary: '#2a2a2a',
        },
        green: {
          DEFAULT: '#4aaa7a',
          dark: '#1a7a55',
          deep: '#0d2d1e',
          cta: '#092c25',
        },
        text: {
          primary: '#f5f5f5',
          secondary: '#cccccc',
          muted: '#888888',
          faint: '#444444',
        },
        border: {
          DEFAULT: '#2a2a2a',
          green: '#1a7a55',
        },
        red: {
          loss: '#e05555',
          'loss-bg': '#2d1414',
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        app: '10px',
        'app-lg': '12px',
        'app-xl': '20px',
      },
      animation: {
        'pulse-dot': 'pulse 1.5s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
