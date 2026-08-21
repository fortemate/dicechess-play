// Classic Cloudflare Pages has no top-level 404.html, so any request that matches no real
// file — including a hashed /_app/ asset a later deploy has already deleted — falls back to
// index.html with a 200 (verified against `wrangler pages dev` and production, #220/#223).
// That 200-plus-HTML pairing is the fallback's specific signature: nothing under /_app/ is
// ever legitimately HTML (js/css/json/wasm only), so it always IS the fallback, never the
// asset the client actually asked for. A non-200 HTML response is a different thing — a
// genuine error page — and must be reported as itself rather than relabeled as "not found".
//
// Answering with an honest 404 instead matters twice over: workbox's precache install
// rejects any non-200 response, so a poisoned install becomes impossible (the #223
// incident this fixed at the root); and the vanished asset's URL stops being cacheable as
// if it were real content — today it inherits static/_headers' `immutable, max-age=1y` by
// PATH rather than by content, so the wrong body can otherwise stick for a year.
export function honestAppAssetResponse(response: Response): Response {
	const contentType = response.headers.get('content-type') ?? '';
	if (response.status !== 200 || !contentType.includes('text/html')) return response;
	return new Response('Not found', {
		status: 404,
		headers: { 'content-type': 'text/plain; charset=utf-8' },
	});
}
