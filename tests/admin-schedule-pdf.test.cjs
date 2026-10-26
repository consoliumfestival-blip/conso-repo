/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/services/schedulePdfService.ts'), 'utf8');

class MockPdf {
  constructor() {
    this.internal = { pageSize: { getWidth: () => 297, getHeight: () => 210 } };
    this.saved = null;
  }
  setFillColor() {}
  rect() {}
  setFont() {}
  setFontSize() {}
  setTextColor() {}
  splitTextToSize(value) { return [value]; }
  text() {}
  setDrawColor() {}
  line() {}
  save(filename) { this.saved = filename; }
}

test('default All item filter downloads all three admin schedule PDFs', async () => {
  const docs = [];
  const tables = [];
  const moduleObject = { exports: {} };
  const requireStub = (name) => {
    if (name === 'jspdf') return { jsPDF: class extends MockPdf { constructor(...args) { super(...args); docs.push(this); } } };
    if (name === 'jspdf-autotable') return (_doc, table) => tables.push(table);
    return {};
  };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', compiled)(requireStub, moduleObject, moduleObject.exports);

  const schedule = {
    id: 'schedule-1', item_id: 'item-1', start_time: '2026-10-26T09:00:00Z',
    items: { item_code: 'ITEM-1', item_name_en: 'Sample', category_codes: ['LP'] },
    venues: { name: 'Stage A' },
  };
  for (const [mode, suffix] of [['master', 'master'], ['venue', 'venue-wise'], ['organisation', 'organisation-wise']]) {
    const result = await moduleObject.exports.downloadAdminSchedulePdf({
      mode,
      itemId: 'All',
      itemCategory: 'All',
      schedules: [schedule],
    });
    assert.equal(result.scheduleCount, 1, `${mode} should include schedules when Item is All`);
    assert.equal(docs.at(-1).saved, `festival-schedule-${suffix}.pdf`);
  }
  assert.equal(tables.length, 3);
});
