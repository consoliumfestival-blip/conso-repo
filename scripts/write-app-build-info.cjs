const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

function getBuildCommit() {
  const suppliedCommit = process.env.CF_PAGES_COMMIT_SHA;
  if (suppliedCommit && /^[a-f0-9]{40}$/i.test(suppliedCommit)) return suppliedCommit.toLowerCase();

  try {
    const localCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    return /^[a-f0-9]{40}$/i.test(localCommit) ? localCommit.toLowerCase() : '';
  } catch {
    return '';
  }
}

const outputDirectory = join(process.cwd(), 'dist');
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, 'app-build-info.json'), JSON.stringify({ commit: getBuildCommit() }));
