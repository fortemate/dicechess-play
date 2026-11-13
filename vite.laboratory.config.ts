/** Separate laboratory artifact and module boundary; the ordinary site's build remains unchanged. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { bootstrapAppearance } from './src/lib/laboratory/appearance';
import { laboratoryOrigin } from './src/lib/laboratory/api';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(repoRoot, 'src');
const outDir = path.join(repoRoot, 'dist-laboratory');
const allowedSourcePaths = new Set([
	'src/lib/live/liveClient.ts',
	'src/lib/live/boardGrid.ts',
	'src/lib/utils/getPieceImage.ts',
]);

function sourcePath(moduleId: string): string | null {
	const id = moduleId.split('?')[0].replaceAll('\\', '/');
	const sourceRootId = sourceRoot.replaceAll('\\', '/') + '/';
	const index = id.lastIndexOf(sourceRootId);
	return index === -1 ? null : `src/${id.slice(index + sourceRootId.length)}`;
}

function isAllowedSource(relativePath: string): boolean {
	return (
		relativePath.startsWith('src/laboratory/') ||
		relativePath.startsWith('src/lib/laboratory/') ||
		relativePath.startsWith('src/lib/paraglide/') ||
		allowedSourcePaths.has(relativePath)
	);
}

function emitStandaloneFiles(): Plugin {
	return {
		name: 'laboratory-standalone-files',
		generateBundle(_options, bundle) {
			const sourceModules = new Set<string>();
			for (const output of Object.values(bundle)) {
				if (output.type !== 'chunk') continue;
				for (const id of Object.keys(output.modules)) {
					const relativePath = sourcePath(id);
					if (!relativePath) continue;
					if (!isAllowedSource(relativePath)) {
						throw new Error(`Laboratory bundle imports disallowed source module: ${relativePath}`);
					}
					sourceModules.add(relativePath);
				}
			}
			if (sourceModules.size === 0 || !sourceModules.has('src/laboratory/main.ts')) {
				throw new Error('Laboratory bundle is missing its own application entry point');
			}
			this.emitFile({
				type: 'asset',
				fileName: 'laboratory-build.json',
				source: JSON.stringify(
					{
						surface: 'laboratory',
						variant: { id: 'choice-2x2d6', revision: 1 },
						protocolVersion: 1,
						modules: [...sourceModules].sort(),
					},
					null,
					2,
				),
			});
			this.emitFile({
				type: 'asset',
				fileName: 'robots.txt',
				source: 'User-agent: *\nDisallow: /\n',
			});
			this.emitFile({
				type: 'asset',
				fileName: '_redirects',
				source: '/* /index.html 200\n',
			});
			this.emitFile({
				type: 'asset',
				fileName: '_headers',
				source:
					'/*\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n',
			});

			const faviconPath = path.join(repoRoot, 'static', 'favicon.svg');
			this.emitFile({ type: 'asset', fileName: 'favicon.svg', source: readFileSync(faviconPath) });
			const pieceDirectory = path.join(repoRoot, 'static', 'pieces', 'cburnett');
			for (const name of readdirSync(pieceDirectory)
				.filter((file) => file.endsWith('.svg'))
				.sort()) {
				this.emitFile({
					type: 'asset',
					fileName: `pieces/cburnett/${name}`,
					source: readFileSync(path.join(pieceDirectory, name)),
				});
			}
		},
	};
}

function appearanceBootstrap(): Plugin {
	return {
		name: 'laboratory-appearance-bootstrap',
		transformIndexHtml: {
			order: 'pre',
			handler() {
				return [
					{
						tag: 'script',
						attrs: { id: 'laboratory-appearance-bootstrap' },
						children: `(${bootstrapAppearance.toString()})()`,
						injectTo: 'head-prepend',
					},
				];
			},
		},
	};
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, repoRoot, 'VITE_LAB_');
	const apiOrigin = laboratoryOrigin(env.VITE_LAB_API_URL ?? '');
	const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
		dependencies: Record<string, string>;
	};
	const rulesVersion = packageJson.dependencies['@fortemate/dicechess-engine'];
	if (!rulesVersion || !/^\d+\.\d+\.\d+$/.test(rulesVersion)) {
		throw new Error('Laboratory build requires an exact Dice Chess engine version');
	}

	return {
		root: path.join(repoRoot, 'laboratory'),
		publicDir: path.join(repoRoot, 'static'),
		envPrefix: 'VITE_LAB_',
		define: {
			__LAB_API_ORIGIN__: JSON.stringify(apiOrigin),
			__LAB_RULES_VERSION__: JSON.stringify(rulesVersion),
		},
		resolve: { alias: { '#lib': path.join(sourceRoot, 'lib') } },
		plugins: [
			paraglideVitePlugin({
				project: path.join(repoRoot, 'project.inlang'),
				outdir: path.join(sourceRoot, 'lib', 'paraglide'),
				strategy: ['preferredLanguage', 'baseLocale'],
			}),
			svelte({ configFile: false, preprocess: vitePreprocess() }),
			appearanceBootstrap(),
			emitStandaloneFiles(),
		],
		server: { host: '127.0.0.1', port: 5174, strictPort: true },
		preview: { host: '127.0.0.1', port: 4175, strictPort: true },
		build: {
			outDir,
			emptyOutDir: true,
			copyPublicDir: false,
			sourcemap: false,
		},
	};
});
