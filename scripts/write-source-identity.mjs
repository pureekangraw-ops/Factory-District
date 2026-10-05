import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const sha = process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA
  || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('SOURCE_SHA_INVALID');
writeFileSync(process.argv[2] || new URL('../src/build-source-identity.mjs', import.meta.url), `export const BUILD_SOURCE_SHA = '${sha}';\n`);
