/**
 * Fail CI when the installed browser engine and play-api's pinned rules have different majors or
 * minors. Read the public server build pin so this check also works before a server deployment.
 * Runtime independently checks /health to handle deploy order and long-lived clients.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Require an exact installed pin and stable rules versions with matching major/minor components. */
export function verifyRulesVersion(engineVersion, dependencyPin, serverBuild) {
	if (engineVersion !== dependencyPin) {
		throw new Error(
			`Engine must be exactly pinned: installed ${engineVersion}, pin ${dependencyPin}`,
		);
	}
	const serverVersion = serverBuild.match(/^val\s+DiceChessRulesVersion\s*=\s*"([^"]+)"/m)?.[1];
	const minor = (version) => /^(\d+\.\d+)\.\d+$/.exec(version ?? '')?.[1];
	if (!minor(engineVersion) || !minor(serverVersion)) {
		throw new Error('Could not read stable engine and play-api rules versions');
	}
	if (minor(engineVersion) !== minor(serverVersion)) {
		throw new Error(`Rules mismatch: bundled engine ${engineVersion}, play-api ${serverVersion}`);
	}
	return `Rules versions aligned: bundled engine ${engineVersion}, play-api ${serverVersion}`;
}

/** Read the live public pin, retrying transport/body failures, 429 and 5xx at most twice. */
export async function fetchServerBuild(
	fetchImpl = fetch,
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
	for (let attempt = 0; ; attempt++) {
		let response;
		try {
			response = await fetchImpl(
				'https://raw.githubusercontent.com/fortemate/dicechess-play-api/main/build.sbt',
				{ signal: AbortSignal.timeout(15_000) },
			);
			if (response.ok) return await response.text();
		} catch (error) {
			if (attempt === 2) throw error;
			await sleep(1000 * 2 ** attempt);
			continue;
		}
		const retryable = response.status === 429 || (response.status >= 500 && response.status < 600);
		if (!retryable || attempt === 2) {
			throw new Error(`Could not read play-api rules pin: HTTP ${response.status}`);
		}
		await sleep(1000 * 2 ** attempt);
	}
}

/** Compare the actual installed browser artifact to the current public play-api build pin. */
async function main() {
	const root = new URL('../', import.meta.url);
	const [engine, site, serverBuild] = await Promise.all([
		readFile(new URL('node_modules/@fortemate/dicechess-engine/package.json', root), 'utf8'),
		readFile(new URL('package.json', root), 'utf8'),
		fetchServerBuild(),
	]);
	console.log(
		verifyRulesVersion(
			JSON.parse(engine).version,
			JSON.parse(site).dependencies['@fortemate/dicechess-engine'],
			serverBuild,
		),
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
