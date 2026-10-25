import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/core/config/supabase';

export type ExportParticipant = {
  id: string;
  name: string;
  chest_number?: string | null;
  category_code?: string | null;
  gender?: string | null;
  age?: string | number | null;
  status?: string | null;
  created_at?: string | null;
  registered_by?: string | null;
  organisation_id?: string | null;
  organisation_name?: string | null;
};

export type ExportItem = {
  id: string;
  item_code?: string | null;
  item_name_en?: string | null;
  item_name_ml?: string | null;
  category_codes?: string[] | null;
  participation_type?: string | null;
};

export type ExportAssignment = {
  registration_id?: string | null;
  participant_id: string;
  item_id: string;
  entry_kind?: string | null;
  registration_status?: string | null;
  is_verified?: boolean | null;
  organisation_id?: string | null;
  organisation_name?: string | null;
};

export type ExportSort = 'team' | 'chest';

export type TeamLeaderParticipantExportRow = {
  participant_id: string;
  participant_name: string;
  gender: string | null;
  category_code: string | null;
  chest_number: string | null;
  participant_status: string | null;
  organisation_id: string;
  team_name: string;
  item_id: string | null;
  item_code: string | null;
  item_name_en: string | null;
  item_name_ml: string | null;
  item_category_codes: string[] | null;
  participation_type: string | null;
  entry_kind: string | null;
  registration_id: string | null;
  registration_status: string | null;
  is_verified: boolean | null;
};

/** Group entries have no participant_id on the registration; resolve members in one query. */
export async function loadAdminGroupMembers(registrations: { id: string; participant_id?: string | null }[]) {
  const registrationIds = registrations.filter((row) => !row.participant_id).map((row) => row.id);
  if (!registrationIds.length) return [] as { registration_id: string; participant_id: string }[];
  const { data, error } = await supabase
    .from('group_members')
    .select('registration_id, participant_id')
    .in('registration_id', registrationIds);
  if (error) throw error;
  return (data ?? []) as { registration_id: string; participant_id: string }[];
}

const INK: [number, number, number] = [18, 24, 32];
const GRID: [number, number, number] = [105, 112, 121];
const MUTED: [number, number, number] = [78, 84, 92];
const LIGHT_GRAY: [number, number, number] = [224, 226, 229];
const PAGE_WIDTH = 210;
const PAGE_HEIGHT_F4 = 330;
const PRINT_MARGIN = 10;

const safeText = (value?: string | number | null) => String(value ?? '').trim();
const MAX_PDF_HEADER_LINES = 2;

function wrappedHeaderLines(doc: jsPDF, value: string, maxWidth: number) {
  const lines = doc.splitTextToSize(value, maxWidth) as string[];
  if (lines.length <= MAX_PDF_HEADER_LINES) return lines;
  const visible = lines.slice(0, MAX_PDF_HEADER_LINES);
  visible[MAX_PDF_HEADER_LINES - 1] = `${visible[MAX_PDF_HEADER_LINES - 1].replace(/[.\s]+$/, '')}…`;
  return visible;
}

function drawRepeatedHeader(doc: jsPDF, value: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text(wrappedHeaderLines(doc, value, PAGE_WIDTH - PRINT_MARGIN * 2), PRINT_MARGIN, 6);
}
const registrationIsActive = (row: ExportAssignment) => !['rejected', 'cancelled', 'canceled'].includes(safeText(row.registration_status).toLowerCase());
const itemLabel = (item?: ExportItem) => {
  if (!item) return 'Unnamed item';
  return item.item_name_en || item.item_name_ml || 'Unnamed item';
};

function requireWebPdf() {
  if (Platform.OS !== 'web') throw new Error('PDF download is available in the browser portal.');
}

function sortParticipants(rows: ExportParticipant[]) {
  return [...rows].sort((a, b) =>
    safeText(a.chest_number).localeCompare(safeText(b.chest_number), undefined, { numeric: true })
      || safeText(a.name).localeCompare(safeText(b.name)),
  );
}

