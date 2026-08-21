// Build-time head hygiene for the prerendered static pages (#254).
//
// The SPA fallback (app.html) carries a site-wide default <title> + description/OG block so
// that the landing page — served raw to crawlers and unfurl bots, which do not run JS — has
// correct metadata. Prerendered content pages (/rules, /ru/rules) set their own head via
// <svelte:head>, which app.html would APPEND the defaults to: two <title>/og:title sets in
// one head, and unfurl bots take the first one — the wrong one. This hook strips the default
// block from prerendered pages that own their head.
//
// This file only ever runs at build time (adapter-static, ssr=false everywhere except the
// prerendered routes) — there is no server at runtime.

import type { Handle } from '@sveltejs/kit';

/** Routes that render a complete head of their own and must not inherit app.html defaults. */
const OWNS_OWN_HEAD = new Set(['/rules', '/ru/rules']);

const DEFAULT_HEAD_BLOCK = /[\t ]*<!-- default-head -->[\s\S]*?<!-- \/default-head -->\n?/;

export function stripDefaultHead(html: string): string {
	return html.replace(DEFAULT_HEAD_BLOCK, '');
}

export const handle: Handle = async ({ event, resolve }) => {
	const ownsHead = event.route.id !== null && OWNS_OWN_HEAD.has(event.route.id);
	return resolve(event, {
		transformPageChunk: ({ html }) => (ownsHead ? stripDefaultHead(html) : html),
	});
};
