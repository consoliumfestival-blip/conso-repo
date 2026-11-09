import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Asset } from 'expo-asset';
import type { TeamLeaderContext, TeamLeaderScheduleRow } from './teamLeaderPortalService';
import { normalizeScheduleLifecycleStatus } from '../core/utils/scheduleLifecycle';
import { formatScheduleTime } from '../core/utils/scheduleTime';

const NAVY = '#123B63';
const MUTED = '#64748B';

type ScheduleRow = {
  id: string;
  tenant_id?: string | null;
  festival_id?: string | null;
  item_id: string;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  venue_id?: string | null;
  items?: {
    item_code?: string | null;
    item_name_en?: string | null;
    item_name_ml?: string | null;
    category_codes?: string[] | string | null;
  } | null;
  venues?: { id?: string; name?: string | null } | null;
};

type RegistrationRow = {
  id?: string | null;
  tenant_id?: string | null;
  festival_id?: string | null;
  schedule_id?: string | null;
  item_id?: string | null;
  participant_id?: string | null;
  status?: string | null;
  is_verified?: boolean | null;
};

type ParticipantRow = {
  id: string;
  name?: string | null;
  chest_number?: string | null;
  category_code?: string | null;
  organisation_id?: string | null;
  organisations?: { name?: string | null } | null;
};

type TeamAttendanceRegistration = {
  id: string;
  item_id: string;
  participant_id?: string | null;
  organisation_id?: string | null;
  festival_id?: string | null;
  entry_kind?: string | null;
  status?: string | null;
  is_verified?: boolean | null;
  checkin_cancelled?: boolean | null;
};

type TeamAttendanceGroupMember = { registration_id: string; participant_id: string };
type TeamAttendanceOrganisation = { id: string; name?: string | null };

export type AdminSchedulePdfMode = 'master' | 'venue' | 'organisation';

export type AdminSchedulePdfInput = {
  mode: AdminSchedulePdfMode;
  itemId?: string | null;
  itemCategory?: string | null;
  festivalName?: string | null;
  schedules: ScheduleRow[];
  registrations?: RegistrationRow[];
  participants?: ParticipantRow[];
};

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  : '-';

const formatTime = (value?: string | null) => formatScheduleTime(value) || '-';

const headerLines = (doc: jsPDF, value: string, maxWidth: number) => {
  const lines = doc.splitTextToSize(value, maxWidth) as string[];
  if (lines.length <= 2) return lines;
  const visible = lines.slice(0, 2);
  visible[1] = `${visible[1].replace(/[.\s]+$/, '')}…`;
  return visible;
};

const itemLabel = (schedule: ScheduleRow) => {
  const item = schedule.items;
  const name = item?.item_name_en || item?.item_name_ml || 'Unnamed item';
  return item?.item_code ? `${item.item_code} · ${name}` : name;
};

const categoryLabel = (schedule: ScheduleRow) => {
  const rawCodes = schedule.items?.category_codes;
  const codes = Array.isArray(rawCodes) ? rawCodes : rawCodes ? [rawCodes] : [];
  return codes.filter(Boolean).join(', ') || '-';
};

const scheduleCategoryCodes = (schedule: ScheduleRow) => {
  const rawCodes = schedule.items?.category_codes;
  const codes = Array.isArray(rawCodes) ? rawCodes : rawCodes ? [rawCodes] : [];
  return codes.map((code) => String(code).trim().toUpperCase()).filter(Boolean);
};

const categoryAliases: Record<string, string[]> = {
  JUNIOR: ['JUNIOR', 'JR'],
  JR: ['JUNIOR', 'JR'],
  SENIOR: ['SENIOR', 'SR'],
  SR: ['SENIOR', 'SR'],
  CAMPUS: ['CAMPUS', 'CA'],
  CA: ['CAMPUS', 'CA'],
  GENERAL: ['GENERAL', 'GN'],
  GN: ['GENERAL', 'GN'],
};

const buildParticipantMap = (participants: ParticipantRow[]) => new Map(participants.map((participant) => [participant.id, participant]));

const registrationsForSchedule = (schedule: ScheduleRow, registrations: RegistrationRow[]) => registrations
  .filter((registration) => registration.item_id === schedule.item_id && registration.festival_id === schedule.festival_id)
  .filter((registration) => registration.status !== 'rejected');