function pageFooter(doc: jsPDF, pageHeight: number) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${page} of ${total}`, PAGE_WIDTH - PRINT_MARGIN, pageHeight - 5, { align: 'right' });
  }
}

/** A4 cut-out slips, 3 or 4 per page depending on the longest competition list. */
export function downloadTeamParticipantSlipsPdf(args: {
  teamName: string;
  participants: ExportParticipant[];
  items: ExportItem[];
  assignments: ExportAssignment[];
}) {
  requireWebPdf();
  if (!args.participants.length) throw new Error('This team has no participants to export.');

  const itemMap = new Map(args.items.map((item) => [item.id, item]));
  const itemsByParticipant = new Map<string, ExportItem[]>();
  args.assignments.filter(registrationIsActive).forEach((assignment) => {
    const item = itemMap.get(assignment.item_id);
    if (!item) return;
    const list = itemsByParticipant.get(assignment.participant_id) ?? [];
    if (!list.some((candidate) => candidate.id === item.id)) list.push(item);
    itemsByParticipant.set(assignment.participant_id, list);
  });

  const participants = sortParticipants(args.participants);
  const maxItems = Math.max(0, ...participants.map((person) => (itemsByParticipant.get(person.id) ?? []).length));
  const slotsPerPage = maxItems > 24 ? 3 : 4;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const slotHeight = (pageHeight - PRINT_MARGIN * 2) / slotsPerPage;
  const slipWidth = pageWidth - PRINT_MARGIN * 2;

  participants.forEach((participant, index) => {
    const slot = index % slotsPerPage;
    if (index && slot === 0) doc.addPage();
    const top = PRINT_MARGIN + slot * slotHeight;
    const bottom = top + slotHeight;
    const assignedItems = [...(itemsByParticipant.get(participant.id) ?? [])].sort((a, b) => itemLabel(a).localeCompare(itemLabel(b)));
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.3);
    doc.rect(PRINT_MARGIN, top, slipWidth, slotHeight);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.setFontSize(12.5);
    doc.text(doc.splitTextToSize(safeText(participant.name) || 'Unnamed participant', slipWidth - 54).slice(0, 2), PRINT_MARGIN + 4, top + 7);
    doc.setFontSize(9);
    doc.text(`Chest No: ${safeText(participant.chest_number) || '—'}`, pageWidth - PRINT_MARGIN - 4, top + 7, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Team: ${safeText(args.teamName) || '—'}`, PRINT_MARGIN + 4, top + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`COMPETITIONS (${assignedItems.length})`, PRINT_MARGIN + 4, top + 20);

    if (!assignedItems.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('No active competitions', PRINT_MARGIN + 4, top + 26);
      return;
    }
    const columns: ExportItem[][] = [[], [], []];
    const perColumn = Math.ceil(assignedItems.length / 3);
    assignedItems.forEach((item, itemIndex) => columns[Math.min(2, Math.floor(itemIndex / perColumn))].push(item));
    const gap = 4;
    const columnWidth = (slipWidth - 8 - gap * 2) / 3;
    const lineHeight = assignedItems.length > 24 ? 3.4 : 3.8;
    const fontSize = assignedItems.length > 24 ? 6.2 : 7;
    let overflow = false;
    columns.forEach((column, columnIndex) => {
      let y = top + 25;
      column.forEach((item, itemIndex) => {
        const number = columnIndex * perColumn + itemIndex + 1;
        const lines = doc.splitTextToSize(`${number}. ${itemLabel(item)}`, columnWidth - 1) as string[];
        if (y + lines.length * lineHeight > bottom - 3) { overflow = true; return; }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(...INK);
        doc.text(lines, PRINT_MARGIN + 4 + columnIndex * (columnWidth + gap), y);
        y += Math.max(lineHeight, lines.length * lineHeight);
      });
    });
    if (overflow) throw new Error(`The competition list for ${safeText(participant.name)} is too long to fit clearly on a slip.`);
  });

  const safeTeam = (safeText(args.teamName) || 'team').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '');
  doc.save(`participant-slips-${safeTeam}.pdf`);
  return { participantCount: participants.length, slotsPerPage };
}

