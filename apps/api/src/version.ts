import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the build identifier reported by the API.
 *
 * Order: non-empty APP_VERSION env (set by CI: `testing-<sha7>` or plain semver),
 * else `<root package.json version>-dev`, else `unknown-dev`.
 *
 * The root package.json sits three levels above this module both in dev
 * (apps/api/src/version.ts) and in the built layout (apps/api/dist/version.js).
 * The production image does not ship the root package.json, so an unset
 * APP_VERSION there yields `unknown-dev` rather than crashing.
 */
export function resolveAppVersion(
  env: NodeJS.ProcessEnv = process.env,
  moduleUrl: string = import.meta.url
): string {
  const fromEnv = env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;

  try {
    const pkgPath = join(dirname(fileURLToPath(moduleUrl)), '../../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
    if (typeof pkg.version === 'string' && pkg.version) return `${pkg.version}-dev`;
  } catch {
    // fall through
  }
  return 'unknown-dev';
}

export const APP_VERSION = resolveAppVersion();
