/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        medgray: '#f4f7fa',   // 🩺 Soft hospital gray background
        medblue: '#0077b6',   // 💙 Professional medical blue
        medgreen: '#2a9d8f',  // 💚 Healing green tone
        medred: '#e63946',    // ❤️ Alert or error color
      },
    },
  },
  plugins: [],
}
