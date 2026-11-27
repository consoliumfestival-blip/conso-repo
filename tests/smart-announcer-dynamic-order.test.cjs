const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(read('tests/smart-announcer-strategy-schema.sql'));
    await db.exec(read('supabase/migrations/20261125141807_announcer_sequential_team_strategy.sql'));
    await db.exec(read('supabase/migrations/20261127101423_smart_announcer_dynamic_order.sql'));
    const strategyFixture = read('tests/smart-announcer-strategy.sql');
    const firstTest = strategyFixture.indexOf('DO $test$');
    await db.exec(strategyFixture.slice(0, firstTest));
    await db.exec(strategyFixture.slice(firstTest));
    await db.exec(read('tests/smart-announcer-dynamic-order.sql'));
    console.log('Smart Announcer dynamic ordering database checks passed.');
  } finally {
    await db.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
