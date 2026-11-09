import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJudgeEvaluationSheetPrintDocument } from '../src/core/utils/judgeEvaluationSheetPrint.ts';

function makeDocument(rowCount, overrides = {}) {
  return buildJudgeEvaluationSheetPrintDocument({
    judgeName: 'Judge One',
    eventName: 'Test Event',
    category: 'General',
    accessCode: 'A1B2C3',
    logoUrl: 'https://example.test/logo.png',
    qrSvg: '<svg><path fill="#000080" /></svg>',
    rows: Array.from({ length: rowCount }, (_, index) => ({
      serialNumber: index + 1,
      codeLetter: index < 26 ? String.fromCharCode(65 + index) : `A${index - 25}`,
    })),
    ...overrides,
  });
}

for (const rowCount of [5, 18, 22]) {
  test(`renders exactly ${rowCount} registration-driven evaluation rows`, () => {
    const html = makeDocument(rowCount);
    assert.equal((html.match(/class="serial"/g) ?? []).length, rowCount);
    assert.equal((html.match(/class="code"/g) ?? []).length, rowCount);
  });
}

test('repeats table headings on printed pages and keeps handwriting columns', () => {
  const html = makeDocument(22);
  assert.match(html, /thead\s*\{\s*display:\s*table-header-group/);
  assert.match(html, /col\.marks-col\s*\{\s*width:\s*24%/);
  assert.match(html, /col\.remarks-col\s*\{\s*width:\s*50%/);
  assert.match(html, /<th>Sl No<\/th><th>Code Letter<\/th><th>Marks<\/th><th>Remarks<\/th>/);
  assert.equal((html.match(/<td class="remarks"><\/td>/g) ?? []).length, 22);
});

test('prints text in black while leaving the logo image unfiltered', () => {
  const html = makeDocument(1);
  assert.match(html, /\*\s*\{\s*box-sizing:\s*border-box;\s*color:\s*#000;/);
  assert.match(html, /<img src="https:\/\/example\.test\/logo\.png" alt="Consolium logo" \/>/);
  assert.doesNotMatch(html, /\.brand img[^}]*filter\s*:/);
  assert.match(html, /<path fill="#000080" \/>/);
});

test('escapes judge, event, and category text before embedding it in the document', () => {
  const html = makeDocument(1, {
    judgeName: '<Judge & Co>',
    eventName: 'A "great" <event>',
    category: 'M & N',
  });
  assert.match(html, /&lt;Judge &amp; Co&gt;/);
  assert.match(html, /A &quot;great&quot; &lt;event&gt;/);
  assert.match(html, /Category: M &amp; N/);
});
