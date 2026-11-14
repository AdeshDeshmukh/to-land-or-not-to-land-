/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        space: {
          950: '#000000',
          900: '#090A0D',
          800: '#12141A',
          700: '#1C1F26'
        },
        lunar: {
          safe: '#10B981',    // Green
          caution: '#F59E0B', // Amber / Yellow
          danger: '#EF4444',  // Red
          glow: '#FFFFFF'     // Crisp monochrome highlight
        }
      }
    },
  },
  plugins: [],
}

