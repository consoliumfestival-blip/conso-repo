import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../core/config/supabase';

const DARK_BLUE = '#123B63';

export type ParticipantItemPdfScope = {
  festivalId?: string | null;
  tenantId?: string | null;
  allTenants?: boolean;
  itemId?: string | null;
  categoryCode?: string | null;
  participants?: {
    id: string;
    name: string;
    chest_number?: string | null;
    category_code?: string | null;
    organisation_id?: string | null;
    festival_id?: string | null;
  }[];
};

type ParticipantRow = {
  id: string;
  name: string;
  chest_number: string | null;
  category_code: string | null;
  organisation_id: string | null;
  festival_id: string;
};

type RegistrationRow = {
  participant_id: string;
  item_id: string | null;
  organisation_id: string | null;
  status: string | null;
};

type ItemRow = { id: string; item_name_en: string | null; item_name_ml: string | null; item_code: string | null; category_codes?: string[] | null };
type OrganisationRow = { id: string; name: string | null };

const resolveFestival = async (scope: ParticipantItemPdfScope) => {
  if (scope.festivalId) return scope.festivalId;
  let query = supabase
    .from('festival_calendar')
    .select('id')
    .eq('is_active', true)
    .order('festival_year', { ascending: false })
    .limit(1);
  if (scope.tenantId && !scope.allTenants) query = query.eq('tenant_id', scope.tenantId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('No active festival found for this export.');
  return data.id as string;
};

const fetchRows = async (scope: ParticipantItemPdfScope) => {
  const festivalId = scope.participants?.length
    ? (scope.festivalId || null)
    : await resolveFestival(scope);
  let participantRows: ParticipantRow[] = (scope.participants || []).map((row) => ({
    id: row.id,
    name: row.name,
    chest_number: row.chest_number || null,
    category_code: row.category_code || null,
    organisation_id: row.organisation_id || null,
    festival_id: row.festival_id || festivalId || '',
  }));
  // When the caller supplies the rows already displayed in the Participants
  // page, keep registrations aligned with that same visible scope instead of
  // applying a second active-festival filter that can hide valid assignments.
  let scopedByFestival = participantRows.length === 0;

  if (participantRows.length === 0) {
    let participantQuery = supabase
      .from('participants')
      .select('id,name,chest_number,category_code,organisation_id,festival_id')
      .eq('festival_id', festivalId)
      .neq('status', 'rejected')
      .order('name');
    if (scope.tenantId && !scope.allTenants) participantQuery = participantQuery.eq('tenant_id', scope.tenantId);

    const { data: participants, error: participantError } = await participantQuery;
    if (participantError) throw participantError;
    participantRows = (participants || []) as ParticipantRow[];
  }

  // The admin participant list can contain tenant-visible records whose
  // festival_id is not the tenant's active calendar row. Keep export aligned
  // with that list, but only use this fallback for a single tenant scope.
  if (participantRows.length === 0 && scope.tenantId && !scope.allTenants) {
    const fallback = await supabase
      .from('participants')
      .select('id,name,chest_number,category_code,organisation_id,festival_id')
      .eq('tenant_id', scope.tenantId)
      .neq('status', 'rejected')
      .order('name');
    if (fallback.error) throw fallback.error;
    participantRows = (fallback.data || []) as ParticipantRow[];
    scopedByFestival = false;
  }
  if (participantRows.length === 0) throw new Error('No participants found for this export.');

  const participantIds = participantRows.map((row) => row.id);
  let registrationQuery = supabase
    .from('registrations')
    .select('participant_id,item_id,organisation_id,status')
    .in('participant_id', participantIds)
    .neq('status', 'rejected');
  if (scopedByFestival && festivalId) registrationQuery = registrationQuery.eq('festival_id', festivalId);
  const { data: registrations, error: registrationError } = await registrationQuery;
  if (registrationError) throw registrationError;

  const registrationRows = (registrations || []) as RegistrationRow[];
  const itemIds = [...new Set(registrationRows.map((row) => row.item_id).filter(Boolean))] as string[];
  const organisationIds = [...new Set([
    ...participantRows.map((row) => row.organisation_id),
    ...registrationRows.map((row) => row.organisation_id),
  ].filter(Boolean))] as string[];

  const [{ data: items, error: itemError }, { data: organisations, error: organisationError }] = await Promise.all([
    supabase.from('items').select('id,item_name_en,item_name_ml,item_code,category_codes').in('id', itemIds),
    organisationIds.length > 0
      ? supabase.from('organisations').select('id,name').in('id', organisationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemError) throw itemError;
  if (organisationError) throw organisationError;

  return {
    festivalId,
    participants: participantRows,
    registrations: registrationRows,
    items: (items || []) as ItemRow[],
    organisations: (organisations || []) as OrganisationRow[],
  };
};

export async function downloadParticipantItemsPdf(scope: ParticipantItemPdfScope = {}) {
  const data = await fetchRows(scope);
  const participantMap = new Map(data.participants.map((row) => [row.id, row]));
  const itemMap = new Map(data.items.map((row) => [row.id, row]));
  const organisationMap = new Map(data.organisations.map((row) => [row.id, row.name || '-']));
  const requestedItemId = scope.itemId?.trim();
  const requestedCategory = scope.categoryCode?.trim().toUpperCase();
  const grouped = new Map<string, { item: string; rows: [string, string, string, string][] }>();

  for (const registration of data.registrations) {
    if (requestedItemId && requestedItemId !== 'ALL' && registration.item_id !== requestedItemId) continue;
    const participant = participantMap.get(registration.participant_id);
    const item = registration.item_id ? itemMap.get(registration.item_id) : null;
    if (!participant || !item) continue;
    if (requestedCategory && requestedCategory !== 'ALL' && (participant.category_code || '').trim().toUpperCase() !== requestedCategory) continue;
    const categoryLabel = participant.category_code || 'Uncategorised';
    const itemName = item.item_code
      ? `${item.item_code} · ${item.item_name_en || item.item_name_ml || 'Unnamed item'}`
      : item.item_name_en || item.item_name_ml || 'Unnamed item';
    const competitionKey = `${item.id}::${categoryLabel}`;
    if (!grouped.has(competitionKey)) grouped.set(competitionKey, { item: `${itemName} · ${categoryLabel}`, rows: [] });
    const organisationId = participant.organisation_id || registration.organisation_id;
    grouped.get(competitionKey)!.rows.push([
      participant.chest_number || '-',
      participant.name || 'Unnamed participant',
      participant.category_code || '-',
      organisationId ? organisationMap.get(organisationId) || '-' : '-',
    ]);
  }

  if (grouped.size === 0) throw new Error('No assigned competition items found for these participants.');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let cursorY = 18;
  let pageNumber = 1;
  const writeFooter = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(DARK_BLUE);
    doc.text(`Page ${pageNumber}`, pageWidth - 18, pageHeight - 10, { align: 'right' });
  };
  const ensureSpace = (height: number) => {
    if (cursorY + height > pageHeight - 17) {
      writeFooter();
      doc.addPage();
      pageNumber += 1;
      cursorY = 18;
    }
  };

  [...grouped.values()].sort((a, b) => a.item.localeCompare(b.item)).forEach((group) => {
    const rows = group.rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    ensureSpace(16);
    doc.setDrawColor(DARK_BLUE);
    doc.setLineWidth(0.6);
    doc.line(14, cursorY, pageWidth - 14, cursorY);
    cursorY += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(DARK_BLUE);
    doc.text(group.item, 14, cursorY);
    cursorY += 4;

    autoTable(doc, {
      startY: cursorY,
      head: [['Chest No', 'Participant', 'Category', 'Organisation / Team']],
      body: rows,
      margin: { left: 14, right: 14, bottom: 17 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        textColor: [18, 59, 99],
        lineColor: [210, 220, 230],
        lineWidth: 0.25,
        cellPadding: 2.2,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [18, 59, 99],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 62 }, 2: { cellWidth: 30 }, 3: { cellWidth: 65 } },
      didDrawPage: () => {
        // Footer is drawn after the final table position is known below.
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 12) + 8;
  });

  writeFooter();
  const scopeName = scope.allTenants ? 'all-tenants' : 'tenant';
  doc.save(`item-participants-${scopeName}-${data.festivalId}.pdf`);
  return {
    participantCount: new Set([...grouped.values()].flatMap((group) => group.rows.map((row) => row[0] + row[1]))).size,
    itemCount: grouped.size,
    festivalId: data.festivalId,
    itemId: scope.itemId || 'All',
    categoryCode: scope.categoryCode || 'All',
  };
}

export async function downloadParticipantPdf(scope: ParticipantItemPdfScope = {}) {
  const data = await fetchRows(scope);
  const participantMap = new Map(data.participants.map((row) => [row.id, row]));
  const itemMap = new Map(data.items.map((row) => [row.id, row]));
  const organisationMap = new Map(data.organisations.map((row) => [row.id, row.name || '-']));
  const itemNames = new Map<string, Set<string>>();

  for (const registration of data.registrations) {
    if (!participantMap.has(registration.participant_id) || !registration.item_id) continue;
    const item = itemMap.get(registration.item_id);
    if (!item) continue;
    const itemName = item.item_name_en || item.item_name_ml || item.item_code || 'Unnamed item';
    if (!itemNames.has(registration.participant_id)) itemNames.set(registration.participant_id, new Set());
    itemNames.get(registration.participant_id)!.add(itemName);
  }

  const rows = data.participants
    .map((participant) => {
      const organisation = participant.organisation_id
        ? organisationMap.get(participant.organisation_id) || '-'
        : '-';
      const items = [...(itemNames.get(participant.id) || new Set<string>())]
        .sort((a, b) => a.localeCompare(b));
      return {
        name: participant.name || 'Unnamed participant',
        organisation,
        items: items.length > 0 ? items : ['None recorded'],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const topMargin = 16;
  const bottomMargin = 14;
  const sectionHeight = (pageHeight - topMargin - bottomMargin) / 4;

  rows.forEach((participant, index) => {
    const slot = index % 4;
    if (index > 0 && slot === 0) doc.addPage();

    const sectionTop = topMargin + slot * sectionHeight;
    const contentX = marginX + 4;
    const itemList = participant.items;
    const columnCount = itemList.length > 16 ? 3 : itemList.length > 6 ? 2 : 1;
    const itemsPerColumn = Math.ceil(itemList.length / columnCount);
    const columnGap = 5;
    const contentWidth = pageWidth - (contentX * 2);
    const columnWidth = (contentWidth - columnGap * (columnCount - 1)) / columnCount;
    const itemFontSize = itemList.length > 16 ? 6.5 : itemList.length > 8 ? 7 : 8;

    doc.setTextColor(DARK_BLUE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(participant.name, contentX, sectionTop + 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Organisation / Team: ${participant.organisation}`, contentX, sectionTop + 21);
    doc.setFontSize(8);
    doc.text('Items:', contentX, sectionTop + 30);

    doc.setFontSize(itemFontSize);
    const itemStartY = sectionTop + 37;
    const itemLineHeight = itemList.length > 16 ? 2.8 : 3.2;
    itemList.forEach((item, itemIndex) => {
      const column = Math.floor(itemIndex / itemsPerColumn);
      const row = itemIndex % itemsPerColumn;
      const lines = doc.splitTextToSize(`• ${item}`, columnWidth - 2);
      doc.text(lines, contentX + column * (columnWidth + columnGap), itemStartY + row * itemLineHeight);
    });

    if (slot < 3) {
      doc.setDrawColor(210, 220, 230);
      doc.setLineWidth(0.35);
      doc.line(marginX, sectionTop + sectionHeight, pageWidth - marginX, sectionTop + sectionHeight);
    }
  });

  const scopeName = scope.allTenants ? 'all-tenants' : 'tenant';
  doc.save(`participant-items-${scopeName}-${data.festivalId}.pdf`);
  return { participantCount: rows.length, itemCount: data.items.length, festivalId: data.festivalId };
}
