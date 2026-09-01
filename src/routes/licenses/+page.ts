// Prerendered static content page (#14): crawlers, archive tools, and unfurl bots
// do not run JS, so the license disclosures must exist as real HTML. Page-level
// ssr=true overrides the root layout's SPA-wide ssr=false; the page still hydrates
// and gets the normal nav/theme chrome. Keep this page SSR-safe.
export const prerender = true;
export const ssr = true;
