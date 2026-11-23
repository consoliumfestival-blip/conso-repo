import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Download, FileText, Printer, Square } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFestival } from '@/core/hooks/useFestival';
import { useFestivalCategories } from '@/core/hooks/useFestivalCategories';
import { useAuthStore } from '@/core/store/authStore';
import { SsfCard } from '@/components/ui/SsfCard';
import { SsfSelectMenu } from '@/components/ui/SsfSelectMenu';
import { ui } from '@/constants/designSystem';
import { loadAdminExportGroupMembers, loadAdminExportPeople, loadAdminExportRegistrations, loadAdminExportTeams, loadAdminParticipantCategories, loadAdminTeamExportRegistrations } from '@/services/adminParticipantListService';
import type { ExportAssignment, ExportItem, ExportParticipant } from '@/services/participantExportService';
import { scheduleService } from '@/services/scheduleService';

type ReportKind = 'program_list' | 'team_items' | 'participant_slips' | 'team_results' | 'festival_schedule' | 'venue_schedule' | 'organisation_schedule' | 'blank_schedule' | 'team_attendance' | 'chance_sheet';

const CATEGORY_EQUIVALENTS: Record<string, string> = {
  JUNIOR: 'JR', JR: 'JR', SENIOR: 'SR', SR: 'SR', CAMPUS: 'CA', CA: 'CA', GENERAL: 'GN', GN: 'GN',
};

function itemHasCategory(item: ExportItem, selectedCategory: string) {
  const target = CATEGORY_EQUIVALENTS[selectedCategory.trim().toUpperCase()] || selectedCategory.trim().toUpperCase();
  return item.category_codes?.some((code) => (CATEGORY_EQUIVALENTS[code.trim().toUpperCase()] || code.trim().toUpperCase()) === target) ?? false;
}

const REPORT_OPTIONS: { value: ReportKind; label: string; detail: string }[] = [
  { value: 'program_list', label: 'Program participant list', detail: 'Participants assigned to a selected program, with verification status.' },
  { value: 'team_items', label: 'Team item list', detail: 'A selected team’s participants grouped by program.' },
  { value: 'participant_slips', label: 'Participant slips', detail: 'Printable slips showing each participant’s assigned programs.' },
  { value: 'team_results', label: 'Selected team program results', detail: 'Stored published points, rank and grade for selected programs assigned to one team.' },
  { value: 'festival_schedule', label: 'Festival master schedule', detail: 'The complete festival schedule in the existing official PDF format.' },
  { value: 'venue_schedule', label: 'Venue-wise schedule', detail: 'The festival schedule using the existing venue-wise PDF format.' },
  { value: 'organisation_schedule', label: 'Organisation-wise schedule', detail: 'Schedule entries grouped with the participant list.' },
  { value: 'blank_schedule', label: 'Blank competition schedule', detail: 'Competition and category rows for writing in dates, times and venues.' },
  { value: 'team_attendance', label: 'Team-wise competition attendance', detail: 'Attendance summaries for completed competitions.' },
  { value: 'chance_sheet', label: 'Chance sheet', detail: 'The existing printable judging sheet for one program.' },
];

function Filter({ label, value, options, onChange, width, placeholder }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; width: '23%' | '48%' | '100%'; placeholder?: string }) {
  return <View style={{ flexBasis: width, flexGrow: 0, flexShrink: 1, minWidth: 170, gap: 7 }}>
    <Text style={{ color: ui.colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.7 }}>{label.toUpperCase()}</Text>
    <SsfSelectMenu value={value} options={options} onValueChange={onChange} accessibilityLabel={label} placeholder={placeholder ?? `All ${label.toLowerCase()}`} width={200} searchable={options.length > 7} keepInViewport />
  </View>;
}

