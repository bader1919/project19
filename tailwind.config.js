/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      fontFamily: {
        // Latin font first: English renders in it, Arabic glyphs fall through to the Arabic family.
        serif: ['"Source Serif 4"', '"Noto Naskh Arabic"', "Georgia", "serif"],
        sans: ['"IBM Plex Sans"', '"IBM Plex Sans Arabic"', "system-ui", "sans-serif"],
      },
      colors: {
        paper: token("paper"),
        sheet: token("sheet"),
        pop: token("pop"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        line: token("line"),
        control: token("control"),
        binding: token("binding"),
        "on-binding": token("on-binding"),
        "binding-wash": token("binding-wash"),
        marker: token("marker"),
        "marker-ink": token("marker-ink"),
        danger: token("danger"),
        "warn-bg": token("warn-bg"),
        "warn-ink": token("warn-ink"),
      },
      fontSize: {
        display: ["2.125rem", { lineHeight: "2.5rem", fontWeight: "600" }],
        title: ["1.75rem", { lineHeight: "2.125rem", fontWeight: "600" }],
        h2: ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        lead: ["1.125rem", { lineHeight: "1.875rem" }],
        body: ["1rem", { lineHeight: "1.5rem" }],
        read: ["1.0625rem", { lineHeight: "1.75rem" }],
        meta: ["0.875rem", { lineHeight: "1.25rem" }],
        small: ["0.8125rem", { lineHeight: "1.125rem", fontWeight: "500" }],
      },
      borderRadius: { tab: "4px", ctl: "8px", frame: "12px" },
      boxShadow: { float: "0 8px 24px rgb(16 32 42 / .12)" },
      maxWidth: { prose: "68ch", list: "880px", item: "1120px" },
      keyframes: {
        pulseSoft: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".5" } },
        sheetUp: { from: { transform: "translateY(24px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        "pulse-soft": "pulseSoft 1.4s ease-in-out infinite",
        "sheet-up": "sheetUp 200ms ease-out",
        "fade-in": "fadeIn 120ms ease-out",
      },
    },
  },
  plugins: [],
};
