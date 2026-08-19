/**
 * Helper for building correct asset URLs when the app is hosted under a
 * base path (e.g. GitHub Pages project sites served at /repo-name/).
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

/** Prefix an absolute asset path with the deploy base path. */
export function assetPath(path: string): string {
  if (!path.startsWith('/')) path = `/${path}`
  return `${BASE_PATH}${path}`
}