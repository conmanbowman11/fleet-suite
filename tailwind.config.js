/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        field: "#F4F3EF",      // page background - light warm gray
        ink: "#1D211C",        // main text - near-black green
        steel: "#2E4034",      // deep equipment green - headers
        steelLight: "#3C523F", // lighter green for hovers
        safety: "#D9480F",     // safety orange - primary actions
        safetyDark: "#B93D0C", // orange hover
        plate: "#FFFFFF",      // card background
        seam: "#DDDBD2",       // borders
        faded: "#6B7268",      // secondary text
      },
    },
  },
  plugins: [],
};
