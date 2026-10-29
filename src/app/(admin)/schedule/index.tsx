import { coreColor } from '@/constants/coreTheme';
import { ui } from '@/constants/designSystem';
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, TextInput, useWindowDimensions, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';

import { useSchedule } from '../../../core/hooks/useSchedule';
import { Calendar, MapPin, Plus, Clock, RotateCcw, UserCheck, Edit, Trash2, Search, X, LogIn, Shuffle, FilePenLine, Trophy, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { scheduleOverviewService, ScheduleWorkflowSummary } from '../../../services/scheduleOverviewService';
import { participantService } from '../../../services/participantService';

import { useFestival } from '../../../core/hooks/useFestival';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../../core/store/authStore';

import { SsfSelectMenu } from '../../../components/ui/SsfSelectMenu';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import type { AdminSchedulePdfMode } from '../../../services/schedulePdfService';
import { ScheduleLifecycleActions } from '../../../components/schedule/ScheduleLifecycleActions';
import { getScheduleLifecycleLabel, normalizeScheduleLifecycleStatus } from '../../../core/utils/scheduleLifecycle';

const normalizeCategory = (value: string) => {
  const norm = value.trim().toUpperCase();
  return norm === 'GN' ? 'GENERAL' : norm;
};

function ScheduleWorkflowBadges({status,summary,isShuffleLocked,compact=false}: {
 status?: string | null; summary?: ScheduleWorkflowSummary; isShuffleLocked?: boolean; compact?: boolean;
}) {
 if (!summary) return <Text className="font-poppins text-[9px] text-ssf-text-muted">{getScheduleLifecycleLabel(status)} / Workflow unavailable</Text>;
 const {active_count:active,verified_count:verified,coded_count:coded,assigned_judges:totalExpected,submitted_judges:totalSubmitted,has_manual_result:hasManualSubmitted,has_published_result:hasInternalPublished}=summary;
 const checkinDone=(active>0 && verified===active)||isShuffleLocked;
 const checkinPending=active>verified && !isShuffleLocked;
 const codesShuffled=(verified>0 && coded===verified)||isShuffleLocked;
 const codesPending=verified>coded && !isShuffleLocked;
 const allDone=totalExpected>0 && totalSubmitted>=totalExpected;
  const badges: { label: string; bg: string; text: string }[] = [];

  // Check-in status (Malayalam highlighted text as requested)
  if (checkinDone && codesShuffled) {
    badges.push({ label: 'Ready to start', bg: 'bg-core-success-soft-emerald-50 border border-core-success-soft-emerald-200', text: 'text-core-success-emerald-700' });
  } else if (checkinPending && !hasManualSubmitted && !hasInternalPublished && !allDone) {
    badges.push({ label: 'Check-in Pending', bg: 'bg-core-warning-soft-amber-100 border border-core-warning-soft-amber-200', text: 'text-core-warning-amber-700' });
  }

  // Code Letter status
  if (!codesShuffled && codesPending && !hasManualSubmitted && !hasInternalPublished && !allDone) {
    badges.push({ label: 'Codes Pending', bg: 'bg-core-surface-muted-gray-100 border border-core-border-gray-200', text: 'text-core-text-muted-gray-500' });
  }

  if (hasManualSubmitted) {
    badges.push({ label: 'Mark Submitted (Manual)', bg: 'bg-core-success-soft-green-100 border border-core-success-soft-green-200', text: 'text-core-success-green-700' });
  }
  if (hasInternalPublished) {
    badges.push({ label: 'Published to Admin Leaderboard', bg: 'bg-core-info-soft-blue-100 border border-core-info-soft-blue-200', text: 'text-core-info-blue-700' });
  }

  if (!badges.length && !totalExpected && !status) return null;

  if (compact) {
    const labels = badges.map((badge) => badge.label);
    if (status) labels.unshift(getScheduleLifecycleLabel(status));
    if (totalExpected > 0) {
      labels.push(`Marks ${totalSubmitted}/${totalExpected} judges submitted`);
    }
    return (
      <Text numberOfLines={1} className="font-poppins text-[9px] text-ssf-text-muted">
        {labels.join(' / ')}
      </Text>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-1.5">
      <View className={`h-6 flex-row items-center px-2 rounded-md self-start border ${normalizeScheduleLifecycleStatus(status) === 'completed' ? 'bg-core-surface-muted-slate-100 border-core-border-slate-200' : normalizeScheduleLifecycleStatus(status) === 'ongoing' ? 'bg-core-success-soft-emerald-50 border-core-success-soft-emerald-200' : 'bg-core-info-soft-blue-50 border-core-info-soft-blue-200'}`}>
        <Text className={`font-poppins-bold text-[9px] ${normalizeScheduleLifecycleStatus(status) === 'completed' ? 'text-core-text-slate-700' : normalizeScheduleLifecycleStatus(status) === 'ongoing' ? 'text-core-success-emerald-700' : 'text-core-info-blue-700'}`}>{getScheduleLifecycleLabel(status)}</Text>
      </View>
      {badges.map((badge) => (
        <View key={badge.label} className={`h-6 flex-row items-center px-2 rounded-md self-start ${badge.bg}`}>
          <Text className={`font-poppins-bold text-[9px] ${badge.text}`}>{badge.label}</Text>
        </View>
      ))}
      {totalExpected > 0 && (
        <View className={`h-6 flex-row items-center px-2 rounded-md self-start border ${
          allDone ? 'bg-core-success-soft-emerald-50 border-core-success-soft-emerald-200' : totalSubmitted > 0 ? 'bg-core-warning-soft-amber-50 border-core-warning-soft-amber-200' : 'bg-core-surface-muted-slate-50 border-core-border-slate-200'
        }`}>
          <Text className={`font-poppins-bold text-[9px] ${
            allDone ? 'text-core-success-emerald-700' : totalSubmitted > 0 ? 'text-core-warning-amber-700' : 'text-core-text-muted-slate-500'
          }`}>
            {`Marks: ${totalSubmitted}/${totalExpected} judges submitted`}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ScheduleDashboard() {
  const router = useRouter();
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival, isLoading: isLoadingFest } = useActiveFestival();
  const { data: activeItems = [], isLoading: isLoadingItems } = useItems(festival?.id);
  const { tenant_id, user } = useAuthStore();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');
  const [mobileActionMenuId, setMobileActionMenuId] = React.useState<string | null>(null);
  const [selectedItem, setSelectedItem] = React.useState('All');
  const [selectedCategory, setSelectedCategory] = React.useState('All');
  const [selectedVenue, setSelectedVenue] = React.useState('All');
  const [selectedStatus, setSelectedStatus] = React.useState('All');
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [calendarMonth, setCalendarMonth] = React.useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const scheduleTimezone = React.useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; }
    catch { return 'Asia/Kolkata'; }
  }, []);
  const availableDatesQuery=useQuery({
   queryKey:['schedule-available-dates',tenant_id,festival?.id,user?.id,scheduleTimezone],
   queryFn:({signal})=>scheduleOverviewService.availableDates(tenant_id!,festival!.id,scheduleTimezone,signal),
   enabled:isFocused && !!tenant_id && !!user?.id && !!festival?.id,
   staleTime:5*60*1000,retry:false,
  });
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  React.useEffect(() => {
    setPage(1);
  }, [tenant_id, festival?.id, debouncedSearchQuery, selectedItem, selectedCategory, selectedVenue, selectedStatus, selectedDate, pageSize]);

  const isSearchDebouncing = searchQuery.trim() !== debouncedSearchQuery;
  const { schedules, totalSchedules, totalFilteredSchedules, hasScheduleData, isLoadingSchedules, isErrorSchedules, refetchSchedules, venues, isLoadingVenues, deleteSchedule, setScheduleStatus, updateSchedule } = useSchedule({
    overviewPage: {
      search: debouncedSearchQuery,
      itemId: selectedItem === 'All' ? null : selectedItem,
      category: selectedCategory === 'All' ? null : selectedCategory,
      venueId: selectedVenue === 'All' ? null : selectedVenue,
      date: selectedDate,
      workflowStatus: selectedStatus === 'All' ? null : selectedStatus,
      page,
      pageSize,
      timezone: scheduleTimezone,
      enabled: isFocused && !isSearchDebouncing,
    },
  });
  const workflowMap=React.useMemo(()=>new Map(schedules.map((row: any)=>[row.id,{
    schedule_id:row.id,
    active_count:Number(row.active_count ?? 0),
    verified_count:Number(row.verified_count ?? 0),
    coded_count:Number(row.coded_count ?? 0),
    rejected_count:Number(row.rejected_count ?? 0),
    assigned_judges:Number(row.assigned_judges ?? 0),
    submitted_judges:Number(row.submitted_judges ?? 0),
    marks_completed:Boolean(row.marks_completed),
    has_manual_result:Boolean(row.has_manual_result),
    has_published_result:Boolean(row.has_published_result),
  }])),[schedules]);
  const exportLock = React.useRef(false);
  const [isExportingSchedule, setIsExportingSchedule] = React.useState(false);
  const [updatingVisibilityId, setUpdatingVisibilityId] = React.useState<string | null>(null);

  const togglePublicVisibility = async (schedule: any) => {
    if (schedule.is_public_visible === undefined) {
      const message = 'Apply the public schedule visibility migration before changing this setting.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Database update required', message);
      return;
    }
    if (updatingVisibilityId) return;
    try {
      setUpdatingVisibilityId(schedule.id);
      await updateSchedule({ id: schedule.id, payload: { is_public_visible: !schedule.is_public_visible } });
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error?.message || 'Unable to update public visibility.');
      else Alert.alert('Update failed', error?.message || 'Unable to update public visibility.');
    } finally {
      setUpdatingVisibilityId(null);
    }
  };

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
    { id: 'scheduled', name: 'Scheduled' },
    { id: 'ongoing', name: 'Started' },
    { id: 'completed', name: 'Completed' },
    { id: 'checkin_pending', name: 'Check-in Pending' },
    { id: 'checkin_done', name: 'Check-in Completed' },
    { id: 'codes_pending', name: 'Codes Pending' },
    { id: 'codes_done', name: 'Codes Shuffled' },
    { id: 'marks_pending', name: 'Marks Pending' },
    { id: 'marks_done', name: 'Marks Submitted' },
    { id: 'published', name: 'Published to Admin Leaderboard' },
  ];

  const filteredSchedules = isSearchDebouncing ? [] : schedules;
  const displayedFilteredCount = isSearchDebouncing ? 0 : totalFilteredSchedules;
  const pageCount = Math.max(1, Math.ceil(displayedFilteredCount / pageSize));
  React.useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const exportFilters = {
    tenantId: tenant_id!, festivalId: festival!.id,
    search: debouncedSearchQuery,
    itemId: selectedItem === 'All' ? null : selectedItem,
    category: selectedCategory === 'All' ? null : selectedCategory,
    venueId: selectedVenue === 'All' ? null : selectedVenue,
    date: selectedDate,
    workflowStatus: selectedStatus === 'All' ? null : selectedStatus,
    timezone: scheduleTimezone,
  };

  const dateSet = React.useMemo(() => new Set((availableDatesQuery.data ?? []).map((date) => String(date).slice(0, 10))), [availableDatesQuery.data]);
  const calendarYear = calendarMonth.getUTCFullYear();
  const calendarMonthIndex = calendarMonth.getUTCMonth();
  const calendarDays = new Date(Date.UTC(calendarYear, calendarMonthIndex + 1, 0)).getUTCDate();
  const calendarOffset = new Date(Date.UTC(calendarYear, calendarMonthIndex, 1)).getUTCDay();
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(calendarMonth);
  const calendarCells = Array.from({ length: calendarOffset + calendarDays }, (_, index) =>
    index < calendarOffset ? null : `${calendarYear}-${String(calendarMonthIndex + 1).padStart(2, '0')}-${String(index - calendarOffset + 1).padStart(2, '0')}`
  );

  const exportSchedulePdf = async (mode: AdminSchedulePdfMode) => {
    if (exportLock.current || isSearchDebouncing) return;
    if (!totalFilteredSchedules) {
      if (Platform.OS === 'web') window.alert('No schedules found for the current filters.');
      else Alert.alert('No schedules', 'No schedules found for the current filters.');
      return;
    }
    try {
      exportLock.current = true;
      setIsExportingSchedule(true);
      const [allSchedules,allRegistrations,participants,{downloadAdminSchedulePdf}]=await Promise.all([scheduleOverviewService.allFiltered(exportFilters),participantService.listRegistrationsByFestival<any>(festival!.id),participantService.listParticipants<any>(),import('../../../services/schedulePdfService')]);
      await downloadAdminSchedulePdf({
        mode,
        itemId: selectedItem,
        itemCategory: selectedCategory,
        festivalName: festival?.custom_name || (festival?.festival_year ? `Festival ${festival.festival_year}` : null),
        schedules: allSchedules as any,
        registrations: allRegistrations as any,
        participants: participants as any,
      });
      if (Platform.OS === 'web') window.alert('Schedule PDF downloaded successfully.');
      else Alert.alert('Export complete', 'Schedule PDF is ready.');
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error?.message || 'Unable to generate schedule PDF.');
      else Alert.alert('Export failed', error?.message || 'Unable to generate schedule PDF.');
    } finally {
      exportLock.current = false;
      setIsExportingSchedule(false);
    }
  };

  const exportBlankSchedule = async () => {
    if (exportLock.current) return;
    try {
      exportLock.current = true;
      setIsExportingSchedule(true);
      const {downloadBlankSchedulePdf}=await import('../../../services/schedulePdfService');
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
      exportLock.current = false;
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

  if (isLoadingVenues || isLoadingFest || isLoadingItems) {
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
        <Text className="text-sm font-poppins text-ssf-text-muted mt-1">{isSearchDebouncing ? 'Updating results…' : totalFilteredSchedules === 0 ? '0 schedules' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalFilteredSchedules)} of ${totalFilteredSchedules}`}</Text>
      </View>

      {isErrorSchedules && <View className="mb-2"><Text className="font-poppins text-xs text-core-danger-red-700">Schedules could not be loaded.</Text><SsfButton label="Retry schedules" size="sm" variant="outline" onPress={()=>{void refetchSchedules();}} /></View>}
      {availableDatesQuery.isError && <View className="mb-2"><Text className="font-poppins text-xs text-core-danger-red-700">Available schedule dates could not be loaded.</Text><SsfButton label="Retry dates" size="sm" variant="outline" onPress={()=>{void availableDatesQuery.refetch();}} /></View>}
      <View className="bg-core-surface-white border border-ui-border rounded-xl p-3 mb-6">
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
              disabled={isExportingSchedule || isSearchDebouncing}
              className={`px-3 py-2 rounded-lg border ${isExportingSchedule ? 'bg-core-surface-muted-gray-100 border-core-border-gray-200' : 'bg-core-surface-white border-ui-border'}`}
            >
              <Text className="font-poppins-bold text-[10px] text-ui-text">{isExportingSchedule ? 'Preparing…' : isSearchDebouncing ? 'Updating…' : label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={exportBlankSchedule}
            disabled={isExportingSchedule}
            className="px-3 py-2 rounded-lg border border-ui-primary bg-ui-primary"
          >
            <Text className="font-poppins-bold text-[10px] text-core-on-primary-white">Blank Schedule PDF</Text>
          </TouchableOpacity>
        </View>
        <Text className="font-poppins text-[10px] text-ui-text-muted mt-2">
          Exports use the current item, item category, venue and workflow filters. Items available: {Math.max(0, itemsList.length - 1)}.
        </Text>
      </View>
      
      <View className="flex-row flex-wrap gap-3 mb-6">
        <TouchableOpacity 
          className="flex-1 min-w-[140px] bg-core-success-soft-emerald-50 border border-core-success-soft-emerald-300 p-4 rounded-xl flex-row items-center justify-between"
          onPress={() => router.push('/(admin)/schedule/venues')}
          accessibilityRole="button"
          accessibilityLabel="Manage venues"
          accessibilityHint="Opens venue management"
        >
          <View>
            <Text className="font-poppins-black text-core-success-emerald-950 text-lg">{venues.length}</Text>
            <Text className="font-poppins text-core-success-emerald-800 text-xs">Venues</Text>
          </View>
          <MapPin color={coreColor("#047857", 'success')} size={22} />
        </TouchableOpacity>

        <TouchableOpacity 
          className="flex-1 min-w-[140px] bg-core-success-soft-emerald-50 border border-core-success-soft-emerald-300 p-4 rounded-xl flex-row items-center justify-between"
          onPress={() => router.push('/(admin)/schedule/create')}
          accessibilityRole="button"
          accessibilityLabel="Manage scheduled events"
          accessibilityHint="Opens schedule creation"
        >
          <View>
            <Text className="font-poppins-black text-core-success-emerald-950 text-lg">{totalSchedules}</Text>
            <Text className="font-poppins text-core-success-emerald-800 text-xs">Scheduled Events</Text>
          </View>
          <Calendar color={coreColor("#047857", 'success')} size={22} />
        </TouchableOpacity>
      </View>

      {false && (<>
      {/* Judges quick card */}
      <TouchableOpacity
        className="bg-core-surface-white border border-ssf-border rounded-xl p-4 mb-6 flex-row items-center justify-between"
        onPress={() => router.push('/(admin)/judges' as any)}
      >
        <View className="flex-row items-center gap-x-3 flex-1 mr-2">
          <View className="w-10 h-10 rounded-full bg-ssf-primary/10 items-center justify-center shrink-0">
            <UserCheck size={20} color={coreColor("#1B6B3A", 'primaryText')} />
          </View>
          <View className="flex-1">
            <Text className="font-poppins-bold text-ssf-text">Judge Panel</Text>
            <Text className="font-poppins text-xs text-ssf-text-muted" numberOfLines={1}>Manage judges & assign to events</Text>
          </View>
        </View>
        <Text className="font-poppins-bold text-ui-primary-text text-xs shrink-0">Manage →</Text>
      </TouchableOpacity>
      </>)}

      {/* Search Bar */}
      <View className="flex-row items-center bg-core-surface-white border border-ui-border rounded-xl px-4 h-11 mb-3">
        <Search size={18} color={coreColor("#9CA3AF", 'textMuted')} />
        <TextInput
          className="flex-1 ml-2 font-poppins text-ssf-text outline-none"
          placeholder="Search by item name or category (e.g. LP, UP)..."
          value={searchQuery}
              onChangeText={(value) => { setSearchQuery(value); setPage(1); }}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={16} color={coreColor("#9CA3AF", 'textMuted')} />
          </TouchableOpacity>
        )}
      </View>

      {isMobile || !isMobile ? (
        <View className="bg-core-surface-white border border-ui-border rounded-xl p-3 mb-6">
          <View className="flex-row flex-wrap items-center gap-2">
            <SsfSelectMenu
              value={selectedItem}
              onValueChange={(value) => { setSelectedItem(value); setPage(1); }}
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
              onValueChange={(value) => { setSelectedCategory(value); setPage(1); }}
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
              onValueChange={(value) => { setSelectedVenue(value); setPage(1); }}
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
              onValueChange={(value) => { setSelectedStatus(value); setPage(1); }}
              accessibilityLabel="Filter by status"
              width={isMobile ? Math.max(220, width - 56) : 210}
              compact
              active={selectedStatus !== 'All'}
              options={statusesList.map((item) => ({
                label: item.id === 'All' ? 'Workflow: All' : `Workflow: ${item.name}`,
                value: item.id,
              }))}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={selectedDate ? `Date filter: ${selectedDate}` : 'Filter by schedule date'}
              onPress={() => setCalendarOpen(true)}
              className={`h-9 px-3 rounded-lg border flex-row items-center justify-center ${selectedDate ? 'border-ui-primary bg-core-info-soft-blue-50' : 'border-ui-border bg-core-surface-white'}`}
            >
              <Calendar size={13} color={selectedDate ? coreColor('#1D4ED8', 'primaryText') : ui.colors.textMuted} />
              <Text className="ml-1.5 font-poppins-bold text-[10px] text-ui-text-muted">{selectedDate || 'Date: All'}</Text>
            </TouchableOpacity>
            {(selectedItem !== 'All' || selectedCategory !== 'All' || selectedVenue !== 'All' || selectedStatus !== 'All' || !!selectedDate) && (
              <TouchableOpacity
                onPress={() => {
                  setSelectedItem('All');
                  setSelectedCategory('All');
                  setSelectedVenue('All');
                  setSelectedStatus('All');
                  setSelectedDate(null);
                  setSearchQuery('');
                  setPage(1);
                }}
                className="h-9 px-3 rounded-lg border border-ui-border bg-core-surface-white flex-row items-center justify-center"
              >
                <RotateCcw size={13} color={ui.colors.textMuted} />
                <Text className="ml-1.5 font-poppins-bold text-[10px] text-ui-text-muted">Reset</Text>
              </TouchableOpacity>
            )}
            <View className="h-9 px-3 rounded-lg bg-ui-muted items-center justify-center">
              <Text className="font-poppins-bold text-[10px] text-ui-text-muted">{isSearchDebouncing ? 'Updating…' : totalFilteredSchedules} results</Text>
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
                  border: `1px solid ${coreColor('#E2E8F0', 'border')}`,
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: 'Poppins_400Regular',
                  fontSize: '14px',
                  color: coreColor('#334155', 'text'),
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
                    className={`px-4 py-1.5 rounded-full mr-2 border ${selectedCategory === item ? 'bg-ssf-primary border-ssf-primary' : 'bg-core-surface-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedCategory === item ? 'text-core-on-primary-white' : 'text-ssf-text-muted'}`}>{item}</Text>
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
                  border: `1px solid ${coreColor('#E2E8F0', 'border')}`,
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: 'Poppins_400Regular',
                  fontSize: '14px',
                  color: coreColor('#334155', 'text'),
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
                    className={`px-4 py-1.5 rounded-full mr-2 border ${selectedVenue === item.id ? 'bg-ssf-secondary border-ssf-secondary' : 'bg-core-surface-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedVenue === item.id ? 'text-core-on-primary-white' : 'text-ssf-text-muted'}`}>{item.name}</Text>
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
                  border: `1px solid ${coreColor('#E2E8F0', 'border')}`,
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: 'Poppins_400Regular',
                  fontSize: '14px',
                  color: coreColor('#334155', 'text'),
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
                    className={`px-4 py-1.5 rounded-full mr-2 border ${selectedStatus === item.id ? 'bg-core-primary-blue-600 border-core-primary-blue-600' : 'bg-core-surface-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedStatus === item.id ? 'text-core-on-primary-white' : 'text-ssf-text-muted'}`}>{item.name}</Text>
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
                      : 'bg-core-surface-white border-ssf-border'
                    }`}
                >
                  <Text className={`font-poppins-bold text-xs ${selectedCategory === item ? 'text-core-on-primary-white' : 'text-ssf-text-muted'}`}>
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
                      : 'bg-core-surface-white border-ssf-border'
                    }`}
                >
                  <Text className={`font-poppins-bold text-xs ${selectedVenue === item.id ? 'text-core-on-primary-white' : 'text-ssf-text-muted'}`}>
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
                      ? 'bg-core-primary-blue-600 border-core-primary-blue-600'
                      : 'bg-core-surface-white border-ssf-border'
                    }`}
                >
                  <Text className={`font-poppins-bold text-xs ${selectedStatus === item.id ? 'text-core-on-primary-white' : 'text-ssf-text-muted'}`}>
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
            className="flex-row items-center gap-x-1 bg-core-info-soft-blue-50 px-3 py-2 rounded-lg border border-core-info-soft-blue-100"
            onPress={() => router.push('/(admin)/schedule/import-json' as any)}
          >
            <Text className="font-poppins-bold text-core-info-blue-700 text-xs">Import JSON</Text>
          </TouchableOpacity>
          {!isMobile && Platform.OS === 'web' && (
            <TouchableOpacity
              className="flex-row items-center gap-x-1 bg-core-surface-white px-3 py-2 rounded-lg border border-ui-border"
              onPress={() => router.push('/(admin)/schedule/bulk-create' as any)}
            >
              <Plus size={14} color={coreColor("#0F766E", 'primaryText')} />
              <Text className="font-poppins-bold text-xs text-core-primary-text-teal-700">Bulk Create</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            className="flex-row items-center gap-x-1 bg-ssf-primary/10 px-3 py-2 rounded-lg border border-ssf-primary/20"
            onPress={() => router.push('/(admin)/schedule/create')}
          >
            <Plus size={14} color={coreColor("#1B6B3A", 'primaryText')} />
            <Text className="font-poppins-bold text-xs text-ui-primary-text">Add New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isSearchDebouncing ? (
        <SsfCard className="items-center py-6">
          <Text className="font-poppins text-xs text-ssf-text-muted">Updating schedule results…</Text>
        </SsfCard>
      ) : isLoadingSchedules && !hasScheduleData ? (
        <SsfTableSkeleton rows={6} columns={5} />
      ) : isErrorSchedules && !hasScheduleData ? null : totalSchedules === 0 ? (
        <SsfCard className="items-center py-10">
          <Calendar size={48} color={ui.colors.border} className="mb-4" />
          <Text className="font-poppins text-ssf-text-muted text-center">No schedules created yet.</Text>
          <SsfButton 
            label="Create First Schedule" 
            onPress={() => router.push('/(admin)/schedule/create')}
            className="mt-4"
          />
        </SsfCard>
      ) : totalFilteredSchedules === 0 ? (
        <SsfCard className="items-center py-10">
          <Search size={48} color={ui.colors.border} className="mb-4" />
          <Text className="font-poppins text-ssf-text-muted text-center">
            No scheduled events found matching your search or filters.
          </Text>
          <TouchableOpacity 
            onPress={() => {
              setSearchQuery('');
              setSelectedItem('All');
              setSelectedCategory('All');
              setSelectedVenue('All');
              setSelectedStatus('All');
              setSelectedDate(null);
              setPage(1);
            }} 
            className="mt-4"
          >
            <Text className="font-poppins-bold text-ui-primary-text text-sm">Reset All Filters</Text>
          </TouchableOpacity>
        </SsfCard>
      ) : (
        !isMobile ? (
        <View className="w-full bg-core-surface-white border border-ui-border rounded-xl overflow-hidden">
            <View className="h-11 px-4 flex-row items-center bg-ui-muted border-b border-ui-border">
              <Text style={{ flex: 1.25 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Event</Text>
              <Text style={{ flex: 0.9 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Venue / Category</Text>
              <Text style={{ flex: 1 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Date & Time</Text>
              <Text style={{ flex: 1.4 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Workflow</Text>
              <Text style={{ flex: 2.1 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted text-right">Actions</Text>
            </View>
            {filteredSchedules.map((schedule: any) => (
              <View key={schedule.id} className="min-h-16 px-3 py-2 flex-row items-center border-b border-ui-border bg-core-surface-white">
                <View style={{ flex: 1.25 }} className="pr-3">
                  <Text className="font-poppins-bold text-xs text-ui-text" numberOfLines={1}>{schedule.items?.item_name_en || 'Unknown Event'}</Text>
                  <Text className="font-poppins text-[10px] text-ui-text-muted mt-0.5" numberOfLines={1}>{schedule.items?.item_name_ml || schedule.items?.item_code || '—'}</Text>
                </View>
                <View style={{ flex: 0.9 }} className="pr-3 items-start">
                  <View className="bg-core-success-soft-emerald-50 border border-core-success-soft-emerald-100 px-2 py-1 rounded-lg">
                    <Text className="font-poppins-bold text-[9px] text-core-success-emerald-700" numberOfLines={1}>{schedule.venues?.name || 'Unknown Venue'}</Text>
                  </View>
                  {!!schedule.items?.category_codes?.length && (
                    <Text className="font-poppins-bold text-[9px] text-core-primary-text-teal-700 mt-1">{(schedule.items.category_codes as string[]).join(', ')}</Text>
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
                  {schedule.is_overdue_unstarted && <Text className="font-poppins-bold text-[9px] text-core-warning-amber-700 mt-1">Scheduled time passed · Not started</Text>}
                </View>
                <View style={{ flex: 1.4 }} className="pr-3">
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`${schedule.is_public_visible !== false ? 'Hide' : 'Show'} ${schedule.items?.item_name_en || 'event'} on public schedule`}
                    disabled={!!updatingVisibilityId}
                    onPress={() => togglePublicVisibility(schedule)}
                    className="self-start border border-ui-border rounded-md px-2 py-1 mb-1 bg-core-surface-white"
                  >
                    <Text className="font-poppins-bold text-[9px] text-ui-text">
                      {updatingVisibilityId === schedule.id ? 'Saving…' : schedule.is_public_visible !== false ? 'Public · Hide' : 'Private · Show'}
                    </Text>
                  </TouchableOpacity>
                  <ScheduleWorkflowBadges
                    status={schedule.status}
                    summary={workflowMap.get(schedule.id)}
                    isShuffleLocked={schedule.is_shuffle_locked}
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
                      className={`h-8 px-2.5 rounded-lg border items-center justify-center ${action.path === 'results' ? 'bg-core-primary-teal-700 border-core-primary-teal-700' : 'bg-core-surface-white border-ui-border'}`}
                    >
                      <Text className={`font-poppins-bold text-[9px] ${action.path === 'results' ? 'text-core-on-primary-white' : 'text-ui-text'}`}>{action.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    className={`h-8 w-8 rounded-lg border border-ui-border bg-core-surface-white items-center justify-center ${schedule.is_shuffle_locked ? 'opacity-50' : ''}`}
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
                    className="h-8 w-8 rounded-lg border border-core-danger-soft-red-200 bg-core-surface-white items-center justify-center"
                    onPress={() => handleDelete(schedule.id, schedule.items?.item_name_en || 'Unknown Event')}
                  >
                    <Trash2 size={13} color={coreColor("#DC2626", 'danger')} />
                  </TouchableOpacity>
                  <ScheduleLifecycleActions scheduleName={schedule.items?.item_name_en || 'Event'} status={schedule.status} onStatusChange={(status, expectedStatus) => setScheduleStatus({ id: schedule.id, status, expectedStatus })} />
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
                  <ScheduleLifecycleActions
                    scheduleName={schedule.items?.item_name_en || 'Event'}
                    status={schedule.status}
                    onStatusChange={(status, expectedStatus) => setScheduleStatus({ id: schedule.id, status, expectedStatus })}
                    accessibilityLabel={`Actions for ${schedule.items?.item_name_en || 'event'}`}
                    open={mobileActionMenuId === schedule.id}
                    onOpenChange={(nextOpen) => setMobileActionMenuId(nextOpen ? schedule.id : null)}
                    additionalItems={[
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
                        icon: <Trophy size={15} color={coreColor("#0F766E", 'primaryText')} />,
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
                        icon: <Trash2 size={15} color={coreColor("#DC2626", 'danger')} />,
                        onPress: () => handleDelete(schedule.id, schedule.items?.item_name_en || 'Unknown Event'),
                      },
                    ]}
                  />
                </View>

                {/* Venue badge — below title row on all sizes */}
                <View className="mt-1.5 self-start">
                  <View className="bg-core-success-soft-green-100 px-2 py-1 rounded">
                    <Text numberOfLines={1} className="font-poppins-bold text-[10px] text-core-success-green-800">
                      {schedule.venues?.name || 'Unknown Venue'}
                      {schedule.items?.category_codes?.length ? ` / ${schedule.items.category_codes.join(', ')}` : ''}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`${schedule.is_public_visible !== false ? 'Hide' : 'Show'} ${schedule.items?.item_name_en || 'event'} on public schedule`}
                  disabled={!!updatingVisibilityId}
                  onPress={(event) => {
                    event.stopPropagation();
                    togglePublicVisibility(schedule);
                  }}
                  className="self-start border border-ui-border rounded-md px-2 py-1.5 mt-1.5 bg-core-surface-white"
                >
                  <Text className="font-poppins-bold text-[10px] text-ui-text">
                    {updatingVisibilityId === schedule.id ? 'Saving…' : schedule.is_public_visible !== false ? 'Public · Hide' : 'Private · Show'}
                  </Text>
                </TouchableOpacity>

                {/* Category Badges */}
                {false && schedule.items?.category_codes && schedule.items.category_codes.length > 0 && (
                  <View className="mt-1.5 flex-row flex-wrap gap-1">
                    {(schedule.items.category_codes as string[]).map((code: string) => (
                      <View key={code} className="bg-ssf-primary/10 border border-ssf-primary/20 px-2 py-0.5 rounded-full">
                        <Text className="font-poppins-bold text-[10px] text-ui-primary-text">{code}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              
              {/* Time & Date row */}
              <View className="mb-2 flex-row flex-wrap items-center gap-x-3 gap-y-1">
                <View className="flex-row items-center gap-x-1">
                  <Clock size={13} color={coreColor("#6B7280", 'text')} />
                  <Text className="font-poppins text-[10px] text-core-text-gray-600">
                    {new Date(schedule.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(schedule.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View className="flex-row items-center gap-x-1">
                  <Calendar size={13} color={coreColor("#6B7280", 'text')} />
                  <Text className="font-poppins text-[10px] text-core-text-gray-600">
                    {new Date(schedule.start_time).toLocaleDateString()}
                  </Text>
                </View>
                {schedule.is_overdue_unstarted && <Text className="font-poppins-bold text-[10px] text-core-warning-amber-700">Scheduled time passed · Not started</Text>}
              </View>

              <ScheduleWorkflowBadges 
                status={schedule.status}
                summary={workflowMap.get(schedule.id)}
                isShuffleLocked={schedule.is_shuffle_locked}
                compact
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
      {hasScheduleData && totalSchedules > 0 && !isSearchDebouncing && (
        <View className="flex-row items-center justify-between flex-wrap gap-2 mt-4 mb-8 bg-core-surface-white border border-ui-border rounded-lg px-3 py-2">
          <Text className="font-poppins text-[10px] text-ui-text-muted">
            {totalFilteredSchedules === 0 ? 'No matching schedules' : `Showing ${Math.min((page - 1) * pageSize + 1, totalFilteredSchedules)}–${Math.min(page * pageSize, totalFilteredSchedules)} of ${totalFilteredSchedules}`}
          </Text>
          <View className="flex-row items-center gap-2">
            <SsfSelectMenu
              value={String(pageSize)}
              onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}
              accessibilityLabel="Schedules per page"
              width={92}
              compact
              options={[25, 50, 100].map((size) => ({ label: `${size} / page`, value: String(size) }))}
            />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous schedule page" disabled={page <= 1} onPress={() => setPage((current) => Math.max(1, current - 1))} className={`h-9 px-3 rounded-lg border flex-row items-center ${page <= 1 ? 'border-core-border-gray-200 bg-core-surface-muted-gray-100' : 'border-ui-border bg-core-surface-white'}`}>
              <ChevronLeft size={15} color={page <= 1 ? ui.colors.border : ui.colors.text} />
              {!isMobile && <Text className="ml-1 font-poppins-bold text-[10px] text-ui-text">Previous</Text>}
            </TouchableOpacity>
            <Text className="font-poppins-bold text-[10px] text-ui-text">{page} / {pageCount}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next schedule page" disabled={page >= pageCount} onPress={() => setPage((current) => Math.min(pageCount, current + 1))} className={`h-9 px-3 rounded-lg border flex-row items-center ${page >= pageCount ? 'border-core-border-gray-200 bg-core-surface-muted-gray-100' : 'border-ui-border bg-core-surface-white'}`}>
              {!isMobile && <Text className="mr-1 font-poppins-bold text-[10px] text-ui-text">Next</Text>}
              <ChevronRight size={15} color={page >= pageCount ? ui.colors.border : ui.colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      </ScrollView>
      <Modal transparent visible={calendarOpen} animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
        <View className="flex-1 bg-black/40 items-center justify-center px-4">
          <View className="w-full max-w-sm bg-core-surface-white border border-ui-border rounded-xl p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="font-poppins-bold text-base text-ui-text">Schedule date</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close date picker" onPress={() => setCalendarOpen(false)} className="h-9 w-9 items-center justify-center rounded-lg border border-ui-border"><X size={16} color={ui.colors.textMuted} /></TouchableOpacity>
            </View>
            <View className="flex-row items-center justify-between mb-3">
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setCalendarMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))} className="h-9 w-9 items-center justify-center rounded-lg border border-ui-border"><ChevronLeft size={16} color={ui.colors.text} /></TouchableOpacity>
              <Text className="font-poppins-bold text-sm text-ui-text">{monthLabel}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setCalendarMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))} className="h-9 w-9 items-center justify-center rounded-lg border border-ui-border"><ChevronRight size={16} color={ui.colors.text} /></TouchableOpacity>
            </View>
            <View className="flex-row mb-1">{['S','M','T','W','T','F','S'].map((day,index)=><View key={`${day}-${index}`} style={{width:'14.2857%'}} className="h-8 items-center justify-center"><Text className="font-poppins-bold text-[10px] text-ui-text-muted">{day}</Text></View>)}</View>
            <View className="flex-row flex-wrap">
              {calendarCells.map((date,index)=>date ? <TouchableOpacity key={date} disabled={!dateSet.has(date)} accessibilityRole="button" accessibilityLabel={`Select ${date}`} onPress={()=>{setSelectedDate(date);setPage(1);setCalendarOpen(false);}} style={{width:'14.2857%'}} className={`h-10 items-center justify-center rounded-lg ${selectedDate===date?'bg-ui-primary':dateSet.has(date)?'bg-core-surface-white':'bg-core-surface-white opacity-40'}`}><Text className={`font-poppins text-xs ${selectedDate===date?'text-core-on-primary-white':dateSet.has(date)?'text-ui-text':'text-ui-text-muted'}`}>{Number(date.slice(-2))}</Text></TouchableOpacity>:<View key={`empty-${index}`} style={{width:'14.2857%'}} className="h-10" />)}
            </View>
            <View className="flex-row items-center justify-between mt-3">
              <TouchableOpacity accessibilityRole="button" onPress={()=>{setSelectedDate(null);setPage(1);setCalendarOpen(false);}} className="h-9 px-3 items-center justify-center rounded-lg border border-ui-border"><Text className="font-poppins-bold text-[10px] text-ui-text">All dates</Text></TouchableOpacity>
              <Text className="font-poppins text-[10px] text-ui-text-muted">{availableDatesQuery.isLoading?'Loading dates…':`${dateSet.size} scheduled dates`}</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
