/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0d12",
        panel: "#11161e",
        line: "#252c37",
        human: "#69d6e8",
        agent: "#f4a852"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["SFMono-Regular", "ui-monospace", "monospace"]
      }
    }
  },
  plugins: []
};
