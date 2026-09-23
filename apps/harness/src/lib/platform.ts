/** Running inside the Tauri shell (native dialogs available). */
export const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** macOS desktop shell: overlay title bar + vibrancy window (see tauri.conf.json). */
export const IS_MAC_TAURI = IS_TAURI && /Mac/i.test(navigator.userAgent);
