import type { Config } from "tailwindcss";

const config: Pick<Config, "content"> = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "@repo/ui/**/*.{ts,tsx}",
  ],
};

export default config; 