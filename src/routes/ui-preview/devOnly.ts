// Guards a route that is a development tool (#252): it exists in the dev server only. In a
// production build the route answers with the site's "not found" page.
//
// Kept apart from `+page.ts` so that it can be tested: the build wraps the `load` of a route
// file for error reporting, and that wrapper does not load outside the framework.
import { error } from '@sveltejs/kit';

export function refuseOutsideDev(dev: boolean): void {
	if (!dev) error(404, 'Not found');
}
