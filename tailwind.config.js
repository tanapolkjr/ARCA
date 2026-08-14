/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      // Token colours used by the Sourcing module only. They read the CSS
      // variables declared in src/index.css, so light/dark follows the same
      // `dark` class the rest of the app uses.
      colors: {
        app: "var(--bg-app)",
        surface: "var(--bg-surface)",
        subtle: "var(--bg-subtle)",
        line: "var(--border)",
        ink: { 1: "var(--text-1)", 2: "var(--text-2)", 3: "var(--text-3)" },
        accent: { DEFAULT: "var(--accent)", hover: "var(--accent-hover)" },
        ok: "var(--c-green)",
        info: "var(--c-blue)",
        warn: "var(--c-amber)",
        bad: "var(--c-red)",
        scored: "var(--c-violet)",
      },
      borderRadius: { DEFAULT: "6px", card: "12px", modal: "12px" },
      boxShadow: { overlay: "0 4px 16px rgba(0,0,0,0.08)" },
      maxWidth: { page: "1280px", form: "760px" },
    },
  },
  plugins: [],
};
