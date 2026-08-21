// SEO origins for the prerendered static content pages (#254).
//
// Absolute URLs are unavoidable here: rel=canonical, hreflang alternates, og:url and og:image
// must be absolute, and the pages are prerendered so nothing can be derived from the request.
//
// Two constants on purpose, even while their values match:
// - SITE_ORIGIN — where the site answers today. og:url/og:image use it so a shared link's
//   unfurl card points somewhere that resolves. static/sitemap.xml and app.html's default-head
//   block hardcode the same origin; change them together.
// - CANONICAL_ORIGIN — what rel=canonical/hreflang point at. The brand runbook (vault) wants
//   the rules pages' canonicals moved to the future brand domain; flip this one constant once
//   that domain actually serves the site (a canonical pointing at a host that does not resolve
//   is ignored by crawlers at best).
export const SITE_ORIGIN = 'https://fortemate.com';
export const CANONICAL_ORIGIN = 'https://fortemate.com';
