/** @type {import('tailwindcss').Config} */
const brandVar = (shade, fallback) => `rgb(var(--brand-${shade}, ${fallback}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: brandVar(50, '255 245 239'),
          100: brandVar(100, '255 230 213'),
          200: brandVar(200, '255 201 170'),
          300: brandVar(300, '255 162 116'),
          400: brandVar(400, '255 112 56'),
          500: brandVar(500, '248 86 6'),
          600: brandVar(600, '229 69 0'),
          700: brandVar(700, '189 51 2'),
          800: brandVar(800, '150 43 9'),
          900: brandVar(900, '121 39 11'),
        },
        ink: '#1f2937',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1)',
      },
    },
  },
  plugins: [],
}
