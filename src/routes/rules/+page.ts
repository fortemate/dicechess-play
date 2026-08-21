// Prerendered static content page (#254): crawlers and unfurl bots do not run JS, so the
// rules must exist as real HTML. Page-level ssr=true overrides the root layout's SPA-wide
// ssr=false; the page still hydrates and gets the normal nav/theme chrome. Keep this page
// (and everything the root layout touches at init) SSR-safe.
export const prerender = true;
export const ssr = true;