const participantsForSchedule = (
  schedule: ScheduleRow,
  registrations: RegistrationRow[],
  participantMap: Map<string, ParticipantRow>,
) => registrationsForSchedule(schedule, registrations)
  .map((registration) => registration.participant_id ? participantMap.get(registration.participant_id) : null)
  .filter(Boolean) as ParticipantRow[];

const writeHeader = (doc: jsPDF, title: string, subtitle: string, documentLabel = 'Official Schedule') => {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(NAVY);
  doc.rect(0, 0, width, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 14, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(headerLines(doc, subtitle, width - 28), 14, 17);
  doc.setFontSize(8);
  doc.text(documentLabel, width - 14, 10, { align: 'right' });
};

const writeFooter = (doc: jsPDF, pageNumber: number) => {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220, 228, 235);
  doc.line(14, height - 14, width - 14, height - 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, height - 8);
  doc.text(`Page ${pageNumber}`, width - 14, height - 8, { align: 'right' });
};

const makeDocument = () => new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

export type BlankScheduleItem = {
  item_code?: string | null;
  item_name_en?: string | null;
  item_name_ml?: string | null;
  category_codes?: string[] | null;
};

export type BlankSchedulePdfInput = {
  festivalName?: string | null;
  tenantName?: string | null;
  items: BlankScheduleItem[];
  allTenants?: boolean;
};

export type ChanceSheetRow = {
  chestNumber: string;
  name: string;
};

export type ChanceSheetPdfInput = {
  festivalName?: string | null;
  festivalYear?: number | string | null;
  itemCode?: string | null;
  itemName: string;
  category: string;
  participationType: 'individual' | 'group';
  rows: ChanceSheetRow[];
};

