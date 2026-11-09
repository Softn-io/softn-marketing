/** localStorage key holding the user's explicit theme choice. Absent means "follow the system". */
export const THEME_STORAGE_KEY = 'softn-theme'

export type Theme = 'dark' | 'light'

/**
 * Inline script run before first paint. Applies the stored explicit choice to
 * `<html data-theme>`; does nothing when no valid choice is stored.
 *
 * The nonce policy of the dynamic routes allows this exact content by hash, built from this
 * constant with `cspHashSourceOf` in `proxy.ts`: the shared layout renders the script inline and
 * cannot carry a nonce.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`
