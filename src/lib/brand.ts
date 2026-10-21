/**
 * Single place for the app's brand/icon URLs. Bump ICON_VERSION whenever the icon artwork changes: the
 * query string gives browsers (and Android's installed-app updater) a new URL, so they cannot keep
 * serving the previous image from cache.
 */
export const ICON_VERSION = "2";
const v = (path: string) => `${path}?v=${ICON_VERSION}`;

export const ICONS = {
  favicon16: v("/icons/icon-16x16.png"),
  favicon32: v("/icons/icon-32x32.png"),
  any192: v("/icons/icon-192x192.png"),
  any512: v("/icons/icon-512x512.png"),
  maskable512: v("/icons/icon-maskable-512x512.png"),
  apple180: v("/icons/apple-touch-icon.png"),
} as const;
