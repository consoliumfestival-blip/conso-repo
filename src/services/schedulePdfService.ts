import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TeamLeaderContext, TeamLeaderScheduleRow } from './teamLeaderPortalService';

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

const formatTime = (value?: string | null) => value
  ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  : '-';

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

const registrationsForSchedule = (
  schedule: ScheduleRow,
  registrations: RegistrationRow[],
  participantMap: Map<string, ParticipantRow>,
) => registrations
  .filter((registration) => {
    if (registration.status === 'rejected') return false;
    return registration.schedule_id === schedule.id;
  })
  .map((registration) => registration.participant_id ? participantMap.get(registration.participant_id) : null)
  .filter(Boolean) as ParticipantRow[];

const writeHeader = (doc: jsPDF, title: string, subtitle: string) => {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(NAVY);
  doc.rect(0, 0, width, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 14, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(subtitle, 14, 17);
  doc.setFontSize(8);
  doc.text('Official Schedule', width - 14, 10, { align: 'right' });
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
  doc.text(input.festivalName || 'Festival Schedule', 14, 19);
  doc.text(input.tenantName ? `Tenant: ${input.tenantName}` : input.allTenants ? 'All Tenants' : '', width - 14, 19, { align: 'right' });

  autoTable(doc, {
    startY: 26,
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
      1: { cellWidth: 62, fontStyle: 'bold' },
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
  const itemFilteredSchedules = requestedItemId && requestedItemId !== 'ALL'
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
  const rows = [...schedules].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  if (input.mode === 'organisation') {
    const grouped = new Map<string, { organisation: string; schedule: ScheduleRow; participants: ParticipantRow[] }[]>();
    rows.forEach((schedule) => {
      const participants = registrationsForSchedule(schedule, registrations, participantMap);
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
      const participants = registrationsForSchedule(schedule, registrations, participantMap);
      const scopedRegistrations = registrations.filter((registration) => {
        return registration.schedule_id === schedule.id;
      });
      const verified = scopedRegistrations.filter((registration) => registration.status !== 'rejected' && registration.is_verified).length;
      return [
        formatDate(schedule.start_time),
        `${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`,
        itemLabel(schedule),
        categoryLabel(schedule),
        schedule.venues?.name || '-',
        String(participants.length || scopedRegistrations.filter((registration) => registration.status !== 'rejected').length),
        `${verified}/${participants.length || '-'}`,
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
