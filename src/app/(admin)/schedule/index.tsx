import { ui } from '@/constants/designSystem';
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, TextInput, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { AdminScheduleChatBot } from '../../../components/ui/AdminScheduleChatBot';
import { useSchedule } from '../../../core/hooks/useSchedule';
import { Calendar, MapPin, Plus, Clock, RotateCcw, UserCheck, Edit, Trash2, Search, X, LogIn, Shuffle, FilePenLine, Trophy } from 'lucide-react-native';
import { useJudges } from '../../../core/hooks/useJudges';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useFestival } from '../../../core/hooks/useFestival';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/config/supabase';
import { SsfSelectMenu } from '../../../components/ui/SsfSelectMenu';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import { SsfActionMenu } from '../../../components/ui/SsfActionMenu';
import { downloadAdminSchedulePdf, downloadBlankSchedulePdf, AdminSchedulePdfMode } from '../../../services/schedulePdfService';

const getItemCategoryCodes = (schedule: any): string[] => {
  const rawCodes = schedule?.items?.category_codes;
  const codes = Array.isArray(rawCodes) ? rawCodes : rawCodes ? [rawCodes] : [];
  return codes.map((code) => String(code).trim()).filter(Boolean);
};

const normalizeCategory = (value: string) => {
  const norm = value.trim().toUpperCase();
  return norm === 'GN' ? 'GENERAL' : norm;
};