export default function ReportsAndPrintouts() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const tenantId = useAuthStore((state) => state.tenant_id);
  const userId = useAuthStore((state) => state.user?.id);
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival, isLoading: festivalLoading, isError: festivalError, refetch: retryFestival } = useActiveFestival();
  const { data: rawItems = [], isLoading: itemsLoading, isError: itemsError, refetch: retryItems } = useItems(festival?.id);
  const { data: festivalCategories = [] } = useFestivalCategories(festival?.id, true);
  const [report, setReport] = useState<ReportKind>('program_list');
  const [fileType, setFileType] = useState<'PDF' | 'CSV'>('PDF');
  const [programScope, setProgramScope] = useState<'all' | 'selected'>('all');
  const [teamId, setTeamId] = useState('All');
  const [categoryCode, setCategoryCode] = useState('All');
  const [itemId, setItemId] = useState('All');
  const [teamResultItemIds, setTeamResultItemIds] = useState<Set<string>>(new Set());
  const [teamResultsProgramFilter, setTeamResultsProgramFilter] = useState<'published' | 'all'>('published');
  const [programSelectorOpen, setProgramSelectorOpen] = useState(false);
  const [programSearch, setProgramSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const participantReport = ['program_list', 'team_items', 'participant_slips', 'team_results'].includes(report);
  const scheduleReport = ['festival_schedule', 'venue_schedule', 'organisation_schedule', 'blank_schedule', 'team_attendance'].includes(report);
  const filterWidth = compact ? (width >= 480 ? '48%' : '100%') : '23%';

  const teamsQuery = useQuery({
    queryKey: ['reports', 'teams', tenantId, userId, festival?.id],
    queryFn: () => loadAdminExportTeams(festival!.id),
    enabled: !!userId && !!festival?.id && participantReport,
    retry: false,
  });
  const publishedResultItemsQuery = useQuery({
    queryKey: ['reports', 'leaderboard-published-item-ids', tenantId, festival?.id],
    queryFn: async () => {
      const { loadAdminLeaderboardPublishedItemIds } = await import('@/services/participantExportService');
      return loadAdminLeaderboardPublishedItemIds({ tenantId: tenantId!, festivalId: festival!.id });
    },
    enabled: !!tenantId && !!festival?.id && report === 'team_results' && teamResultsProgramFilter === 'published',
    retry: false,
  });
  const scheduleQuery = useQuery({
    queryKey: ['reports', 'schedules', tenantId, userId, festival?.id],
    queryFn: () => scheduleService.listSchedules<any>(tenantId!, festival!.id),
    enabled: !!tenantId && !!userId && !!festival?.id && scheduleReport,
    retry: false,
  });
  const legacyCategoriesQuery = useQuery({
    queryKey: ['reports', 'categories', tenantId, userId],
    queryFn: loadAdminParticipantCategories,
    enabled: !!userId && !!festival?.id && festival?.festival_template !== 'college_fest',
    retry: false,
  });
  const items = useMemo(() => (rawItems as any[]).filter((row) => row?.id).map((row): ExportItem => ({
    id: row.id,
    item_code: row.item_code,
    item_name_en: row.item_name_en,
    item_name_ml: row.item_name_ml,
    category_codes: Array.isArray(row.category_codes) ? row.category_codes : row.category_codes ? [row.category_codes] : [],
    participation_type: row.participation_type,
  })).sort((a, b) => `${a.item_code || ''} ${a.item_name_en || a.item_name_ml || ''}`.localeCompare(`${b.item_code || ''} ${b.item_name_en || b.item_name_ml || ''}`)), [rawItems]);
  const categoryOptions = useMemo(() => {
    const values = festival?.festival_template === 'college_fest'
      ? festivalCategories.map((entry: any) => ({ value: entry.code, label: entry.name }))
      : (legacyCategoriesQuery.data ?? []).map((code) => ({ value: code, label: code }));
    return [{ value: 'All', label: 'All categories' }, ...values.filter((entry) => entry.value.toLowerCase() !== 'gn')];
  }, [festival?.festival_template, festivalCategories, legacyCategoriesQuery.data]);
  const programOptions = useMemo(() => [{ value: 'All', label: 'All permitted programs' }, ...items.map((item) => ({
    value: item.id,
    label: `${item.item_code ? `${item.item_code} · ` : ''}${item.item_name_en || item.item_name_ml || 'Unnamed program'}${item.category_codes?.length ? ` · ${item.category_codes.join(', ')}` : ''}`,
  }))], [items]);
  const reportMeta = REPORT_OPTIONS.find((option) => option.value === report)!;
  const reportFormatOptions = report === 'program_list'
    ? [{ value: 'PDF', label: 'PDF' }, { value: 'CSV', label: 'CSV' }]
    : [{ value: 'PDF', label: 'PDF' }];
  const selectedItem = items.find((candidate) => candidate.id === itemId);
  const visiblePrograms = useMemo(() => items.filter((item) => categoryCode === 'All' || itemHasCategory(item, categoryCode)), [items, categoryCode]);
  const teamResultsPrograms = useMemo(() => teamResultsProgramFilter === 'published'
    ? visiblePrograms.filter((item) => publishedResultItemsQuery.data?.includes(item.id))
    : visiblePrograms, [visiblePrograms, teamResultsProgramFilter, publishedResultItemsQuery.data]);
  const selectedTeamResultItemCount = teamResultsPrograms.filter((item) => teamResultItemIds.has(item.id)).length;
  const matchingPrograms = useMemo(() => {
    const query = programSearch.trim().toLowerCase();
    return teamResultsPrograms.filter((item) => !query || [item.item_code, item.item_name_en, item.item_name_ml].some((value) => value?.toLowerCase().includes(query)));
  }, [teamResultsPrograms, programSearch]);
  const visibleProgramOptions = useMemo(() => [{ value: 'All', label: 'All permitted programs' }, ...visiblePrograms.map((item) => programOptions.find((option) => option.value === item.id)!).filter(Boolean)], [visiblePrograms, programOptions]);
  const reportItems = items.filter((item) => (itemId === 'All' || item.id === itemId)
    && (categoryCode === 'All' || itemHasCategory(item, categoryCode)));
  const selectedTeam = (teamsQuery.data ?? []).find((team) => team.id === teamId);
  const needsTeam = report === 'team_items' || report === 'participant_slips';
  const needsSelectedItem = (report === 'program_list' && (fileType === 'PDF' || programScope === 'selected'))
    || report === 'team_items' || report === 'chance_sheet';
  const matchingSchedules = (scheduleQuery.data ?? []).filter((row: any) => reportItems.some((item) => item.id === row.item_id));
  const downloadBlocker = (() => {
    if (busy) return 'Preparing your report…';
    if (!tenantId || !userId) return 'Sign in to an admin account to download reports.';
    if (festivalLoading) return 'Loading the active festival…';
    if (festivalError) return 'Could not load the active festival. Retry the request.';
    if (!festival?.id) return 'No active festival is available for this account.';
    if (itemsLoading) return 'Loading programs…';
    if (itemsError) return 'Could not load programs. Retry the request.';
    if (participantReport && (needsTeam || teamId !== 'All' || report === 'team_results')) {
      if (teamsQuery.isLoading) return 'Loading team options…';
      if (teamsQuery.isError) return 'Could not load team options. Retry the request.';
      if (needsTeam && !selectedTeam) return 'Select a team for this report.';
      if (teamId !== 'All' && !selectedTeam) return 'Select an available team.';
    }
    if (report === 'team_results' && teamResultsProgramFilter === 'published') {
      if (publishedResultItemsQuery.isLoading) return 'Loading competitions published in Leaderboard Management…';
      if (publishedResultItemsQuery.isError) return 'Could not load Leaderboard Management published competitions. Retry the request.';
    }
    if (report === 'team_results' && !teamResultsPrograms.some((program) => teamResultItemIds.has(program.id))) return 'Select one or more eligible programs for this report.';
    if (needsSelectedItem && !selectedItem) return report === 'program_list' && fileType === 'CSV'
      ? 'Select a program for the selected-program CSV.'
      : 'Select a program for this PDF report.';
    if (scheduleReport) {
      if (report === 'blank_schedule') return reportItems.length ? null : 'No programs match these filters.';
      if (scheduleQuery.isLoading) return 'Loading the schedule…';
      if (scheduleQuery.isError) return 'Could not load the schedule. Retry the request.';
      if (!matchingSchedules.length) return 'No scheduled programs match these filters.';
    }
    return null;
  })();
  const canDownload = !downloadBlocker;

  const download = async () => {
    setBusy(true);
    setErrorMessage('');
    try {
      if (!festival?.id) throw new Error('Select an active festival before creating a report.');
      if (report === 'program_list' && fileType === 'CSV') {
        const { loadAllAdminParticipants } = await import('@/services/adminParticipantListService');
        const participants = await loadAllAdminParticipants({ search: '', category: categoryCode === 'All' ? null : categoryCode, status: null, gender: null, festivalId: festival.id, itemId: itemId === 'All' ? null : itemId, competitionCategory: null });
        if (programScope === 'selected' && itemId === 'All') throw new Error('Select a program for the selected program scope.');
        const scoped = teamId === 'All' ? participants : participants.filter((person: any) => person.organisation_id === teamId);
        const { downloadParticipantsCsv } = await import('@/services/participantExportService');
        await downloadParticipantsCsv(scoped.map((person: any): ExportParticipant => ({
          id: person.id, name: person.name, chest_number: person.chest_number,
          organisation_id: person.organisation_id, organisation_name: person.organisations?.name,
          category_code: person.category_code, gender: person.gender, age: person.age,
          status: person.status, created_at: person.created_at, registered_by: person.registered_by,
        })));
        return;
      }
      if (report === 'chance_sheet') {
        if (!tenantId || !selectedItem) throw new Error('Select a program before generating its chance sheet.');
        const [{ chanceSheetService }, { downloadChanceSheetPdf }] = await Promise.all([
          import('@/services/chanceSheetService'),
          import('@/services/schedulePdfService'),
        ]);
        const rows = await chanceSheetService.loadRows({ tenantId, festivalId: festival.id, itemId: selectedItem.id });
        const participationType = ['group', 'general', 'general_team'].includes(String(selectedItem.participation_type || '').toLowerCase()) ? 'group' : 'individual';
        await downloadChanceSheetPdf({
          festivalName: festival.custom_name,
          festivalYear: festival.festival_year,
          itemCode: selectedItem.item_code,
          itemName: selectedItem.item_name_en || selectedItem.item_name_ml || 'Unnamed program',
          category: selectedItem.category_codes?.join(', ') || 'All',
          participationType,
          rows,
        });
        return;
      }
      if (scheduleReport) {
        const scheduleItemIds = reportItems.map((item) => item.id);
        const selectedSchedules = matchingSchedules;
        if (report === 'blank_schedule') {
          const { downloadBlankSchedulePdf } = await import('@/services/schedulePdfService');
          downloadBlankSchedulePdf({
            festivalName: festival.custom_name || `Festival ${festival.festival_year}`,
            items: reportItems,
          });
          return;
        }
        if (!selectedSchedules.length) throw new Error('No scheduled programs match the selected filters.');
        const { downloadAdminSchedulePdf, downloadTeamAttendancePdf } = await import('@/services/schedulePdfService');
        if (report === 'team_attendance') {
          const attendanceData = await (await import('@/services/participantExportService')).loadAdminScheduleAttendanceData(festival.id, scheduleItemIds);
          downloadTeamAttendancePdf({
            festivalName: festival.custom_name || `Festival ${festival.festival_year}`,
            schedules: selectedSchedules,
            registrations: attendanceData.registrations,
            groupMembers: attendanceData.groupMembers,
            participants: attendanceData.participants.map((person) => ({
              id: person.id, name: person.name, chest_number: person.chest_number,
              category_code: person.category_code, organisation_id: person.organisation_id,
              organisations: { name: person.organisation_name },
            })),
            organisations: attendanceData.organisations,
          });
        } else {
          const mode = report === 'venue_schedule' ? 'venue' : report === 'organisation_schedule' ? 'organisation' : 'master';
          let registrations: any[];
          let participants: any[] = [];
          if (mode === 'organisation') {
            const attendanceData = await (await import('@/services/participantExportService')).loadAdminScheduleAttendanceData(festival.id, scheduleItemIds);
            registrations = attendanceData.registrations;
            participants = attendanceData.participants.map((person) => ({
              id: person.id, name: person.name, chest_number: person.chest_number,
              category_code: person.category_code, organisation_id: person.organisation_id,
              organisations: { name: person.organisation_name },
            }));
          } else {
            registrations = await loadAdminExportRegistrations(festival.id, null);
          }
          downloadAdminSchedulePdf({
            mode,
            itemId: itemId === 'All' ? null : itemId,
            itemCategory: categoryCode === 'All' ? null : categoryCode,
            festivalName: festival.custom_name || `Festival ${festival.festival_year}`,
            schedules: selectedSchedules,
            registrations,
            participants,
          });
        }
        return;
      }
      if (report === 'program_list' && fileType === 'PDF' && !selectedItem) throw new Error('Select a program to create this report.');
      if (needsTeam && !selectedTeam) throw new Error('Select a team to create this report.');
      if (report === 'team_results' && teamId !== 'All' && !selectedTeam) throw new Error('Select a team to create this report.');
      const selectedTeamPeople = selectedTeam ? await loadAdminExportPeople(festival.id, selectedTeam.id, null) : null;
      const selectedTeamParticipantIds = selectedTeamPeople?.map((person: any) => person.id) ?? [];
      const registrations = selectedTeam
        ? await loadAdminTeamExportRegistrations(festival.id, selectedTeam.id, selectedTeamParticipantIds)
        : await loadAdminExportRegistrations(festival.id, null);
      const selectedResultItems = teamResultsPrograms.filter((item) => teamResultItemIds.has(item.id));
      const selectedResultItemIds = selectedResultItems.map((item) => item.id);
      const teamRegistrations = registrations.filter((row: any) => report === 'team_results'
        ? selectedResultItemIds.includes(row.item_id)
        : itemId === 'All' || row.item_id === itemId);
      const groupMembers = await loadAdminExportGroupMembers(teamRegistrations.filter((row: any) => row.status !== 'rejected'));
      const participantIds = Array.from(new Set([
        ...teamRegistrations.map((row: any) => row.participant_id).filter(Boolean),
        ...groupMembers.map((member) => member.participant_id),
      ])) as string[];
      const rawPeople = selectedTeamPeople ?? (participantIds.length
        ? await loadAdminExportPeople(festival.id, null, participantIds)
        : []);
      let people: ExportParticipant[] = rawPeople.map((person: any) => ({
        id: person.id, name: person.name, chest_number: person.chest_number,
        organisation_id: person.organisation_id, organisation_name: person.organisations?.name,
        category_code: person.category_code, gender: person.gender, age: person.age,
        status: person.status, created_at: person.created_at, registered_by: person.registered_by,
      }));
      if (categoryCode !== 'All') people = people.filter((person) => person.category_code?.toLowerCase() === categoryCode.toLowerCase());
      const personById = new Map(people.map((person) => [person.id, person]));
      const membersByRegistration = new Map<string, string[]>();
      groupMembers.forEach(({ registration_id, participant_id }) => membersByRegistration.set(registration_id, [...(membersByRegistration.get(registration_id) ?? []), participant_id]));
      const assignments: ExportAssignment[] = teamRegistrations.flatMap((registration: any) => {
        if (!registration.item_id) return [];
        const ids: string[] = registration.participant_id ? [registration.participant_id] : membersByRegistration.get(registration.id) ?? [];
        return ids.filter((id) => personById.has(id)).map((id) => ({
          registration_id: registration.id, participant_id: id, item_id: registration.item_id,
          entry_kind: registration.entry_kind,
          registration_status: registration.status, is_verified: registration.is_verified,
          organisation_id: registration.organisation_id || personById.get(id)?.organisation_id,
          organisation_name: personById.get(id)?.organisation_name,
        }));
      });
      if (report === 'team_results') {
        if (!tenantId) throw new Error('Sign in to an admin account to create this report.');
        if (!selectedResultItemIds.length) throw new Error('Select one or more programs for this report.');
        const { downloadTeamSelectedResultsPdf, loadAdminPublishedItemResults } = await import('@/services/participantExportService');
        const results = await loadAdminPublishedItemResults({
          tenantId,
          festivalId: festival.id,
          registrationIds: teamRegistrations.map((registration: any) => registration.id),
          itemIds: selectedResultItemIds,
        });
        downloadTeamSelectedResultsPdf({
          teamName: selectedTeam?.label,
          groupByTeam: !selectedTeam,
          festivalName: festival.custom_name || `Festival ${festival.festival_year}`,
          selectedItemIds: selectedResultItemIds,
          participants: people,
          items,
          assignments,
          results,
        });
        return;
      }
      const { downloadItemVerificationPdf, downloadTeamItemParticipantsPdf, downloadTeamParticipantSlipsPdf } = await import('@/services/participantExportService');
      const festivalName = festival.custom_name || `Festival ${festival.festival_year}`;
      if (report === 'program_list') {
        const scopedAssignments = teamId === 'All' ? assignments : assignments.filter((entry) => entry.organisation_id === teamId);
        downloadItemVerificationPdf({ festivalName, item: selectedItem!, participants: people, assignments: scopedAssignments, sortBy: 'team' });
      } else if (report === 'team_items') {
        downloadTeamItemParticipantsPdf({ selectedItemIds: [selectedItem!.id], teamName: selectedTeam!.label, teamId: selectedTeam!.id, participants: people, items, assignments });
      } else {
        downloadTeamParticipantSlipsPdf({ teamName: selectedTeam!.label, participants: people, items, assignments });
      }
    } catch (cause: any) {
      const message = cause?.message || 'Unable to create the report.';
      setErrorMessage(message);
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Report unavailable', message);
    } finally {
      setBusy(false);
    }
  };

  return <ScrollView contentContainerStyle={{ padding: compact ? 16 : 28, gap: 18, maxWidth: 1440, width: '100%', alignSelf: 'center' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Printer size={21} color={ui.colors.primary} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 23, fontWeight: '800', color: ui.colors.text }}>Reports & printouts</Text><Text style={{ marginTop: 3, fontSize: 12, color: ui.colors.textMuted }}>Build and download reports for {festival?.custom_name || 'the active festival'}.</Text></View>
    </View>

    <View style={{ flexDirection: compact ? 'column' : 'row', alignItems: 'stretch', gap: 16 }}>
      <SsfCard style={{ flex: 1, gap: 18 }}>
        <View><Text style={{ fontSize: 15, fontWeight: '800', color: ui.colors.text }}>Build a report</Text><Text style={{ marginTop: 4, fontSize: 12, color: ui.colors.textMuted }}>{reportMeta.detail}</Text></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14 }}>
          <Filter width={filterWidth} label="Report" value={report} onChange={(value) => { setReport(value as ReportKind); if (value !== 'program_list') setFileType('PDF'); if (value === 'chance_sheet') setCategoryCode('All'); }} options={REPORT_OPTIONS.map(({ value, label }) => ({ value, label }))} />
          {report === 'program_list' ? <Filter width={filterWidth} label="File type" value={fileType} onChange={(value) => setFileType(value as 'PDF' | 'CSV')} options={reportFormatOptions} /> : null}
          {report === 'program_list' && fileType === 'CSV' ? <Filter width={filterWidth} label="Programs" value={programScope} onChange={(value) => setProgramScope(value as 'all' | 'selected')} options={[{ value: 'all', label: 'All permitted programs' }, { value: 'selected', label: 'Selected program only' }]} /> : null}
          {participantReport ? <Filter width={filterWidth} label="Team" value={teamId} onChange={(value) => setTeamId(value)} options={[...(needsTeam ? [] : [{ value: 'All', label: report === 'team_results' ? 'All teams' : 'All permitted teams' }]), ...(teamsQuery.data ?? []).map((team) => ({ value: team.id, label: team.label }))]} placeholder={needsTeam ? 'Select a team' : undefined} /> : null}
          {report !== 'chance_sheet' ? <Filter width={filterWidth} label="Category" value={categoryCode} onChange={(value) => { setCategoryCode(value); setItemId('All'); setTeamResultItemIds((current) => new Set([...current].filter((id) => items.some((item) => item.id === id && (value === 'All' || itemHasCategory(item, value)))))); }} options={categoryOptions} /> : null}
          {report !== 'team_results' ? <Filter width={filterWidth} label="Program" value={itemId} onChange={setItemId} options={needsSelectedItem ? visibleProgramOptions.filter((option) => option.value !== 'All') : visibleProgramOptions} placeholder={needsSelectedItem ? 'Select a program' : undefined} /> : null}
        </View>
        {report === 'team_results' ? <View style={{ gap: 8 }}>
          <Filter width="100%" label="Program filter" value={teamResultsProgramFilter} onChange={(value) => setTeamResultsProgramFilter(value as 'published' | 'all')} options={[{ value: 'published', label: 'Published in Leaderboard Management' }, { value: 'all', label: 'All programs' }]} />
          <Text style={{ color: ui.colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.7 }}>SELECT PROGRAMS ({selectedTeamResultItemCount} selected)</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Select programs" accessibilityState={{ expanded: programSelectorOpen }} onPress={() => setProgramSelectorOpen((open) => !open)} style={{ minHeight: 42, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: ui.colors.surface }}>
            <Text style={{ color: ui.colors.text, fontSize: 12, fontWeight: '600' }}>{selectedTeamResultItemCount ? `${selectedTeamResultItemCount} programs selected` : 'Select programs'}</Text>
            <ChevronDown size={16} color={ui.colors.textMuted} />
          </TouchableOpacity>
          {programSelectorOpen ? <View style={{ borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, padding: 10, gap: 8, backgroundColor: ui.colors.surface }}>
            <TextInput accessibilityLabel="Search programs" placeholder="Search programs" placeholderTextColor={ui.colors.textMuted} value={programSearch} onChangeText={setProgramSearch} style={{ minHeight: 38, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 7, paddingHorizontal: 10, color: ui.colors.text, fontSize: 12 }} />
            <TouchableOpacity accessibilityRole="button" disabled={!teamResultsPrograms.length} onPress={() => setTeamResultItemIds(new Set(teamResultsPrograms.map((item) => item.id)))} style={{ alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 6, backgroundColor: ui.colors.buttonPrimary, opacity: teamResultsPrograms.length ? 1 : 0.5 }}><Text style={{ color: ui.colors.buttonForeground, fontSize: 12, fontWeight: '700' }}>Select all</Text></TouchableOpacity>
            {matchingPrograms.length ? <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {matchingPrograms.map((item) => {
              const isSelected = teamResultItemIds.has(item.id);
              return <TouchableOpacity key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: isSelected }} onPress={() => setTeamResultItemIds((current) => {
                const next = new Set(current);
                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                return next;
              })} style={{ minHeight: 36, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: isSelected ? ui.colors.primary : ui.colors.border, borderRadius: 7, paddingHorizontal: 9, backgroundColor: ui.colors.surface }}>
                {isSelected ? <Check size={14} color={ui.colors.primary} /> : <Square size={14} color={ui.colors.textMuted} />}
                <Text numberOfLines={1} style={{ maxWidth: compact ? width - 100 : 310, fontSize: 11, fontWeight: isSelected ? '700' : '500', color: ui.colors.text }}>{item.item_code ? `${item.item_code} · ` : ''}{item.item_name_en || item.item_name_ml || 'Unnamed program'}</Text>
              </TouchableOpacity>;
            })}
          </ScrollView> : <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>{teamResultsProgramFilter === 'published' && publishedResultItemsQuery.isLoading ? 'Loading Leaderboard Management published competitions…' : teamResultsProgramFilter === 'published' ? 'No Leaderboard Management published competitions found.' : 'No programs found.'}</Text>}
          </View> : null}
        </View> : null}
        {((participantReport && teamsQuery.isLoading) || itemsLoading || festivalLoading || (scheduleReport && scheduleQuery.isLoading)) ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator size="small" color={ui.colors.primary} /><Text style={{ fontSize: 12, color: ui.colors.textMuted }}>Loading report options…</Text></View> : null}
        {participantReport && teamsQuery.isError ? <Text accessibilityRole="alert" style={{ color: ui.colors.danger, fontSize: 12 }}>Could not load team options. Retry before exporting a team report.</Text> : null}
        {report === 'team_results' && publishedResultItemsQuery.isError ? <TouchableOpacity accessibilityRole="button" onPress={() => void publishedResultItemsQuery.refetch()} style={{ paddingVertical: 8 }}><Text style={{ color: ui.colors.primary, fontWeight: '700', fontSize: 12 }}>Retry published competitions</Text></TouchableOpacity> : null}
        {festivalError ? <TouchableOpacity accessibilityRole="button" onPress={() => void retryFestival()} style={{ paddingVertical: 8 }}><Text style={{ color: ui.colors.primary, fontWeight: '700', fontSize: 12 }}>Retry active festival</Text></TouchableOpacity> : null}
        {!festivalLoading && !festivalError && !festival?.id ? <TouchableOpacity accessibilityRole="button" onPress={() => void retryFestival()} style={{ paddingVertical: 8 }}><Text style={{ color: ui.colors.primary, fontWeight: '700', fontSize: 12 }}>Check active festival again</Text></TouchableOpacity> : null}
        {itemsError ? <TouchableOpacity accessibilityRole="button" onPress={() => void retryItems()} style={{ paddingVertical: 8 }}><Text style={{ color: ui.colors.primary, fontWeight: '700', fontSize: 12 }}>Retry programs</Text></TouchableOpacity> : null}
        {participantReport && teamsQuery.isError ? <TouchableOpacity accessibilityRole="button" onPress={() => void teamsQuery.refetch()} style={{ paddingVertical: 8 }}><Text style={{ color: ui.colors.primary, fontWeight: '700', fontSize: 12 }}>Retry teams</Text></TouchableOpacity> : null}
        {scheduleReport && scheduleQuery.isError ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><Text accessibilityRole="alert" style={{ flex: 1, color: ui.colors.danger, fontSize: 12 }}>Could not load the schedule.</Text><TouchableOpacity accessibilityRole="button" onPress={() => void scheduleQuery.refetch()} style={{ paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: ui.colors.primary, fontWeight: '700', fontSize: 12 }}>Retry</Text></TouchableOpacity></View> : null}
        {errorMessage ? <Text accessibilityRole="alert" style={{ color: ui.colors.danger, fontSize: 12 }}>{errorMessage}</Text> : null}
      </SsfCard>

      <SsfCard style={{ width: compact ? '100%' : 300, gap: 16, alignSelf: compact ? 'stretch' : 'flex-start' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><FileText size={18} color={ui.colors.primary} /><Text style={{ fontSize: 15, fontWeight: '800', color: ui.colors.text }}>Download</Text></View>
        <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Your current access limits the records in this report.</Text>
        <View style={{ gap: 11, paddingVertical: 2 }}>
          {[['Report', reportMeta.label], ['Programs', report === 'team_results' ? `${teamResultsPrograms.filter((item) => teamResultItemIds.has(item.id)).length} selected` : itemId === 'All' ? 'All permitted programs' : selectedItem?.item_name_en || selectedItem?.item_name_ml || selectedItem?.item_code || 'Selected program'], ...(participantReport ? [['Team', selectedTeam?.label || (teamId === 'All' ? (report === 'team_results' ? 'All teams' : 'All permitted teams') : 'Selected team')]] : []), ...(report !== 'chance_sheet' ? [['Category', categoryCode === 'All' ? 'All permitted' : categoryCode]] : []), ['File type', fileType]].map(([label, value]) => <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: ui.colors.textMuted, fontSize: 11 }}>{label}</Text><Text numberOfLines={2} style={{ flex: 1, textAlign: 'right', color: ui.colors.text, fontSize: 11, fontWeight: '600' }}>{value}</Text></View>)}
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !canDownload, busy }} disabled={!canDownload} onPress={download} style={{ minHeight: 44, borderRadius: 8, backgroundColor: ui.colors.buttonPrimary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: canDownload ? 1 : 0.55 }}>
          {busy ? <ActivityIndicator size="small" color={ui.colors.buttonForeground} /> : <Download size={16} color={ui.colors.buttonForeground} />}
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{busy ? 'Preparing report…' : 'Download report'}</Text>
        </TouchableOpacity>
        {downloadBlocker ? <Text accessibilityRole="alert" style={{ color: ui.colors.textMuted, fontSize: 12, lineHeight: 17 }}>{downloadBlocker}</Text> : null}
      </SsfCard>
    </View>

    <SsfCard style={{ gap: 14 }}>
      <View><Text style={{ fontSize: 15, fontWeight: '800', color: ui.colors.text }}>Other existing PDF tools</Text><Text style={{ marginTop: 4, fontSize: 12, color: ui.colors.textMuted }}>These print layouts remain on their original pages and keep their current options.</Text></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[
          { key: 'substitution_requests', label: 'Pending substitution requests', route: '/(admin)/participants/programs' },
          { key: 'chest_cards', label: 'Chest cards (A4 / A3)', route: '/(admin)/participants/chest-cards' },
          { key: 'judge_evaluation', label: 'Judge evaluation sheet', route: '/(admin)/judges' },
          { key: 'leaderboard_media', label: 'Leaderboard PDF assets', route: '/(admin)/settings/leaderboard/media-center' },
        ].map((entry) => <TouchableOpacity key={entry.key} accessibilityRole="button" onPress={() => router.push(entry.route as any)} style={{ minHeight: 42, paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, justifyContent: 'center' }}><Text style={{ color: ui.colors.primary, fontSize: 12, fontWeight: '700' }}>{entry.label}</Text></TouchableOpacity>)}
      </View>
    </SsfCard>
  </ScrollView>;
}

