/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  safelist: [
    'bg-blue-600',
    'bg-green-600',
    'bg-orange-500',
    'bg-purple-600',
    'bg-gray-400'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
