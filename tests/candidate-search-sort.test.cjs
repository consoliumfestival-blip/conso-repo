const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSortModule() {
  const filePath = path.join(process.cwd(), 'src/core/utils/candidateSearchSort.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports }, { filename: filePath });
  return mod.exports;
}

const { mergeAndSortDualCandidates, sortCandidatesByRelevance } = loadSortModule();

test('ranks exact chest match first and mixes Consoulium + Campus results seamlessly', () => {
  const merged = mergeAndSortDualCandidates(
    [
      {
        tenantId: '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe',
        festivalName: 'Consoulium',
        items: [
          { slug: 'sub-1', name: 'Ahmed Substring', chest_number: '21300', category_code: 'HS' },
          { slug: 'pre-1', name: 'Bilal Prefix', chest_number: '13001', category_code: 'HS' },
        ],
      },
      {
        tenantId: '73ee92f3-d795-43eb-997e-380e52856424',
        festivalName: 'Campus',
        items: [
          { slug: 'muzammil-1300', name: 'MUHAMMED MUZAMMIL KP', chest_number: '1300', category_code: 'UP' },
        ],
      },
    ],
    '1300',
  );

  assert.deepEqual(
    Array.from(merged, (m) => [m.festivalName, m.candidate.chest_number, m.candidate.slug]),
    [
      ['Campus', '1300', 'muzammil-1300'],
      ['Consoulium', '13001', 'pre-1'],
      ['Consoulium', '21300', 'sub-1'],
    ],
  );
});

test('ranks closer chest prefixes and shorter numbers before longer/substring matches', () => {
  const merged = mergeAndSortDualCandidates(
    [
      {
        tenantId: 't-conso',
        festivalName: 'Consoulium',
        items: [
          { slug: 'c-213', name: 'Sub Match', chest_number: '2130', category_code: null },
          { slug: 'c-1305', name: 'Later Prefix', chest_number: '1305', category_code: null },
        ],
      },
      {
        tenantId: 't-campus',
        festivalName: 'Campus',
        items: [
          { slug: 'p-1301', name: 'Closer Prefix', chest_number: '1301', category_code: null },
          { slug: 'p-13000', name: 'Longer Prefix', chest_number: '13000', category_code: null },
          { slug: 'p-130', name: 'Exact Match', chest_number: '130', category_code: null },
        ],
      },
    ],
    '130',
  );

  assert.deepEqual(
    Array.from(merged, (m) => m.candidate.chest_number),
    ['130', '1301', '1305', '13000', '2130'],
  );
});

test('ranks name matches cleanly across festivals without hiding duplicates across tenants', () => {
  const sorted = mergeAndSortDualCandidates(
    [
      {
        tenantId: 't-conso',
        festivalName: 'Consoulium',
        items: [
          { slug: 'ameen-shared', name: 'Syed Ameen', chest_number: '302', category_code: null },
          { slug: 'ameen-1', name: 'Ameen K', chest_number: '101', category_code: null },
        ],
      },
      {
        tenantId: 't-campus',
        festivalName: 'Campus',
        items: [
          { slug: 'ameen-shared', name: 'Ameen', chest_number: '1405', category_code: null },
        ],
      },
    ],
    'ameen',
  );

  assert.deepEqual(
    Array.from(sorted, (m) => [m.festivalName, m.candidate.name]),
    [
      ['Campus', 'Ameen'],
      ['Consoulium', 'Ameen K'],
      ['Consoulium', 'Syed Ameen'],
    ],
  );

  const scoped = sortCandidatesByRelevance(
    [
      { slug: 'a', name: 'Syed Ali', chest_number: '410', category_code: null },
      { slug: 'b', name: 'Ali Hassan', chest_number: '110', category_code: null },
    ],
    'ali',
  );
  assert.deepEqual(Array.from(scoped, (s) => s.slug), ['b', 'a']);
});
