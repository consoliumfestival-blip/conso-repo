const fs = require('node:fs');
const catalogPath = process.argv.find(x => x.startsWith('--catalog='))?.slice(10);
const output = process.argv.find(x => x.startsWith('--out='))?.slice(6);
if (!catalogPath) throw new Error('Usage: --catalog=<read-only-catalog-json> [--out=<summary-json>]');
const data = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const result = { observed_at: data.observed_at, parity: true, categories: {} };
const identity = x => [x.schema || '', x.table_name || '', x.publication || '',
  x.name || '', x.arguments || '', x.grantee || '', x.privilege || '',
  x.object_type || '', x.object_type ? x.owner : ''].join('|');
// Object OIDs are database-local. Existing column ordinal positions need not match
// after an additive migration; names, types, defaults and nullability must match.
const normalize = row => Object.fromEntries(Object.entries(row)
  .filter(([key]) => !['oid', 'position'].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
for (const kind of Object.keys(data.source)) {
  if (!Array.isArray(data.target[kind])) throw new Error(`Missing target category: ${kind}`);
  const source = new Map(data.source[kind].map(row => [identity(row), normalize(row)]));
  const target = new Map(data.target[kind].map(row => [identity(row), normalize(row)]));
  if (source.size !== data.source[kind].length || target.size !== data.target[kind].length) {
    throw new Error(`Non-unique comparison identity: ${kind}`);
  }
  const missing = [...source.keys()].filter(key => !target.has(key));
  const extra = [...target.keys()].filter(key => !source.has(key));
  const changed = [...source.keys()].filter(key => target.has(key)
    && JSON.stringify(source.get(key)) !== JSON.stringify(target.get(key)));
  result.categories[kind] = { source: source.size, target: target.size, missing, extra, changed };
  if (missing.length || extra.length || changed.length) result.parity = false;
  console.log(JSON.stringify({ kind, source: source.size, target: target.size,
    missing: missing.length, extra: extra.length, changed: changed.length }));
}
if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(`Application catalog parity: ${result.parity ? 'PASS' : 'FAIL'}. Runtime behavior and managed services require separate validation.`);
process.exitCode = result.parity ? 0 : 1;
