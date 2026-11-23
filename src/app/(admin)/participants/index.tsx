import { coreColor } from '@/constants/coreTheme';
import { ui } from '@/constants/designSystem';
import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCodeLetterUpdates } from '../../../core/hooks/useCodeLetterUpdates';
import { AdminParticipantFilters, loadAdminParticipantCategories, loadAdminParticipantPage, loadAllAdminParticipants, loadAdminExportTeams, loadAdminExportRegistrations, loadAdminTeamExportRegistrations, loadAdminExportGroupMembers, loadAdminExportPeople } from '../../../services/adminParticipantListService';
import { View, Text, ScrollView, TouchableOpacity, Pressable, ActivityIndicator, Alert, Platform, TextInput, useWindowDimensions } from 'react-native';
import { Modal } from '@/components/ui/CoreModal';
import { participantService } from '@/services/participantService';
import { supabase } from '@/core/config/supabase';
import { useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useAuthStore } from '../../../core/store/authStore';
import { useFestival } from '../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../core/hooks/useFestivalCategories';
import { UserPlus, ChevronRight, Upload, CheckSquare, Square, X, Search, FileDown, CheckCircle, Trash2, RotateCcw } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SsfSelectMenu } from '../../../components/ui/SsfSelectMenu';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import { ParticipantExportModal, ParticipantExportKind, ExportChoice } from '@/components/participants/ParticipantExportModal';
import { AdminBulkAddParticipantsModal } from '@/components/participants/AdminBulkAddParticipantsModal';
import type { ExportAssignment, ExportItem, ExportParticipant, ExportSort } from '@/services/participantExportService';

type CompactFilterProps = {
  label: string;
  items: (string | { id: string; label: string })[];
  selectedValue: string;
  onSelect: (value: string) => void;
  width: number;
  searchable?: boolean;
  autoFocusSearch?: boolean;
  keepInViewport?: boolean;
};

function CompactFilter({ label, items, selectedValue, onSelect, width, searchable, autoFocusSearch, keepInViewport }: CompactFilterProps) {
  return (
    <SsfSelectMenu
      value={selectedValue}
      onValueChange={onSelect}
      accessibilityLabel={`Filter by ${label}`}
      width={width}
      compact
      active={selectedValue !== 'All'}
      searchable={searchable}
      autoFocusSearch={autoFocusSearch}
      keepInViewport={keepInViewport}
      options={items.map((item) => ({
        label: typeof item === 'string'
          ? (item === 'All' ? `${label}: All` : `${label}: ${item}`)
          : (item.id === 'All' ? `${label}: All` : item.label),
        value: typeof item === 'string' ? item : item.id,
      }))}
    />
  );
}