const categoryAliases: Record<string, string[]> = {
  LP: ['LP'],
  UP: ['UP'],
  HS: ['HS'],
  HSS: ['HSS'],
  JUNIOR: ['JUNIOR', 'JR'],
  JR: ['JUNIOR', 'JR'],
  SENIOR: ['SENIOR', 'SR'],
  SR: ['SENIOR', 'SR'],
  CAMPUS: ['CAMPUS', 'CA'],
  CA: ['CAMPUS', 'CA'],
  GENERAL: ['GENERAL', 'GN'],
  GN: ['GENERAL', 'GN'],
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ScheduleStatusBadge({ scheduleId }: { scheduleId: string }) {
  const { useJudgeSubmissionSummary } = useJudges();
  const { data: summary } = useJudgeSubmissionSummary(scheduleId);
  if (!summary || !(summary as any[]).length) return null;
  const rows = summary as any[];
  const totalSubmitted = rows.reduce((acc: number, j: any) => acc + Number(j.submitted_count), 0);
  const totalExpected = rows.reduce((acc: number, j: any) => acc + Number(j.total_assigned), 0);
  const allDone = rows.every((j: any) => Number(j.submitted_count) >= Number(j.total_assigned) && Number(j.total_assigned) > 0);
  return (
    <View className={`flex-row items-center gap-x-1 px-2 py-0.5 rounded-full mt-2 self-start ${
      allDone ? 'bg-green-100' : totalSubmitted > 0 ? 'bg-orange-100' : 'bg-gray-100'
    }`}>
      <Text className={`font-poppins text-xs ${
        allDone ? 'text-green-700' : totalSubmitted > 0 ? 'text-orange-700' : 'text-gray-500'
      }`}>
        {allDone ? `✅ Marks: All submitted` : `📝 Marks: ${totalSubmitted}/${totalExpected} submitted`}
      </Text>
    </View>
  );
}

function ScheduleWorkflowBadges({
  scheduleId,
  registrations = [],
  isShuffleLocked,
  marksCompleted = false,
  expectedJudgeCount = 3,
  compact = false,
}: {
  scheduleId: string;
  registrations?: any[];
  isShuffleLocked?: boolean;
  marksCompleted?: boolean;
  expectedJudgeCount?: number;
  compact?: boolean;
}) {
  const { useJudgeSubmissionSummary, useResults } = useJudges();
  const { data: summary } = useJudgeSubmissionSummary(scheduleId);
  const { data: results } = useResults(scheduleId);
  const resultRows = (results as any[]) ?? [];
  const hasInternalPublished = resultRows.some((row) =>
    row.published === true || row.result_status === 'published'
  );
  const hasManualSubmitted = resultRows.some((row) =>
    row.collection_method === 'manual' && (row.published === true || row.result_status === 'published')
  );

  const activeRegs = registrations.filter((r: any) => r.status !== 'rejected');
  const verifiedRegs = activeRegs.filter((r: any) => r.is_verified);
  
  const checkinDone = (activeRegs.length > 0 && activeRegs.every((r: any) => r.is_verified)) || isShuffleLocked;
  const checkinPending = activeRegs.length > 0 && activeRegs.some((r: any) => !r.is_verified) && !isShuffleLocked;
  
  const codesShuffled = (verifiedRegs.length > 0 && verifiedRegs.every((r: any) => r.code_letter !== null && r.code_letter !== undefined)) || isShuffleLocked;
  const codesPending = verifiedRegs.length > 0 && verifiedRegs.some((r: any) => r.code_letter === null || r.code_letter === undefined) && !isShuffleLocked;

  const rows = (summary as any[]) ?? [];
  const totalSubmitted = rows.reduce((acc: number, j: any) => acc + Number(j.submitted_count), 0);
  const registrationsPerJudge = rows.length > 0 ? Number(rows[0].total_assigned) : 0;
  const totalExpected = registrationsPerJudge * expectedJudgeCount;
  const allDone = marksCompleted;

  const badges: { label: string; bg: string; text: string }[] = [];

  // Check-in status (Malayalam highlighted text as requested)
  if (checkinDone) {
    badges.push({ label: 'Check-in Kazhinju', bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700' });
  } else if (checkinPending && !hasManualSubmitted && !hasInternalPublished && !allDone) {
    badges.push({ label: 'Check-in Pending', bg: 'bg-amber-100 border border-amber-200', text: 'text-amber-700' });
  }

  // Code Letter status
  if (codesShuffled) {
    badges.push({ label: 'Codes Shuffled', bg: 'bg-sky-50 border border-sky-200', text: 'text-sky-700' });
  } else if (codesPending && !hasManualSubmitted && !hasInternalPublished && !allDone) {
    badges.push({ label: 'Codes Pending', bg: 'bg-gray-100 border border-gray-200', text: 'text-gray-500' });
  }

  if (hasManualSubmitted) {
    badges.push({ label: 'Mark Submitted (Manual)', bg: 'bg-green-100 border border-green-200', text: 'text-green-700' });
  }
  if (hasInternalPublished) {
    badges.push({ label: 'Published to Admin Leaderboard', bg: 'bg-blue-100 border border-blue-200', text: 'text-blue-700' });
  }

  if (!badges.length && !rows.length) return null;

  if (compact) {
    const labels = badges.map((badge) => badge.label);
    if (rows.length > 0) {
      labels.push(allDone ? 'Marks complete' : `Marks ${totalSubmitted}/${totalExpected}`);
    }
    return (
      <Text numberOfLines={1} className="font-poppins text-[9px] text-ssf-text-muted">
        {labels.join(' / ')}
      </Text>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-1.5">
      {badges.map((badge) => (
        <View key={badge.label} className={`h-6 flex-row items-center px-2 rounded-md self-start ${badge.bg}`}>
          <Text className={`font-poppins-bold text-[9px] ${badge.text}`}>{badge.label}</Text>
        </View>
      ))}
      {rows.length > 0 && (
        <View className={`h-6 flex-row items-center px-2 rounded-md self-start border ${
          allDone ? 'bg-emerald-50 border-emerald-200' : totalSubmitted > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
        }`}>
          <Text className={`font-poppins-bold text-[9px] ${
            allDone ? 'text-emerald-700' : totalSubmitted > 0 ? 'text-amber-700' : 'text-slate-500'
          }`}>
            {allDone ? 'Marks: All submitted' : `Marks: ${totalSubmitted}/${totalExpected} submitted`}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ScheduleDashboard() {
  const router = useRouter();
  const { schedules, isLoadingSchedules, venues, isLoadingVenues, deleteSchedule } = useSchedule();
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival, isLoading: isLoadingFest } = useActiveFestival();
  const { data: activeItems = [], isLoading: isLoadingItems } = useItems(festival?.id);
  const { participants, useFestivalRegistrations } = useParticipants();
  const { data: allRegistrations = [], isLoading: isLoadingRegs } = useFestivalRegistrations(festival?.id);
  const { judges } = useJudges();

  const { tenant_id } = useAuthStore();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [searchQuery, setSearchQuery] = React.useState('');
  const [mobileActionMenuId, setMobileActionMenuId] = React.useState<string | null>(null);
  const [selectedItem, setSelectedItem] = React.useState('All');
  const [selectedCategory, setSelectedCategory] = React.useState('All');
  const [selectedVenue, setSelectedVenue] = React.useState('All');
  const [selectedStatus, setSelectedStatus] = React.useState('All');
  const [isExportingSchedule, setIsExportingSchedule] = React.useState(false);

  const categoriesList = React.useMemo(() => {
    const sourceItems = (activeItems as any[]).length > 0
      ? activeItems as any[]
      : schedules.map((schedule: any) => schedule.items).filter(Boolean);
    const tenantCategories = sourceItems.flatMap((item: any) => {
      const rawCodes = item?.category_codes;
      const codes = Array.isArray(rawCodes) ? rawCodes : rawCodes ? [rawCodes] : [];
      return codes.map((code: unknown) => normalizeCategory(String(code))).filter(Boolean);
    });
    return ['All', ...Array.from(new Set(tenantCategories)).sort((a, b) => a.localeCompare(b))];
  }, [activeItems, schedules]);

  const itemsList = React.useMemo(() => {
    const uniqueItems = new Map<string, { id: string; label: string }>();
    (activeItems as any[]).forEach((item: any) => {
      if (!item?.id) return;
      const name = item.item_name_en || item.item_name_ml || 'Unnamed item';
      uniqueItems.set(item.id, {
        id: item.id,
        label: item.item_code ? `${item.item_code} · ${name}` : name,
      });
    });
    return [
      { id: 'All', label: 'Item: All' },
      ...Array.from(uniqueItems.values()).sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [activeItems]);

  const venuesList = React.useMemo(() => {
    return [{ id: 'All', name: 'All Venues' }, ...venues.map((v: any) => ({ id: v.id, name: v.name }))];
  }, [venues]);

  const statusesList = [
    { id: 'All', name: 'All Statuses' },
    { id: 'checkin_pending', name: 'Check-in Pending' },
    { id: 'checkin_done', name: 'Check-in Completed' },
    { id: 'codes_pending', name: 'Codes Pending' },
    { id: 'codes_done', name: 'Codes Shuffled' },
    { id: 'marks_pending', name: 'Marks Pending' },
    { id: 'marks_done', name: 'Marks Submitted' },
    { id: 'published', name: 'Published to Admin Leaderboard' },
  ];

  // Fetch all results for the active festival to filter schedules by published status
  const { data: allResults = [] } = useQuery({
    queryKey: ['allFestivalResults', festival?.id],
    queryFn: async () => {
      if (!festival?.id) return [];
      const { data, error } = await supabase
        .from('results')
        .select('schedule_id, tenant_id, festival_id, item_id, published, result_status')
        .eq('festival_id', festival.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!festival?.id,
  });

  // Canonical panel/marks workflow status for every schedule in this tenant.
  const { data: allJudgeWorkflowStatuses = [] } = useQuery({
    queryKey: ['judgeManagementStatus', tenant_id],
    queryFn: async () => {
      if (!tenant_id) return [];
      const { data, error } = await supabase.rpc('get_judge_management_status', {
        p_tenant_id: tenant_id,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenant_id,
  });

  const filteredSchedules = React.useMemo(() => {
    return schedules.filter((schedule: any) => {
      // 1. Search Query Filter
      let matchesSearch = true;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchNameEn = schedule.items?.item_name_en?.toLowerCase().includes(query);
        const matchNameMl = schedule.items?.item_name_ml?.toLowerCase().includes(query);
        const matchCategory = getItemCategoryCodes(schedule).some((code) =>
          code.toLowerCase().includes(query)
        );
        matchesSearch = matchNameEn || matchNameMl || matchCategory;
      }
      
      // 2. Item Filter
      const matchesItem = selectedItem === 'All' || schedule.item_id === selectedItem;

      // 3. Item Category Filter
      let matchesCategory = true;
      if (selectedCategory !== 'All') {
        const selectedCodes = categoryAliases[normalizeCategory(selectedCategory)] || [normalizeCategory(selectedCategory)];
        const scheduleCodes = getItemCategoryCodes(schedule).map(normalizeCategory);
        matchesCategory = scheduleCodes.some((code) => selectedCodes.includes(code));
      }
      
      // 4. Venue Filter
      let matchesVenue = true;
      if (selectedVenue !== 'All') {
        matchesVenue = schedule.venue_id === selectedVenue || schedule.venues?.id === selectedVenue;
      }

      // 5. Status/Workflow Filter
      let matchesStatus = true;
      if (selectedStatus !== 'All') {
         const scheduleRegs = allRegistrations.filter((r: any) => r.schedule_id === schedule.id && r.status !== 'rejected');
        const verifiedRegs = scheduleRegs.filter((r: any) => r.is_verified);
        
        const checkinDone = scheduleRegs.length > 0 && scheduleRegs.every((r: any) => r.is_verified);
        const checkinPending = scheduleRegs.length > 0 && scheduleRegs.some((r: any) => !r.is_verified);
        
        const codesShuffled = verifiedRegs.length > 0 && verifiedRegs.every((r: any) => r.code_letter !== null && r.code_letter !== undefined);
        const codesPending = verifiedRegs.length > 0 && verifiedRegs.some((r: any) => r.code_letter === null || r.code_letter === undefined);
        
        const isPublished = allResults.some((res: any) => 
          res.schedule_id === schedule.id &&
          (res.published === true || res.result_status === 'published')
        );
        
        const workflowStatus = allJudgeWorkflowStatuses.find(
          (status: any) => status.schedule_id === schedule.id
        );
        const marksSubmitted = workflowStatus?.marks_completed === true || isPublished;

        if (selectedStatus === 'checkin_pending') {
          matchesStatus = checkinPending;
        } else if (selectedStatus === 'checkin_done') {
          matchesStatus = checkinDone;
        } else if (selectedStatus === 'codes_pending') {
          matchesStatus = codesPending;
        } else if (selectedStatus === 'codes_done') {
          matchesStatus = codesShuffled;
        } else if (selectedStatus === 'marks_pending') {
          matchesStatus = !marksSubmitted;
        } else if (selectedStatus === 'marks_done') {
          matchesStatus = marksSubmitted;
        } else if (selectedStatus === 'published') {
          matchesStatus = isPublished;
        }
      }
      
      return matchesSearch && matchesItem && matchesCategory && matchesVenue && matchesStatus;
    });
  }, [schedules, searchQuery, selectedItem, selectedCategory, selectedVenue, selectedStatus, allRegistrations, allResults, allJudgeWorkflowStatuses]);

  const exportSchedulePdf = async (mode: AdminSchedulePdfMode) => {
    if (!filteredSchedules.length) {
      if (Platform.OS === 'web') window.alert('No schedules found for the current filters.');
      else Alert.alert('No schedules', 'No schedules found for the current filters.');
      return;
    }
    try {
      setIsExportingSchedule(true);
      await downloadAdminSchedulePdf({
        mode,
        itemId: selectedItem,
        itemCategory: selectedCategory,
        festivalName: festival?.custom_name || (festival?.festival_year ? `Festival ${festival.festival_year}` : null),
        schedules: filteredSchedules as any,
        registrations: allRegistrations as any,
        participants: participants as any,
      });
      if (Platform.OS === 'web') window.alert('Schedule PDF downloaded successfully.');
      else Alert.alert('Export complete', 'Schedule PDF is ready.');
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error?.message || 'Unable to generate schedule PDF.');
      else Alert.alert('Export failed', error?.message || 'Unable to generate schedule PDF.');
    } finally {
      setIsExportingSchedule(false);
    }
  };

  const exportBlankSchedule = () => {
    try {
      setIsExportingSchedule(true);
      downloadBlankSchedulePdf({
        festivalName: festival?.custom_name || (festival?.festival_year ? `Festival ${festival.festival_year}` : null),
        tenantName: tenant_id,
        items: activeItems as any,
      });
      if (Platform.OS === 'web') window.alert('Blank schedule PDF downloaded successfully.');
      else Alert.alert('Export complete', 'Blank schedule PDF is ready.');
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error?.message || 'Unable to generate blank schedule PDF.');
      else Alert.alert('Export failed', error?.message || 'Unable to generate blank schedule PDF.');
    } finally {
      setIsExportingSchedule(false);
    }
  };

  const handleDelete = async (id: string, itemName: string) => {
    const confirmMsg = `Are you sure you want to delete the schedule for "${itemName}"? This action cannot be undone.`;
    if (Platform.OS === 'web') {
      if (!window.confirm(confirmMsg)) return;
    } else {
      let confirmed = false;
      await new Promise<void>((resolve) => {
        Alert.alert(
          'Delete Schedule',
          confirmMsg,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
            { 
              text: 'Delete', 
              style: 'destructive', 
              onPress: () => {
                confirmed = true;
                resolve();
              } 
            }
          ]
        );
      });
      if (!confirmed) return;
    }

    try {
      await deleteSchedule(id);
      if (Platform.OS === 'web') {
        window.alert('✅ Schedule deleted successfully!');
      } else {
        Alert.alert('Success', 'Schedule deleted successfully!');
      }
    } catch (err: any) {
      if (Platform.OS === 'web') {
        window.alert('❌ Error: ' + err.message);
      } else {
        Alert.alert('Error', err.message);
      }
    }
  };

  if (isLoadingSchedules || isLoadingVenues || isLoadingRegs || isLoadingFest || isLoadingItems) {
    return (
      <View className="flex-1 bg-ssf-bg p-5">
        <SsfTableSkeleton rows={8} columns={6} />
      </View>
    );
  }

  return (
    <>
      <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
        <View className="mb-4">
        <Text className="text-3xl font-poppins-black text-ssf-text">Schedules</Text>
        <Text className="text-sm font-poppins text-ssf-text-muted mt-1">{filteredSchedules.length} showing</Text>
      </View>

      <View className="bg-white border border-ui-border rounded-xl p-3 mb-6">
        <Text className="font-poppins-bold text-xs text-ui-text mb-2">Download schedule PDFs</Text>
        <View className="flex-row flex-wrap gap-2">
          {([
            ['master', 'Master Schedule'],
            ['venue', 'Venue-wise Schedule'],
            ['organisation', 'Organisation-wise Schedule'],
          ] as [AdminSchedulePdfMode, string][]).map(([mode, label]) => (
            <TouchableOpacity
              key={mode}
              onPress={() => exportSchedulePdf(mode)}
              disabled={isExportingSchedule}
              className={`px-3 py-2 rounded-lg border ${isExportingSchedule ? 'bg-gray-100 border-gray-200' : 'bg-white border-ui-border'}`}
            >
              <Text className="font-poppins-bold text-[10px] text-ui-text">{isExportingSchedule ? 'Preparing…' : label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={exportBlankSchedule}
            disabled={isExportingSchedule}
            className="px-3 py-2 rounded-lg border border-ui-primary bg-ui-primary"
          >
            <Text className="font-poppins-bold text-[10px] text-white">Blank Schedule PDF</Text>
          </TouchableOpacity>
        </View>
        <Text className="font-poppins text-[10px] text-ui-text-muted mt-2">
          Exports use the current item, item category, venue and workflow filters. Items available: {Math.max(0, itemsList.length - 1)}.
        </Text>
      </View>
      
      <View className="flex-row flex-wrap gap-3 mb-6">
        <TouchableOpacity 
          className="flex-1 min-w-[140px] bg-white border border-ui-border p-4 rounded-xl flex-row items-center justify-between"
          onPress={() => router.push('/(admin)/schedule/venues')}
        >
          <View>
            <Text className="font-poppins-black text-ui-text text-lg">{venues.length}</Text>
            <Text className="font-poppins text-ui-text-muted text-xs">Venues</Text>
          </View>
          <MapPin color="#0F766E" size={22} />
        </TouchableOpacity>

        <TouchableOpacity 
          className="flex-1 min-w-[140px] bg-white border border-ui-border p-4 rounded-xl flex-row items-center justify-between"
          onPress={() => router.push('/(admin)/schedule/create')}
        >
          <View>
            <Text className="font-poppins-black text-ui-text text-lg">{schedules.length}</Text>
            <Text className="font-poppins text-ui-text-muted text-xs">Scheduled Events</Text>
          </View>
          <Calendar color="#0F766E" size={22} />
        </TouchableOpacity>
      </View>

      {false && (<>
      {/* Judges quick card */}
      <TouchableOpacity
        className="bg-white border border-ssf-border rounded-xl p-4 mb-6 flex-row items-center justify-between"
        onPress={() => router.push('/(admin)/judges' as any)}
      >
        <View className="flex-row items-center gap-x-3 flex-1 mr-2">
          <View className="w-10 h-10 rounded-full bg-ssf-primary/10 items-center justify-center shrink-0">
            <UserCheck size={20} color="#1B6B3A" />
          </View>
          <View className="flex-1">
            <Text className="font-poppins-bold text-ssf-text">Judge Panel</Text>
            <Text className="font-poppins text-xs text-ssf-text-muted" numberOfLines={1}>Manage judges & assign to events</Text>
          </View>
        </View>
        <Text className="font-poppins-bold text-ssf-primary text-xs shrink-0">Manage →</Text>
      </TouchableOpacity>
      </>)}

      {/* Search Bar */}
      <View className="flex-row items-center bg-white border border-ui-border rounded-xl px-4 h-11 mb-3">
        <Search size={18} color="#9CA3AF" />
        <TextInput
          className="flex-1 ml-2 font-poppins text-ssf-text outline-none"
          placeholder="Search by item name or category (e.g. LP, UP)..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {isMobile || !isMobile ? (
        <View className="bg-white border border-ui-border rounded-xl p-3 mb-6">
          <View className="flex-row flex-wrap items-center gap-2">
            <SsfSelectMenu
              value={selectedItem}
              onValueChange={setSelectedItem}
              accessibilityLabel="Filter by item"
              searchable
              searchPlaceholder="Search item..."
              width={isMobile ? Math.max(220, width - 56) : 250}
              compact
              active={selectedItem !== 'All'}
              options={itemsList.map((item) => ({
                label: item.label,
                value: item.id,
              }))}
            />
            <SsfSelectMenu
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              accessibilityLabel="Filter by item category"
              width={isMobile ? Math.max(120, (width - 72) / 2) : 148}
              compact
              active={selectedCategory !== 'All'}
              options={categoriesList.map((item) => ({
                label: item === 'All' ? 'Item category: All' : `Item category: ${item}`,
                value: item,
              }))}
            />
            <SsfSelectMenu
              value={selectedVenue}
              onValueChange={setSelectedVenue}
              accessibilityLabel="Filter by venue"
              searchable
              searchPlaceholder="Search venue..."
              width={isMobile ? Math.max(120, (width - 72) / 2) : 164}
              compact
              active={selectedVenue !== 'All'}
              options={venuesList.map((item) => ({
                label: item.id === 'All' ? 'Venue: All' : `Venue: ${item.name}`,
                value: item.id,
              }))}
            />
            <SsfSelectMenu
              value={selectedStatus}
              onValueChange={setSelectedStatus}
              accessibilityLabel="Filter by status"
              width={isMobile ? Math.max(220, width - 56) : 210}
              compact
              active={selectedStatus !== 'All'}
              options={statusesList.map((item) => ({
                label: item.id === 'All' ? 'Workflow: All' : `Workflow: ${item.name}`,
                value: item.id,
              }))}
            />
            {(selectedItem !== 'All' || selectedCategory !== 'All' || selectedVenue !== 'All' || selectedStatus !== 'All') && (
              <TouchableOpacity
                onPress={() => {
                  setSelectedItem('All');
                  setSelectedCategory('All');
                  setSelectedVenue('All');
                  setSelectedStatus('All');
                }}
                className="h-9 px-3 rounded-lg border border-ui-border bg-white flex-row items-center justify-center"
              >
                <RotateCcw size={13} color={ui.colors.textMuted} />
                <Text className="ml-1.5 font-poppins-bold text-[10px] text-ui-text-muted">Reset</Text>
              </TouchableOpacity>
            )}
            <View className="h-9 px-3 rounded-lg bg-ui-muted items-center justify-center">
              <Text className="font-poppins-bold text-[10px] text-ui-text-muted">{filteredSchedules.length} results</Text>
            </View>
          </View>
        </View>
      ) : false ? (
        <View className="gap-y-3 mb-6">
          {/* Category Dropdown */}
          <View>
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1 ml-1">Filter by Item Category</Text>
            {Platform.OS === 'web' ? (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: ui.colors.surface,
                  border: '1px solid #E2E8F0',
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: 'Poppins_400Regular',
                  fontSize: '14px',
                  color: '#334155',
                  outline: 'none',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg fill='gray' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center'
                }}
              >
                {categoriesList.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
                {categoriesList.map(item => (
                  <TouchableOpacity
                    key={item}
                    onPress={() => setSelectedCategory(item)}
                    className={`px-4 py-1.5 rounded-full mr-2 border ${selectedCategory === item ? 'bg-ssf-primary border-ssf-primary' : 'bg-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedCategory === item ? 'text-white' : 'text-ssf-text-muted'}`}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Venue Dropdown */}
          <View>
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1 ml-1">Filter by Venue</Text>
            {Platform.OS === 'web' ? (
              <select
                value={selectedVenue}
                onChange={(e) => setSelectedVenue(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: ui.colors.surface,
                  border: '1px solid #E2E8F0',
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: 'Poppins_400Regular',
                  fontSize: '14px',
                  color: '#334155',
                  outline: 'none',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg fill='gray' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center'
                }}
              >
                {venuesList.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
                {venuesList.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setSelectedVenue(item.id)}
                    className={`px-4 py-1.5 rounded-full mr-2 border ${selectedVenue === item.id ? 'bg-ssf-secondary border-ssf-secondary' : 'bg-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedVenue === item.id ? 'text-white' : 'text-ssf-text-muted'}`}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Status Dropdown */}
          <View>
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1 ml-1">Filter by Status / Workflow</Text>
            {Platform.OS === 'web' ? (
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: ui.colors.surface,
                  border: '1px solid #E2E8F0',
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: 'Poppins_400Regular',
                  fontSize: '14px',
                  color: '#334155',
                  outline: 'none',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg fill='gray' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center'
                }}
              >
                {statusesList.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
                {statusesList.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setSelectedStatus(item.id)}
                    className={`px-4 py-1.5 rounded-full mr-2 border ${selectedStatus === item.id ? 'bg-blue-600 border-blue-600' : 'bg-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedStatus === item.id ? 'text-white' : 'text-ssf-text-muted'}`}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      ) : (
        /* Desktop: Horizontal Pills */
        <View className="gap-y-4 mb-6">
          {/* Category Filter Pills */}
          <View className="mb-1">
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1.5 ml-1">Filter by Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
              {categoriesList.map(item => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setSelectedCategory(item)}
                  className={`px-4 py-1.5 rounded-full mr-2 border ${selectedCategory === item
                      ? 'bg-ssf-primary border-ssf-primary'
                      : 'bg-white border-ssf-border'
                    }`}
                >
                  <Text className={`font-poppins-bold text-xs ${selectedCategory === item ? 'text-white' : 'text-ssf-text-muted'}`}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Venue Filter Pills */}
          <View className="mb-1">
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1.5 ml-1">Filter by Venue</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
              {venuesList.map(item => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setSelectedVenue(item.id)}
                  className={`px-4 py-1.5 rounded-full mr-2 border ${selectedVenue === item.id
                      ? 'bg-ssf-secondary border-ssf-secondary'
                      : 'bg-white border-ssf-border'
                    }`}
                >
                  <Text className={`font-poppins-bold text-xs ${selectedVenue === item.id ? 'text-white' : 'text-ssf-text-muted'}`}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Status Filter Pills */}
          <View className="mb-1">
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1.5 ml-1">Filter by Status / Workflow</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
              {statusesList.map(item => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setSelectedStatus(item.id)}
                  className={`px-4 py-1.5 rounded-full mr-2 border ${selectedStatus === item.id
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-white border-ssf-border'
                    }`}
                >
                  <Text className={`font-poppins-bold text-xs ${selectedStatus === item.id ? 'text-white' : 'text-ssf-text-muted'}`}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      <View className="flex-row justify-between items-center mb-4 flex-wrap gap-y-2">
        <Text className="font-poppins-bold text-lg text-ssf-text">Upcoming Schedule</Text>
        <View className="flex-row gap-x-2">
          <TouchableOpacity 
            className="flex-row items-center gap-x-1 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100"
            onPress={() => router.push('/(admin)/schedule/import-json' as any)}
          >
            <Text className="font-poppins-bold text-blue-700 text-xs">Import JSON</Text>
          </TouchableOpacity>
          {!isMobile && Platform.OS === 'web' && (
            <TouchableOpacity
              className="flex-row items-center gap-x-1 bg-white px-3 py-2 rounded-lg border border-ui-border"
              onPress={() => router.push('/(admin)/schedule/bulk-create' as any)}
            >
              <Plus size={14} color="#0F766E" />
              <Text className="font-poppins-bold text-xs text-teal-700">Bulk Create</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            className="flex-row items-center gap-x-1 bg-ssf-primary/10 px-3 py-2 rounded-lg border border-ssf-primary/20"
            onPress={() => router.push('/(admin)/schedule/create')}
          >
            <Plus size={14} color="#1B6B3A" />
            <Text className="font-poppins-bold text-xs text-ssf-primary">Add New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {schedules.length === 0 ? (
        <SsfCard className="items-center py-10">
          <Calendar size={48} color={ui.colors.border} className="mb-4" />
          <Text className="font-poppins text-ssf-text-muted text-center">No schedules created yet.</Text>
          <SsfButton 
            label="Create First Schedule" 
            onPress={() => router.push('/(admin)/schedule/create')}
            className="mt-4"
          />
        </SsfCard>
      ) : filteredSchedules.length === 0 ? (
        <SsfCard className="items-center py-10">
          <Search size={48} color={ui.colors.border} className="mb-4" />
          <Text className="font-poppins text-ssf-text-muted text-center">
            No scheduled events found matching your search or filters.
          </Text>
          <TouchableOpacity 
            onPress={() => {
              setSearchQuery('');
              setSelectedCategory('All');
              setSelectedVenue('All');
              setSelectedStatus('All');
            }} 
            className="mt-4"
          >
            <Text className="font-poppins-bold text-ssf-primary text-sm">Reset All Filters</Text>
          </TouchableOpacity>
        </SsfCard>
      ) : (
        !isMobile ? (
        <View className="w-full bg-white border border-ui-border rounded-xl overflow-hidden">
            <View className="h-11 px-4 flex-row items-center bg-ui-muted border-b border-ui-border">
              <Text style={{ flex: 1.25 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Event</Text>
              <Text style={{ flex: 0.9 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Venue / Category</Text>
              <Text style={{ flex: 1 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Date & Time</Text>
              <Text style={{ flex: 1.4 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Workflow</Text>
              <Text style={{ flex: 2.1 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted text-right">Actions</Text>
            </View>
            {filteredSchedules.map((schedule: any) => (
              <View key={schedule.id} className="min-h-16 px-3 py-2 flex-row items-center border-b border-ui-border bg-white">
                <View style={{ flex: 1.25 }} className="pr-3">
                  <Text className="font-poppins-bold text-xs text-ui-text" numberOfLines={1}>{schedule.items?.item_name_en || 'Unknown Event'}</Text>
                  <Text className="font-poppins text-[10px] text-ui-text-muted mt-0.5" numberOfLines={1}>{schedule.items?.item_name_ml || schedule.items?.item_code || '—'}</Text>
                </View>
                <View style={{ flex: 0.9 }} className="pr-3 items-start">
                  <View className="bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
                    <Text className="font-poppins-bold text-[9px] text-emerald-700" numberOfLines={1}>{schedule.venues?.name || 'Unknown Venue'}</Text>
                  </View>
                  {!!schedule.items?.category_codes?.length && (
                    <Text className="font-poppins-bold text-[9px] text-teal-700 mt-1">{(schedule.items.category_codes as string[]).join(', ')}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }} className="pr-3">
                  <View className="flex-row items-center">
                    <Calendar size={12} color={ui.colors.textMuted} />
                    <Text className="font-poppins text-[10px] text-ui-text-muted ml-1.5">{new Date(schedule.start_time).toLocaleDateString()}</Text>
                  </View>
                  <View className="flex-row items-center mt-1">
                    <Clock size={12} color={ui.colors.textMuted} />
                    <Text className="font-poppins text-[10px] text-ui-text-muted ml-1.5">
                      {new Date(schedule.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(schedule.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1.4 }} className="pr-3">
                  <ScheduleWorkflowBadges
                    scheduleId={schedule.id}
                    registrations={allRegistrations.filter((r: any) => r.schedule_id === schedule.id)}
                    isShuffleLocked={schedule.is_shuffle_locked}
                    expectedJudgeCount={schedule.expected_judge_count || 3}
                    marksCompleted={allJudgeWorkflowStatuses.find((status: any) => status.schedule_id === schedule.id)?.marks_completed === true}
                  />
                </View>
                <View style={{ flex: 2.1 }} className="flex-row flex-wrap justify-end gap-1.5">
                  {[
                    { label: 'Check-in', path: 'checkin' },
                    { label: 'Codes', path: 'code-letter' },
                    { label: 'Marks', path: 'marks' },
                    { label: 'Results', path: 'results' },
                  ].map((action) => (
                    <TouchableOpacity
                      key={action.path}
                      onPress={() => router.push(`/(admin)/schedule/${schedule.id}/${action.path}` as any)}
                      className={`h-8 px-2.5 rounded-lg border items-center justify-center ${action.path === 'results' ? 'bg-teal-700 border-teal-700' : 'bg-white border-ui-border'}`}
                    >
                      <Text className={`font-poppins-bold text-[9px] ${action.path === 'results' ? 'text-white' : 'text-ui-text'}`}>{action.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    className={`h-8 w-8 rounded-lg border border-ui-border bg-white items-center justify-center ${schedule.is_shuffle_locked ? 'opacity-50' : ''}`}
                    onPress={() => {
                      if (schedule.is_shuffle_locked) {
                        if (Platform.OS === 'web') window.alert('Cannot edit schedule after event is locked.');
                        else Alert.alert('Locked', 'Cannot edit schedule after event is locked.');
                        return;
                      }
                      router.push(`/(admin)/schedule/${schedule.id}/edit` as any);
                    }}
                  >
                    <Edit size={13} color={ui.colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="h-8 w-8 rounded-lg border border-red-200 bg-white items-center justify-center"
                    onPress={() => handleDelete(schedule.id, schedule.items?.item_name_en || 'Unknown Event')}
                  >
                    <Trash2 size={13} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
        </View>
        ) : (
        <View>
          {filteredSchedules.map((schedule: any) => (
            <TouchableOpacity
              key={schedule.id}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={`Open actions for ${schedule.items?.item_name_en || 'event'}`}
              onPress={() => setMobileActionMenuId(schedule.id)}
              className="border-b border-ui-border px-1 py-3"
            >
              {/* Card Header: Title + Actions */}
              <View className="mb-1.5">
                {/* Top row: title left, action buttons right */}
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-2">
                    <Text className="font-poppins-bold text-[14px]" numberOfLines={1}>{schedule.items?.item_name_en || 'Unknown Event'}</Text>
                    {false && schedule.items?.item_name_ml ? (
                      <Text className="font-poppins text-[10px] text-ssf-text-muted" numberOfLines={1}>{schedule.items.item_name_ml}</Text>
                    ) : null}
                  </View>
                  <SsfActionMenu
                    accessibilityLabel={`Actions for ${schedule.items?.item_name_en || 'event'}`}
                    open={mobileActionMenuId === schedule.id}
                    onOpenChange={(nextOpen) => setMobileActionMenuId(nextOpen ? schedule.id : null)}
                    items={[
                      {
                        label: 'Check-in',
                        icon: <LogIn size={15} color={ui.colors.textMuted} />,
                        onPress: () => router.push(`/(admin)/schedule/${schedule.id}/checkin` as any),
                      },
                      {
                        label: 'Code letters',
                        icon: <Shuffle size={15} color={ui.colors.textMuted} />,
                        onPress: () => router.push(`/(admin)/schedule/${schedule.id}/code-letter` as any),
                      },
                      {
                        label: 'Marks',
                        icon: <FilePenLine size={15} color={ui.colors.textMuted} />,
                        onPress: () => router.push(`/(admin)/schedule/${schedule.id}/marks` as any),
                      },
                      {
                        label: 'Results',
                        icon: <Trophy size={15} color="#0F766E" />,
                        onPress: () => router.push(`/(admin)/schedule/${schedule.id}/results` as any),
                      },
                      {
                        label: schedule.is_shuffle_locked ? 'Edit (locked)' : 'Edit schedule',
                        separatorBefore: true,
                        icon: <Edit size={15} color={ui.colors.textMuted} />,
                        onPress: () => {
                          if (schedule.is_shuffle_locked) {
                            if (Platform.OS === 'web') window.alert('Cannot edit schedule after event is locked.');
                            else Alert.alert('Locked', 'Cannot edit schedule after event is locked.');
                            return;
                          }
                          router.push(`/(admin)/schedule/${schedule.id}/edit` as any);
                        },
                      },
                      {
                        label: 'Delete schedule',
                        destructive: true,
                        icon: <Trash2 size={15} color="#DC2626" />,
                        onPress: () => handleDelete(schedule.id, schedule.items?.item_name_en || 'Unknown Event'),
                      },
                    ]}
                  />
                </View>

                {/* Venue badge — below title row on all sizes */}
                <View className="mt-1.5 self-start">
                  <View className="bg-green-100 px-2 py-1 rounded">
                    <Text numberOfLines={1} className="font-poppins-bold text-[10px] text-green-800">
                      {schedule.venues?.name || 'Unknown Venue'}
                      {schedule.items?.category_codes?.length ? ` / ${schedule.items.category_codes.join(', ')}` : ''}
                    </Text>
                  </View>
                </View>

                {/* Category Badges */}
                {false && schedule.items?.category_codes && schedule.items.category_codes.length > 0 && (
                  <View className="mt-1.5 flex-row flex-wrap gap-1">
                    {(schedule.items.category_codes as string[]).map((code: string) => (
                      <View key={code} className="bg-ssf-primary/10 border border-ssf-primary/20 px-2 py-0.5 rounded-full">
                        <Text className="font-poppins-bold text-[10px] text-ssf-primary">{code}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              
              {/* Time & Date row */}
              <View className="mb-2 flex-row flex-wrap items-center gap-x-3 gap-y-1">
                <View className="flex-row items-center gap-x-1">
                  <Clock size={13} color="#6B7280" />
                  <Text className="font-poppins text-[10px] text-gray-600">
                    {new Date(schedule.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(schedule.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View className="flex-row items-center gap-x-1">
                  <Calendar size={13} color="#6B7280" />
                  <Text className="font-poppins text-[10px] text-gray-600">
                    {new Date(schedule.start_time).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              <ScheduleWorkflowBadges 
                scheduleId={schedule.id} 
                registrations={allRegistrations.filter((r: any) => r.schedule_id === schedule.id)}
                isShuffleLocked={schedule.is_shuffle_locked}
                expectedJudgeCount={schedule.expected_judge_count || 3}
                compact
                marksCompleted={
                  allJudgeWorkflowStatuses.find(
                    (status: any) => status.schedule_id === schedule.id
                  )?.marks_completed === true
                }
              />

              {/* Action buttons — 2×2 grid on mobile */}
              <View className="hidden">
                <View className="flex-1 flex-row gap-x-1">
                  <SsfButton 
                    label="Check-In" 
                    variant="outline" 
                    size="sm"
                    className="flex-1"
                    onPress={() => router.push(`/(admin)/schedule/${schedule.id}/checkin` as any)}
                  />
                  <SsfButton 
                    label="Code Letters" 
                    variant="outline" 
                    size="sm"
                    className="flex-1"
                    onPress={() => router.push(`/(admin)/schedule/${schedule.id}/code-letter` as any)}
                  />
                </View>
                <View className="flex-1 flex-row gap-x-1">
                  <SsfButton 
                    label="📝 Marks" 
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onPress={() => router.push(`/(admin)/schedule/${schedule.id}/marks` as any)}
                  />
                  <SsfButton 
                    label="🏆 Results" 
                    size="sm"
                    className="flex-1"
                    onPress={() => router.push(`/(admin)/schedule/${schedule.id}/results` as any)}
                  />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        )
      )}
      </ScrollView>
      {/* AI Assistant temporarily disabled for architectural redesign
      <AdminScheduleChatBot tenantId={tenant_id} festivalId={festival?.id} schedules={schedules} venues={venues} registrations={allRegistrations} results={allResults} judges={judges} workflowStatuses={allJudgeWorkflowStatuses} /> 
      */}
    </>
  );
}
