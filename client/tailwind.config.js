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
          950: '#030712',
          900: '#0B0F19',
          800: '#111827',
          700: '#1F2937'
        },
        lunar: {
          safe: '#10B981',    // Green
          caution: '#F59E0B', // Amber / Yellow
          danger: '#EF4444',  // Red
          glow: '#38BDF8'     // Cyan glow for UI accents
        }
      }
    },
  },
  plugins: [],
}

