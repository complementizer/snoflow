/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        finding: {
          bg: '#e3f2fd',
          border: '#1976d2',
          text: '#1565c0',
        },
        body: {
          bg: '#f3e5f5',
          border: '#7b1fa2',
          text: '#6a1b9a',
        },
        procedure: {
          bg: '#e8f5e9',
          border: '#388e3c',
          text: '#2e7d32',
        },
      },
    },
  },
  plugins: [],
}
