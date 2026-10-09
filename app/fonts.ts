import localFont from "next/font/local";

/**
 * Full license text for both fonts below (SIL Open Font License 1.1) is in `../assets/fonts/OFL.txt`.
 */

/**
 * Self-hosted variable font backing the `--softn-font-body` design token
 * (Plus Jakarta Sans, SIL Open Font License, weight axis 200-800).
 * Exposed as `--font-plus-jakarta-sans` and bound to the `font-body` Tailwind
 * utility in `app/globals.css`, since `@softnio-labs/tokens` only ships the
 * font-family name, not the actual font files.
 */
export const plusJakartaSans = localFont({
  src: [
    { path: "../assets/fonts/PlusJakartaSans-VariableFont_wght.woff2", weight: "200 800", style: "normal" },
    { path: "../assets/fonts/PlusJakartaSans-Italic-VariableFont_wght.woff2", weight: "200 800", style: "italic" },
  ],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

/**
 * Self-hosted variable font backing the `--softn-font-display` design token
 * (Zalando Sans, SIL Open Font License, weight axis 200-900, width axis 75-125).
 * Exposed as `--font-zalando-sans` and bound to the `font-display` Tailwind
 * utility in `app/globals.css`.
 */
export const zalandoSans = localFont({
  src: [
    { path: "../assets/fonts/ZalandoSans-VariableFont_wdth_wght.woff2", weight: "200 900", style: "normal" },
    { path: "../assets/fonts/ZalandoSans-Italic-VariableFont_wdth_wght.woff2", weight: "200 900", style: "italic" },
  ],
  variable: "--font-zalando-sans",
  display: "swap",
});
