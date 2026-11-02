import type { Handle } from '@sveltejs/kit/hooks';

// Build-time head hygiene for the prerendered static pages (#254).
//
// The SPA fallback (app.html) carries a site-wide default <title> + description/OG block so
// that the landing page — served raw to crawlers and unfurl bots, which do not run JS — has
// correct metadata. Prerendered content pages (/rules) set their own head via <svelte:head>,
// which app.html would APPEND the defaults to: two <title>/og:title sets in one head, and
// unfurl bots take the first one — the wrong one. This hook strips the default block from
// prerendered pages that own their head.
//
// This file only ever runs at build time (adapter-static, ssr=false everywhere except the
// prerendered routes) — there is no server at runtime.
/** Routes that render a complete head of their own and must not inherit app.html defaults. */
const OWNS_OWN_HEAD = new Set(['/rules', '/licenses']);

const START_TAG = '<!-- default-head -->';
const END_TAG = '<!-- /default-head -->';

export function stripDefaultHead(html: string): string {
	const start = html.indexOf(START_TAG);
	if (start === -1) return html;
	const end = html.indexOf(END_TAG, start + START_TAG.length);
	if (end === -1) return html;
	let lineStart = start;
	while (lineStart > 0 && (html[lineStart - 1] === ' ' || html[lineStart - 1] === '\t')) {
		lineStart--;
	}
	let afterEnd = end + END_TAG.length;
	if (html[afterEnd] === '\r') afterEnd++;
	if (html[afterEnd] === '\n') afterEnd++;
	return html.slice(0, lineStart) + html.slice(afterEnd);
}

export const handle: Handle = ({ event, resolve }) => {
	const ownsHead = event.route.id !== null && OWNS_OWN_HEAD.has(event.route.id);
	return resolve(event, {
		transformPageChunk: ({ html }) => (ownsHead ? stripDefaultHead(html) : html),
	});
};