export default function ParticipantsList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tenantId = useAuthStore(state => state.tenant_id);
  const userId = useAuthStore(state => state.user?.id);
  const currentSelectionScope = `${tenantId ?? 'no-tenant'}:${userId ?? 'no-user'}`;
  const [selectionScope, setSelectionScope] = useState(currentSelectionScope);
  const { width } = useWindowDimensions();
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const isCompactParticipantLayout = width < 1200;
  const isCardLayout = width >= 768;
  const cardColumns = width >= 1440 ? 4 : width >= 1100 ? 3 : width >= 820 ? 2 : 1;
  const phoneFilterWidth = width < 640
    ? Math.max(120, Math.floor((width - 32) / 2))
    : width < 1200
      ? Math.floor((width - 52) / 3)
      : undefined;
  const { useActiveFestival } = useFestival();
  const { data: activeFestival, isLoading: festivalLoading, isError: festivalError } = useActiveFestival();
  useCodeLetterUpdates(activeFestival?.id ? `festival:${activeFestival.id}` : null, () => queryClient.invalidateQueries({ queryKey: ['participants', 'admin-page'] }), undefined, true, false);
  const isCollegeFest = activeFestival?.festival_template === 'college_fest';
  const { data: festivalCategories = [] } = useFestivalCategories(isCollegeFest ? activeFestival?.id : undefined, true);
  const { useItems } = useFestival();
  const { data: activeItems = [], isLoading: isLoadingItems } = useItems(activeFestival?.id);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportKind, setExportKind] = useState<ParticipantExportKind>('item_verification');
  const [exportTeamId, setExportTeamId] = useState('');
  const [exportItemId, setExportItemId] = useState('');
  const [exportSort, setExportSort] = useState<ExportSort>('team');
  
  const {
    updateStatus,
    deleteMultiple,
    deleteParticipant,
    approveMultiple,
    isDeleting,
    isApprovingMultiple
  } = useParticipants(undefined, { loadList: false });

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300); return () => clearTimeout(timer); }, [searchQuery]);
  const searchPending = searchQuery !== debouncedSearch;
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedGender, setSelectedGender] = useState<string>('All');
  const [page, setPage] = useState(0);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const operationScope = useRef('');
  const categoryQuery = useQuery({
    queryKey: ['participants', 'admin-categories', tenantId, userId],
    queryFn: loadAdminParticipantCategories,
    enabled: !!userId && !festivalLoading && !festivalError && !isCollegeFest,
    retry: false,
  });

  const categories = isCollegeFest
    ? [
        'All',
        ...festivalCategories
          .filter((category) => category.code.toLowerCase() !== 'gn')
          .map((category) => ({ id: category.code, label: category.name })),
      ]
    : [
        'All',
        ...(categoryQuery.data ?? []),
      ];
  const statuses = ['All', 'Pending', 'Approved', 'Rejected'];
  const genders = ['All', 'Boys', 'Girls'];
  const filters: AdminParticipantFilters = {
    search: debouncedSearch, category: selectedCategory === 'All' ? null : selectedCategory,
    status: selectedStatus === 'All' ? null : selectedStatus,
    gender: selectedGender === 'All' ? null : selectedGender,
    festivalId: activeFestival?.id ?? null,
    itemId: null,
    competitionCategory: null,
  };
  const scopeKey = JSON.stringify([currentSelectionScope, filters, searchQuery]);
  operationScope.current = scopeKey;
  const pageQuery = useQuery({
    queryKey: ['participants', 'admin-page', tenantId, userId, filters, page],
    queryFn: ({ signal }) => loadAdminParticipantPage(filters, page, 50, signal),
    enabled: !!userId && !searchPending,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const filteredParticipants = pageQuery.data?.participants ?? [];
  const resultCount = pageQuery.data?.count ?? 0;
  const isLoadingList = searchPending || pageQuery.isLoading;
  const listError = pageQuery.error;
  const retryList = () => pageQuery.refetch();
  const retryCategories = () => categoryQuery.refetch();
  useEffect(() => { if (page > 0 && pageQuery.data && page * 50 >= pageQuery.data.count) setPage(Math.max(0, Math.ceil(pageQuery.data.count / 50) - 1)); }, [page, pageQuery.data]);


  // Bulk action state
  const [selectMode, setSelectMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [programsTarget, setProgramsTarget] = useState<{ id: string; name: string } | null>(null);
  const programsQuery = useQuery({
    queryKey: ['participants', 'card-programs', tenantId, userId, activeFestival?.id, programsTarget?.id],
    enabled: !!programsTarget && !!userId,
    queryFn: () => participantService.getParticipantRegistrations<any>(programsTarget!.id),
  });
  const registrationIds = (programsQuery.data ?? []).map((registration: any) => registration.id as string);
  const publishedResultsQuery = useQuery({
    queryKey: ['participants', 'card-program-results', tenantId, userId, activeFestival?.id, programsTarget?.id, registrationIds],
    enabled: !!programsTarget && programsQuery.isSuccess && !!activeFestival?.id,
    queryFn: async () => {
      if (registrationIds.length === 0) return [];
      let query = supabase.from('results')
        .select('registration_id,rank,grade,points_awarded,result_status')
        .eq('festival_id', activeFestival!.id)
        .eq('published', true)
        .in('registration_id', registrationIds);
      if (tenantId) query = query.eq('tenant_id', tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).filter((result) => result.result_status == null || result.result_status === 'published');
    },
  });
  const [selectedStatusById, setSelectedStatusById] = useState<Map<string, string>>(new Map());
  const selected = new Set(selectedStatusById.keys());
  const approvableSelectedIds = Array.from(selected).filter((id) => (selectedStatusById.get(id) || 'pending').toLowerCase() !== 'approved');
  const selectionScopeIsCurrent = selectionScope === currentSelectionScope;
  const selectionScopeMatchesSession = () => {
    const currentAuth = useAuthStore.getState();
    return selectionScope === `${currentAuth.tenant_id ?? 'no-tenant'}:${currentAuth.user?.id ?? 'no-user'}`;
  };

  useEffect(() => {
    if (selectionScope === currentSelectionScope) return;
    setSelectedStatusById(new Map());
    setSelectMode(false);
    setIsExportOpen(false);
    setDeleteTarget(null);
    setProgramsTarget(null);
    setIsBulkAddOpen(false);
    setSelectionScope(currentSelectionScope);
  }, [currentSelectionScope, selectionScope]);
  useEffect(() => {
    setDeleteTarget(null);
    setProgramsTarget(null);
  }, [activeFestival?.id]);

  const processingBulk = isDeleting || isApprovingMultiple || isSelectingAll;

  const needsExportTeam = exportKind === 'slips' || exportKind === 'team_items';
  const exportTeamsQuery = useQuery({
    queryKey: ['participants', 'admin-export-teams', tenantId, userId, activeFestival?.id],
    queryFn: () => loadAdminExportTeams(activeFestival!.id),
    enabled: isExportOpen && needsExportTeam && !!activeFestival?.id && !!userId,
  });
  const exportTeams: ExportChoice[] = exportTeamsQuery.data ?? [];
  useEffect(() => {
    if (isExportOpen && needsExportTeam && exportTeamsQuery.data && exportTeamId && !exportTeamsQuery.data.some(team => team.id === exportTeamId)) {
      setExportTeamId('');
    }
  }, [isExportOpen, needsExportTeam, exportTeamsQuery.data, exportTeamId]);
  const exportItems: ExportChoice[] = (activeItems as any[])
    .filter((item: any) => item?.id)
    .map((item: any) => ({ id: item.id, label: item.item_code ? `${item.item_code} · ${item.item_name_en || item.item_name_ml || 'Unnamed item'}${item.category_codes?.length ? ` · ${item.category_codes.join(', ')}` : ''}` : item.item_name_en || item.item_name_ml || 'Unnamed item' }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const teamReportItemsQuery = useQuery({
    queryKey: ['participants', 'team-report-items', tenantId, userId, activeFestival?.id, exportTeamId],
    enabled: isExportOpen && exportKind === 'team_items' && !!activeFestival?.id && !!exportTeamId && !!userId,
    queryFn: async () => {
      const people = await loadAdminExportPeople(activeFestival!.id, exportTeamId, null);
      const ids = people.map((person: any) => person.id);
      const registrations = await loadAdminTeamExportRegistrations(activeFestival!.id, exportTeamId, ids);
      const active = registrations.filter((row: any) => !['rejected', 'cancelled', 'canceled'].includes(String(row.status ?? '').toLowerCase()));
      const members = await loadAdminExportGroupMembers(active, ids);
      const groupIds = new Set(members.map((member: any) => member.registration_id));
      const personIds = new Set(ids);
      return new Set(active.filter((row: any) => row.participant_id ? personIds.has(row.participant_id) : groupIds.has(row.id)).map((row: any) => row.item_id));
    },
  });

  const openExport = () => {
    if (isExporting || !selectionScopeMatchesSession()) return;
    if (!exportItemId && exportItems[0]) setExportItemId(exportItems[0].id);
    setExportTeamId('');
    setIsExportOpen(true);
  };

  const runExport = async (selectedTeamItemIds: string[]) => {
    try {
      if (searchPending || pageQuery.isFetching) throw new Error('Wait for the current search to finish before exporting.');
      if (!selectionScopeMatchesSession()) throw new Error('Session changed. Please retry the export.');
      const exportScope = scopeKey;
      setIsExporting(true);
      const { downloadItemVerificationPdf, downloadParticipantsCsv, downloadTeamItemParticipantsPdf, downloadTeamParticipantSlipsPdf } = await import('@/services/participantExportService');
      if (exportKind === 'csv') {
        const csvParticipants = await loadAllAdminParticipants(filters);
        if (exportScope !== operationScope.current || !selectionScopeMatchesSession()) throw new Error('Filters or session changed. Please retry the export.');
        await downloadParticipantsCsv(csvParticipants.map((participant: any): ExportParticipant => ({
          id: participant.id, name: participant.name, chest_number: participant.chest_number,
          organisation_id: participant.organisation_id, organisation_name: participant.organisations?.name,
          category_code: participant.category_code, gender: participant.gender, age: participant.age,
          status: participant.status, created_at: participant.created_at, registered_by: participant.registered_by,
        })));
        setIsExportOpen(false);
        return;
      }
      if (!activeFestival?.id) throw new Error('Select an active festival before exporting.');
      const selectedTeam = needsExportTeam ? exportTeams.find((candidate) => candidate.id === exportTeamId) : null;
      if (needsExportTeam && !selectedTeam) throw new Error('Select a team to export.');
      const selectedItem = exportKind === 'item_verification' ? (activeItems as any[]).find((candidate) => candidate.id === exportItemId) : null;
      if (exportKind === 'item_verification' && !selectedItem) throw new Error('Select an item to export.');
      const itemRecords: ExportItem[] = (activeItems as any[]).map((item: any) => ({
        id: item.id, item_code: item.item_code, item_name_en: item.item_name_en,
        item_name_ml: item.item_name_ml, category_codes: item.category_codes,
        participation_type: item.participation_type,
      }));
      const teamPeople = selectedTeam ? await loadAdminExportPeople(activeFestival.id, selectedTeam.id, null) : null;
      const festivalRegistrations = selectedTeam
        ? await loadAdminTeamExportRegistrations(activeFestival.id, selectedTeam.id, teamPeople!.map((person: any) => person.id))
        : await loadAdminExportRegistrations(activeFestival.id, selectedItem?.id ?? null);
      const groupMembers = await loadAdminExportGroupMembers(festivalRegistrations, teamPeople?.map((person: any) => person.id));
      const participantIds = selectedItem ? Array.from(new Set([
        ...festivalRegistrations.map((registration: any) => registration.participant_id).filter(Boolean),
        ...groupMembers.map((member) => member.participant_id).filter(Boolean),
      ])) as string[] : null;
      const exportPeople = teamPeople ?? await loadAdminExportPeople(activeFestival.id, null, participantIds);
      if (exportScope !== operationScope.current || !selectionScopeMatchesSession()) throw new Error('Filters or session changed. Please retry the export.');
      const people: ExportParticipant[] = exportPeople.map((participant: any) => ({
        id: participant.id, name: participant.name, chest_number: participant.chest_number,
        organisation_id: participant.organisation_id, organisation_name: participant.organisations?.name,
        category_code: participant.category_code, gender: participant.gender, age: participant.age,
        status: participant.status, created_at: participant.created_at, registered_by: participant.registered_by,
      }));
      const membersByRegistration = new Map<string, string[]>();
      groupMembers.forEach(({ registration_id, participant_id }) => membersByRegistration.set(registration_id, [
        ...(membersByRegistration.get(registration_id) ?? []), participant_id,
      ]));
      const personById = new Map(people.map((person) => [person.id, person]));
      const assignments: ExportAssignment[] = (festivalRegistrations as any[]).flatMap((registration) => {
        if (!registration.item_id) return [];
        const personIds: string[] = registration.participant_id
          ? [registration.participant_id]
          : membersByRegistration.get(registration.id) ?? [];
        return personIds.map((participantId) => ({
          registration_id: registration.id, participant_id: participantId, item_id: registration.item_id,
          registration_status: registration.status, is_verified: registration.is_verified,
          organisation_id: registration.organisation_id || personById.get(participantId)?.organisation_id,
          organisation_name: personById.get(participantId)?.organisation_name,
        }));
      });

      if (exportKind === 'item_verification') {
        const item = itemRecords.find((candidate) => candidate.id === exportItemId);
        if (!item) throw new Error('Select an item to export.');
        downloadItemVerificationPdf({ festivalName: activeFestival.custom_name || `Festival ${activeFestival.festival_year}`, item, participants: people, assignments, sortBy: exportSort });
      } else {
        const team = selectedTeam;
        if (!team) throw new Error('Select a team to export.');
        const teamPeople = people.filter((person) => person.organisation_id === team.id);
        const teamAssignments = assignments.filter((assignment) => assignment.organisation_id === team.id);
        if (exportKind === 'slips') downloadTeamParticipantSlipsPdf({ teamName: team.label, participants: teamPeople, items: itemRecords, assignments: teamAssignments });
        else downloadTeamItemParticipantsPdf({ selectedItemIds: selectedTeamItemIds, teamName: team.label, teamId: team.id, participants: teamPeople, items: itemRecords, assignments: teamAssignments });
      }
      setIsExportOpen(false);
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error?.message || 'Unable to create the export.');
      else Alert.alert('Export unavailable', error?.message || 'Unable to create the export.');
    } finally {
      setIsExporting(false);
    }
  };

  const updateSingleStatus = async (id: string, newStatus: string) => {
    try {
      await updateStatus({ id, status: newStatus as any, reason: null });
      setSelectedStatusById((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.set(id, newStatus);
        return next;
      });
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert('Status update failed: ' + error.message);
      else Alert.alert('Error', error.message);
    }
  };

  const promptStatusChange = (p: any) => {
    if (Platform.OS === 'web') {
      const newStatus = window.prompt(`Update status for ${p.name} (pending/approved/rejected):`, p.status || 'pending');
      if (newStatus && ['pending', 'approved', 'rejected'].includes(newStatus.toLowerCase())) {
        updateSingleStatus(p.id, newStatus.toLowerCase());
      }
    } else {
      Alert.alert('Update Status', `Select new status for ${p.name}`, [
        { text: 'Pending', onPress: () => updateSingleStatus(p.id, 'pending') },
        { text: 'Approve', onPress: () => updateSingleStatus(p.id, 'approved') },
        { text: 'Reject', onPress: () => updateSingleStatus(p.id, 'rejected'), style: 'destructive' },
        { text: 'Cancel', style: 'cancel' }
      ]);
    }
  };

  const getStatusColor = (status: string) => {
    switch ((status || 'pending').toLowerCase()) {
      case 'approved': return { bg: 'bg-core-success-soft-green-100', text: 'text-core-success-green-700', border: 'border-core-success-soft-green-200' };
      case 'rejected': return { bg: 'bg-core-danger-soft-red-100', text: 'text-core-danger-red-700', border: 'border-core-danger-soft-red-200' };
      default: return { bg: 'bg-core-warning-soft-yellow-100', text: 'text-core-warning-yellow-700', border: 'border-core-warning-soft-yellow-200' };
    }
  };

  const toggleSelectMode = () => {
    if (isSelectingAll) return;
    setSelectMode(prev => !prev);
    setSelectedStatusById(new Map());
  };

  const toggleSelect = (id: string, status: string | null | undefined) => {
    if (isSelectingAll) return;
    setSelectedStatusById((prev) => {
      const next = new Map(prev);
      if (prev.has(id)) next.delete(id);
      else next.set(id, status || 'pending');
      return next;
    });
  };

  const selectAll = async () => {
    const scope = scopeKey;
    setIsSelectingAll(true);
    try {
      const rows = await loadAllAdminParticipants(filters, false, 'id,status');
      if (scope === operationScope.current && selectionScopeMatchesSession()) {
        setSelectedStatusById(new Map(rows.map((p: any) => [p.id, p.status || 'pending'])));
      }
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error?.message || 'Unable to select all participants.');
      else Alert.alert('Selection unavailable', error?.message || 'Unable to select all participants.');
    } finally { setIsSelectingAll(false); }
  };

  const bulkUpdateAction = async (action: 'delete' | 'approve') => {
    if (listError || isLoadingList || pageQuery.isFetching || processingBulk || !selectionScopeMatchesSession()) return;
    const ids = action === 'approve' ? approvableSelectedIds : Array.from(selected);
    if (ids.length === 0) return;
    try {
      if (action === 'delete') {
        await deleteMultiple(ids);
      } else {
        await approveMultiple(ids);
      }
      setSelectedStatusById(new Map());
      setSelectMode(false);
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert('Action failed: ' + error.message);
      else Alert.alert('Error', error.message);
    }
  };

  const confirmBulkAction = (action: 'delete' | 'approve') => {
    if (listError || isLoadingList || pageQuery.isFetching || processingBulk || !selectionScopeMatchesSession() || (action === 'approve' ? approvableSelectedIds.length === 0 : selected.size === 0)) return;
    const msg = action === 'delete'
      ? `Delete ${selected.size} selected participant(s)? This cannot be undone.`
      : `Approve ${approvableSelectedIds.length} selected participant(s)?`;

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) bulkUpdateAction(action);
    } else {
      Alert.alert('Confirm', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: action === 'delete' ? 'Delete' : 'Approve', style: action === 'delete' ? 'destructive' : 'default', onPress: () => bulkUpdateAction(action) },
      ]);
    }
  };

  const hasActiveFilters = selectedCategory !== 'All' || selectedStatus !== 'All' || selectedGender !== 'All';

  const clearFilters = () => {
    setPage(0);
    setSelectedCategory('All');
    setSelectedStatus('All');
    setSelectedGender('All');
  };

  const headerActionSize = width < 640 ? 'h-10 px-2.5' : 'h-9 px-2';

  return (
    <ScrollView
      className="flex-1 bg-ssf-bg"
      style={{ paddingTop: isCompactParticipantLayout ? 12 : 24, paddingBottom: isCompactParticipantLayout ? 12 : 24, paddingHorizontal: width < 640 ? 12 : width < 1200 ? 18 : 16 }}
      stickyHeaderIndices={[1]}
    >
      {/* Header */}
      <View className={`${width < 640 ? 'flex-col' : 'flex-row'} justify-between items-start ${isCompactParticipantLayout ? 'gap-2 mb-2' : 'gap-3 mb-4'}`}>
        <View className="shrink-0">
          <Text className={`${width < 640 ? 'text-2xl' : 'text-3xl'} font-poppins-black text-ssf-text`}>Participants</Text>
          <Text className="text-sm font-poppins text-ssf-text-muted mt-1">{listError ? 'Participants unavailable' : `${resultCount} showing`}</Text>
        </View>
        <View className={`${width < 640 ? 'w-full' : 'flex-1'} flex-row flex-wrap justify-end gap-1.5`}>
          {!selectMode && <TouchableOpacity onPress={toggleSelectMode} disabled={!!listError || !selectionScopeIsCurrent} className="flex-row items-center gap-x-2 rounded-lg border border-ssf-border bg-core-surface-white px-3 py-2">
            <CheckSquare size={16} color={coreColor("#1B6B3A", 'primaryText')} />
            <Text className="font-poppins-bold text-xs text-ui-primary-text">Select Multiple</Text>
          </TouchableOpacity>}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Manage chest numbers" onPress={() => router.push('/(admin)/participants/chest-numbers')} className={`${headerActionSize} bg-core-surface-white border border-ssf-primary/20 rounded-md flex-row items-center justify-center`}>
            <Text className="font-poppins-bold text-ui-primary-text text-[11px]">Numbers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Print participant cards"
            onPress={() => router.push('/(admin)/participants/chest-cards' as any)}
            className={`${headerActionSize} bg-core-surface-white border border-ssf-primary/20 rounded-md flex-row items-center justify-center`}
          >
            <Text className="font-poppins-bold text-ui-primary-text text-[11px]">Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openExport}
            disabled={isExporting || isLoadingList || isLoadingItems || !!listError}
            accessibilityRole="button"
            accessibilityLabel="Export participants"
            className={`${headerActionSize} bg-ssf-primary border border-ssf-primary rounded-md flex-row items-center gap-x-1.5 ${isLoadingList || isLoadingItems || listError ? 'opacity-60' : ''}`}
          >
            <FileDown size={14} color={ui.colors.onPrimary} />
            <Text className="font-poppins-bold text-[11px] text-core-on-primary-white">Export</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Import participants" onPress={() => router.push('/(admin)/participants/import')} className={`${width < 640 ? 'h-10 w-10' : 'h-9 w-9'} bg-core-surface-white border border-ssf-primary/20 rounded-md items-center justify-center`}>
            <Upload size={15} color={coreColor("#1B6B3A", 'primaryText')} />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add multiple participants" onPress={() => setIsBulkAddOpen(true)} className={`${headerActionSize} bg-core-surface-white border border-ssf-primary/20 rounded-md flex-row items-center justify-center gap-x-1.5`}>
            <UserPlus size={14} color={coreColor('#1B6B3A', 'primaryText')} />
            <Text className="font-poppins-bold text-[11px] text-ui-primary-text">Add Multiple</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add participant" onPress={() => router.push('/(admin)/participants/add')} className={`${headerActionSize} bg-ssf-primary border border-ssf-primary rounded-md flex-row items-center justify-center gap-x-1.5`}>
            <UserPlus size={14} color={coreColor('#FFFFFF', 'onPrimary')} />
            <Text className="font-poppins-bold text-core-on-primary-white text-[11px]">Add New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sticky Filters & Search */}
      <View className={`bg-ui-bg z-10 ${isCompactParticipantLayout ? 'pb-2' : 'pb-4'}`}>
        <View className={`flex-row items-center bg-core-surface-white border border-ui-border px-3 ${isCompactParticipantLayout ? 'h-10 rounded-lg' : 'h-11 rounded-xl'}`}>
          <Search size={18} color={coreColor("#9CA3AF", 'textMuted')} />
          <TextInput
            className="flex-1 ml-2 font-poppins text-ssf-text outline-none"
            accessibilityLabel="Search participants by name or chest number"
            placeholder="Search by name or chest number..."
            value={searchQuery}
            onChangeText={(value) => { setPage(0); setSearchQuery(value); }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear participant search" onPress={() => { setPage(0); setSearchQuery(''); }} className="h-9 w-9 items-center justify-center">
              <X size={16} color={coreColor("#9CA3AF", 'textMuted')} />
            </TouchableOpacity>
          )}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: width < 640 ? 6 : 8, paddingTop: width < 640 ? 8 : 10 }}>
          <CompactFilter
            label="Category"
            items={categories}
            selectedValue={selectedCategory}
            onSelect={(value) => { setPage(0); setSelectedCategory(value); }}
            width={phoneFilterWidth ?? 148}
            searchable={false}
          />
          {!isCollegeFest && categoryQuery.isLoading && (
            <View accessibilityLabel="Loading categories" className="h-9 px-2 rounded-lg border border-ui-border bg-core-surface-white items-center justify-center">
              <ActivityIndicator size="small" color={ui.colors.primary} />
            </View>
          )}
          {!isCollegeFest && categoryQuery.isError && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Retry loading categories"
              disabled={categoryQuery.isFetching}
              onPress={() => { void retryCategories(); }}
              className="h-9 px-2 rounded-lg border border-ui-border bg-core-surface-white items-center justify-center"
            >
              <Text className="font-poppins-bold text-[10px] text-ui-text-muted">Retry categories</Text>
            </TouchableOpacity>
          )}
          <CompactFilter
            label="Status"
            items={statuses}
            selectedValue={selectedStatus}
            onSelect={(value) => { setPage(0); setSelectedStatus(value); }}
            width={phoneFilterWidth ?? 142}
          />
          <CompactFilter
            label="Gender"
            items={genders}
            selectedValue={selectedGender}
            onSelect={(value) => { setPage(0); setSelectedGender(value); }}
            width={phoneFilterWidth ?? 132}
          />
          {hasActiveFilters && (
            <TouchableOpacity
              onPress={clearFilters}
              className="h-9 px-3 rounded-lg border border-ui-border bg-core-surface-white flex-row items-center justify-center"
            >
              <RotateCcw size={13} color={ui.colors.textMuted} />
              <Text className="ml-1.5 font-poppins-bold text-[10px] text-ui-text-muted">Reset</Text>
            </TouchableOpacity>
          )}
          <View className="h-9 px-3 rounded-lg bg-ui-muted items-center justify-center">
            <Text className="font-poppins-bold text-[10px] text-ui-text-muted">
              {listError ? 'Participants unavailable' : `${resultCount} results`}
            </Text>
          </View>
        </View>
      </View>

      {/* Bulk action bar */}
      {selectMode && <View className={`flex-row items-center justify-between ${isCompactParticipantLayout ? 'mb-2 mt-1' : 'mb-4 mt-2'}`}>
          <View className="flex-1 flex-row items-center justify-between bg-core-surface-white px-3 py-2 border border-ssf-border rounded-lg">
            <View className="flex-row items-center gap-x-3">
              <TouchableOpacity onPress={toggleSelectMode} className="p-1">
                <X size={18} color={ui.colors.textMuted} />
              </TouchableOpacity>
              <Text className="font-poppins-bold text-ssf-text">{selected.size} selected</Text>
              <TouchableOpacity onPress={selectAll} disabled={processingBulk || isLoadingList || pageQuery.isFetching || !!listError || !selectionScopeIsCurrent}>
                <Text className="font-poppins text-xs text-ui-primary-text">All</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row gap-x-2">
              <TouchableOpacity onPress={() => confirmBulkAction('delete')} disabled={processingBulk || selected.size === 0 || !!listError || !selectionScopeIsCurrent} className={`p-2 rounded-lg ${selected.size > 0 ? 'bg-core-danger-soft-red-100' : 'bg-core-surface-muted-gray-100'}`}>
                <Trash2 size={16} color={selected.size > 0 ? coreColor('#DC2626', 'danger') : coreColor('#9CA3AF', 'textMuted')} />
              </TouchableOpacity>
              {approvableSelectedIds.length > 0 && <TouchableOpacity onPress={() => confirmBulkAction('approve')} disabled={processingBulk || !!listError || !selectionScopeIsCurrent} className="flex-row items-center gap-x-1 rounded-lg bg-ssf-primary px-3 py-2">
                {processingBulk ? <ActivityIndicator color={coreColor("white", 'onPrimary')} size="small" /> : <CheckCircle size={16} color={coreColor('white', 'onPrimary')} />}
                <Text className="font-poppins-bold text-xs text-core-on-primary-white">Approve{approvableSelectedIds.length < selected.size ? ` (${approvableSelectedIds.length})` : ''}</Text>
              </TouchableOpacity>}
            </View>
          </View>
      </View>}

      {/* List */}
      <SsfCard className={isCardLayout ? 'mb-4 p-0' : 'mb-4 p-0 overflow-hidden'} style={isCardLayout ? { backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0 } : undefined}>
        {isLoadingList || isLoadingItems ? (
          <View className="p-4">
          <SsfTableSkeleton rows={7} columns={6} compact={width < 1200} />
          </View>
        ) : listError ? (
          <View className="items-center justify-center py-10 px-4">
            <Text className="text-core-danger-red-700 font-poppins mb-3">Could not load participants. The list may be incomplete.</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => { void retryList(); }} className="rounded-lg border border-ui-border px-3 py-2"><Text className="font-poppins-bold text-xs text-ui-text">Retry participants</Text></TouchableOpacity>
          </View>
        ) : filteredParticipants.length === 0 ? (
          <View className="items-center justify-center py-10">
            <Text className="text-ssf-text-muted font-poppins mb-4">No participants found.</Text>
          </View>
        ) : isCardLayout ? (
          <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
            {filteredParticipants.map((p: any) => {
              const isSelected = selected.has(p.id);
              const statColor = getStatusColor(p.status);
              return (
                <View key={p.id} style={{ width: `${100 / cardColumns}%`, padding: 5 }}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`${selectMode ? 'Select' : 'Open'} ${p.name}`}
                    activeOpacity={0.86}
                    onPress={() => selectMode ? toggleSelect(p.id, p.status) : router.push(`/(admin)/participants/${p.id}`)}
                    onLongPress={() => { if (!selectMode) setSelectMode(true); toggleSelect(p.id, p.status); }}
                    style={{ minHeight: 148, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: isSelected ? ui.colors.primary : ui.colors.border, backgroundColor: isSelected ? ui.colors.primarySoft : ui.colors.surface, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      {selectMode && <View style={{ paddingTop: 2 }}>{isSelected ? <CheckSquare size={18} color={ui.colors.primary} /> : <Square size={18} color={ui.colors.textSubtle} />}</View>}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={2} style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{p.name || 'Participant'}</Text>
                        <Text numberOfLines={1} style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 2 }}>{p.chest_number ? `#${p.chest_number}` : 'No chest number'}</Text>
                      </View>
                      {!selectMode && <ChevronRight size={17} color={ui.colors.textSubtle} />}
                    </View>
                    <View style={{ marginTop: 6, gap: 2 }}>
                      <Text numberOfLines={1} style={{ color: ui.colors.textMuted, fontSize: 11 }}>Category  <Text style={{ color: ui.colors.text, fontWeight: '600' }}>{p.category_code || '—'}</Text><Text style={{ color: ui.colors.textMuted }}> · Gender  </Text><Text style={{ color: ui.colors.text, fontWeight: '600' }}>{p.gender || '—'}</Text></Text>
                      <Text numberOfLines={1} style={{ color: ui.colors.textMuted, fontSize: 11 }}>Team  <Text style={{ color: ui.colors.text, fontWeight: '600' }}>{p.organisations?.name || '—'}</Text></Text>
                    </View>
                    <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Change status for ${p.name}`} disabled={selectMode} onPress={(event) => { event.stopPropagation(); promptStatusChange(p); }} style={{ maxWidth: '60%' }} className={`px-2.5 py-1 rounded-full border ${statColor.bg} ${statColor.border}`}>
                        <Text numberOfLines={1} className={`font-poppins-bold text-[9px] uppercase ${statColor.text}`}>{p.status || 'Pending'}</Text>
                      </TouchableOpacity>
                      {!selectMode && p.profile_slug && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open public profile for ${p.name}`} onPress={(event) => { event.stopPropagation(); router.push(`/candidate/${p.profile_slug}` as any); }} className="rounded-lg border border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50 px-2.5 py-1.5">
                        <Text className="font-poppins-bold text-[10px] text-core-success-emerald-700">Public profile</Text>
                      </TouchableOpacity>}
                    </View>
                    {!selectMode && <View style={{ marginTop: 6, flexDirection: 'row', gap: 5 }}>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${p.name}`} disabled={!!p.is_locked} onPress={(event) => { event.stopPropagation(); router.push({ pathname: '/(admin)/participants/[id]', params: { id: p.id, open: 'edit' } } as any); }} style={{ flex: 1, minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: '#93C5FD', backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center', opacity: p.is_locked ? 0.45 : 1 }}>
                        <Text numberOfLines={1} style={{ color: '#1D4ED8', fontSize: 10, fontWeight: '700' }}>{p.is_locked ? 'Locked' : 'Edit'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete ${p.name}`} onPress={(event) => { event.stopPropagation(); setDeleteError(null); setDeleteTarget({ id: p.id, name: p.name }); }} style={{ flex: 1, minHeight: 42, borderRadius: 8, backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>Delete</Text>
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Details for ${p.name}`} onPress={(event) => { event.stopPropagation(); router.push(`/(admin)/participants/${p.id}`); }} style={{ flex: 1, minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ color: ui.colors.text, fontSize: 10, fontWeight: '700' }}>Details</Text>
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Programs for ${p.name}`} onPress={(event) => { event.stopPropagation(); setProgramsTarget({ id: p.id, name: p.name }); }} style={{ flex: 1, minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: '#86EFAC', backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ color: '#15803D', fontSize: 10, fontWeight: '700' }}>Programs</Text>
                      </TouchableOpacity>
                    </View>}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : (
          <View>
            {filteredParticipants.map((p: any, index: number) => {
              const isSelected = selected.has(p.id);
              const statColor = getStatusColor(p.status);

              return (
                <Animated.View key={p.id} entering={FadeInUp.delay((index % 10) * 50)}>
                  <TouchableOpacity
                    className={`min-h-[72px] flex-row items-center justify-between border-b border-ssf-border px-3 py-2 ${isSelected ? 'bg-core-success-soft-green-50' : 'bg-ssf-surface'
                      }`}
                    onPress={() => selectMode ? toggleSelect(p.id, p.status) : router.push(`/(admin)/participants/${p.id}`)}
                    onLongPress={() => {
                      if (!selectMode) setSelectMode(true);
                      toggleSelect(p.id, p.status);
                    }}
                  >
                    {selectMode && (
                      <View className="mr-3">
                        {isSelected ? <CheckSquare size={20} color={coreColor("#1B6B3A", 'primaryText')} /> : <Square size={20} color={coreColor("#9CA3AF", 'textMuted')} />}
                      </View>
                    )}

                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-center gap-x-2">
                        <Text numberOfLines={1} className="min-w-0 flex-1 font-poppins-bold text-[13px] text-ssf-text">{p.name}</Text>
                        <TouchableOpacity onPress={() => promptStatusChange(p)} className={`px-2 py-0.5 rounded-full border ${statColor.bg} ${statColor.border}`}>
                          <Text className={`font-poppins-bold text-[9px] uppercase ${statColor.text}`}>
                            {p.status || 'Pending'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <Text numberOfLines={1} className="mt-0.5 font-poppins text-[10px] text-ssf-text-muted">
                        {p.chest_number ? `No: ${p.chest_number}` : 'No Chest No.'} • Cat: {p.category_code} {p.gender ? `• ${p.gender === 'boys' ? 'B' : 'G'}` : ''}
                      </Text>
                      {p.organisations && (
                        <Text numberOfLines={1} className="mt-0.5 font-poppins text-[9px] text-core-info-blue-600">
                          🏠 {p.organisations.name} ({p.organisations.org_type})
                        </Text>
                      )}
                    </View>

                    {!selectMode && (
                      <View className="ml-2 flex-row items-center gap-x-1.5">
                        {p.profile_slug && (
                          <TouchableOpacity 
                            onPress={(e) => {
                              e.stopPropagation();
                              router.push(`/candidate/${p.profile_slug}` as any);
                            }}
                            className="rounded-md bg-core-success-soft-emerald-50 px-2 py-1"
                          >
                            <Text className="font-poppins-bold text-[8px] text-core-success-emerald-700">Public</Text>
                          </TouchableOpacity>
                        )}
                        <ChevronRight size={16} color={coreColor("#9CA3AF", 'textMuted')} />
                      </View>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        )}
      </SsfCard>
      {!isLoadingList && !listError && resultCount > 0 && (
        <View className="flex-row items-center justify-center gap-x-4 mb-6">
          <TouchableOpacity accessibilityRole="button" disabled={page === 0 || pageQuery.isFetching} onPress={() => setPage(page - 1)} className="px-3 py-2 border border-ui-border rounded-lg"><Text className="font-poppins-bold text-xs text-ui-text">Previous</Text></TouchableOpacity>
          <Text className="font-poppins text-xs text-ui-text">Page {page + 1} of {Math.max(1, Math.ceil(resultCount / 50))}</Text>
          <TouchableOpacity accessibilityRole="button" disabled={(page + 1) * 50 >= resultCount || pageQuery.isFetching} onPress={() => setPage(page + 1)} className="px-3 py-2 border border-ui-border rounded-lg"><Text className="font-poppins-bold text-xs text-ui-text">Next</Text></TouchableOpacity>
        </View>
      )}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => { if (!isDeleting) setDeleteTarget(null); }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(15,23,42,0.62)' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close delete confirmation" disabled={isDeleting} onPress={() => setDeleteTarget(null)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
          <View style={{ width: '100%', maxWidth: 380, borderRadius: 14, padding: 18, backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 24, elevation: 18 }}>
            <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={19} color="#DC2626" /></View>
            <Text style={{ color: ui.colors.text, fontSize: 17, fontWeight: '800', marginTop: 11 }}>Delete participant?</Text>
            <Text style={{ color: ui.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>{deleteTarget?.name} will be permanently deleted. Participants with competition registrations cannot be deleted.</Text>
            {!!deleteError && <Text accessibilityRole="alert" style={{ color: '#B91C1C', fontSize: 12, marginTop: 10 }}>{deleteError}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity accessibilityRole="button" disabled={isDeleting} onPress={() => setDeleteTarget(null)} style={{ flex: 1, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: ui.colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: ui.colors.text, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" disabled={isDeleting} onPress={async () => { if (!deleteTarget) return; try { setDeleteError(null); await deleteParticipant(deleteTarget.id); setDeleteTarget(null); } catch (error: any) { setDeleteError(error?.message || 'Could not delete this participant.'); } }} style={{ flex: 1, minHeight: 44, borderRadius: 9, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', opacity: isDeleting ? 0.65 : 1 }}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{isDeleting ? 'Deleting…' : 'Delete'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!programsTarget} transparent animationType="fade" onRequestClose={() => setProgramsTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: width >= 1200 ? 12 : 16, backgroundColor: 'rgba(15,23,42,0.62)' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close programs" onPress={() => setProgramsTarget(null)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
          <View style={{ width: '100%', maxWidth: width >= 1200 ? 520 : 620, maxHeight: width >= 1200 ? '70%' : '85%', borderRadius: width >= 1200 ? 14 : 18, backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, overflow: 'hidden' }}>
            <View style={{ padding: width >= 1200 ? 12 : 18, borderBottomWidth: 1, borderBottomColor: ui.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: ui.colors.text, fontSize: width >= 1200 ? 15 : 18, fontWeight: '800' }}>Programs</Text><Text numberOfLines={1} style={{ color: ui.colors.textMuted, fontSize: width >= 1200 ? 10 : 12, marginTop: 2 }}>{programsTarget?.name}</Text></View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close programs" onPress={() => setProgramsTarget(null)} style={{ width: width >= 1200 ? 34 : 40, height: width >= 1200 ? 34 : 40, alignItems: 'center', justifyContent: 'center' }}><X size={width >= 1200 ? 16 : 19} color={ui.colors.text} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: width >= 1200 ? 10 : 16, gap: width >= 1200 ? 6 : 10 }}>
              {programsQuery.isLoading ? <ActivityIndicator color={ui.colors.primary} /> : programsQuery.isError ? <View><Text accessibilityRole="alert" style={{ color: ui.colors.danger, fontSize: 12 }}>Could not load programs.</Text><TouchableOpacity accessibilityRole="button" onPress={() => void programsQuery.refetch()} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ color: ui.colors.primary, fontWeight: '700' }}>Retry</Text></TouchableOpacity></View> : programsQuery.data?.length ? programsQuery.data.map((registration: any) => {
                const result = (publishedResultsQuery.data ?? []).find((row) => row.registration_id === registration.id);
                return <View key={registration.id} style={{ padding: width >= 1200 ? 8 : 13, borderRadius: 11, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surfaceMuted }}>
                  <Text style={{ color: ui.colors.text, fontSize: width >= 1200 ? 11 : 13, fontWeight: '700' }}>{registration.items?.item_name_en || registration.items?.item_name_ml || 'Program'}</Text>
                  <Text style={{ color: ui.colors.textMuted, fontSize: width >= 1200 ? 9 : 11, marginTop: 2 }}>{[registration.items?.item_code, registration.status].filter(Boolean).join(' · ')}</Text>
                  {publishedResultsQuery.isLoading ? <Text style={{ color: ui.colors.textMuted, fontSize: 10, marginTop: 4 }}>Loading result…</Text> : publishedResultsQuery.isError ? <Text style={{ color: ui.colors.danger, fontSize: 10, marginTop: 4 }}>Result unavailable. Retry below.</Text> : result ? <Text style={{ color: ui.colors.primaryText, fontSize: width >= 1200 ? 10 : 12, fontWeight: '700', marginTop: 4 }}>{[result.rank != null ? `Rank ${result.rank}` : null, result.grade ? `Grade ${result.grade}` : null, result.points_awarded != null ? `${result.points_awarded} points` : null].filter(Boolean).join(' · ') || 'Result published'}</Text> : <Text style={{ color: ui.colors.textMuted, fontSize: 10, marginTop: 4 }}>No published result yet</Text>}
                </View>;
              }) : <Text style={{ color: ui.colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>No programs assigned yet</Text>}
              {publishedResultsQuery.isError && <TouchableOpacity accessibilityRole="button" onPress={() => void publishedResultsQuery.refetch()} style={{ minHeight: 40, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: ui.colors.primary, fontWeight: '700' }}>Retry results</Text></TouchableOpacity>}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ParticipantExportModal
        visible={isExportOpen}
        isTeamPortal={false}
        colors={{ overlay: 'rgba(12, 20, 32, 0.48)', surface: '#FFFFFF', text: ui.colors.text, muted: ui.colors.textMuted, border: ui.colors.border, primary: ui.colors.primary, onPrimary: ui.colors.onPrimary, selected: ui.colors.surfaceMuted }}
        teams={exportTeams}
        items={exportKind === 'team_items' ? exportItems.filter(item => teamReportItemsQuery.data?.has(item.id)) : exportItems}
        selectedKind={exportKind}
        selectedTeamId={exportTeamId}
        selectedItemId={exportItemId}
        sortBy={exportSort}
        busy={isExporting}
        loadingOptions={(needsExportTeam && exportTeamsQuery.isLoading) || (exportKind === 'team_items' && !!exportTeamId && teamReportItemsQuery.isFetching)}
        errorMessage={needsExportTeam && exportTeamsQuery.error ? 'Could not load teams.' : exportKind === 'team_items' && teamReportItemsQuery.error ? 'Could not load competitions for this team.' : null}
        onKindChange={(kind) => { if (!isExporting) setExportKind(kind); }}
        onTeamChange={setExportTeamId}
        onItemChange={setExportItemId}
        onSortChange={setExportSort}
        onClose={() => setIsExportOpen(false)}
        onDownload={runExport}
      />
      <AdminBulkAddParticipantsModal
        visible={isBulkAddOpen}
        tenantId={tenantId}
        festivalId={activeFestival?.id}
        festivalTemplate={activeFestival?.festival_template}
        festivalLevel={activeFestival?.level}
        chestNumberTemplate={activeFestival?.chest_number_template}
        genderMode={activeFestival?.gender_mode}
        onClose={() => setIsBulkAddOpen(false)}
        onCreated={(count) => {
          void queryClient.invalidateQueries({ queryKey: ['participants', 'admin-page'] });
          void queryClient.invalidateQueries({ queryKey: ['participants', 'admin-categories'] });
          void queryClient.invalidateQueries({ queryKey: ['chest-number-order'] });
          if (Platform.OS === 'web') window.alert(`${count} participant${count === 1 ? '' : 's'} added.`);
          else Alert.alert('Participants added', `${count} participant${count === 1 ? '' : 's'} added.`);
        }}
      />
    </ScrollView>
  );
}
