// Disposable PostgreSQL contract test; never reads local environment or remote credentials.
/* global __dirname */
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const container = `conso-team-program-batch-${Date.now()}`;

function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error((result.stderr || '') + (result.stdout || '').slice(-3000));
  return result.stdout + result.stderr;
}

function read(file) {
  return readFileSync(resolve(__dirname, '..', file), 'utf8');
}

(async () => {
  let created = false;
  try {
    docker(['run', '-d', '--network', 'none', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:15']);
    created = true;
    for (let attempt = 0; ; attempt++) {
      try {
        docker(['exec', container, 'pg_isready', '-U', 'postgres']);
        break;
      } catch (error) {
        if (attempt === 30) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    const sql = [
      read('supabase/tests/team_leader_multi_participant_fixture.sql'),
      read('supabase/migrations/20261023180000_team_leader_multi_participant_assignment.sql'),
      read('supabase/tests/team_leader_multi_participant_transaction.sql'),
    ].join('\n');
    const output = docker(['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], sql);
    const passed = output.split('\n').filter((line) => /PASS:/.test(line));
    if (passed.length < 5) throw new Error(`Expected at least 5 contract assertions; saw ${passed.length}.\n${output}`);
    console.log(passed.join('\n'));
    console.log(`Passed ${passed.length} Team Leader multi-participant PostgreSQL contract assertions.`);
  } finally {
    if (created) docker(['rm', '-f', container]);
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
