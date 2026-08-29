import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    // lib/ was missing from this list, so Tailwind never scanned lib/tags.tsx for
    // class names — its one-off classes like z-[10000]/z-[10001] (used to float the
    // tag picker's dropdown above everything else) silently generated no CSS at all,
    // leaving the dropdown with no real z-index. It rendered in the right place with
    // the right content, just invisible/unclickable behind other stacked elements.
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
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
