import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { refuseOutsideDev } from './devOnly';

// The primitives preview is a development tool (#252). What matters outside the dev server is
// that the route does not exist for a visitor: its `load` refuses it through this guard, and
// the sitemap does not list it.
describe('/ui-preview', () => {
	it('loads in the dev server', () => {
		expect(() => refuseOutsideDev(true)).not.toThrow();
	});

	it('is "not found" in a production build', () => {
		expect(() => refuseOutsideDev(false)).toThrow(expect.objectContaining({ status: 404 }));
	});

	it('passes the flag of the build to the guard', () => {
		const route = readFileSync('src/routes/ui-preview/+page.ts', 'utf-8');
		expect(route).toContain("import { dev } from '$app/env';");
		expect(route).toContain('refuseOutsideDev(dev);');
	});

	it('is not listed in the sitemap', () => {
		expect(readFileSync('static/sitemap.xml', 'utf-8')).not.toContain('ui-preview');
	});
});