/** Creates a printable judging sheet without exposing assigned code letters. */
export async function downloadChanceSheetPdf(input: ChanceSheetPdfInput) {
  if (!input.rows.length) throw new Error('No active entries were found for this item.');

  const logoAsset = Asset.fromModule(require('../../public/brand/consolium-icon-192.png'));
  await logoAsset.downloadAsync();
  const logoUri = logoAsset.localUri || logoAsset.uri;
  const logoResponse = await fetch(logoUri);
  if (!logoResponse.ok) throw new Error('Unable to load the Consolium logo for this PDF.');
  const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const left = 8;
  const right = width - 8;
  const columnWidths = [18, 58, 20, 24, 24, 23, 13, 14];
  const head = ['Chest No.', 'Participant', 'Code Letter', 'Chance\n1', 'Chance\n2', 'Dead\nRound', 'Grade', 'Prize'];

  const drawHeader = () => {
    doc.setTextColor(15, 23, 42);
    doc.addImage(logoBytes, 'PNG', left, 7, 17, 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('CONSOULIUM', left + 22, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const festivalLabel = [input.festivalName, input.festivalYear].filter(Boolean).join(' · ') || 'Festival';
    doc.setTextColor(100, 116, 139);
    doc.text(doc.splitTextToSize(festivalLabel, right - (left + 22)), left + 22, 22);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Ayatic Codex', right, 13, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('OFFICIAL JUDGING SHEET', right, 19, { align: 'right' });
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.line(left, 29, right, 29);

    const cardX = left;
    const cardY = 33;
    const cardWidth = right - left;
    const innerX = cardX + 4;
    const innerWidth = cardWidth - 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    const itemNameLines = doc.splitTextToSize(input.itemName, innerWidth);
    const nameY = cardY + 15;
    const metadataY = nameY + itemNameLines.length * 6.2 + 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const categoryLines = doc.splitTextToSize(input.category || '-', innerWidth - 22);
    const categoryY = metadataY + 8;
    const cardBottom = categoryY + Math.max(1, categoryLines.length - 1) * 4 + 6;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.roundedRect(cardX, cardY, cardWidth, cardBottom - cardY, 2, 2, 'FD');

    // Draw the text after the card fill so the panel stays behind its content.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(13, 116, 106);
    doc.text('CHANCE SHEET · ITEM', innerX, cardY + 7);
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(itemNameLines, innerX, nameY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Item code: ${input.itemCode || '-'}`, innerX, metadataY);
    doc.text(`Type: ${input.participationType === 'group' ? 'Group' : 'Individual'}`, innerX + innerWidth * 0.43, metadataY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Entries: ${input.rows.length}`, right - 4, metadataY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('Category:', innerX, categoryY);
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(categoryLines, innerX + 22, categoryY);

    const judgeY = cardBottom + 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('Judge name:', left, judgeY);
    doc.line(left + 20, judgeY + 0.5, left + 84, judgeY + 0.5);
    doc.text('Signature:', left + 94, judgeY);
    doc.line(left + 112, judgeY + 0.5, right, judgeY + 0.5);
    return judgeY + 7;
  };

  const tableStartY = drawHeader();
  autoTable(doc, {
    startY: tableStartY,
    head: [head],
    body: input.rows.map((row) => [row.chestNumber, row.name, '', '', '', '', '', '']),
    margin: { left, right: width - right, top: tableStartY, bottom: 10 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      textColor: [15, 23, 42],
      lineColor: [35, 35, 35],
      lineWidth: 0.22,
      cellPadding: { top: 2.4, right: 0.5, bottom: 2.4, left: 1.2 },
      overflow: 'linebreak',
      valign: 'middle',
      minCellHeight: 11,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
      minCellHeight: 12,
    },
    columnStyles: Object.fromEntries(columnWidths.map((cellWidth, index) => [index, {
      cellWidth,
      halign: index === 0 || index >= 2 ? 'center' : 'left',
    }])),
    didDrawPage: (data) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Page ${data.pageNumber}`, right, height - 5, { align: 'right' });
    },
  });

  const safeName = input.itemName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'item';
  doc.save(`chance-sheet-${safeName}.pdf`);
  return { entryCount: input.rows.length };
}

export function downloadBlankSchedulePdf(input: BlankSchedulePdfInput) {
  if (!input.items.length) throw new Error('No active competitions found for this export.');

  const doc = makeDocument();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const rows = input.items.flatMap((item) => {
    const categories = item.category_codes?.filter(Boolean);
    const name = item.item_name_en || item.item_name_ml || 'Unnamed competition';
    const label = item.item_code ? `${item.item_code} - ${name}` : name;
    return (categories?.length ? categories : ['-']).map((category) => [label, category, '', '', '', '']);
  }).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));

  const drawFooter = (pageNumber: number) => {
    doc.setDrawColor(210, 220, 230);
    doc.line(14, height - 14, width - 14, height - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(NAVY);
    doc.text('Prepared by: ____________________    Approved by: ____________________', 14, height - 8);
    doc.text(`Page ${pageNumber}`, width - 14, height - 8, { align: 'right' });
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(NAVY);
  doc.text('Blank Competition Schedule', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setFontSize(8.5);
  const festivalLines = headerLines(doc, input.festivalName || 'Festival Schedule', width - 28);
  doc.text(festivalLines, 14, 19);
  const tenantLabel = input.tenantName ? `Tenant: ${input.tenantName}` : input.allTenants ? 'All Tenants' : '';
  const tenantLines = tenantLabel ? headerLines(doc, tenantLabel, width - 28) : [];
  const tenantY = 19 + festivalLines.length * 4;
  if (tenantLines.length) doc.text(tenantLines, 14, tenantY);
  const tableStartY = Math.max(30, tenantY + tenantLines.length * 4 + 2);

  autoTable(doc, {
    startY: tableStartY,
    head: [['No.', 'Competition', 'Category', 'Date', 'Time', 'Venue / Stage', 'Notes']],
    body: rows.map((row, index) => [String(index + 1), ...row]),
    margin: { left: 14, right: 14, bottom: 18 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      textColor: [18, 59, 99],
      lineColor: [185, 198, 210],
      lineWidth: 0.3,
      cellPadding: { top: 6, right: 3, bottom: 6, left: 3 },
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [18, 59, 99],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 61, fontStyle: 'bold' },
      2: { cellWidth: 30 },
      3: { cellWidth: 28 },
      4: { cellWidth: 28 },
      5: { cellWidth: 45 },
      6: { cellWidth: 65 },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(NAVY);
        doc.text('Blank Competition Schedule', 14, 13);
      }
      drawFooter(data.pageNumber);
    },
  });

  const suffix = input.allTenants ? 'all-tenants' : 'tenant';
  doc.save(`blank-competition-schedule-${suffix}.pdf`);
  return { rowCount: rows.length };
}

export async function downloadAdminSchedulePdf(input: AdminSchedulePdfInput) {
  const requestedItemId = input.itemId?.trim();
  const requestedCategory = input.itemCategory?.trim().toUpperCase();
  const selectedCodes = requestedCategory && requestedCategory !== 'ALL'
    ? categoryAliases[requestedCategory] || [requestedCategory]
    : null;
  const itemFilteredSchedules = requestedItemId && requestedItemId.toUpperCase() !== 'ALL'
    ? input.schedules.filter((schedule) => schedule.item_id === requestedItemId)
    : input.schedules;
  const schedules = selectedCodes
    ? itemFilteredSchedules.filter((schedule) => scheduleCategoryCodes(schedule).some((code) => selectedCodes.includes(code)))
    : itemFilteredSchedules;
  if (!schedules.length) throw new Error('No schedules found for this item category.');
  const registrations = input.registrations || [];
  const participantMap = buildParticipantMap(input.participants || []);
  const doc = makeDocument();
  const title = input.mode === 'venue'
    ? 'Venue-wise Schedule'
    : input.mode === 'organisation'
      ? 'Organisation-wise Schedule'
      : 'Festival Master Schedule';
  const subtitle = input.festivalName || 'Festival Schedule';
  // The schedule overview RPC returns the canonical status-priority order;
  // preserve it so exported schedules match the on-screen list and pagination.
  const rows = [...schedules];

  if (input.mode === 'organisation') {
    const grouped = new Map<string, { organisation: string; schedule: ScheduleRow; participants: ParticipantRow[] }[]>();
    rows.forEach((schedule) => {
      const participants = participantsForSchedule(schedule, registrations, participantMap);
      const byOrganisation = new Map<string, ParticipantRow[]>();
      participants.forEach((participant) => {
        const name = participant.organisations?.name || participant.organisation_id || 'Unassigned organisation';
        byOrganisation.set(name, [...(byOrganisation.get(name) || []), participant]);
      });
      if (!byOrganisation.size) byOrganisation.set('No registered participants', []);
      byOrganisation.forEach((groupParticipants, organisation) => {
        const current = grouped.get(organisation) || [];
        current.push({ organisation, schedule, participants: groupParticipants });
        grouped.set(organisation, current);
      });
    });

    const body: string[][] = [];
    [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([organisation, events]) => {
      body.push([organisation, '', '', '', '', '', '']);
      events.forEach(({ schedule, participants }) => {
        const names = participants.map((participant) => `${participant.chest_number || '-'} ${participant.name || '-'}`).join('\n') || '-';
        body.push([
          '', formatDate(schedule.start_time), `${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`,
          itemLabel(schedule), categoryLabel(schedule), schedule.venues?.name || '-', names,
        ]);
      });
    });
    writeHeader(doc, title, subtitle);
    autoTable(doc, {
      startY: 30,
      head: [['Organisation', 'Date', 'Time', 'Item', 'Category', 'Venue / Stage', 'Participants (Chest No · Name)']],
      body,
      margin: { left: 14, right: 14, bottom: 18 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.5, textColor: [18, 59, 99], cellPadding: 2.2, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 250, 252] },
      columnStyles: { 0: { cellWidth: 39 }, 1: { cellWidth: 25 }, 2: { cellWidth: 30 }, 3: { cellWidth: 57 }, 4: { cellWidth: 35 }, 5: { cellWidth: 38 }, 6: { cellWidth: 64 } },
      didParseCell: (data) => {
        if (data.row.raw && Array.isArray(data.row.raw) && data.row.raw[0] && data.row.raw.slice(1).every((value) => value === '')) {
          data.cell.styles.fillColor = [230, 244, 242];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [15, 118, 110];
        }
      },
      didDrawPage: (data) => writeFooter(doc, data.pageNumber),
    });
  } else {
    writeHeader(doc, title, subtitle);
    const body = rows.map((schedule) => {
      const scopedRegistrations = registrationsForSchedule(schedule, registrations);
      const verified = scopedRegistrations.filter((registration) => registration.is_verified === true).length;
      return [
        formatDate(schedule.start_time),
        `${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`,
        itemLabel(schedule),
        categoryLabel(schedule),
        schedule.venues?.name || '-',
        String(scopedRegistrations.length),
        `${verified}/${scopedRegistrations.length || '-'}`,
        schedule.status || 'scheduled',
      ];
    });
    autoTable(doc, {
      startY: 30,
      head: [['Date', 'Time', 'Item', 'Category', 'Venue / Stage', 'Participants', 'Checked in', 'Status']],
      body,
      margin: { left: 14, right: 14, bottom: 18 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, textColor: [18, 59, 99], cellPadding: 2.6, overflow: 'linebreak' },
      headStyles: { fillColor: [18, 59, 99], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles: { 0: { cellWidth: 27 }, 1: { cellWidth: 34 }, 2: { cellWidth: 66 }, 3: { cellWidth: 38 }, 4: { cellWidth: 46 }, 5: { cellWidth: 25 }, 6: { cellWidth: 25 }, 7: { cellWidth: 25 } },
      didDrawPage: (data) => writeFooter(doc, data.pageNumber),
    });
  }

  const suffix = input.mode === 'venue' ? 'venue-wise' : input.mode === 'organisation' ? 'organisation-wise' : 'master';
  doc.save(`festival-schedule-${suffix}.pdf`);
  return {
    scheduleCount: schedules.length,
    mode: input.mode,
    itemId: input.itemId || 'All',
    itemCategory: input.itemCategory || 'All',
  };
}

export function downloadTeamAttendancePdf(input: {
  festivalName?: string | null;
  schedules: ScheduleRow[];
  registrations: TeamAttendanceRegistration[];
  groupMembers: TeamAttendanceGroupMember[];
  participants: ParticipantRow[];
  organisations: TeamAttendanceOrganisation[];
}) {
  const completedSchedules = input.schedules
    .filter((schedule) => normalizeScheduleLifecycleStatus(schedule.status) === 'completed')
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '') || itemLabel(a).localeCompare(itemLabel(b)));
  if (!completedSchedules.length) throw new Error('No completed competitions match the current filters.');

  // Registrations are item-scoped, so repeated schedule rows for one item must not duplicate people.
  const schedulesByItem = new Map<string, ScheduleRow>();
  completedSchedules.forEach((schedule) => {
    if (!schedulesByItem.has(schedule.item_id)) schedulesByItem.set(schedule.item_id, schedule);
  });
  const completedItems = Array.from(schedulesByItem.values());

  const participantMap = buildParticipantMap(input.participants);
  const organisationMap = new Map(input.organisations.map((organisation) => [organisation.id, organisation.name]));
  const membersByRegistration = new Map<string, string[]>();
  input.groupMembers.forEach(({ registration_id, participant_id }) => {
    membersByRegistration.set(registration_id, [...(membersByRegistration.get(registration_id) || []), participant_id]);
  });

  const teamSummaries = new Map<string, {
    itemId: string;
    itemName: string;
    teamId: string;
    teamName: string;
    participantAttendance: Map<string, boolean>;
  }>();

  completedItems.forEach((schedule) => {
    input.registrations
      .filter((registration) => registration.item_id === schedule.item_id
        && (!schedule.festival_id || registration.festival_id === schedule.festival_id)
        && registration.status?.trim().toLowerCase() !== 'rejected')
      .forEach((registration) => {
        const isGroupEntry = registration.entry_kind === 'general_team';
        const participantIds = isGroupEntry
          ? membersByRegistration.get(registration.id)
            || (registration.participant_id ? [registration.participant_id] : [])
          : registration.participant_id ? [registration.participant_id] : [];
        const registrationStatus = registration.status?.trim().toLowerCase();
        const participated = registrationStatus !== 'cancelled'
          && registrationStatus !== 'canceled'
          && registration.checkin_cancelled !== true
          && registration.is_verified === true;

        Array.from(new Set(participantIds)).forEach((participantId) => {
          const participant = participantMap.get(participantId);
          if (!participant) return;
          const teamId = registration.organisation_id || participant.organisation_id || '';
          const teamName = teamId
            ? organisationMap.get(teamId) || 'Team name unavailable'
            : participant.organisations?.name || 'Unassigned team';
          const itemName = itemLabel(schedule);
          const summaryKey = `${schedule.item_id}:${teamId || `unassigned:${teamName}`}`;
          const summary = teamSummaries.get(summaryKey) || {
            itemId: schedule.item_id,
            itemName,
            teamId,
            teamName,
            participantAttendance: new Map<string, boolean>(),
          };
          // Count a participant once per item/team; a verified attendance wins if duplicate source rows exist.
          summary.participantAttendance.set(
            participantId,
            summary.participantAttendance.get(participantId) === true || participated,
          );
          teamSummaries.set(summaryKey, summary);
        });
      });
  });

  if (!teamSummaries.size) throw new Error('No assigned participants were found for completed competitions in these filters.');

  const rows = Array.from(teamSummaries.values()).map((summary) => {
    const participantCounts = Array.from(summary.participantAttendance.values()).reduce((counts, participated) => {
      counts[participated ? 'participated' : 'notParticipated'] += 1;
      return counts;
    }, { participated: 0, notParticipated: 0 });
    return { ...summary, ...participantCounts };
  }).sort((a, b) => a.itemName.localeCompare(b.itemName)
    || a.itemId.localeCompare(b.itemId)
    || a.teamName.localeCompare(b.teamName)
    || a.teamId.localeCompare(b.teamId));

  const doc = makeDocument();
  const counts = rows.reduce((result, row) => {
    result.participated += row.participated;
    result.notParticipated += row.notParticipated;
    return result;
  }, { participated: 0, notParticipated: 0 });
  const reportTitle = 'Team-wise Competition Attendance';
  const reportSubtitle = input.festivalName || 'Festival';
  const summary = `Completed competitions: ${completedItems.length}   Item-team rows: ${rows.length}   Participated: ${counts.participated}   Did not participate: ${counts.notParticipated}`;
  const drawReportHeader = () => {
    writeHeader(doc, reportTitle, reportSubtitle, 'Fair Play Attendance');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(summary, 14, 28);
    doc.text('* Cancelled and check-in-cancelled entries count as not participating; rejected entries are excluded.', 14, 33);
  };
  drawReportHeader();

  const body = rows.map((row) => [
    row.itemName,
    row.teamName,
    String(row.participated),
    String(row.notParticipated),
  ]);

  autoTable(doc, {
    startY: 37,
    head: [['Competition / Item', 'Team', 'Participated', 'Did not participate']],
    body,
    margin: { top: 37, left: 14, right: 14, bottom: 18 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, textColor: [18, 59, 99], cellPadding: 2.4, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [18, 59, 99], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: 90 }, 1: { cellWidth: 100 }, 2: { cellWidth: 34, halign: 'center' }, 3: { cellWidth: 45, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.styles.textColor = [180, 83, 9];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawReportHeader();
      writeFooter(doc, data.pageNumber);
    },
  });

  doc.save('team-wise-competition-attendance.pdf');
  return { scheduleCount: completedSchedules.length, itemCount: completedItems.length, teamRowCount: rows.length, counts };
}

export async function downloadTeamLeaderSchedulePdf(
  context: TeamLeaderContext,
  schedules: TeamLeaderScheduleRow[],
) {
  if (!schedules.length) throw new Error('No schedule events found for your team.');
  const doc = makeDocument();
  writeHeader(doc, 'My Team Schedule', `${context.festival_name || 'Festival'} · ${context.team_name || 'Team'}`);
  const body = [...schedules]
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    .map((event) => [
      formatDate(event.start_time),
      `${formatTime(event.start_time)} - ${formatTime(event.end_time)}`,
      event.item_code ? `${event.item_code} · ${event.item_name || '-'}` : event.item_name || '-',
      event.category_codes?.join(', ') || '-',
      event.venue_name || '-',
      String(event.participant_count),
      `${event.checked_in_count}/${event.participant_count}`,
      event.event_status || 'scheduled',
    ]);
  autoTable(doc, {
    startY: 30,
    head: [['Date', 'Time', 'Item', 'Category', 'Venue / Stage', 'Participants', 'Checked in', 'Status']],
    body,
    margin: { left: 14, right: 14, bottom: 18 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, textColor: [18, 59, 99], cellPadding: 2.6, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 250, 252] },
    columnStyles: { 0: { cellWidth: 27 }, 1: { cellWidth: 34 }, 2: { cellWidth: 66 }, 3: { cellWidth: 38 }, 4: { cellWidth: 46 }, 5: { cellWidth: 25 }, 6: { cellWidth: 25 }, 7: { cellWidth: 25 } },
    didDrawPage: (data) => writeFooter(doc, data.pageNumber),
  });
  doc.save(`my-team-schedule-${context.festival_id}.pdf`);
  return { scheduleCount: schedules.length };
}
