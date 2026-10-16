/** @type {import('tailwindcss').Config} */
// FLEET SUITE COLORS AND FONTS
// Blue and white, office-modern with an industrial edge.
// Every screen uses these names, so changing a value here restyles the app.
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        field: "#F2F5F9", // page background - cool light gray
        ink: "#14202E", // main text - near-black navy
        plate: "#FFFFFF", // cards
        seam: "#DCE3EB", // borders
        faded: "#5B6B7D", // secondary text
        navy: "#0E2A47", // sidebar
        navyLight: "#1A3A5E", // sidebar hover
        steel: "#0E2A47", // dark buttons and selected choices
        steelLight: "#1A3A5E",
        safety: "#1E5BA8", // primary blue - main actions and links
        safetyDark: "#174A8B",
        tint: "#E8EFF8", // light blue wash
        danger: "#C42B2B", // overdue, urgent, errors
        dangerSoft: "#FBE9E9",
        caution: "#E2A400", // due soon
        cautionSoft: "#FDF3D7",
        cautionInk: "#5A4100",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
