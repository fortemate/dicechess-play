<!--
	Stand-in for the board's heavy children while `page.test.ts` exercises the page's own logic
	(#216). Named `*.test.svelte` so it reads as test scaffolding rather than shipped UI.

	Renders nothing and declares no props on purpose: Svelte ignores props a component never reads,
	so one stub stands in for every child regardless of its signature, and the suite asserts on the
	page's own actions rather than on anything here.
-->
