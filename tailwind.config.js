/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        parchment: {
          50: '#FBF6E6',
          100: '#F5EBD6',
          200: '#EDDDB8',
          300: '#E2C88D',
          400: '#CD853F',
          500: '#B87333',
          600: '#8B4513',
          700: '#5E2F0D',
        },
        wax: {
          red: '#B22222',
          burgundy: '#800020',
          forest: '#355E3B',
        },
        seal: {
          blue: '#4A6FA5',
          sage: '#6B8E23',
          sunset: '#E8A87C',
          lamp: '#F4C430',
        },
        fog: {
          light: '#3B3A4A',
          dark: '#1A1823',
        },
      },
      fontFamily: {
        story: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        hand: ['"Caveat"', '"Patrick Hand"', 'cursive'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        parchment: '0 1px 3px rgba(94, 47, 13, 0.15), 0 4px 20px rgba(94, 47, 13, 0.08)',
        'paper-deep': '0 8px 32px rgba(30, 20, 10, 0.25)',
      },
      animation: {
        flicker: 'flicker 2.5s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'seal-press': 'sealPress 0.4s ease-out',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        sealPress: {
          '0%': { transform: 'scale(1.4) rotate(-10deg)', opacity: '0' },
          '60%': { transform: 'scale(0.95) rotate(2deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
