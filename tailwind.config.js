
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Claude 设计规范 - 暖色调系统
        parchment: '#f5f4ed',
        ivory: '#faf9f5',
        warmSand: '#e8e6dc',
        darkSurface: '#30302e',
        nearBlack: '#141413',
        
        terracotta: '#c96442',
        coral: '#d97757',
        charcoalWarm: '#4d4c48',
        oliveGray: '#5e5d59',
        stoneGray: '#87867f',
        darkWarm: '#3d3d3a',
        warmSilver: '#b0aea5',
        
        borderCream: '#f0eee6',
        borderWarm: '#e8e6dc',
        borderDark: '#30302e',
        ringWarm: '#d1cfc5',
        ringSubtle: '#dedc01',
        ringDeep: '#c2c0b6',
        
        errorCrimson: '#b53333',
        focusBlue: '#3898ec',
        
        // 主色调
        primary: {
          50: '#fef3f0',
          100: '#fde7e0',
          200: '#fbd0c1',
          300: '#f8b5a0',
          400: '#f59479',
          500: '#d97757',
          600: '#c96442',
          700: '#a85236',
          800: '#87412a',
          900: '#663120',
        }
      }
    },
  },
  plugins: [],
}
