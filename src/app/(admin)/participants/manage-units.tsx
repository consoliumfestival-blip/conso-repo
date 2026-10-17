import { ui } from '@/constants/designSystem';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useFestival } from '../../../core/hooks/useFestival';
import { useAuthStore } from '../../../core/store/authStore';
import { participantService } from '../../../services/participantService';
import { participantUnitAssignmentService, AssignmentPreviewReport } from '../../../services/participantUnitAssignmentService';
import { ArrowLeft, Search, CheckSquare, Square, X, ChevronLeft, ChevronRight, FileDown, CheckCircle, RefreshCw, AlertTriangle, Play, HelpCircle } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as XLSX from 'xlsx';

export default function ManageUnits() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const showAlert = (title: string, message: string, buttons?: { text: string; onPress?: () => void; style?: string }[]) => {
    if (Platform.OS === 'web') {
      if (buttons && buttons.length > 0) {
        const defaultButton = buttons.find(b => b.style !== 'cancel') || buttons[0];
        const isConfirm = window.confirm(`${title}\n\n${message}`);
        if (isConfirm && defaultButton && defaultButton.onPress) {
          defaultButton.onPress();
        }
      } else {
        window.alert(`${title}\n\n${message}`);
      }
    } else {
      Alert.alert(title, message, buttons as any);
    }
  };

  const { tenant_id: authTenantId, user } = useAuthStore();
  const tenantId = authTenantId || '';
  const userId = user?.id || null;

  // Active Festival
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival } = useActiveFestival();
  const festivalId = festival?.id;

  // Tab State
  const [activeTab, setActiveTab] = useState<'reassign' | 'history'>('reassign');

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('All');
  const [selectedItemId, setSelectedItemId] = useState<string>('All');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetUnitId, setTargetUnitId] = useState<string>('');

  // UI Modals & Processing States
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewReport, setPreviewReport] = useState<AssignmentPreviewReport | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmInputText, setConfirmInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressState, setProgressState] = useState({ processed: 0, total: 0, currentChunk: 0, totalChunks: 0 });

  // Load Participants list via React Query
  const { participants, isLoadingList } = useParticipants();

  // Load Organisations list
  const [organisations, setOrganisations] = useState<any[]>([]);
  useEffect(() => {
    if (tenantId) {
      participantService.listOrganisations(tenantId).then(setOrganisations);
    }
  }, [tenantId]);

  const orgMap = useMemo(() => {
    const map = new Map<string, string>();
    organisations.forEach((o: any) => map.set(o.id, `${o.name} (${o.org_type})`));
    return map;
  }, [organisations]);

  // Load Items list
  const { data: items = [] } = useItems(festivalId);

  // Load registrations for item if item filter is selected
  const { useItemRegistrations } = useParticipants();
  const { data: itemRegistrations = [], isLoading: isLoadingRegs } = useItemRegistrations(
    selectedItemId !== 'All' ? selectedItemId : undefined
  );

  const registeredParticipantIds = useMemo(() => {
    return new Set(itemRegistrations.map((r: any) => r.participant_id));
  }, [itemRegistrations]);

  // Load Batches & Audit Logs
  const batchesQuery = useQuery({
    queryKey: ['participant-unit-batches', tenantId],
    queryFn: () => participantUnitAssignmentService.listBatches<any>(tenantId),
    enabled: !!tenantId && activeTab === 'history',
  });

  const logsQuery = useQuery({
    queryKey: ['participant-unit-audit-logs', tenantId],
    queryFn: () => participantUnitAssignmentService.listAuditLogs<any>(),
    enabled: !!tenantId && activeTab === 'history',
  });

  const categories = ['All', 'LP', 'UP', 'HS', 'HSS', 'JUNIOR', 'SENIOR', 'CAMPUS', 'GENERAL'];

  // Filtered Participants
  const filteredParticipants = useMemo(() => {
    return participants.filter((p: any) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.chest_number && p.chest_number.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCat = selectedCategory === 'All' || p.category_code === selectedCategory;
      const matchesUnit = selectedUnitId === 'All' || p.organisation_id === selectedUnitId;
      const matchesItem = selectedItemId === 'All' || registeredParticipantIds.has(p.id);

      return matchesSearch && matchesCat && matchesUnit && matchesItem;
    });
  }, [participants, searchQuery, selectedCategory, selectedUnitId, selectedItemId, registeredParticipantIds]);

  // Paginated View List
  const paginatedParticipants = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredParticipants.slice(startIndex, startIndex + pageSize);
  }, [filteredParticipants, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredParticipants.length / pageSize) || 1;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedUnitId, selectedItemId, pageSize]);

  // Checkbox functions
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      paginatedParticipants.forEach((p: any) => next.add(p.id));
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredParticipants.map((p: any) => p.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // CSV Exporter Helper
  const downloadCSV = (data: any[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const csvOutput = XLSX.utils.sheet_to_csv(ws);
    if (Platform.OS === 'web') {
      const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      showAlert('Excel Export', 'CSV download is supported on web browsers.');
    }
  };

  // Preview Reassignment Modal Handler
  const handlePreviewAssignment = async () => {
    if (selectedIds.size === 0) {
      showAlert('No Selection', 'Please select at least one participant.');
      return;
    }
    if (!targetUnitId) {
      showAlert('Target Unit Required', 'Please select a Target Unit.');
      return;
    }

    try {
      setPreviewLoading(true);
      const report = await participantUnitAssignmentService.previewUnitAssignment(
        Array.from(selectedIds),
        targetUnitId,
        tenantId
      );
      setPreviewReport(report);
      setConfirmInputText('');
      setIsPreviewOpen(true);
    } catch (error: any) {
      showAlert('Preview Failed', error.message || 'Unable to build assignment preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const exportPreviewCSV = () => {
    if (!previewReport) return;
    const records: any[] = [];
    const targetName = previewReport.targetUnitName;

    // Add Valid rows
    previewReport.validIds.forEach((id) => {
      const p = participants.find((x: any) => x.id === id);
      if (p) {
        records.push({
          Name: p.name,
          'Chest Number': p.chest_number || '-',
          Category: p.category_code,
          'Current Unit': p.organisation_id ? orgMap.get(p.organisation_id) : 'Unassigned',
          'Target Unit': targetName,
          Status: 'Ready',
          Notes: '',
        });
      }
    });

    // Add Skipped rows
    previewReport.skipped.forEach((item) => {
      records.push({
        Name: item.name,
        'Chest Number': '',
        Category: '',
        'Current Unit': '',
        'Target Unit': targetName,
        Status: 'Skipped',
        Notes: item.reason,
      });
    });

    downloadCSV(records, `Preview_Reassignment_${new Date().getTime()}.csv`);
  };

  // Execute Reassignment Chunk-Queue
  const handleExecuteAssignment = async () => {
    if (!previewReport) return;
    const requiresHardConfirm = previewReport.validIds.length > 300;

    if (requiresHardConfirm && confirmInputText.toLowerCase() !== 'confirm') {
      showAlert('Verification Required', 'Please type the word CONFIRM to execute this large reassignment.');
      return;
    }

    try {
      setIsProcessing(true);
      setProgressState({ processed: 0, total: previewReport.validIds.length, currentChunk: 0, totalChunks: 0 });

      const result = await participantUnitAssignmentService.executeBulkUnitAssignment(
        previewReport.validIds,
        previewReport.validHashes,
        targetUnitId,
        tenantId,
        (processed, total) => {
          setProgressState({
            processed,
            total,
            currentChunk: Math.ceil(processed / 200),
            totalChunks: Math.ceil(total / 200),
          });
        }
      );

      showAlert('Reassignment Completed', `Successfully reassigned ${result.successCount} participants.`);
      setIsPreviewOpen(false);
      setSelectedIds(new Set());
      setTargetUnitId('');

      // Invalidate Cache
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['public-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['public-published-results'] });
      queryClient.invalidateQueries({ queryKey: ['festival-results'] });
      queryClient.invalidateQueries({ queryKey: ['publicCandidateProfile'] });
      queryClient.invalidateQueries({ queryKey: ['participant'] });
      queryClient.invalidateQueries({ queryKey: ['media-center'] });
      queryClient.invalidateQueries({ queryKey: ['generated-assets'] });
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
    } catch (error: any) {
      showAlert('Execution Error', error.message || 'An error occurred during chunk reassignment.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Rollback Action Handler
  const handleRollback = async (batchId: string) => {
    showAlert('Confirm Rollback', 'Are you sure you want to revert this entire reassignment batch? Unlocked records will be restored.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revert',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsProcessing(true);
            const result = await participantUnitAssignmentService.rollbackUnitAssignment(batchId, tenantId);
            if (result.skippedCount > 0) {
              showAlert(
                'Rollback Completed (Partial)',
                `Reverted ${result.revertedCount} records. Skipped ${result.skippedCount} locked participants.`
              );
            } else {
              showAlert('Rollback Successful', `Reverted all ${result.revertedCount} participants back to their original units.`);
            }

            // Invalidate Cache
            queryClient.invalidateQueries({ queryKey: ['participants'] });
            queryClient.invalidateQueries({ queryKey: ['participant-unit-batches'] });
            queryClient.invalidateQueries({ queryKey: ['participant-unit-audit-logs'] });
            queryClient.invalidateQueries({ queryKey: ['admin-leaderboard'] });
            queryClient.invalidateQueries({ queryKey: ['public-leaderboard'] });
            queryClient.invalidateQueries({ queryKey: ['public-published-results'] });
            queryClient.invalidateQueries({ queryKey: ['festival-results'] });
            queryClient.invalidateQueries({ queryKey: ['publicCandidateProfile'] });
            queryClient.invalidateQueries({ queryKey: ['participant'] });
            queryClient.invalidateQueries({ queryKey: ['media-center'] });
            queryClient.invalidateQueries({ queryKey: ['generated-assets'] });
            queryClient.invalidateQueries({ queryKey: ['certificates'] });
          } catch (error: any) {
            showAlert('Rollback Failed', error.message || 'An error occurred during rollback.');
          } finally {
            setIsProcessing(false);
          }
        },
      },
    ]);
  };

  // Export Batch Logs CSV
  const handleExportBatchCSV = (batchId: string) => {
    const logs = logsQuery.data || [];
    const batchLogs = logs.filter((l: any) => l.batch_id === batchId);

    if (batchLogs.length === 0) {
      showAlert('No Audit Logs', 'No log history found for this batch.');
      return;
    }

    const records = batchLogs.map((l: any) => ({
      Name: l.participants?.name || 'Deleted Participant',
      'Chest Number': l.participants?.chest_number || '-',
      'Old Unit Name': l.old_unit ? `${l.old_unit.name} (${l.old_unit.org_type})` : 'Unassigned',
      'New Unit Name': l.new_unit ? `${l.new_unit.name} (${l.new_unit.org_type})` : 'Deleted Target',
      Timestamp: new Date(l.changed_at).toLocaleString(),
      'Revert Status': l.is_reverted ? `Reverted (at ${new Date(l.reverted_at).toLocaleString()})` : 'Active',
    }));

    downloadCSV(records, `Audit_Batch_${batchId}_${new Date().getTime()}.csv`);
  };

  return (
    <View className="flex-1 bg-ssf-bg">
      <ScrollView className="flex-1 py-6 px-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.replace('/(admin)/participants')} className="p-2 mr-2 bg-white rounded-full border border-ssf-border">
            <ArrowLeft size={24} color={ui.colors.text} />
          </TouchableOpacity>
          <View>
            <Text className="text-3xl font-poppins-black text-ssf-text">Reassign Units</Text>
            <Text className="text-sm font-poppins text-ssf-text-muted">Safe bulk unit mapping utility</Text>
          </View>
        </View>

        {/* Tab Selector */}
        <View className="flex-row bg-white border border-ssf-border rounded-xl p-1">
          <TouchableOpacity
            onPress={() => setActiveTab('reassign')}
            className={`px-4 py-2 rounded-lg ${activeTab === 'reassign' ? 'bg-ssf-primary' : 'bg-transparent'}`}
          >
            <Text className={`font-poppins-bold text-xs ${activeTab === 'reassign' ? 'text-white' : 'text-ssf-text'}`}>Reassign</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg ${activeTab === 'history' ? 'bg-ssf-primary' : 'bg-transparent'}`}
          >
            <Text className={`font-poppins-bold text-xs ${activeTab === 'history' ? 'text-white' : 'text-ssf-text'}`}>Batch Logs</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'reassign' ? (
        <View className="flex-1 flex-row flex-wrap gap-4">
          {/* Main Controls Panel */}
          <View className="w-full lg:w-1/4 bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-4 h-fit">
            <Text className="text-lg font-poppins-bold text-ssf-text mb-4">1. Filter Records</Text>

            {/* Text Search */}
            <View className="flex-row items-center bg-ssf-bg border border-ssf-border rounded-xl px-3 py-2 mb-3">
              <Search size={18} color="#9CA3AF" />
              <TextInput
                className="flex-1 ml-2 font-poppins text-sm text-ssf-text outline-none"
                placeholder="Search name/chest no..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            {/* Current Unit Filter */}
            <Text className="font-poppins text-xs text-ssf-text-muted mb-1 ml-1">Current Unit</Text>
            <View className="bg-ssf-bg border border-ssf-border rounded-xl p-1 mb-3">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                <TouchableOpacity
                  onPress={() => setSelectedUnitId('All')}
                  className={`px-3 py-1.5 rounded-lg mr-1 ${selectedUnitId === 'All' ? 'bg-white shadow-sm border border-ssf-border' : 'bg-transparent'}`}
                >
                  <Text className={`font-poppins text-xs ${selectedUnitId === 'All' ? 'text-ssf-primary font-poppins-bold' : 'text-ssf-text'}`}>All Units</Text>
                </TouchableOpacity>
                {organisations.map((org) => (
                  <TouchableOpacity
                    key={org.id}
                    onPress={() => setSelectedUnitId(org.id)}
                    className={`px-3 py-1.5 rounded-lg mr-1 ${selectedUnitId === org.id ? 'bg-white shadow-sm border border-ssf-border' : 'bg-transparent'}`}
                  >
                    <Text className={`font-poppins text-xs ${selectedUnitId === org.id ? 'text-ssf-primary font-poppins-bold' : 'text-ssf-text'}`}>{org.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Category Filter */}
            <Text className="font-poppins text-xs text-ssf-text-muted mb-1 ml-1">Category</Text>
            <View className="bg-ssf-bg border border-ssf-border rounded-xl p-1 mb-3">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg mr-1 ${selectedCategory === cat ? 'bg-white shadow-sm border border-ssf-border' : 'bg-transparent'}`}
                  >
                    <Text className={`font-poppins text-xs ${selectedCategory === cat ? 'text-ssf-primary font-poppins-bold' : 'text-ssf-text'}`}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Event/Item Filter */}
            <Text className="font-poppins text-xs text-ssf-text-muted mb-1 ml-1">Registered Event</Text>
            <View className="bg-ssf-bg border border-ssf-border rounded-xl p-1 mb-4">
              {isLoadingRegs ? (
                <ActivityIndicator size="small" color="#1B6B3A" />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                  <TouchableOpacity
                    onPress={() => setSelectedItemId('All')}
                    className={`px-3 py-1.5 rounded-lg mr-1 ${selectedItemId === 'All' ? 'bg-white shadow-sm border border-ssf-border' : 'bg-transparent'}`}
                  >
                    <Text className={`font-poppins text-xs ${selectedItemId === 'All' ? 'text-ssf-primary font-poppins-bold' : 'text-ssf-text'}`}>All Events</Text>
                  </TouchableOpacity>
                  {items.map((item: any) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => setSelectedItemId(item.id)}
                      className={`px-3 py-1.5 rounded-lg mr-1 ${selectedItemId === item.id ? 'bg-white shadow-sm border border-ssf-border' : 'bg-transparent'}`}
                    >
                      <Text className={`font-poppins text-xs ${selectedItemId === item.id ? 'text-ssf-primary font-poppins-bold' : 'text-ssf-text'}`}>
                        {item.item_code} - {item.item_name_ml}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Target Unit Panel */}
            <Text className="text-lg font-poppins-bold text-ssf-text mb-2">2. Destination Unit</Text>
            <Text className="font-poppins text-xs text-ssf-text-muted mb-2">Select the organisation to reassign selected participants into:</Text>
            <View className="bg-ssf-bg border border-ssf-border rounded-xl p-2 max-h-48 overflow-y-auto mb-4">
              {organisations.map((org) => (
                <TouchableOpacity
                  key={org.id}
                  onPress={() => setTargetUnitId(org.id)}
                  className={`flex-row justify-between items-center p-2 rounded-xl mb-1 ${targetUnitId === org.id ? 'bg-green-50 border border-green-200' : 'bg-white'}`}
                >
                  <Text className={`font-poppins-bold text-xs ${targetUnitId === org.id ? 'text-ssf-primary' : 'text-ssf-text'}`}>{org.name}</Text>
                  <Text className="font-poppins text-[10px] text-ssf-text-muted">{org.org_type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedIds.size > 0 && (
              <SsfButton
                label="Assign Unit"
                onPress={handlePreviewAssignment}
                isLoading={previewLoading}
                icon={<CheckCircle size={18} color="white" />}
              />
            )}
          </View>

          {/* Participants Selection Grid */}
          <View className="flex-1 min-w-[300px]">
            <SsfCard className="flex-1 pb-16">
              <View className="flex-row flex-wrap justify-between items-center mb-4 gap-2">
                <View>
                  <Text className="text-xl font-poppins-bold">Selection List</Text>
                  <Text className="text-xs text-ssf-text-muted">
                    {filteredParticipants.length} matching filters • {selectedIds.size} selected persistently
                  </Text>
                </View>

                {/* Selection Controls */}
                <View className="flex-row gap-x-2">
                  <TouchableOpacity onPress={selectAllPage} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <Text className="font-poppins-bold text-[10px] text-slate-700">Select Page</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={selectAllFiltered} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <Text className="font-poppins-bold text-[10px] text-slate-700">Select All Filtered</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={clearSelection} className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                    <Text className="font-poppins-bold text-[10px] text-red-600">Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {isLoadingList ? (
                <ActivityIndicator color="#1B6B3A" className="my-10" />
              ) : filteredParticipants.length === 0 ? (
                <View className="items-center justify-center py-20 border border-dashed border-ssf-border rounded-xl bg-slate-50">
                  <Text className="text-ssf-text-muted font-poppins text-sm mb-2">No records match your filters.</Text>
                  <Text className="text-ssf-text-muted font-poppins text-xs">Try adjusting the filters in the left sidebar.</Text>
                </View>
              ) : (
                <View className="flex-1">
                  <View className="gap-y-2 mb-4">
                    {paginatedParticipants.map((item: any) => {
                      const isSelected = selectedIds.has(item.id);
                      const orgName = item.organisation_id ? orgMap.get(item.organisation_id) : 'Unassigned';

                      return (
                        <TouchableOpacity
                          key={item.id}
                          className={`flex-row items-center justify-between p-3 border rounded-xl ${
                            isSelected ? 'bg-green-50 border-green-300' : 'bg-white border-ssf-border'
                          }`}
                          onPress={() => toggleSelectOne(item.id)}
                        >
                          <View className="mr-3">
                            {isSelected ? <CheckSquare size={20} color="#1B6B3A" /> : <Square size={20} color="#9CA3AF" />}
                          </View>
                          <View className="flex-1">
                            <View className="flex-row items-center gap-x-2">
                              <Text className="font-poppins-bold text-ssf-text text-sm">{item.name}</Text>
                              {item.is_locked && (
                                <View className="px-1.5 py-0.5 rounded bg-red-100 border border-red-200">
                                  <Text className="font-poppins-bold text-[8px] text-red-600 uppercase">LOCKED</Text>
                                </View>
                              )}
                            </View>
                            <Text className="font-poppins text-[10px] text-ssf-text-muted">
                              {item.chest_number ? `No: ${item.chest_number}` : 'No Chest No.'} • Cat: {item.category_code}
                            </Text>
                            <Text className="font-poppins text-[10px] text-slate-500 mt-0.5">🏠 {orgName}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Pagination Footer */}
                  <View className="flex-row justify-between items-center mt-4 pt-3 border-t border-slate-100">
                    <Text className="font-poppins text-xs text-ssf-text-muted">
                      Page {currentPage} of {totalPages}
                    </Text>

                    <View className="flex-row items-center gap-x-2">
                      <TouchableOpacity
                        onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={`p-2 bg-slate-50 border border-slate-200 rounded-lg ${currentPage === 1 ? 'opacity-40' : ''}`}
                      >
                        <ChevronLeft size={16} color={ui.colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className={`p-2 bg-slate-50 border border-slate-200 rounded-lg ${currentPage === totalPages ? 'opacity-40' : ''}`}
                      >
                        <ChevronRight size={16} color={ui.colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </SsfCard>
          </View>
        </View>
      ) : (
        /* History & Audit logs Tab */
        <ScrollView className="flex-1 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-xl font-poppins-bold">Audit History Batches</Text>
            <TouchableOpacity onPress={() => queryClient.invalidateQueries({ queryKey: ['participant-unit-batches'] })} className="p-2 border border-ssf-border rounded-lg bg-slate-50 flex-row items-center gap-x-1">
              <RefreshCw size={14} color="#334155" />
              <Text className="font-poppins-bold text-[10px] text-slate-600">Reload</Text>
            </TouchableOpacity>
          </View>

          {batchesQuery.isLoading ? (
            <ActivityIndicator color="#1B6B3A" className="my-10" />
          ) : (batchesQuery.data || []).length === 0 ? (
            <View className="items-center justify-center py-20">
              <Text className="font-poppins text-sm text-ssf-text-muted mb-2">No history batches found.</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">Reassignments will appear here as audit batches.</Text>
            </View>
          ) : (
            <View className="gap-y-4 pb-10">
              {(batchesQuery.data || []).map((batch: any) => {
                const targetName = batch.target_unit_id ? orgMap.get(batch.target_unit_id) : 'Unknown Unit';
                const createdDate = new Date(batch.started_at).toLocaleString();

                const isRolledBack = batch.status === 'rolled_back';
                const isPartial = batch.status === 'partial';
                const isFailed = batch.status === 'failed';
                const isProcessingState = batch.status === 'processing';

                return (
                  <View key={batch.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <View className="flex-row justify-between items-start flex-wrap gap-2 mb-2 border-b border-slate-100 pb-2">
                      <View>
                        <Text className="font-poppins-bold text-xs text-slate-500">BATCH ID: {batch.id}</Text>
                        <Text className="font-poppins text-[10px] text-slate-400">Executed: {createdDate}</Text>
                      </View>

                      {/* Status Badge */}
                      <View
                        className={`px-2 py-0.5 rounded-full border ${
                          isRolledBack
                            ? 'bg-orange-50 border-orange-200'
                            : isPartial
                            ? 'bg-yellow-50 border-yellow-200'
                            : isFailed
                            ? 'bg-red-50 border-red-200'
                            : isProcessingState
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-green-50 border-green-200'
                        }`}
                      >
                        <Text
                          className={`font-poppins-bold text-[9px] uppercase ${
                            isRolledBack
                              ? 'text-orange-700'
                              : isPartial
                              ? 'text-yellow-700'
                              : isFailed
                              ? 'text-red-700'
                              : isProcessingState
                              ? 'text-blue-700'
                              : 'text-green-700'
                          }`}
                        >
                          {batch.status}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row justify-between items-center mb-4 flex-wrap gap-2">
                      <View>
                        <Text className="font-poppins text-xs text-slate-800">
                          Destination: <Text className="font-poppins-bold text-ssf-primary">{targetName}</Text>
                        </Text>
                        <Text className="font-poppins text-xs text-slate-700 mt-1">
                          Records: Total: {batch.total_records} | Success: {batch.success_count} | Skipped: {batch.skipped_count} | Failures: {batch.failed_count}
                        </Text>
                        {batch.notes && (
                          <Text className="font-poppins text-[10px] text-red-500 italic mt-1">Error: {batch.notes}</Text>
                        )}
                        {isPartial && batch.skip_reasons && batch.skip_reasons.length > 0 && (
                          <View className="mt-2 bg-yellow-100/50 p-2 rounded-lg border border-yellow-200">
                            <Text className="font-poppins-bold text-[9px] text-yellow-800">Skipped Rollback Items:</Text>
                            {batch.skip_reasons.map((r: any, index: number) => (
                              <Text key={index} className="font-poppins text-[9px] text-yellow-700 ml-1">
                                • {r.name} - {r.reason}
                              </Text>
                            ))}
                          </View>
                        )}
                      </View>

                      {/* Batch Controls */}
                      <View className="flex-row gap-x-2">
                        <TouchableOpacity
                          onPress={() => handleExportBatchCSV(batch.id)}
                          className="p-2 bg-white border border-slate-200 rounded-lg flex-row items-center gap-x-1"
                        >
                          <FileDown size={14} color="#0284c7" />
                          <Text className="font-poppins-bold text-[10px] text-sky-700">Export Logs</Text>
                        </TouchableOpacity>

                        {!isRolledBack && !isFailed && !isProcessingState && (
                          <TouchableOpacity
                            onPress={() => handleRollback(batch.id)}
                            className="p-2 bg-white border border-red-200 rounded-lg flex-row items-center gap-x-1"
                          >
                            <RefreshCw size={14} color="#dc2626" />
                            <Text className="font-poppins-bold text-[10px] text-red-600">Rollback</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
      </ScrollView>

      {/* Confirmation & Preview Modal */}
      {isPreviewOpen && previewReport && (
        <View className="absolute inset-0 bg-black/60 z-50 justify-center items-center p-4">
          <View className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-xl border border-slate-100 max-h-[90%] overflow-y-auto">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <View className="flex-row items-center gap-x-2">
                <AlertTriangle size={24} color="#dc2626" />
                <Text className="text-xl font-poppins-bold text-ssf-text">Verify Reassignment</Text>
              </View>
              <TouchableOpacity onPress={() => setIsPreviewOpen(false)} className="p-1">
                <X size={20} color={ui.colors.textSubtle} />
              </TouchableOpacity>
            </View>

            <View className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <Text className="font-poppins text-xs text-slate-700">
                You are about to reassign:
              </Text>
              <Text className="text-2xl font-poppins-black text-ssf-primary mt-1">
                {previewReport.validIds.length} Participants
              </Text>
              <Text className="font-poppins text-xs text-slate-700 mt-2">
                To Target Organisation:
              </Text>
              <Text className="font-poppins-bold text-slate-900 mt-1">
                {previewReport.targetUnitName}
              </Text>
            </View>

            {/* Current organisation distribution */}
            {previewReport.currentUnits.length > 0 && (
              <View className="mb-4">
                <Text className="font-poppins-bold text-xs text-slate-700 mb-2">Original Distribution:</Text>
                <View className="gap-y-1">
                  {previewReport.currentUnits.map((u, i) => (
                    <Text key={i} className="font-poppins text-xs text-slate-600">
                      • {u.count} from {u.name}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {/* Skipped Records */}
            {previewReport.skipped.length > 0 && (
              <View className="mb-4">
                <View className="flex-row items-center gap-x-1 mb-2">
                  <AlertTriangle size={14} color={ui.colors.warning} />
                  <Text className="font-poppins-bold text-xs text-amber-700">
                    Skipped / Conflict Records ({previewReport.skipped.length}):
                  </Text>
                </View>
                <ScrollView className="max-h-24 bg-amber-50 border border-amber-200 rounded-xl p-2">
                  {previewReport.skipped.map((s, i) => (
                    <Text key={i} className="font-poppins text-[10px] text-amber-800">
                      • {s.name}: {s.reason}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* CSV Export of Preview */}
            <TouchableOpacity
              onPress={exportPreviewCSV}
              className="flex-row items-center justify-center p-2.5 bg-sky-50 border border-sky-200 rounded-xl mb-6"
            >
              <FileDown size={16} color="#0284c7" className="mr-2" />
              <Text className="font-poppins-bold text-xs text-sky-700">Export Preview Details (CSV)</Text>
            </TouchableOpacity>

            {/* Hard Confirmation Gate */}
            {previewReport.validIds.length > 300 && (
              <View className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl">
                <Text className="font-poppins-bold text-xs text-red-800 uppercase mb-1">🔥 Large Operation Alert</Text>
                <Text className="font-poppins text-xs text-red-700 mb-3">
                  This reassignment modifies more than 300 participants. This action will update leaderboards and certificates.
                </Text>
                <Text className="font-poppins text-xs text-red-900 font-poppins-bold mb-2">
                  Type CONFIRM to execute:
                </Text>
                <TextInput
                  value={confirmInputText}
                  onChangeText={setConfirmInputText}
                  className="bg-white border border-red-300 rounded-xl px-3 py-2 text-sm font-poppins-bold outline-none text-red-900"
                  placeholder="Type CONFIRM here..."
                  autoCapitalize="characters"
                />
              </View>
            )}

            {/* Action Buttons */}
            <View className="flex-row gap-x-2">
              <TouchableOpacity
                onPress={() => setIsPreviewOpen(false)}
                className="flex-1 py-3 bg-slate-50 border border-slate-200 rounded-xl items-center"
              >
                <Text className="font-poppins-bold text-sm text-slate-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleExecuteAssignment}
                disabled={previewReport.validIds.length > 300 && confirmInputText.toLowerCase() !== 'confirm'}
                className={`flex-1 py-3 rounded-xl items-center justify-center flex-row ${
                  previewReport.validIds.length > 300 && confirmInputText.toLowerCase() !== 'confirm'
                    ? 'bg-slate-200'
                    : 'bg-ssf-primary'
                }`}
              >
                <Play size={16} color="white" className="mr-2" />
                <Text className="font-poppins-bold text-sm text-white">Execute Batch</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Progress Overlay */}
      {isProcessing && (
        <View className="absolute inset-0 bg-black/70 z-[100] justify-center items-center p-4">
          <View className="bg-white p-6 rounded-3xl w-full max-w-sm items-center shadow-2xl">
            <ActivityIndicator size="large" color="#1B6B3A" className="mb-4" />
            <Text className="font-poppins-bold text-lg text-slate-800 mb-1">Executing Reassignment...</Text>
            <Text className="font-poppins text-xs text-slate-500 text-center mb-4">
              Processing transactional chunks. Do not close or refresh this page.
            </Text>

            {progressState.total > 0 && (
              <View className="w-full">
                <View className="flex-row justify-between mb-1">
                  <Text className="font-poppins text-xs text-slate-600">Processed</Text>
                  <Text className="font-poppins-bold text-xs text-slate-800">
                    {progressState.processed} / {progressState.total}
                  </Text>
                </View>
                <View className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <View
                    className="h-full bg-ssf-primary"
                    style={{ width: `${(progressState.processed / progressState.total) * 100}%` }}
                  />
                </View>
                <Text className="font-poppins text-[10px] text-slate-400 text-center">
                  Chunk: {progressState.currentChunk} of {progressState.totalChunks} (200 records per chunk)
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