/** Team report: one F4 PDF, with participant rows grouped by item. */
export function downloadTeamItemParticipantsPdf(args: {
  teamName: string;
  teamId: string;
  participants: ExportParticipant[];
  items: ExportItem[];
  assignments: ExportAssignment[];
}) {
  requireWebPdf();
  const people = new Map(args.participants.map((person) => [person.id, person]));
  const itemMap = new Map(args.items.map((item) => [item.id, item]));
  const groups = new Map<string, { item: ExportItem; rows: { chest: string; category: string; name: string }[] }>();

  args.assignments.filter(registrationIsActive).forEach((assignment) => {
    if (assignment.organisation_id && assignment.organisation_id !== args.teamId) return;
    const person = people.get(assignment.participant_id);
    const item = itemMap.get(assignment.item_id);
    if (!person || !item) return;
    const group = groups.get(item.id) ?? { item, rows: [] };
    group.rows.push({
      chest: safeText(person.chest_number) || '—',
      category: safeText(person.category_code) || '—',
      name: safeText(person.name) || 'Unnamed participant',
    });
    groups.set(item.id, group);
  });
  if (!groups.size) throw new Error('No active item assignments were found for this team.');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PAGE_WIDTH, PAGE_HEIGHT_F4] });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text('TEAM ITEM PARTICIPANT REPORT', PAGE_WIDTH / 2, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Team: ${safeText(args.teamName) || '—'}`, PRINT_MARGIN, 25);
  let cursorY = 31;

  [...groups.values()].sort((a, b) => itemLabel(a.item).localeCompare(itemLabel(b.item))).forEach(({ item, rows }) => {
    if (cursorY > PAGE_HEIGHT_F4 - 30) { doc.addPage(); cursorY = PRINT_MARGIN + 8; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const titleLines = doc.splitTextToSize(itemLabel(item), PAGE_WIDTH - PRINT_MARGIN * 2) as string[];
    doc.text(titleLines, PRINT_MARGIN, cursorY);
    cursorY += Math.max(5, titleLines.length * 4.2 + 1);
    autoTable(doc, {
      startY: cursorY,
      head: [['Sl. No.', 'Chest No.', 'Category', 'Participant Name']],
      body: rows.sort((a, b) => a.chest.localeCompare(b.chest, undefined, { numeric: true }) || a.name.localeCompare(b.name)).map((row, index) => [String(index + 1), row.chest, row.category, row.name]),
      margin: { left: PRINT_MARGIN, right: PRINT_MARGIN, top: 16, bottom: PRINT_MARGIN + 4 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, textColor: INK, lineColor: GRID, lineWidth: 0.2, cellPadding: 1.8, overflow: 'linebreak', minCellHeight: 6 },
      headStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: 'bold', lineWidth: 0.3 },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 122 },
      },
      didParseCell: (hook) => {
        if (hook.section === 'body' && hook.column.index === 3) hook.cell.styles.fontSize = 9;
      },
      rowPageBreak: 'avoid',
      didDrawPage: (hook) => {
        if (hook.pageNumber > 1) drawRepeatedHeader(doc, `${safeText(args.teamName)} · ${itemLabel(item)}`);
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY + 10) + 7;
  });
  pageFooter(doc, PAGE_HEIGHT_F4);
  const safeTeam = (safeText(args.teamName) || 'team').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '');
  doc.save(`team-items-${safeTeam}.pdf`);
  return { itemCount: groups.size };
}

/** Item verification report shared by Admin and Team Leader scopes. */
export function downloadItemVerificationPdf(args: {
  festivalName?: string | null;
  item: ExportItem;
  participants: ExportParticipant[];
  assignments: ExportAssignment[];
  sortBy: ExportSort;
  teamId?: string;
}) {
  requireWebPdf();
  const people = new Map(args.participants.map((person) => [person.id, person]));
  const rows = args.assignments
    .filter((assignment) => assignment.item_id === args.item.id && (!args.teamId || assignment.organisation_id === args.teamId))
    .flatMap((assignment) => {
      const participant = people.get(assignment.participant_id);
      if (!participant) return [];
      const registrationStatus = safeText(assignment.registration_status).toLowerCase();
      const status = registrationStatus === 'rejected'
        ? 'Rejected'
        : ['cancelled', 'canceled'].includes(registrationStatus)
          ? 'Cancelled'
          : assignment.is_verified === true ? 'Verified' : 'Not Verified';
      return [{ participant, status }];
    });
  if (!rows.length) throw new Error('No assigned participants were found for this item.');

  rows.sort((a, b) => args.sortBy === 'team'
    ? safeText(a.participant.organisation_name).localeCompare(safeText(b.participant.organisation_name))
      || safeText(a.participant.chest_number).localeCompare(safeText(b.participant.chest_number), undefined, { numeric: true })
    : safeText(a.participant.chest_number).localeCompare(safeText(b.participant.chest_number), undefined, { numeric: true })
      || safeText(a.participant.name).localeCompare(safeText(b.participant.name)));

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PAGE_WIDTH, PAGE_HEIGHT_F4] });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text('ITEM PARTICIPANT VERIFICATION REPORT', PAGE_WIDTH / 2, 17, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (args.festivalName) doc.text(safeText(args.festivalName), PAGE_WIDTH / 2, 23, { align: 'center' });

  autoTable(doc, {
    startY: args.festivalName ? 27 : 23,
    head: [],
    body: [[
      { content: 'ITEM', styles: { fontStyle: 'bold', halign: 'center' } }, itemLabel(args.item),
      { content: 'TOTAL PARTICIPANTS', styles: { fontStyle: 'bold', halign: 'center' } },
      { content: String(rows.length), styles: { halign: 'center' } },
    ]],
    margin: { left: PRINT_MARGIN, right: PRINT_MARGIN },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, textColor: INK, lineColor: GRID, lineWidth: 0.2, cellPadding: 1.6, minCellHeight: 7, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 95 }, 2: { cellWidth: 42 }, 3: { cellWidth: 35 } },
  });
  const headerY = ((doc as any).lastAutoTable?.finalY ?? 31) + 4;
  autoTable(doc, {
    startY: headerY,
    head: [['Sl. No.', 'Chest No.', 'Participant Name', 'System Status']],
    body: rows.map(({ participant, status }, index) => [String(index + 1), safeText(participant.chest_number) || '—', safeText(participant.name) || 'Unnamed participant', status]),
    margin: { left: PRINT_MARGIN, right: PRINT_MARGIN, top: PRINT_MARGIN, bottom: PRINT_MARGIN + 4 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, textColor: INK, lineColor: GRID, lineWidth: 0.2, cellPadding: 2.1, minCellHeight: 7.2, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: 'bold', lineWidth: 0.35 },
    columnStyles: { 0: { cellWidth: 18, halign: 'center' }, 1: { cellWidth: 30, halign: 'center' }, 2: { cellWidth: 95 }, 3: { cellWidth: 47, halign: 'center' } },
    didParseCell: (hook) => {
      if (hook.section === 'body' && hook.column.index === 2) hook.cell.styles.fontSize = 9;
      if (hook.section === 'body' && hook.column.index === 3 && ['Rejected', 'Cancelled'].includes(String(hook.cell.raw))) {
        hook.cell.styles.fillColor = LIGHT_GRAY;
        hook.cell.styles.fontStyle = 'bold';
      }
    },
    rowPageBreak: 'avoid',
    didDrawPage: (hook) => {
      if (hook.pageNumber > 1) drawRepeatedHeader(doc, itemLabel(args.item));
    },
  });
  pageFooter(doc, PAGE_HEIGHT_F4);
  const safeItem = (safeText(args.item.item_name_en) || safeText(args.item.item_name_ml) || 'item').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '');
  doc.save(`item-verification-${safeItem}.pdf`);
  return { participantCount: rows.length };
}

function csvCell(value: unknown) {
  let text = String(value ?? '').trim();
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function downloadParticipantsCsv(participants: ExportParticipant[]) {
  if (!participants.length) throw new Error('No participants are available to export.');
  const columns: [string, (participant: ExportParticipant) => unknown][] = [
    ['Participant', (participant) => participant.name],
    ['Chest Number', (participant) => participant.chest_number],
    ['Team', (participant) => participant.organisation_name],
    ['Category', (participant) => participant.category_code],
    ['Gender', (participant) => participant.gender],
    ['Age', (participant) => participant.age],
    ['Status', (participant) => participant.status],
    ['Registered By', (participant) => participant.registered_by],
    ['Created At', (participant) => participant.created_at],
  ];
  const content = `\uFEFF${columns.map(([label]) => csvCell(label)).join(',')}\r\n${participants.map((participant) => columns.map(([, get]) => csvCell(get(participant))).join(',')).join('\r\n')}`;
  const filename = `participants-${new Date().toISOString().slice(0, 10)}.csv`;
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    const fileUri = `${(FileSystem as any).documentDirectory || ''}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding: 'utf8' as any });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
    else throw new Error('File sharing is not available on this device.');
  }
  return { participantCount: participants.length };
}
