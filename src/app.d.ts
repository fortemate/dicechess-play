/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/svelte" />

// See https://svelte.dev/docs/kit/types#app.d.ts for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		// Set by the root layout once the module graph made it; read by app.html's inline
		// boot watchdog (#223) so a booted app never triggers the self-heal reload.
		__dcBooted?: boolean;
	}
}

export {};
