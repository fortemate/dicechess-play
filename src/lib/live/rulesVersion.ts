/**
 * The exact rules version shipped in this client. The engine dependency is pinned, and CI verifies
 * the installed artifact against that pin and play-api's rules minor. Runtime requires an exact
 * match with /health.rulesVersion; unknown/older servers keep using authoritative turn trees.
 */
import packageJson from '../../../package.json';

export const bundledRulesVersion = packageJson.dependencies['@fortemate/dicechess-engine'];
