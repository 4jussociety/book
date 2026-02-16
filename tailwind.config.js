/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        fontFamily: {
            sans: ['Inter', 'sans-serif'],
            roboto: ['Roboto', 'sans-serif'], // Add Roboto font family
        },
        extend: {},
    },
    plugins: [],
}
