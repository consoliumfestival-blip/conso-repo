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
    await db.exec(read('supabase/migrations/20261127194500_smart_announcer_full_pool_suspense.sql'));
    await db.exec(read('supabase/migrations/20261128033612_smart_announcer_50_result_horizon.sql'));
    await db.exec(read('supabase/migrations/20261128034151_smart_announcer_70_result_horizon.sql'));
    await db.exec(read('supabase/migrations/20261128035932_announcer_queue_when_leaderboard_limit_reached.sql'));
    await db.exec(read('supabase/migrations/20261128040640_smart_announcer_bounded_runtime.sql'));
    await db.exec(read('supabase/migrations/20261128040757_smart_announcer_bulk_all_mode_deltas.sql'));
    await db.exec(read('supabase/migrations/20261128040926_smart_announcer_shortlist_expansion.sql'));
    await db.exec(read('supabase/migrations/20261128151500_smart_announcer_top3_spread.sql'));
    await db.exec(read('supabase/migrations/20261128160000_smart_announcer_team_first_beam_and_shortlist.sql'));
    await db.exec(read('supabase/migrations/20261128163000_smart_announcer_team_first_auto_horizon.sql'));
    const strategyFixture = read('tests/smart-announcer-strategy.sql');
    const firstTest = strategyFixture.indexOf('DO $test$');
    await db.exec(strategyFixture.slice(0, firstTest));
    await db.exec(strategyFixture.slice(firstTest));
    await db.exec(read('tests/smart-announcer-dynamic-order.sql'));
    await db.exec(read('tests/smart-announcer-full-pool.sql'));
    console.log('Smart Announcer dynamic ordering database checks passed.');
  } finally {
    await db.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
