import { ui } from '@/constants/designSystem';
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, TextInput, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useFestival } from '../../../core/hooks/useFestival';
import { useAuthStore } from '../../../core/store/authStore';
import { downloadParticipantItemsPdf, downloadParticipantPdf } from '../../../services/participantItemsPdfService';
import { UserPlus, ChevronRight, Upload, CheckSquare, Square, X, Search, FileDown, CheckCircle, Trash2, GitCompare, RotateCcw } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { SsfSelectMenu } from '../../../components/ui/SsfSelectMenu';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';

export default function ParticipantsList() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktopTable = width >= 980;
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const { useItems } = useFestival();
  const { data: activeItems = [], isLoading: isLoadingItems } = useItems(activeFestival?.id);
  const { tenant_id: tenantId, is_superadmin: isSuperadmin } = useAuthStore();
  const [isExportingItemsPdf, setIsExportingItemsPdf] = useState(false);
  
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

  const categories = [
    'All',
    ...Array.from(new Set([
      'LP', 'UP', 'HS', 'HSS', 'JUNIOR', 'SENIOR', 'CAMPUS', 'GENERAL',
      ...participants.map((participant: any) => participant.category_code).filter(Boolean),
    ])).sort((a, b) => (a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b))),
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

  const exportToExcel = async () => {
    if (filteredParticipants.length === 0) {
      if (Platform.OS === 'web') window.alert('No data to export');
      else Alert.alert('No Data', 'No participants found to export.');
      return;
    }

    const data = filteredParticipants.map((p: any) => ({
      'Name': p.name,
      'Chest Number': p.chest_number || '-',
      'Category': p.category_code || '-',
      'Gender': p.gender || '-',
      'Age': p.age || '-',
      'Status': (p.status || 'pending').toUpperCase(),
      'Registered By': p.registered_by || '-',
      'Created At': new Date(p.created_at).toLocaleDateString()
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Participants");

    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const filename = `Participants_${new Date().getTime()}.xlsx`;

    if (Platform.OS === 'web') {
      const uri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
      const link = document.createElement('a');
      link.href = uri;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const docDir = (FileSystem as any).documentDirectory || '';
      const fileUri = docDir + filename;
      const encType = (FileSystem as any).EncodingType?.Base64 || 'base64';
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: encType });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Error', 'Sharing not available on this device');
      }
    }
  };

  const exportItemsPdf = async (allTenants = false) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Web download only', 'Open the admin portal in a browser to download this PDF.');
      return;
    }
    if (!activeFestival?.id && !tenantId) {
      window.alert('No active festival or tenant was found for this export.');
      return;
    }
    if (!allTenants && filteredParticipants.length === 0) {
      window.alert('No participants match the selected item and category filters.');
      return;
    }
    try {
      setIsExportingItemsPdf(true);
      const result = await downloadParticipantItemsPdf({
        festivalId: activeFestival?.id,
        tenantId,
        allTenants,
        itemId: allTenants ? undefined : selectedCompetitionDetails?.itemId,
        categoryCode: allTenants ? undefined : (selectedCompetitionDetails?.categoryCode || selectedCategory),
        participants: allTenants ? undefined : filteredParticipants,
      });
      window.alert(`PDF downloaded: ${result.participantCount} participants across ${result.itemCount} item-category competitions.`);
    } catch (error: any) {
      window.alert(error?.message || 'Unable to generate the participant item PDF.');
    } finally {
      setIsExportingItemsPdf(false);
    }
  };

  const exportParticipantPdf = async (allTenants = false) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Web download only', 'Open the admin portal in a browser to download this PDF.');
      return;
    }
    if (!activeFestival?.id && !tenantId) {
      window.alert('No active festival or tenant was found for this export.');
      return;
    }
    try {
      setIsExportingItemsPdf(true);
      const result = await downloadParticipantPdf({
        festivalId: activeFestival?.id,
        tenantId,
        allTenants,
        participants: allTenants ? undefined : participants,
      });
      window.alert(`PDF downloaded: ${result.participantCount} participants.`);
    } catch (error: any) {
      window.alert(error?.message || 'Unable to generate the participant PDF.');
    } finally {
      setIsExportingItemsPdf(false);
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
      case 'approved': return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' };
      case 'rejected': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
      default: return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' };
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

  const CompactFilter = ({
    label,
    items,
    selectedValue,
    onSelect,
    width: filterWidth,
  }: {
    label: string;
    items: (string | { id: string; label: string })[];
    selectedValue: string;
    onSelect: (value: string) => void;
    width: number;
  }) => (
    <SsfSelectMenu
      value={selectedValue}
      onValueChange={onSelect}
      accessibilityLabel={`Filter by ${label}`}
      width={filterWidth}
      compact
      active={selectedValue !== 'All'}
      options={items.map((item) => ({
        label: typeof item === 'string'
          ? (item === 'All' ? `${label}: All` : `${label}: ${item}`)
          : (item.id === 'All' ? `${label}: All` : item.label),
        value: typeof item === 'string' ? item : item.id,
      }))}
    />
  );

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
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/chest-numbers')} className="p-2 bg-white border border-ssf-border rounded-lg flex-row items-center gap-x-1">
            <Text className="font-poppins-bold text-ssf-primary text-xs hidden sm:flex">Numbers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(admin)/participants/chest-cards' as any)}
            className="p-2 bg-white border border-ssf-border rounded-lg flex-row items-center gap-x-1"
          >
            <Text className="font-poppins-bold text-ssf-primary text-xs">🪪 Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(admin)/participants/manage-units' as any)}
            className="p-2 bg-white border border-ssf-border rounded-lg flex-row items-center gap-x-1"
          >
            <GitCompare size={14} color="#1B6B3A" />
            <Text className="font-poppins-bold text-ssf-primary text-xs">Reassign</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={exportToExcel} className="p-2 bg-white border border-ssf-border rounded-lg">
            <FileDown size={20} color="#1B6B3A" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => exportItemsPdf(false)}
            disabled={isExportingItemsPdf}
            className="p-2 bg-white border border-ssf-border rounded-lg flex-row items-center gap-x-1"
          >
            <FileDown size={18} color={ui.colors.primary} />
            <Text className="font-poppins-bold text-xs text-ui-primary">Item PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => exportParticipantPdf(false)}
            disabled={isExportingItemsPdf}
            className="p-2 bg-white border border-ssf-border rounded-lg flex-row items-center gap-x-1"
          >
            <FileDown size={18} color={ui.colors.primary} />
            <Text className="font-poppins-bold text-xs text-ui-primary">Participant PDF</Text>
          </TouchableOpacity>
          {isSuperadmin && (
            <TouchableOpacity
              onPress={() => exportItemsPdf(true)}
              disabled={isExportingItemsPdf}
              className="p-2 bg-ui-primary border border-ui-primary rounded-lg flex-row items-center gap-x-1"
            >
              <FileDown size={18} color={ui.colors.surface} />
              <Text className="font-poppins-bold text-xs text-white">All-Tenant PDF</Text>
            </TouchableOpacity>
          )}
          {isSuperadmin && (
            <TouchableOpacity
              onPress={() => exportParticipantPdf(true)}
              disabled={isExportingItemsPdf}
              className="p-2 bg-ui-primary border border-ui-primary rounded-lg flex-row items-center gap-x-1"
            >
              <FileDown size={18} color={ui.colors.surface} />
              <Text className="font-poppins-bold text-xs text-white">All-Tenant Participant PDF</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/import')} className="p-2 bg-white border border-ssf-border rounded-lg">
            <Upload size={20} color="#1B6B3A" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/add')} className="p-2 bg-ssf-primary border border-ssf-primary rounded-lg flex-row items-center gap-x-2">
            <UserPlus size={20} color="white" />
            <Text className="font-poppins-bold text-white text-xs hidden sm:flex">Add New</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Sticky Filters & Search */}
      <View className="bg-ui-bg pb-4 z-10">
        <View className="bg-white border border-ui-border rounded-xl p-3">
        <View className="flex-row items-center bg-white border border-ui-border rounded-xl px-4 h-11">
          <Search size={18} color="#9CA3AF" />
          <TextInput
            className="flex-1 ml-2 font-poppins text-ssf-text outline-none"
            placeholder="Search by name or chest number..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color="#9CA3AF" />
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
          />
          <CompactFilter
            label="Category"
            items={categories}
            selectedValue={selectedCategory}
            onSelect={setSelectedCategory}
            width={148}
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
              className="h-9 px-3 rounded-lg border border-ui-border bg-white flex-row items-center justify-center"
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
          <TouchableOpacity onPress={toggleSelectMode} className="flex-row items-center gap-x-2 px-3 py-2 bg-white border border-ssf-border rounded-lg">
            <CheckSquare size={16} color="#1B6B3A" />
            <Text className="font-poppins-bold text-xs text-ssf-primary">Select Multiple</Text>
          </TouchableOpacity>
        ) : (
          <View className="flex-1 flex-row items-center justify-between bg-white px-3 py-2 border border-ssf-border rounded-lg">
            <View className="flex-row items-center gap-x-3">
              <TouchableOpacity onPress={toggleSelectMode} className="p-1">
                <X size={18} color={ui.colors.textMuted} />
              </TouchableOpacity>
              <Text className="font-poppins-bold text-ssf-text">{selected.size} selected</Text>
              <TouchableOpacity onPress={selectAll}>
                <Text className="font-poppins text-xs text-ssf-primary">All</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row gap-x-2">
              <TouchableOpacity onPress={() => confirmBulkAction('delete')} disabled={processingBulk || selected.size === 0} className={`p-2 rounded-lg ${selected.size > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                <Trash2 size={16} color={selected.size > 0 ? '#DC2626' : '#9CA3AF'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmBulkAction('approve')} disabled={processingBulk || selected.size === 0} className={`flex-row items-center gap-x-1 px-3 py-2 rounded-lg ${selected.size > 0 ? 'bg-ssf-primary' : 'bg-gray-200'}`}>
                {processingBulk ? <ActivityIndicator color="white" size="small" /> : <CheckCircle size={16} color={selected.size > 0 ? 'white' : '#9CA3AF'} />}
                <Text className={`font-poppins-bold text-xs ${selected.size > 0 ? 'text-white' : 'text-gray-400'}`}>Approve</Text>
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
                    isSelected ? 'bg-teal-50' : 'bg-white'
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
                        ? <CheckSquare size={18} color="#0F766E" />
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
                        className="h-8 px-2.5 rounded-lg border border-emerald-200 bg-emerald-50 items-center justify-center"
                      >
                        <Text className="font-poppins-bold text-[9px] text-emerald-700">Public Profile</Text>
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
                    className={`min-h-[72px] flex-row items-center justify-between border-b border-ssf-border px-3 py-2 ${isSelected ? 'bg-green-50' : 'bg-ssf-surface'
                      }`}
                    onPress={() => selectMode ? toggleSelect(p.id) : router.push(`/(admin)/participants/${p.id}`)}
                    onLongPress={() => {
                      if (!selectMode) setSelectMode(true);
                      toggleSelect(p.id);
                    }}
                  >
                    {selectMode && (
                      <View className="mr-3">
                        {isSelected ? <CheckSquare size={20} color="#1B6B3A" /> : <Square size={20} color="#9CA3AF" />}
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
                        <Text numberOfLines={1} className="mt-0.5 font-poppins text-[9px] text-blue-600">
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
                            className="rounded-md bg-emerald-50 px-2 py-1"
                          >
                            <Text className="font-poppins-bold text-[8px] text-emerald-700">Public</Text>
                          </TouchableOpacity>
                        )}
                        <ChevronRight size={16} color="#9CA3AF" />
                      </View>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        )}
      </SsfCard>
    </ScrollView>
  );
}
