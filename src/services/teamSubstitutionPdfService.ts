import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { AdminSubstitutionRequest } from '@/services/teamSubstitutionService';

function escapeHtml(value: string | null | undefined) {
  return (value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function buildHtml(requests: AdminSubstitutionRequest[]) {
  const rows = requests.map((request) => `
    <article class="request">
      <div class="heading"><strong>${escapeHtml(request.item_name)}</strong><span>${escapeHtml(request.item_code)}</span></div>
      <div class="team">${escapeHtml(request.team_name)}</div>
      <div class="change">
        <div><small>Replace</small><strong>${escapeHtml(request.old_participant_name)}</strong><span>Chest ${escapeHtml(request.old_chest_number || '—')}</span></div>
        <div class="arrow">→</div>
        <div><small>With</small><strong>${escapeHtml(request.new_participant_name)}</strong><span>Chest ${escapeHtml(request.new_chest_number || '—')}</span></div>
      </div>
      <div class="reason"><small>Team Leader reason</small><p dir="auto">${escapeHtml(request.reason)}</p></div>
      <div class="date">Requested ${escapeHtml(formatDate(request.requested_at))}</div>
    </article>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pending program substitutions</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { color: #18212b; font: 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
    h1 { font-size: 19px; margin: 0 0 4px; }
    .subtitle { color: #586779; margin: 0 0 16px; }
    .request { border: 1px solid #aab4be; padding: 10px 12px; margin: 0 0 10px; break-inside: avoid; }
    .heading, .change, .date { display: flex; justify-content: space-between; gap: 10px; }
    .heading strong { font-size: 14px; }
    .heading span, .team, .date, .change span { color: #526171; }
    .team { margin-top: 2px; }
    .change { justify-content: flex-start; align-items: center; margin-top: 10px; }
    .change > div:not(.arrow) { min-width: 42%; display: grid; gap: 1px; }
    .change small, .reason small { color: #526171; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    .arrow { font-size: 17px; }
    .reason { border-top: 1px solid #d6dce2; margin-top: 9px; padding-top: 7px; }
    .reason p { white-space: pre-wrap; margin: 2px 0 0; overflow-wrap: anywhere; }
    .date { justify-content: flex-start; margin-top: 8px; font-size: 10px; }
  </style></head><body>
    <h1>Pending program substitutions</h1>
    <p class="subtitle">${requests.length} request(s) · Generated ${escapeHtml(new Date().toLocaleString())}</p>
    ${rows}
  </body></html>`;
}

export async function exportSubstitutionRequestsPdf(requests: AdminSubstitutionRequest[]) {
  if (!requests.length) throw new Error('There are no pending requests to export.');
  const html = buildHtml(requests);
  if (Platform.OS === 'web') {
    const printWindow = window.open('', '_blank');
    if (!printWindow) throw new Error('Allow pop-ups to export this PDF.');
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 350);
    return;
  }
  const file = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    return;
  }
  throw new Error('PDF was generated, but sharing is not available on this device.');
}
