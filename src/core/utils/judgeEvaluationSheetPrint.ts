export type JudgeEvaluationSheetPrintRow = {
  serialNumber: number;
  codeLetter: string;
};

export type JudgeEvaluationSheetPrintInput = {
  eventName: string;
  category: string;
  accessCode: string;
  logoUrl: string;
  qrSvg: string;
  rows: JudgeEvaluationSheetPrintRow[];
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

export function buildJudgeEvaluationSheetPrintDocument(input: JudgeEvaluationSheetPrintInput): string {
  const rows = input.rows.map((row) => `
    <tr>
      <td class="serial">${row.serialNumber}</td>
      <td class="code">${escapeHtml(row.codeLetter)}</td>
      <td class="marks"></td>
      <td class="remarks"></td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Evaluation Sheet - ${escapeHtml(input.eventName)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; color: #000; }
      html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; }
      body { font-size: 10pt; }
      .sheet-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 34mm;
        gap: 5mm;
        align-items: start;
        border-bottom: 2px solid #000080;
        padding-bottom: 3mm;
        margin-bottom: 3mm;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .brand { display: flex; align-items: center; gap: 3mm; margin-bottom: 1mm; }
      .brand img { display: block; width: 10mm; height: 10mm; object-fit: contain; }
      .brand-name { font-size: 17pt; font-weight: 800; letter-spacing: 1pt; }
      .sheet-title { font-size: 10pt; font-weight: 700; letter-spacing: .3pt; margin: 0 0 2mm; }
      .event { border-left: 1mm solid #000080; padding-left: 2.5mm; }
      .event-label { margin-bottom: 1mm; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
      .event-name { margin: 0; font-size: 16pt; line-height: 1.2; overflow-wrap: anywhere; }
      .category { margin: 1mm 0 0; font-size: 10pt; line-height: 1.3; overflow-wrap: anywhere; }
      .access { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 1.5mm; }
      .access-qr { width: 30mm; height: 30mm; display: block; }
      .access-qr svg { display: block; width: 100%; height: 100%; }
      .access-code { font-size: 16pt; font-weight: 800; letter-spacing: 2.5pt; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      col.serial-col { width: 10%; }
      col.code-col { width: 16%; }
      col.marks-col { width: 24%; }
      col.remarks-col { width: 50%; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 1px solid #000080; }
      th { height: 10mm; padding: 2mm; background: #f0f0f0; font-size: 10pt; font-weight: 700; text-align: center; }
      td { height: 9mm; padding: 1mm 2mm; }
      td.serial, td.code { text-align: center; }
      td.code { font-size: 11pt; font-weight: 700; }
      @media screen {
        body { width: 210mm; min-height: 297mm; margin: 16px auto; padding: 10mm; box-shadow: 0 1px 8px #0002; }
      }
    </style>
  </head>
  <body>
    <header class="sheet-header">
      <div>
        <div class="brand">
          <img src="${escapeHtml(input.logoUrl)}" alt="Consolium logo" />
          <div class="brand-name">CONSOULIUM</div>
        </div>
        <h1 class="sheet-title">Official Evaluation Sheet</h1>
        <section class="event">
          <div class="event-label">Event / Item</div>
          <h2 class="event-name">${escapeHtml(input.eventName)}</h2>
          <p class="category">Category: ${escapeHtml(input.category)}</p>
        </section>
      </div>
      <aside class="access" aria-label="Judge access code">
        <div class="access-qr">${input.qrSvg}</div>
        <div class="access-code">${escapeHtml(input.accessCode)}</div>
      </aside>
    </header>
    <table aria-label="Evaluation marks and remarks">
      <colgroup>
        <col class="serial-col" />
        <col class="code-col" />
        <col class="marks-col" />
        <col class="remarks-col" />
      </colgroup>
      <thead><tr><th>Sl No</th><th>Code Letter</th><th>Marks</th><th>Remarks</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;
}
