const { utilityColors, semantic: core, scoped } = require('./scripts/core-theme-colors.cjs');
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      animation: {
        marquee: 'marquee 25s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        }
      },
      fontFamily: {
        "barabara": ["Barabara", "sans-serif"],
        "headline-lg": ["Plus Jakarta Sans"],
        "display-xl": ["Plus Jakarta Sans"],
        "headline-lg-mobile": ["Plus Jakarta Sans"],
        "body-lg": ["Manrope"],
        "body-md": ["Manrope"],
        "display-xl-mobile": ["Plus Jakarta Sans"],
        "title-md": ["Plus Jakarta Sans"],
        "label-sm": ["Space Grotesk"]
      },
      fontSize: {
        "headline-lg": ["40px", { "lineHeight": "1.2", "fontWeight": "700" }],
        "display-xl": ["80px", { "lineHeight": "1.1", "letterSpacing": "-0.04em", "fontWeight": "800" }],
        "headline-lg-mobile": ["32px", { "lineHeight": "1.2", "fontWeight": "700" }],
        "body-lg": ["18px", { "lineHeight": "1.6", "fontWeight": "400" }],
        "body-md": ["16px", { "lineHeight": "1.6", "fontWeight": "400" }],
        "display-xl-mobile": ["48px", { "lineHeight": "1.1", "letterSpacing": "-0.02em", "fontWeight": "800" }],
        "title-md": ["20px", { "lineHeight": "1.4", "fontWeight": "600" }],
        "label-sm": ["12px", { "lineHeight": "1", "letterSpacing": "0.1em", "fontWeight": "600" }]
      },

      spacing: {
        'unit': '4px',
        'gutter': '24px',
        'margin-mobile': '16px',
        'margin-desktop': '64px',
        'container-max': '1280px',
        'section-gap': '64px'
      },

      aspectRatio: {
        auto: 'auto',
        square: '1 / 1',
        video: '16 / 9',
      },
      colors: {
        core: utilityColors,
        'alviora-bg': '#011635',
        'alviora-surface': 'rgba(255, 255, 255, 0.05)',
        'alviora-primary': '#3b82f6',
        'alviora-heading': '#ffffff',
        'alviora-body': '#cbd5e1',
        'alviora-border': 'rgba(255, 255, 255, 0.1)',
        'alviora-accent': '#60a5fa',
        'alviora-accent-dim': '#93c5fd',
        'error-container': '#fee2e2',
        'on-error-container': '#991b1b',

        border: scoped('border', '#e4e4e7'),
        input: scoped('border', '#e4e4e7'),
        ring: scoped('primary', '#a1a1aa'),
        background: scoped('surface', '#ffffff'),
        foreground: scoped('text', '#09090b'),
        primary: {
          DEFAULT: scoped('primary', '#18181b'),
          foreground: scoped('onPrimary', '#fafafa'),
        },
        secondary: {
          DEFAULT: scoped('surfaceMuted', '#f4f4f5'),
          foreground: scoped('text', '#18181b'),
        },
        destructive: {
          DEFAULT: scoped('dangerAction', '#e60000'),
          foreground: scoped('onPrimary', '#f8fafc'),
        },
        muted: {
          DEFAULT: scoped('surfaceMuted', '#f4f4f5'),
          foreground: scoped('textMuted', '#71717a'),
        },
        accent: {
          DEFAULT: scoped('primarySoft', '#f4f4f5'),
          foreground: scoped('text', '#18181b'),
        },
        popover: {
          DEFAULT: scoped('surface', '#ffffff'),
          foreground: scoped('text', '#09090b'),
        },
        card: {
          DEFAULT: scoped('surface', '#ffffff'),
          foreground: scoped('text', '#09090b'),
        },
        sidebar: {
          DEFAULT: "#fafafa",
          foreground: "#09090b",
          primary: "#18181b",
          "primary-foreground": "#fafafa",
          accent: "#f4f4f5",
          "accent-foreground": "#18181b",
          border: "#e4e4e7",
          ring: "#a1a1aa",
        },
        chart: {
          1: "#5eead4",
          2: "#06b6d4",
          3: "#0891b2",
          4: "#0e7490",
          5: "#164e63",
        },
        ui: {
          bg: core.background,
          surface: core.surface,
          muted: core.surfaceMuted,
          border: core.border,
          text: core.text,
          'text-muted': core.textMuted,
          primary: core.primary,
          'primary-text': core.primaryText,
          'on-primary': core.onPrimary,
          'primary-soft': core.primarySoft,
        },
        ssf: {
          primary: core.primary,
          gold: scoped('warning', '#C89116'),
          bg: core.background,
          surface: core.surface,
          text: scoped('text', '#0F172A'),
          "text-muted": core.textMuted,
        },
      },
      fontFamily: {
        poppins: ["Poppins_400Regular"],
        "poppins-bold": ["Poppins_700Bold"],
        "poppins-black": ["Poppins_900Black"],
        cooper: ["CooperBlack"],
        sans: ["Inter Variable", "Inter", "sans-serif"],
      },
      borderRadius: {
        lg: "0.45rem",
        md: "calc(0.45rem - 2px)",
        sm: "calc(0.45rem - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
}

