// The primitives preview is a development tool (#252): the route exists in the dev server
// only, and it is listed neither in the sitemap nor in any navigation.
import { dev } from '$app/env';
import { refuseOutsideDev } from './devOnly';

export function load() {
	refuseOutsideDev(dev);
}
