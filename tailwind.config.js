/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Noto Sans Arabic", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          500: "#2f6fed",
          600: "#2259d1",
          700: "#1d47a8",
        },
      },
    },
  },
  plugins: [],
};
