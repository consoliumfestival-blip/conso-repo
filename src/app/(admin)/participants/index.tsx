import { coreColor } from '@/constants/coreTheme';
import { ui } from '@/constants/designSystem';
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, TextInput, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useFestival } from '../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../core/hooks/useFestivalCategories';
import { UserPlus, ChevronRight, Upload, CheckSquare, Square, X, Search, FileDown, CheckCircle, Trash2, GitCompare, RotateCcw, Trophy } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SsfSelectMenu } from '../../../components/ui/SsfSelectMenu';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import { ParticipantExportModal, ParticipantExportKind, ExportChoice } from '@/components/participants/ParticipantExportModal';
import { downloadItemVerificationPdf, downloadParticipantsCsv, downloadTeamItemParticipantsPdf, downloadTeamParticipantSlipsPdf, ExportAssignment, ExportItem, ExportParticipant, ExportSort, loadAdminGroupMembers } from '@/services/participantExportService';

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
  const { width } = useWindowDimensions();
  const isDesktopTable = width >= 980;
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
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
    participants,
    isLoadingList,
    updateStatus,
    deleteMultiple,
    approveMultiple,
    useFestivalRegistrations,
    isDeleting,
    isApprovingMultiple
  } = useParticipants();
  const { data: festivalRegistrations = [], isLoading: isLoadingRegistrations } = useFestivalRegistrations(activeFestival?.id);

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedCompetition, setSelectedCompetition] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedGender, setSelectedGender] = useState<string>('All');

  const categories = isCollegeFest
    ? [
        'All',
        ...festivalCategories
          .filter((category) => category.code.toLowerCase() !== 'gn')
          .map((category) => ({ id: category.code, label: category.name })),
      ]
    : [
        'All',
        ...Array.from(new Set(participants
          .map((participant: any) => typeof participant.category_code === 'string' ? participant.category_code.trim() : '')
          .filter(Boolean))).sort((a, b) => a.localeCompare(b)),
      ];
  const itemOptions = [
    { id: 'All', label: 'All items' },
    ...(activeItems as any[])
      .filter((item: any) => item?.id)
      .map((item: any) => ({
        id: item.id,
        label: item.item_code ? `${item.item_code} · ${item.item_name_en || item.item_name_ml || 'Unnamed item'}` : item.item_name_en || item.item_name_ml || 'Unnamed item',
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const itemRecords = (activeItems as any[]).length > 0
    ? (activeItems as any[])
    : itemOptions.map((item: any) => ({ id: item.id, item_code: item.label, item_name_en: null, item_name_ml: null, category_codes: [null] }));
  const competitionOptions = [
    { id: 'All', label: 'All competitions', itemId: null as string | null, categoryCode: null as string | null },
    ...itemRecords.flatMap((item: any) => {
      if (!item?.id) return [];
      const rawCategories = Array.isArray(item.category_codes)
        ? item.category_codes
        : item.category_codes ? [item.category_codes] : [null];
      const itemLabel = item.item_code
        ? `${item.item_code} · ${item.item_name_en || item.item_name_ml || 'Unnamed item'}`
        : item.item_name_en || item.item_name_ml || 'Unnamed item';
      return rawCategories.map((categoryCode: string | null, index: number) => ({
        id: `${item.id}::${categoryCode || 'ALL'}::${index}`,
        label: categoryCode ? `${itemLabel} · ${categoryCode}` : itemLabel,
        itemId: item.id as string,
        categoryCode: categoryCode || null,
      }));
    }).sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const selectedCompetitionDetails = competitionOptions.find((option) => option.id === selectedCompetition);
  const statuses = ['All', 'Pending', 'Approved', 'Rejected'];
  const genders = ['All', 'Boys', 'Girls'];

  // Bulk action state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const processingBulk = isDeleting || isApprovingMultiple;

  const filteredParticipants = participants.filter((p: any) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.chest_number && p.chest_number.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = selectedCategory === 'All' || p.category_code === selectedCategory;
    const matchesCompetition = selectedCompetition === 'All' || (
      !!selectedCompetitionDetails?.itemId && festivalRegistrations.some((registration: any) =>
        registration.participant_id === p.id &&
        registration.item_id === selectedCompetitionDetails.itemId &&
        registration.status !== 'rejected' &&
        (!selectedCompetitionDetails.categoryCode || (p.category_code || '').trim().toUpperCase() === selectedCompetitionDetails.categoryCode.trim().toUpperCase())
      )
    );
    const matchesStatus = selectedStatus === 'All' || (p.status || 'pending').toLowerCase() === selectedStatus.toLowerCase();
    const matchesGender = selectedGender === 'All' || (p.gender || '').toLowerCase() === selectedGender.toLowerCase();

    return matchesSearch && matchesCompetition && matchesCat && matchesStatus && matchesGender;
  });

  const currentFestivalParticipants = activeFestival?.id
    ? participants.filter((participant: any) => participant.festival_id === activeFestival.id)
    : participants;
  const exportTeams: ExportChoice[] = Array.from(new Map(currentFestivalParticipants
    .filter((participant: any) => participant.organisation_id && participant.organisations?.name)
    .map((participant: any) => [participant.organisation_id, { id: participant.organisation_id, label: participant.organisations.name }])).values())
    .sort((a, b) => a.label.localeCompare(b.label));
  const exportItems: ExportChoice[] = (activeItems as any[])
    .filter((item: any) => item?.id)
    .map((item: any) => ({ id: item.id, label: item.item_code ? `${item.item_code} · ${item.item_name_en || item.item_name_ml || 'Unnamed item'}` : item.item_name_en || item.item_name_ml || 'Unnamed item' }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const openExport = () => {
    if (!exportTeamId && exportTeams[0]) setExportTeamId(exportTeams[0].id);
    if (!exportItemId && exportItems[0]) setExportItemId(exportItems[0].id);
    setIsExportOpen(true);
  };

  const runExport = async () => {
    try {
      setIsExporting(true);
      if (exportKind === 'csv') {
        await downloadParticipantsCsv(filteredParticipants.map((participant: any): ExportParticipant => ({
          id: participant.id, name: participant.name, chest_number: participant.chest_number,
          organisation_id: participant.organisation_id, organisation_name: participant.organisations?.name,
          category_code: participant.category_code, gender: participant.gender, age: participant.age,
          status: participant.status, created_at: participant.created_at, registered_by: participant.registered_by,
        })));
        setIsExportOpen(false);
        return;
      }
      if (!activeFestival?.id) throw new Error('Select an active festival before exporting.');
      const people: ExportParticipant[] = currentFestivalParticipants.map((participant: any) => ({
        id: participant.id, name: participant.name, chest_number: participant.chest_number,
        organisation_id: participant.organisation_id, organisation_name: participant.organisations?.name,
        category_code: participant.category_code, gender: participant.gender, age: participant.age,
        status: participant.status, created_at: participant.created_at, registered_by: participant.registered_by,
      }));
      const itemRecords: ExportItem[] = (activeItems as any[]).map((item: any) => ({
        id: item.id, item_code: item.item_code, item_name_en: item.item_name_en,
        item_name_ml: item.item_name_ml, category_codes: item.category_codes,
        participation_type: item.participation_type,
      }));
      const groupMembers = await loadAdminGroupMembers(festivalRegistrations as any[]);
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
        const team = exportTeams.find((candidate) => candidate.id === exportTeamId);
        if (!team) throw new Error('Select a team to export.');
        const teamPeople = people.filter((person) => person.organisation_id === team.id);
        const teamAssignments = assignments.filter((assignment) => assignment.organisation_id === team.id);
        if (exportKind === 'slips') downloadTeamParticipantSlipsPdf({ teamName: team.label, participants: teamPeople, items: itemRecords, assignments: teamAssignments });
        else downloadTeamItemParticipantsPdf({ teamName: team.label, teamId: team.id, participants: teamPeople, items: itemRecords, assignments: teamAssignments });
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
    setSelectMode(prev => !prev);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filteredParticipants.map((p: any) => p.id)));

  const bulkUpdateAction = async (action: 'delete' | 'approve') => {
    const ids = Array.from(selected);
    try {
      if (action === 'delete') {
        await deleteMultiple(ids);
      } else {
        await approveMultiple(ids);
      }
      setSelected(new Set());
      setSelectMode(false);
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert('Action failed: ' + error.message);
      else Alert.alert('Error', error.message);
    }
  };

  const confirmBulkAction = (action: 'delete' | 'approve') => {
    if (selected.size === 0) return;
    const msg = action === 'delete'
      ? `Delete ${selected.size} selected participant(s)? This cannot be undone.`
      : `Approve ${selected.size} selected participant(s)?`;

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) bulkUpdateAction(action);
    } else {
      Alert.alert('Confirm', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: action === 'delete' ? 'Delete' : 'Approve', style: action === 'delete' ? 'destructive' : 'default', onPress: () => bulkUpdateAction(action) },
      ]);
    }
  };

  const hasActiveFilters =
    selectedCompetition !== 'All' || selectedCategory !== 'All' || selectedStatus !== 'All' || selectedGender !== 'All';

  const clearFilters = () => {
    setSelectedCompetition('All');
    setSelectedCategory('All');
    setSelectedStatus('All');
    setSelectedGender('All');
  };

  const selectCompetition = (value: string) => {
    setSelectedCompetition(value);
    // A competition already contains its item category; avoid a stale
    // standalone category filter producing an empty or misleading export.
    setSelectedCategory('All');
  };

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4" stickyHeaderIndices={[1]}>
      {/* Header */}
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-3xl font-poppins-black text-ssf-text">Participants</Text>
          <Text className="text-sm font-poppins text-ssf-text-muted mt-1">{filteredParticipants.length} showing</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexShrink: 1, marginLeft: 12 }}
          contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingRight: 2 }}
        >
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/chest-numbers')} className="p-2 bg-core-surface-white border border-ssf-border rounded-lg flex-row items-center gap-x-1">
            <Text className="font-poppins-bold text-ui-primary-text text-xs hidden sm:flex">Numbers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(admin)/participants/chest-cards' as any)}
            className="p-2 bg-core-surface-white border border-ssf-border rounded-lg flex-row items-center gap-x-1"
          >
            <Text className="font-poppins-bold text-ui-primary-text text-xs">🪪 Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(admin)/participants/manage-units' as any)}
            className="p-2 bg-core-surface-white border border-ssf-border rounded-lg flex-row items-center gap-x-1"
          >
            <GitCompare size={14} color={coreColor("#1B6B3A", 'primaryText')} />
            <Text className="font-poppins-bold text-ui-primary-text text-xs">Reassign</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openExport}
            disabled={isExporting || isLoadingList || isLoadingItems || isLoadingRegistrations}
            accessibilityRole="button"
            accessibilityLabel="Export participants"
            className={`px-3 py-2 bg-ui-primary border border-ui-primary rounded-lg flex-row items-center gap-x-2 ${isLoadingList || isLoadingItems || isLoadingRegistrations ? 'opacity-60' : ''}`}
          >
            <FileDown size={16} color={ui.colors.onPrimary} />
            <Text className="font-poppins-bold text-xs text-core-on-primary-white">Export</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/import')} className="p-2 bg-core-surface-white border border-ssf-border rounded-lg">
            <Upload size={20} color={coreColor("#1B6B3A", 'primaryText')} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(admin)/participants/programs' as any)}
            className="p-2 bg-core-surface-white border border-ssf-border rounded-lg flex-row items-center gap-x-2"
            accessibilityRole="button"
            accessibilityLabel="Manage programs"
          >
            <Trophy size={16} color={coreColor("#1B6B3A", 'primaryText')} />
            <Text className="font-poppins-bold text-ui-primary-text text-xs">Programs</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/add')} className="p-2 bg-ssf-primary border border-ssf-primary rounded-lg flex-row items-center gap-x-2">
            <UserPlus size={20} color={coreColor("white", 'onPrimary')} />
            <Text className="font-poppins-bold text-core-on-primary-white text-xs hidden sm:flex">Add New</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Sticky Filters & Search */}
      <View className="bg-ui-bg pb-4 z-10">
        <View className="bg-core-surface-white border border-ui-border rounded-xl p-3">
        <View className="flex-row items-center bg-core-surface-white border border-ui-border rounded-xl px-4 h-11">
          <Search size={18} color={coreColor("#9CA3AF", 'textMuted')} />
          <TextInput
            className="flex-1 ml-2 font-poppins text-ssf-text outline-none"
            placeholder="Search by name or chest number..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={coreColor("#9CA3AF", 'textMuted')} />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 }}
        >
          <CompactFilter
            label="Competition"
            items={competitionOptions}
            selectedValue={selectedCompetition}
            onSelect={selectCompetition}
            width={280}
            searchable
            autoFocusSearch={false}
            keepInViewport
          />
          <CompactFilter
            label="Category"
            items={categories}
            selectedValue={selectedCategory}
            onSelect={setSelectedCategory}
            width={148}
            searchable={false}
          />
          <CompactFilter
            label="Status"
            items={statuses}
            selectedValue={selectedStatus}
            onSelect={setSelectedStatus}
            width={142}
          />
          <CompactFilter
            label="Gender"
            items={genders}
            selectedValue={selectedGender}
            onSelect={setSelectedGender}
            width={132}
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
              {filteredParticipants.length} results
            </Text>
          </View>
        </ScrollView>
        </View>
      </View>

      {/* Bulk action bar */}
      <View className="flex-row items-center justify-between mb-4 mt-2">
        {!selectMode ? (
          <TouchableOpacity onPress={toggleSelectMode} className="flex-row items-center gap-x-2 px-3 py-2 bg-core-surface-white border border-ssf-border rounded-lg">
            <CheckSquare size={16} color={coreColor("#1B6B3A", 'primaryText')} />
            <Text className="font-poppins-bold text-xs text-ui-primary-text">Select Multiple</Text>
          </TouchableOpacity>
        ) : (
          <View className="flex-1 flex-row items-center justify-between bg-core-surface-white px-3 py-2 border border-ssf-border rounded-lg">
            <View className="flex-row items-center gap-x-3">
              <TouchableOpacity onPress={toggleSelectMode} className="p-1">
                <X size={18} color={ui.colors.textMuted} />
              </TouchableOpacity>
              <Text className="font-poppins-bold text-ssf-text">{selected.size} selected</Text>
              <TouchableOpacity onPress={selectAll}>
                <Text className="font-poppins text-xs text-ui-primary-text">All</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row gap-x-2">
              <TouchableOpacity onPress={() => confirmBulkAction('delete')} disabled={processingBulk || selected.size === 0} className={`p-2 rounded-lg ${selected.size > 0 ? 'bg-core-danger-soft-red-100' : 'bg-core-surface-muted-gray-100'}`}>
                <Trash2 size={16} color={selected.size > 0 ? coreColor('#DC2626', 'danger') : coreColor('#9CA3AF', 'textMuted')} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmBulkAction('approve')} disabled={processingBulk || selected.size === 0} className={`flex-row items-center gap-x-1 px-3 py-2 rounded-lg ${selected.size > 0 ? 'bg-ssf-primary' : 'bg-core-surface-strong-gray-200'}`}>
                {processingBulk ? <ActivityIndicator color={coreColor("white", 'onPrimary')} size="small" /> : <CheckCircle size={16} color={selected.size > 0 ? coreColor('white', 'onPrimary') : coreColor('#9CA3AF', 'textMuted')} />}
                <Text className={`font-poppins-bold text-xs ${selected.size > 0 ? 'text-core-on-primary-white' : 'text-core-text-muted-gray-400'}`}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* List */}
      <SsfCard className="mb-20 p-0 overflow-hidden">
        {isLoadingList || isLoadingItems || isLoadingRegistrations ? (
          <View className="p-4">
            <SsfTableSkeleton rows={7} columns={6} compact={!isDesktopTable} />
          </View>
        ) : filteredParticipants.length === 0 ? (
          <View className="items-center justify-center py-10">
            <Text className="text-ssf-text-muted font-poppins mb-4">No participants found.</Text>
          </View>
        ) : isDesktopTable ? (
          <View>
            <View className="min-h-11 px-4 flex-row items-center bg-ui-muted border-b border-ui-border">
              {selectMode && <View style={{ width: 42 }} />}
              <Text style={{ flex: 2.4 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">
                Participant
              </Text>
              <Text style={{ flex: 0.9 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">
                Chest No.
              </Text>
              <Text style={{ flex: 0.75 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">
                Category
              </Text>
              <Text style={{ flex: 0.75 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">
                Gender
              </Text>
              <Text style={{ flex: 1.5 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">
                Organisation
              </Text>
              <Text style={{ width: 112 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">
                Status
              </Text>
              <Text style={{ width: 130 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted text-right">
                Actions
              </Text>
            </View>
            {filteredParticipants.map((p: any) => {
              const isSelected = selected.has(p.id);
              const statColor = getStatusColor(p.status);
              return (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.72}
                  className={`min-h-16 px-4 flex-row items-center border-b border-ui-border ${
                    isSelected ? 'bg-core-primary-soft-teal-50' : 'bg-core-surface-white'
                  }`}
                  onPress={() => selectMode ? toggleSelect(p.id) : router.push(`/(admin)/participants/${p.id}`)}
                  onLongPress={() => {
                    if (!selectMode) setSelectMode(true);
                    toggleSelect(p.id);
                  }}
                >
                  {selectMode && (
                    <View style={{ width: 42 }}>
                      {isSelected
                        ? <CheckSquare size={18} color={coreColor("#0F766E", 'primaryText')} />
                        : <Square size={18} color={ui.colors.textSubtle} />}
                    </View>
                  )}
                  <View style={{ flex: 2.4, paddingRight: 12 }}>
                    <Text numberOfLines={1} className="font-poppins-bold text-sm text-ui-text">
                      {p.name}
                    </Text>
                    <Text numberOfLines={1} className="font-poppins text-[10px] text-ui-text-muted mt-0.5">
                      Registered {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                    </Text>
                  </View>
                  <Text style={{ flex: 0.9 }} numberOfLines={1} className="font-poppins text-xs text-ui-text">
                    {p.chest_number || '—'}
                  </Text>
                  <Text style={{ flex: 0.75 }} numberOfLines={1} className="font-poppins-bold text-xs text-ui-text">
                    {p.category_code || '—'}
                  </Text>
                  <Text style={{ flex: 0.75 }} numberOfLines={1} className="font-poppins text-xs text-ui-text-muted capitalize">
                    {p.gender || '—'}
                  </Text>
                  <View style={{ flex: 1.5, paddingRight: 12 }}>
                    <Text numberOfLines={1} className="font-poppins text-xs text-ui-text">
                      {p.organisations?.name || '—'}
                    </Text>
                    {p.organisations?.org_type && (
                      <Text numberOfLines={1} className="font-poppins text-[9px] text-ui-text-muted capitalize">
                        {p.organisations.org_type}
                      </Text>
                    )}
                  </View>
                  <View style={{ width: 112, alignItems: 'flex-start' }}>
                    <TouchableOpacity
                      onPress={(event) => {
                        event.stopPropagation();
                        promptStatusChange(p);
                      }}
                      className={`px-2.5 py-1 rounded-full border ${statColor.bg} ${statColor.border}`}
                    >
                      <Text className={`font-poppins-bold text-[9px] uppercase ${statColor.text}`}>
                        {p.status || 'Pending'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ width: 130, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                    {p.profile_slug && !selectMode && (
                      <TouchableOpacity
                        onPress={(event) => {
                          event.stopPropagation();
                          router.push(`/candidate/${p.profile_slug}` as any);
                        }}
                        className="h-8 px-2.5 rounded-lg border border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50 items-center justify-center"
                      >
                        <Text className="font-poppins-bold text-[9px] text-core-success-emerald-700">Public Profile</Text>
                      </TouchableOpacity>
                    )}
                    {!selectMode && <ChevronRight size={17} color={ui.colors.textSubtle} />}
                  </View>
                </TouchableOpacity>
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
                    onPress={() => selectMode ? toggleSelect(p.id) : router.push(`/(admin)/participants/${p.id}`)}
                    onLongPress={() => {
                      if (!selectMode) setSelectMode(true);
                      toggleSelect(p.id);
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
      <ParticipantExportModal
        visible={isExportOpen}
        isTeamPortal={false}
        colors={{ overlay: 'rgba(12, 20, 32, 0.48)', surface: '#FFFFFF', text: ui.colors.text, muted: ui.colors.textMuted, border: ui.colors.border, primary: ui.colors.primary, onPrimary: ui.colors.onPrimary, selected: ui.colors.surfaceMuted }}
        teams={exportTeams}
        items={exportItems}
        selectedKind={exportKind}
        selectedTeamId={exportTeamId}
        selectedItemId={exportItemId}
        sortBy={exportSort}
        busy={isExporting}
        onKindChange={setExportKind}
        onTeamChange={setExportTeamId}
        onItemChange={setExportItemId}
        onSortChange={setExportSort}
        onClose={() => setIsExportOpen(false)}
        onDownload={runExport}
      />
    </ScrollView>
  );
}
