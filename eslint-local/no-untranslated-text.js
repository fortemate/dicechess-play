/**
 * Fails on user-facing text that is hardcoded in a Svelte template instead of coming from the
 * i18n catalog (epic #8). See CONTRIBUTING.md, "Internationalisation (i18n)".
 *
 * WHY A LOCAL RULE. `eslint-plugin-i18next`'s `no-literal-string` cannot do this job on Svelte:
 * it visits JS `Literal` and JSX text, while Svelte template copy parses to `SvelteText` and
 * `SvelteLiteral` nodes that it never reaches. Tested at `mode: 'all'` against a fixture with an
 * aria-label, an h1, a p, a title and an alt — it missed all five and false-positived on a
 * console.log. That is structural, not a bug, so there is nothing to configure. inlang's own lint
 * rules operate on catalog contents, not on source, and its extraction is a VS Code affordance,
 * not a CI gate.
 *
 * SUPPRESSION DIRECTION. The rule is on repo-wide and each not-yet-migrated file carries its own
 * `eslint-disable` comment, deleted when the file is migrated. The inverse — an allowlist of
 * migrated files — would leave every brand-new component unguarded, which is the regression this
 * rule exists to prevent. Paired with `reportUnusedDisableDirectives: 'error'` in the flat config,
 * a suppression cannot outlive its file's migration, so the debt list can only shrink.
 *
 * SCOPE. Script-level literals are deliberately out of scope: this rule only ever visits template
 * nodes, which is why it is quiet where the i18next plugin was noisy. Strings authored in `.ts`
 * (toast text, label maps) are a separate migration and a separate problem.
 */

/**
 * Attributes whose value is read out to a user — by a screen reader, as a tooltip, or in place of
 * a missing image. Everything else (class, src, href, data-*, event handlers) is machinery.
 */
const USER_FACING_ATTRS = new Set([
	'alt',
	'aria-description',
	'aria-label',
	'aria-placeholder',
	'aria-roledescription',
	'aria-valuetext',
	'placeholder',
	'title',
]);

/**
 * Text directly inside these is a literal identifier, not prose: an env-var name in `<code>`, a
 * shell snippet in `<pre>`. Translating it would be wrong, so flagging it is only noise.
 */
const DEFAULT_IGNORED_ELEMENTS = ['code', 'pre', 'script', 'style'];

/** Two consecutive letters. Filters whitespace, punctuation, digits, and single-letter labels
 * ("3W", "·", "%") — none of which a translator would touch. */
const HAS_WORD = /\p{L}\p{L}/u;

/** @param {string} raw */
const preview = (raw) => JSON.stringify(raw.trim().slice(0, 40));

/**
 * Element-ish parents. `<style>` and `<script>` get their OWN node types rather than the plain
 * `SvelteElement` — miss them and every stylesheet in the repo is reported as untranslated prose,
 * because CSS rule bodies parse to `SvelteText` like any other template text.
 */
const ELEMENT_NODE_TYPES = new Set(['SvelteElement', 'SvelteStyleElement', 'SvelteScriptElement']);

/** Name of the element a node sits directly inside, or null for components and fragments. */
const parentElementName = (node) => {
	const el = node.parent;
	if (!el || !ELEMENT_NODE_TYPES.has(el.type)) return null;
	const name = el.name;
	return typeof name?.name === 'string' ? name.name.toLowerCase() : null;
};

/** @type {import('eslint').Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Require user-facing text in Svelte templates to come from the i18n catalog rather than being hardcoded',
		},
		schema: [
			{
				type: 'object',
				properties: {
					/** Regex source. Trimmed text matching it is not copy (licence ids, brand names). */
					allowPattern: { type: 'string' },
					/** Element names whose direct text is never copy. Replaces the default list. */
					ignoreElements: { type: 'array', items: { type: 'string' } },
					/** User-facing attributes to stop checking, e.g. while migrating in stages. */
					ignoreAttributes: { type: 'array', items: { type: 'string' } },
				},
				additionalProperties: false,
			},
		],
		messages: {
			text: 'Untranslated user-facing text: {{ text }}. Move it to a messages/*.en.json catalog and render it with m.some_key() — see CONTRIBUTING.md, "Internationalisation (i18n)".',
			attr: 'Untranslated {{ name }} attribute: {{ text }}. Use {{ name }}={m.some_key()} — see CONTRIBUTING.md, "Internationalisation (i18n)".',
		},
	},

	create(context) {
		const { allowPattern, ignoreElements, ignoreAttributes = [] } = context.options[0] ?? {};

		const allow = allowPattern ? new RegExp(allowPattern, 'u') : null;
		const ignoredElements = new Set(ignoreElements ?? DEFAULT_IGNORED_ELEMENTS);
		const ignoredAttributes = new Set(ignoreAttributes);

		/** @param {string} raw */
		const isCopy = (raw) => {
			const trimmed = raw.trim();
			return HAS_WORD.test(trimmed) && !allow?.test(trimmed);
		};

		return {
			SvelteText(node) {
				if (!isCopy(node.value)) return;

				const parent = parentElementName(node);
				if (parent !== null && ignoredElements.has(parent)) return;

				context.report({ node, messageId: 'text', data: { text: preview(node.value) } });
			},

			SvelteAttribute(node) {
				const name = node.key?.name;
				if (typeof name !== 'string') return;
				if (!USER_FACING_ATTRS.has(name) || ignoredAttributes.has(name)) return;

				// An attribute value is a list of parts: alt="Board" is one SvelteLiteral, while
				// aria-label="You have {n} moves" mixes literals with SvelteMustacheTag. Checking only
				// the single-part case would wave the mixed form through — and interpolated copy is
				// exactly the kind that most needs a catalog key, since a translation has to be free to
				// move the placeholder. Report the attribute once if ANY literal part is copy;
				// alt={m.key()} has no literal parts and stays silent.
				const literals = (node.value ?? []).filter((part) => part.type === 'SvelteLiteral');
				const offending = literals.find((part) => isCopy(part.value));
				if (!offending) return;

				context.report({
					node,
					messageId: 'attr',
					data: { name, text: preview(offending.value) },
				});
			},
		};
	},
};
