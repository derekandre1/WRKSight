/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Muted dark surfaces with green/red P/L accents.
        base: '#0b0e13',
        panel: '#141922',
        panel2: '#1b212c',
        edge: '#252c38',
        muted: '#8b97a8',
        text: '#e6eaf0',
        profit: '#3ecf8e',
        loss: '#f06d6d',
        accent: '#5b8def',
      },
    },
  },
  plugins: [],
};
