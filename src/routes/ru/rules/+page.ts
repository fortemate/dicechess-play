// Prerendered static content page (#254) — see src/routes/rules/+page.ts. Two routes instead
// of an i18n framework is deliberate: the framework is a separate later task and must not
// block the rules content.
export const prerender = true;
export const ssr = true;
