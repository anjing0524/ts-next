/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"], // Standard shadcn/ui dark mode strategy
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}', // Scan packages/ui
  ],
  theme: {
    // Most theme variables (colors, radius) are expected to be loaded from shared-styles.css via @theme
    // However, if you need to extend Tailwind's default theme scale (e.g., for spacing, fontSize), do it here.
    // For shadcn/ui, ensuring the CSS variables are available is key.
    // The container utility is defined in shared-styles.css using @utility.
    extend: {
      // Keyframes for tailwindcss-animate (if not automatically handled by the plugin with v4)
      // Usually, tailwindcss-animate adds these, but good to be aware.
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Standard shadcn/ui animations (slide-in, slide-out, etc.)
        // are typically provided by tailwindcss-animate itself.
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    // Other plugins if needed
  ],
}
