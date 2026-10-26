import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core Brand & Palette from DESIGN.md (Apex Ledger Corporate)
        primary: {
          DEFAULT: "#1d63ed",
          hover: "#1550c0",
          active: "#0f3ea9",
          container: "#eff4ff",
          fixed: "#dbe1ff",
        },
        sidebar: {
          bg: "#0f172a",
          surface: "#162032",
          border: "#1e293b",
          text: "#94a3b8",
          active: "#ffffff",
          activeBg: "#1e293b",
        },
        surface: {
          canvas: "#f8fafc",
          card: "#ffffff",
          subtle: "#f1f5f9",
          border: "#e2e8f0",
        },
        status: {
          active: {
            text: "#065f46",
            bg: "#ecfdf5",
            border: "#a7f3d0",
            dot: "#10b981",
          },
          pending: {
            text: "#92400e",
            bg: "#fffbeb",
            border: "#fde68a",
            dot: "#f59e0b",
          },
          inactive: {
            text: "#475569",
            bg: "#f1f5f9",
            border: "#e2e8f0",
            dot: "#94a3b8",
          },
          error: {
            text: "#991b1b",
            bg: "#fef2f2",
            border: "#fecaca",
            dot: "#ef4444",
          },
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: {
        sm: "0.125rem",
        DEFAULT: "0.25rem",
        md: "0.375rem", // 6px - inputs, buttons
        lg: "0.5rem", // 8px - cards, widgets
        xl: "0.75rem", // 12px - modals, global panels
        full: "9999px",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.03)",
        popover: "0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)",
        modal: "0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
