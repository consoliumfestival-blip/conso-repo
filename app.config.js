const { execFileSync } = require('node:child_process');
const appJson = require('./app.json');

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

const buildCommit = getBuildCommit();
process.env.EXPO_PUBLIC_BUILD_COMMIT = buildCommit;

module.exports = ({ config }) => ({
  ...appJson.expo,
  ...config,
  extra: {
    ...appJson.expo.extra,
    ...config.extra,
    buildCommit,
  },
});
