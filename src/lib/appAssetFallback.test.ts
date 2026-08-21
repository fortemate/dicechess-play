import { describe, expect, it } from 'vitest';

import { honestAppAssetResponse } from './appAssetFallback';

describe('honestAppAssetResponse', () => {
	it('passes a real asset through unchanged', async () => {
		const real = new Response('console.log(1)', {
			status: 200,
			headers: { 'content-type': 'application/javascript', 'cache-control': 'immutable' },
		});

		const result = honestAppAssetResponse(real);

		expect(result).toBe(real);
	});

	it('turns the SPA fallback (text/html) into an honest 404', async () => {
		const fallback = new Response('<!doctype html>...', {
			status: 200,
			headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'immutable' },
		});

		const result = honestAppAssetResponse(fallback);

		expect(result.status).toBe(404);
		expect(result.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		await expect(result.text()).resolves.toBe('Not found');
	});

	it('matches text/html regardless of charset suffix', () => {
		const fallback = new Response('', { headers: { 'content-type': 'text/html' } });

		expect(honestAppAssetResponse(fallback).status).toBe(404);
	});

	it.each(['application/wasm', 'text/css', 'application/json', 'audio/mpeg'])(
		'leaves a %s asset untouched',
		(contentType) => {
			const real = new Response('', { status: 200, headers: { 'content-type': contentType } });

			expect(honestAppAssetResponse(real)).toBe(real);
		},
	);

	it('passes a response through when it carries no content-type at all', () => {
		const noType = new Response('', { status: 200 });

		expect(honestAppAssetResponse(noType)).toBe(noType);
	});

	it('preserves a genuine non-200 HTML error instead of relabeling it as 404', () => {
		const serverError = new Response('<!doctype html><h1>500</h1>', {
			status: 500,
			headers: { 'content-type': 'text/html; charset=utf-8' },
		});

		const result = honestAppAssetResponse(serverError);

		expect(result).toBe(serverError);
		expect(result.status).toBe(500);
	});
});
