import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        kokoni: {
          blue: '#0369A1',
          teal: '#0891B2',
          light: '#E0F2FE',
          dark: '#0C2D5A',
        },
      },
    },
  },
  plugins: [],
}
export default config
