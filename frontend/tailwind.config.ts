import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        rasid: {
          50: "#eef7ff",
          100: "#d9edff",
          200: "#bce0ff",
          300: "#8eccff",
          400: "#59afff",
          500: "#338bff",
          600: "#1b6af5",
          700: "#1454e1",
          800: "#1744b6",
          900: "#193c8f",
          950: "#142657",
        },
        accent: {
          50: "#fff8ed",
          100: "#ffedd2",
          200: "#ffd8a8",
          300: "#ffbc70",
          400: "#ff9938",
          500: "#ff7b12",
          600: "#f46208",
          700: "#cb4809",
          800: "#a13a12",
          900: "#823215",
          950: "#461707",
        },
      },
      fontFamily: {
        arabic: ['var(--font-tajawal)', '"Noto Sans Arabic"', '"IBM Plex Sans Arabic"', "sans-serif"],
        sans: ['var(--font-space-grotesk)', '"Segoe UI"', "sans-serif"],
      },
      spacing: {
        "sidebar-collapsed": "5rem",
        "sidebar-expanded": "18rem",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out forwards",
        "fade-out": "fadeOut 0.2s ease-in",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "slide-up": "slideUp 0.4s ease-out forwards",
        "scale-in": "scaleIn 0.3s ease-out forwards",
        "spin-slow": "spin 3s linear infinite",
        "float": "float 3s ease-in-out infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "count-up": "countUp 0.6s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideInLeft: {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        glow: {
          "0%": { boxShadow: "0 0 20px rgba(14, 165, 233, 0.12)" },
          "100%": { boxShadow: "0 0 30px rgba(14, 165, 233, 0.3)" },
        },
        countUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
};

export default config;
