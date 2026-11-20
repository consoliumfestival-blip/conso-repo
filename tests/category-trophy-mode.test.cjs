const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('category trophy migration keeps mode off and protects the toggle', () => {
  const sql = read('supabase/migrations/20261120090000_festival_category_trophy_mode.sql');
  assert.match(sql, /category_trophy_enabled boolean not null default false/i);
  assert.match(sql, /super_set_festival_category_trophy_mode/i);
  assert.match(sql, /public\.is_superadmin\(\) is distinct from true/i);
  assert.match(sql, /array_length\(i\.category_codes, 1\).*<> 1/s);
  assert.match(sql, /upper\(btrim\(c\.code\)\).*upper\(btrim\(i\.category_codes\[1\]\)\)/s);
});

test('category standings exclude General and use the public visibility gate', () => {
  const sql = read('supabase/migrations/20261120090000_festival_category_trophy_mode.sql');
  assert.match(sql, /upper\(btrim\(c\.code\)\) not in \('GN', 'GENERAL'\)/i);
  assert.match(sql, /p_public is false or fs\.public_visible is true/i);
  assert.match(sql, /coalesce\(r\.public_visible, false\) is true/i);
  assert.match(sql, /reg\.status is distinct from 'rejected'/i);
});

test('active item category assignments stay valid while the mode is enabled', () => {
  const sql = read('supabase/migrations/20261120090400_category_trophy_item_category_guard.sql');
  assert.match(sql, /before insert or update of festival_id, category_codes, is_active/i);
  assert.match(sql, /exactly one valid category code per active item/i);
});

test('UI only renders category standings through the new service hook', () => {
  const board = read('src/components/leaderboard/CategoryTrophyBoard.tsx');
  const service = read('src/services/categoryTrophyService.ts');
  assert.match(service, /get_public_category_trophy_standings/);
  assert.match(service, /get_admin_category_trophy_standings/);
  assert.match(board, /mode\.data\?\.enabled !== true/);
  assert.match(board, /General is counted only in Overall Champion/);
});
