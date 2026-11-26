import { getStageCheckinProgress } from '../../../core/utils/stageCheckinProgress';
import { coreColor } from '@/constants/coreTheme';
import { ui } from '@/constants/designSystem';
import React from 'react';
import { Animated, Pressable, View, Text, ScrollView, TouchableOpacity, Platform, TextInput, useWindowDimensions, RefreshControl, Alert } from 'react-native';
import { Modal } from '@/components/ui/CoreModal';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { SsfCard } from '../../../components/ui/SsfCard';
import { getPortalCardAccent, getPortalCardColumns, getPortalCardWidth, PORTAL_CARD_GAP } from '../../../components/admin/portalCardLayout';
import { SsfButton } from '../../../components/ui/SsfButton';
import { useStageManagement } from '../../../core/hooks/useStageManagement';
import { Calendar, ChevronRight, MapPin, Clock, Search, X, Lock, Bell, RefreshCw, Copy, Check, ExternalLink, RotateCcw } from 'lucide-react-native';
import { SsfSelectMenu } from '../../../components/ui/SsfSelectMenu';
import { SsfDatePicker } from '../../../components/ui/SsfDatePicker';
import { scheduleLocalDateKey, sortStageSchedulesAroundToday } from '../../../core/utils/stageScheduleDate';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import { useAuthStore } from '../../../core/store/authStore';
import { getCurrentOriginAppUrl } from '@/core/utils/appUrls';
import { ScheduleLifecycleActions } from '../../../components/schedule/ScheduleLifecycleActions';
import { getScheduleLifecycleLabel, normalizeScheduleLifecycleStatus } from '../../../core/utils/scheduleLifecycle';
import { formatScheduleTime } from '@/core/utils/scheduleTime';
import type { StageRegistrationSummary } from '../../../services/stageManagementService';
import { stageManagementService } from '../../../services/stageManagementService';
import { ScheduleTopicSetupModal } from '@/components/schedule/ScheduleTopicSetupModal';
import { scheduleTopicDrawService, type ScheduleTopicDrawState } from '@/services/scheduleTopicDrawService';
import { useQuery } from '@tanstack/react-query';

const getRegistrationsForSchedule = (registrations: any[], schedule: any) =>
  registrations.filter((registration: any) =>
    registration.item_id === schedule.item_id
    && registration.festival_id === schedule.festival_id
  );

const isPastSchedule = (schedule: any, now: number) => {
  const lifecycleStatus = normalizeScheduleLifecycleStatus(schedule.status);
  if (lifecycleStatus === 'completed') return true;
  if (lifecycleStatus === 'ongoing') return false;
  if (!schedule.end_time) return false;

  const endTime = Date.parse(schedule.end_time);
  return Number.isFinite(endTime) && endTime <= now;
};

function ScheduleWorkflowBadges({ registrations = [], summary, status, isShuffleLocked }: { registrations?: any[]; summary?: StageRegistrationSummary; status?: string | null; isShuffleLocked?: boolean }) {
  const activeRegs = registrations.filter((r: any) => r.status !== 'rejected');
  const verifiedRegs = activeRegs.filter((r: any) => r.is_verified);
  const activeCount = summary?.active_count ?? activeRegs.length;
  const verifiedCount = summary?.verified_count ?? verifiedRegs.length;
  const codedCount = summary?.coded_count ?? verifiedRegs.filter((r: any) => r.code_letter !== null && r.code_letter !== undefined).length;
  
  const { checkinDone, checkinPending, codesDone: codesShuffled, codesPending, attendanceLabel } = getStageCheckinProgress(activeCount, verifiedCount, codedCount, isShuffleLocked);
  


  const badges: { label: string; bg: string; text: string }[] = [];

  // Check-in status (Malayalam highlighted text as requested)
  if (checkinDone) {
    badges.push({ label: `Check-in Completed · ${attendanceLabel}`, bg: 'bg-core-success-soft-green-100 border border-core-success-soft-green-300', text: 'text-core-success-green-700' });
  }
  if (checkinDone && codesShuffled) {
    badges.push({ label: 'Ready to start', bg: 'bg-core-success-soft-emerald-50 border border-core-success-soft-emerald-200', text: 'text-core-success-emerald-700' });
  } else if (checkinPending) {
    badges.push({ label: 'Check-in Pending', bg: 'bg-core-warning-soft-amber-100 border border-core-warning-soft-amber-200', text: 'text-core-warning-amber-700' });
  }

  // Code Letter status
  if (!codesShuffled && codesPending) {
    badges.push({ label: 'Codes Pending', bg: 'bg-core-surface-muted-gray-100 border border-core-border-gray-200', text: 'text-core-text-muted-gray-500' });
  }

  if (!badges.length && !status) return null;

  return (
    <View className="flex-row flex-wrap gap-1.5">
      {status ? <View className={`h-6 flex-row items-center px-2 rounded-md self-start border ${normalizeScheduleLifecycleStatus(status) === 'completed' ? 'bg-core-success-soft-green-100 border-core-success-soft-green-300' : normalizeScheduleLifecycleStatus(status) === 'ongoing' ? 'bg-core-success-soft-emerald-50 border-core-success-soft-emerald-200' : 'bg-core-info-soft-blue-50 border-core-info-soft-blue-200'}`}><Text className={`font-poppins-bold text-[9px] ${normalizeScheduleLifecycleStatus(status) === 'completed' ? 'text-core-success-green-700' : normalizeScheduleLifecycleStatus(status) === 'ongoing' ? 'text-core-success-emerald-700' : 'text-core-info-blue-700'}`}>{getScheduleLifecycleLabel(status)}</Text></View> : null}
      {badges.map((badge) => (
        <View key={badge.label} className={`h-6 flex-row items-center px-2 rounded-md self-start ${badge.bg}`}>
          <Text className={`font-poppins-bold text-[9px] ${badge.text}`}>{badge.label}</Text>
        </View>
      ))}
    </View>
  );
}

function AdminMobileScheduleRow({ schedule, summary, registrations, onPress, last }: {
  schedule: any;
  summary?: StageRegistrationSummary;
  registrations: any[];
  onPress: () => void;
  last: boolean;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const animate = (toValue: number) => Animated.spring(scale, {
    toValue, useNativeDriver: true, speed: 30, bounciness: 0,
  }).start();
  return <Animated.View style={{ transform: [{ scale }] }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open actions for ${schedule.items?.item_name_en || 'event'}`}
      onPressIn={() => animate(0.98)}
      onPressOut={() => animate(1)}
      onPress={onPress}
      className={`min-h-[76px] bg-core-surface-white px-3 py-2.5 ${last ? '' : 'border-b border-ui-border'}`}
    >
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-poppins-bold text-sm text-ui-text">{schedule.items?.item_name_en || 'Unknown Event'}</Text>
          <Text numberOfLines={1} className="mt-0.5 font-poppins text-[11px] text-ui-text-muted">
            {schedule.start_time ? new Date(schedule.start_time).toLocaleDateString() : '—'} · {formatScheduleTime(schedule.start_time)} · {schedule.venues?.name || 'Stage'}
          </Text>
        </View>
        <ChevronRight size={17} color={coreColor('#64748B', 'textMuted')} />
      </View>
      <View className="mt-1.5"><ScheduleWorkflowBadges status={schedule.status} isShuffleLocked={schedule.is_shuffle_locked} registrations={registrations} summary={summary} /></View>
    </Pressable>
  </Animated.View>;
}

function StageManagementDashboardContent({ venueIdOverride, optimizedRead }: { venueIdOverride?: string; optimizedRead: boolean }) {
  const router = useRouter();
  const { user, role, is_superadmin, initialized } = useAuthStore();
  const hasStageAccess = !!user && (role === 'admin' || is_superadmin);

  const stage = useStageManagement({ summaryOnly: optimizedRead });
  const schedules = React.useMemo(() => stage.schedules || [], [stage.schedules]);
  const venues = React.useMemo(() => stage.venues || [], [stage.venues]);
  const allRegistrations = React.useMemo(() => stage.registrations || [], [stage.registrations]);
  const summariesBySchedule = React.useMemo(() => new Map(stage.summaries.map((row) => [row.schedule_id, row])), [stage.summaries]);
  const isLoadingSchedules = stage.contextQuery.isLoading || stage.schedulesQuery.isLoading;
  const isLoadingRegs = optimizedRead ? stage.summaryQuery.isLoading : stage.registrationsQuery.isLoading;
  const isLoadingVenues = stage.venuesQuery.isLoading;
  const isLoadingFest = stage.contextQuery.isLoading;
  
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [cardsWidth, setCardsWidth] = React.useState(0);
  const cardsAvailableWidth = cardsWidth || width - 32;
  const cardColumns = getPortalCardColumns(cardsAvailableWidth);
  const cardWidth = getPortalCardWidth(cardsAvailableWidth, cardColumns, Platform.OS === 'web');
  const mobileHalfFilterWidth = width >= 320 ? Math.floor((width - 64) / 2) : Math.max(0, width - 56);

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      stage.schedulesQuery.refetch(),
      stage.venuesQuery.refetch(),
      optimizedRead ? stage.summaryQuery.refetch() : stage.registrationsQuery.refetch()
    ]);
    setRefreshing(false);
  }, [stage.schedulesQuery, stage.venuesQuery, stage.registrationsQuery, stage.summaryQuery, optimizedRead]);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('All');
  const [selectedVenue, setSelectedVenue] = React.useState(venueIdOverride || 'All');
  const [selectedStatus, setSelectedStatus] = React.useState('All');
  const [selectedSchedulePeriod, setSelectedSchedulePeriod] = React.useState<'all' | 'upcoming' | 'past' | 'postponed'>('all');
  const [selectedDate, setSelectedDate] = React.useState('');
  const [actionScheduleId, setActionScheduleId] = React.useState<string | null>(null);
  const [showStatusChoices, setShowStatusChoices] = React.useState(false);
  const [scheduleFilterNow, setScheduleFilterNow] = React.useState(() => Date.now());
  const [copiedVenueId, setCopiedVenueId] = React.useState<string | null>(null);
  const [topicSetupScheduleId, setTopicSetupScheduleId] = React.useState<string | null>(null);
  const [topicSetupInitialState, setTopicSetupInitialState] = React.useState<ScheduleTopicDrawState | undefined>();
  const [topicActionLoadingId, setTopicActionLoadingId] = React.useState<string | null>(null);
  const actionSchedule = schedules.find((row: any) => row.id === actionScheduleId) ?? null;

  React.useEffect(() => {
    const interval = setInterval(() => setScheduleFilterNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const openStagePortal = (venueId: string) => {
    const path = `/stage-management/venue/${venueId}${optimizedRead ? '?read=v2' : ''}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(path, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(path as any);
  };

  const copyStageLink = async (venueId: string) => {
    const path = `/stage-management/venue/${venueId}${optimizedRead ? '?read=v2' : ''}`;
    const url = Platform.OS === 'web' ? getCurrentOriginAppUrl(path) : null;

    try {
      if (!url || Platform.OS !== 'web' || !navigator?.clipboard?.writeText) {
        throw new Error('Clipboard is unavailable on this device.');
      }
      await navigator.clipboard.writeText(url);
      setCopiedVenueId(venueId);
      setTimeout(() => setCopiedVenueId((current) => current === venueId ? null : current), 1800);
    } catch (error: any) {
      Alert.alert('Copy failed', error.message || 'Unable to copy the stage link.');
    }
  };

  const openScheduleTopics = async (schedule: any) => {
    if (!schedule?.id || topicActionLoadingId) return;
    setTopicActionLoadingId(schedule.id);
    setActionScheduleId(null);
    try {
      const topicState = await scheduleTopicDrawService.getState(schedule.id);
      setTopicSetupInitialState(topicState);
      setTopicSetupScheduleId(schedule.id);
    } catch (error: any) {
      const detail = error?.message || 'Could not check Topic Draw settings.';
      if (Platform.OS === 'web') window.alert(`Topics unavailable\n\n${detail}`);
      else Alert.alert('Topics unavailable', detail);
    } finally {
      setTopicActionLoadingId(null);
    }
  };

  const closeScheduleTopicSetup = () => {
    setTopicSetupScheduleId(null);
    setTopicSetupInitialState(undefined);
  };

  const categoriesList = ['All', 'LP', 'UP', 'HS', 'HSS', 'JUNIOR', 'SENIOR', 'CAMPUS', 'GENERAL'];

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
  ];

  const activeVenue = React.useMemo(
    () => venues.find((venue: any) => venue.id === selectedVenue),
    [venues, selectedVenue],
  );

  const filteredSchedules = React.useMemo(() => {
    const matching = schedules.filter((schedule: any) => {
      const isPast = isPastSchedule(schedule, scheduleFilterNow);
      const matchesSchedulePeriod = selectedSchedulePeriod === 'all'
        || (selectedSchedulePeriod === 'postponed'
          ? schedule.is_postponed === true
          : schedule.is_postponed !== true && (selectedSchedulePeriod === 'past' ? isPast : !isPast));
      const matchesDate = !selectedDate || scheduleLocalDateKey(schedule.start_time) === selectedDate;

      // 1. Search Query Filter
      let matchesSearch = true;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchNameEn = schedule.items?.item_name_en?.toLowerCase().includes(query);
        const matchNameMl = schedule.items?.item_name_ml?.toLowerCase().includes(query);
        const matchCategory = schedule.items?.category_codes?.some((code: string) => 
          code.toLowerCase().includes(query)
        );
        matchesSearch = matchNameEn || matchNameMl || matchCategory;
      }
      
      // 2. Category Filter
      let matchesCategory = true;
      if (selectedCategory !== 'All') {
        const codes = Array.isArray(schedule.items?.category_codes) 
          ? schedule.items.category_codes 
          : (schedule.items?.category_codes ? [schedule.items.category_codes] : []);
        
        const catShort = selectedCategory === 'SENIOR' ? 'SR' : (selectedCategory === 'JUNIOR' ? 'JR' : (selectedCategory === 'CAMPUS' ? 'CA' : (selectedCategory === 'GENERAL' ? 'GN' : selectedCategory)));
        const catLong = selectedCategory === 'SR' ? 'SENIOR' : (selectedCategory === 'JR' ? 'JUNIOR' : (selectedCategory === 'CA' ? 'CAMPUS' : (selectedCategory === 'GN' ? 'GENERAL' : selectedCategory)));

        matchesCategory = codes.includes(selectedCategory) || codes.includes(catShort) || codes.includes(catLong);
      }
      
      // 3. Venue Filter
      let matchesVenue = true;
      if (selectedVenue !== 'All') {
        matchesVenue = schedule.venue_id === selectedVenue || schedule.venues?.id === selectedVenue;
      }

      // 4. Status/Workflow Filter
      let matchesStatus = true;
      if (selectedStatus !== 'All') {
        const lifecycleStatus = normalizeScheduleLifecycleStatus(schedule.status);
        const summary = optimizedRead ? summariesBySchedule.get(schedule.id) : undefined;
        const scheduleRegs = getRegistrationsForSchedule(allRegistrations, schedule)
          .filter((registration: any) => registration.status !== 'rejected');
        const verifiedRegs = scheduleRegs.filter((r: any) => r.is_verified);
        
        const activeCount = summary?.active_count ?? scheduleRegs.length;
        const verifiedCount = summary?.verified_count ?? verifiedRegs.length;
        const codedCount = summary?.coded_count ?? verifiedRegs.filter((r: any) => r.code_letter !== null && r.code_letter !== undefined).length;
        const { checkinDone, checkinPending, codesDone: codesShuffled, codesPending } = getStageCheckinProgress(activeCount, verifiedCount, codedCount, schedule.is_shuffle_locked);

        if (['scheduled', 'ongoing', 'completed'].includes(selectedStatus)) {
          matchesStatus = lifecycleStatus === selectedStatus;
        } else if (selectedStatus === 'checkin_pending') {
          matchesStatus = checkinPending;
        } else if (selectedStatus === 'checkin_done') {
          matchesStatus = checkinDone;
        } else if (selectedStatus === 'codes_pending') {
          matchesStatus = codesPending;
        } else if (selectedStatus === 'codes_done') {
          matchesStatus = codesShuffled;
        }
      }
      
      return matchesSchedulePeriod && matchesDate && matchesSearch && matchesCategory && matchesVenue && matchesStatus;
    });
    return sortStageSchedulesAroundToday(matching, scheduleFilterNow).sort((left: any, right: any) => {
      const leftPostponed = left.is_postponed === true;
      const rightPostponed = right.is_postponed === true;
      return Number(leftPostponed) - Number(rightPostponed);
    });
  }, [schedules, scheduleFilterNow, selectedSchedulePeriod, selectedDate, searchQuery, selectedCategory, selectedVenue, selectedStatus, allRegistrations, summariesBySchedule, optimizedRead]);

  const changeActionStatus = (nextStatus: 'scheduled' | 'ongoing' | 'completed') => {
    if (!actionSchedule || normalizeScheduleLifecycleStatus(actionSchedule.status) === nextStatus) return;
    const schedule = actionSchedule;
    setActionScheduleId(null);
    setShowStatusChoices(false);
    const title = 'Change event status?';
    const body = `Change “${schedule.items?.item_name_en || 'Event'}” to ${getScheduleLifecycleLabel(nextStatus)}?`;
    const run = () => {
      void stage.setScheduleStatus({ scheduleId: schedule.id, status: nextStatus, expectedStatus: schedule.status })
        .catch((error: Error) => {
          const detail = error.message || 'Please try again.';
          if (Platform.OS === 'web') window.alert(`Unable to update status\n\n${detail}`);
          else Alert.alert('Unable to update status', detail);
        });
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${body}`)) run();
    } else {
      Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Change status', onPress: run }]);
    }
  };

  if (!initialized || (!hasStageAccess && stage.contextQuery.isLoading)) {
    return (
      <View className="flex-1 bg-ssf-bg justify-center items-center px-4">
        <SsfTableSkeleton rows={5} columns={4} />
      </View>
    );
  }

  if (!hasStageAccess) {
    return (
      <View className="flex-1 bg-ssf-bg justify-center items-center px-4">
        <SsfCard className="w-full max-w-sm p-6 items-center">
          <View className="w-16 h-16 bg-core-success-soft-green-50 rounded-full items-center justify-center mb-4">
            <Lock size={32} color={coreColor("#1B6B3A", 'primaryText')} />
          </View>
          <Text className="text-xl font-poppins-black text-ssf-text text-center mb-2">Stage Management</Text>
          <Text className="font-poppins text-ssf-text-muted text-center mb-6 text-sm">
            Sign in with a festival administrator account to access the tenant-scoped stage portal.
          </Text>
          <SsfButton
            label="Go to Sign In"
            onPress={() => router.replace('/login')}
            className="w-full"
          />
        </SsfCard>
      </View>
    );
  }

  if (isLoadingSchedules || isLoadingVenues || isLoadingRegs || isLoadingFest) {
    return (
      <View className="flex-1 bg-ssf-bg p-5">
        <SsfTableSkeleton rows={8} columns={5} />
      </View>
    );
  }

  const missingSummary = optimizedRead && stage.summaryQuery.isSuccess
    && schedules.some((schedule: any) => !summariesBySchedule.has(schedule.id));
  const stageError = stage.contextQuery.error || stage.schedulesQuery.error || stage.venuesQuery.error
    || (optimizedRead ? stage.summaryQuery.error : stage.registrationsQuery.error)
    || (missingSummary ? new Error('The new Stage summary is incomplete. Use the existing Stage page until it is checked.') : null);
  if (stageError) {
    return (
      <View className="flex-1 bg-ssf-bg justify-center items-center px-4">
        <SsfCard className="w-full max-w-lg p-6 items-center">
          <Text className="font-poppins-bold text-lg text-ui-text text-center mb-2">Unable to load Stage Management</Text>
          <Text className="font-poppins text-sm text-ui-text-muted text-center mb-5">{(stageError as any)?.message || 'Please retry the tenant-scoped stage data request.'}</Text>
          <SsfButton label="Retry" onPress={onRefresh} icon={<RefreshCw size={15} color={coreColor("#FFFFFF", 'onPrimary')} />} />
        </SsfCard>
      </View>
    );
  }

  if (!stage.context) {
    return (
      <View className="flex-1 bg-ssf-bg justify-center items-center px-4">
        <SsfCard className="w-full max-w-lg p-6 items-center">
          <Calendar size={42} color={coreColor("#94A3B8", 'textSubtle')} />
          <Text className="font-poppins-bold text-lg text-ui-text text-center mt-3 mb-2">
            No active festival for this tenant
          </Text>
          <Text className="font-poppins text-sm text-ui-text-muted text-center mb-5">
            Create or activate this tenant&apos;s festival calendar before setting up venues and stages.
          </Text>
          <SsfButton
            label="Open Festival Calendar"
            onPress={() => router.push('/(admin)/settings/calendar' as any)}
          />
        </SsfCard>
      </View>
    );
  }

  if (!venueIdOverride) {
    return (
      <ScrollView
        className={`flex-1 bg-ssf-bg ${isMobile ? 'px-3 py-3' : 'px-4 py-6'}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className={`flex-row justify-between items-center ${isMobile ? 'mb-4' : 'mb-6'}`}>
          <View className={isMobile ? 'flex-1 mr-3' : ''}>
            <Text className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-poppins-black text-ssf-text`}>Stage Management</Text>
            <Text className="font-poppins text-sm text-ssf-text-muted mt-1">
              {venues.length} stages available
            </Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh stages" onPress={onRefresh} disabled={refreshing} className={`${isMobile ? 'h-11 w-11' : 'p-2'} items-center justify-center bg-core-surface-white border border-ssf-border rounded-xl`}>
            <RefreshCw size={18} color={coreColor("#475569", 'text')} />
          </TouchableOpacity>
        </View>

        {venues.length === 0 ? (
          <SsfCard className="items-center py-10">
            <MapPin size={42} color={coreColor("#94A3B8", 'textSubtle')} />
            <Text className="font-poppins-bold text-ssf-text mt-3">No stages available</Text>
            <Text className="font-poppins text-sm text-ssf-text-muted mt-1">Create venues from Schedule Management first.</Text>
          </SsfCard>
        ) : (
          <View onLayout={event => setCardsWidth(event.nativeEvent.layout.width)} style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: PORTAL_CARD_GAP, paddingBottom: 20 }}>
            {venues.map((venue: any, index: number) => {
              const stageSchedules = schedules.filter((schedule: any) =>
                schedule.venue_id === venue.id || schedule.venues?.id === venue.id
              );
              const copied = copiedVenueId === venue.id;
              const accent = getPortalCardAccent(index);

              return (
                <SsfCard key={venue.id} className="p-3" style={{
                  width: cardWidth,
                  backgroundColor: accent.backgroundColor,
                  borderColor: accent.borderColor,
                }}>
                  <View className="flex-row items-start gap-2.5">
                    <View className="h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-core-surface-white">
                      <MapPin size={17} color={accent.icon} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-poppins-bold text-sm text-ui-text" numberOfLines={2}>{venue.name}</Text>
                      <Text className="mt-0.5 font-poppins text-[11px] text-ui-text-muted">Check-in and code-letter workspace</Text>
                      <View className="mt-2 self-start rounded-full border border-white/80 bg-core-surface-white px-2.5 py-1">
                        <Text className="font-poppins-bold text-[10px] text-ui-text">{stageSchedules.length} events</Text>
                      </View>
                    </View>
                  </View>

                  <View className="mt-3 flex-row gap-2">
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => openStagePortal(venue.id)}
                      className="h-11 flex-1 flex-row items-center justify-center rounded-lg px-2"
                      style={{ backgroundColor: ui.colors.buttonPrimary }}
                    >
                      <ExternalLink size={15} color={ui.colors.buttonForeground} />
                      <Text className="ml-1.5 font-poppins-bold text-xs" style={{ color: ui.colors.buttonForeground }}>Open Stage</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Copy stage link for ${venue.name}`}
                      onPress={() => copyStageLink(venue.id)}
                      className={`h-11 flex-1 flex-row items-center justify-center rounded-lg border px-2 ${copied ? 'border-core-success-soft-green-300 bg-core-success-soft-green-100' : 'border-white/80 bg-core-surface-white'}`}
                    >
                      {copied ? <Check size={15} color="#16A34A" /> : <Copy size={15} color="#475569" />}
                      <Text className={`ml-1.5 font-poppins-bold text-xs ${copied ? 'text-core-success-green-700' : 'text-ui-text'}`}>{copied ? 'Copied' : 'Copy link'}</Text>
                    </TouchableOpacity>
                  </View>
                </SsfCard>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <>
    <ScrollView 
      className="flex-1 bg-ssf-bg py-6 px-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-xl font-poppins-black text-ui-text">{activeVenue?.name || 'All Stages'}</Text>
          <Text className="font-poppins text-xs text-ssf-text-muted mt-1">
            {filteredSchedules.length} {selectedSchedulePeriod === 'postponed' ? 'postponed events' : selectedSchedulePeriod === 'all' ? 'events' : selectedSchedulePeriod === 'upcoming' ? 'upcoming events' : 'past events'}
          </Text>
        </View>
        <View className="flex-row gap-x-3">
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            className="h-9 w-9 bg-core-surface-white border border-ui-border rounded-lg items-center justify-center"
          >
            <RefreshCw size={16} color={coreColor("#475569", 'text')} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/notifications' as any)}
            className="h-9 w-9 bg-core-surface-white border border-ui-border rounded-lg items-center justify-center"
          >
            <Bell size={16} color={coreColor("#475569", 'text')} />
          </TouchableOpacity>
        </View>
      </View>
      
      <View className="flex-row flex-wrap gap-3 mb-5">
        <View className="flex-1 min-w-[140px] bg-core-surface-white border border-ui-border p-3 rounded-xl flex-row items-center justify-between">
          <View>
            <Text className="font-poppins-black text-ui-text text-lg">{selectedVenue === 'All' ? venues.length : 1}</Text>
            <Text className="font-poppins text-ui-text-muted text-xs">Venues</Text>
          </View>
          <MapPin color={coreColor("#0F766E", 'primaryText')} size={22} />
        </View>

        <View className="flex-1 min-w-[140px] bg-core-surface-white border border-ui-border p-3 rounded-xl flex-row items-center justify-between">
          <View>
            <Text className="font-poppins-black text-ui-text text-lg">{filteredSchedules.length}</Text>
            <Text className="font-poppins text-ui-text-muted text-xs">
              {selectedSchedulePeriod === 'postponed' ? 'Postponed Events' : selectedSchedulePeriod === 'all' ? 'Events' : selectedSchedulePeriod === 'upcoming' ? 'Upcoming Events' : 'Past Events'}
            </Text>
          </View>
          <Calendar color={coreColor("#0F766E", 'primaryText')} size={22} />
        </View>
      </View>

      {/* Search Bar */}
      <View className="flex-row items-center bg-core-surface-white border border-ui-border rounded-xl px-4 h-11 mb-3">
        <Search size={18} color={coreColor("#9CA3AF", 'textMuted')} />
        <TextInput
          className="flex-1 ml-2 font-poppins text-ssf-text outline-none"
          placeholder="Search by item name or category (e.g. LP, UP)..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={16} color={coreColor("#9CA3AF", 'textMuted')} />
          </TouchableOpacity>
        )}
      </View>

      {isMobile || !isMobile ? (
        <View className={`bg-core-surface-white border border-ui-border rounded-xl mb-5 ${isMobile ? 'p-2' : 'p-3'}`}>
          <View className="flex-row flex-wrap items-center gap-2">
            <SsfSelectMenu
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              accessibilityLabel="Filter by category"
              width={isMobile ? mobileHalfFilterWidth : 148}
              compact
              active={selectedCategory !== 'All'}
              options={categoriesList.map((item) => ({
                label: item === 'All' ? 'Category: All' : `Category: ${item}`,
                value: item,
              }))}
            />
            <SsfSelectMenu
              value={selectedVenue}
              onValueChange={setSelectedVenue}
              accessibilityLabel="Filter by venue"
              searchable
              searchPlaceholder="Search stage..."
              width={isMobile ? mobileHalfFilterWidth : 164}
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
              width={isMobile ? Math.max(0, width - 56) : 200}
              compact
              active={selectedStatus !== 'All'}
              options={statusesList.map((item) => ({
                label: item.id === 'All' ? 'Workflow: All' : `Workflow: ${item.name}`,
                value: item.id,
              }))}
            />
            <SsfSelectMenu
              value={selectedSchedulePeriod}
              onValueChange={(value) => setSelectedSchedulePeriod(value as 'all' | 'upcoming' | 'past' | 'postponed')}
              accessibilityLabel="Filter schedules by time"
              width={isMobile ? mobileHalfFilterWidth : 180}
              compact
              active={selectedSchedulePeriod !== 'all'}
              options={[
                { label: 'When: All dates', value: 'all' },
                { label: 'When: Upcoming', value: 'upcoming' },
                { label: 'When: Past', value: 'past' },
                { label: 'When: Postponed', value: 'postponed' },
              ]}
            />
            <SsfDatePicker value={selectedDate} onValueChange={setSelectedDate} placeholder={isMobile ? 'Date: All' : 'Calendar: All dates'} width={isMobile ? mobileHalfFilterWidth : 180} />
            {(selectedCategory !== 'All' || selectedVenue !== (venueIdOverride || 'All') || selectedStatus !== 'All' || selectedSchedulePeriod !== 'all' || selectedDate) && (
              <TouchableOpacity
                onPress={() => {
                  setSelectedCategory('All');
                  setSelectedVenue(venueIdOverride || 'All');
                  setSelectedStatus('All');
                  setSelectedSchedulePeriod('all');
                  setSelectedDate('');
                }}
                className="h-9 px-3 rounded-lg border border-ui-border bg-core-surface-white flex-row items-center justify-center"
              >
                <RotateCcw size={13} color={coreColor("#64748B", 'textMuted')} />
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
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1 ml-1">Filter by Category</Text>
            {Platform.OS === 'web' ? (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: coreColor('#FFF', 'surface'),
                  border: `1px solid ${coreColor('#E2E8F0', 'border')}`,
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: "Outfit_400Regular",
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
                    className={`px-4 py-1.5 rounded-full mr-2 border ${selectedCategory === item ? 'bg-button-primary border-button-border' : 'bg-core-surface-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedCategory === item ? 'text-button-foreground' : 'text-ssf-text-muted'}`}>{item}</Text>
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
                  backgroundColor: coreColor('#FFF', 'surface'),
                  border: `1px solid ${coreColor('#E2E8F0', 'border')}`,
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: "Outfit_400Regular",
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
                  backgroundColor: coreColor('#FFF', 'surface'),
                  border: `1px solid ${coreColor('#E2E8F0', 'border')}`,
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: "Outfit_400Regular",
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
                    className={`px-4 py-1.5 rounded-full mr-2 border ${selectedStatus === item.id ? 'bg-button-primary border-button-border' : 'bg-core-surface-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedStatus === item.id ? 'text-button-foreground' : 'text-ssf-text-muted'}`}>{item.name}</Text>
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
                      ? 'bg-button-primary border-button-border'
                      : 'bg-core-surface-white border-ssf-border'
                    }`}
                >
                  <Text className={`font-poppins-bold text-xs ${selectedCategory === item ? 'text-button-foreground' : 'text-ssf-text-muted'}`}>
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
                      ? 'bg-button-primary border-button-border'
                      : 'bg-core-surface-white border-ssf-border'
                    }`}
                >
                  <Text className={`font-poppins-bold text-xs ${selectedStatus === item.id ? 'text-button-foreground' : 'text-ssf-text-muted'}`}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {schedules.length === 0 ? (
        <SsfCard className="items-center py-10">
          <Calendar size={48} color={coreColor("#D1D5DB", 'textMuted')} className="mb-4" />
          <Text className="font-poppins text-ssf-text-muted text-center">No schedules created yet.</Text>
        </SsfCard>
      ) : filteredSchedules.length === 0 ? (
        <SsfCard className="items-center py-10">
          <Search size={48} color={coreColor("#D1D5DB", 'textMuted')} className="mb-4" />
          <Text className="font-poppins text-ssf-text-muted text-center">
            No scheduled events found matching your search or filters.
          </Text>
          <TouchableOpacity 
            onPress={() => {
              setSearchQuery('');
              setSelectedCategory('All');
              setSelectedVenue('All');
              setSelectedStatus('All');
              setSelectedSchedulePeriod('all');
              setSelectedDate('');
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
            <Text style={{ flex: 1.4 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Event</Text>
            <Text style={{ flex: 1 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Venue / Category</Text>
            <Text style={{ flex: 1 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Date & Time</Text>
            <Text style={{ flex: 1.3 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Workflow</Text>
            <Text style={{ width: 300 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted text-right">Actions</Text>
          </View>
          {filteredSchedules.map((schedule: any) => (
            <View key={schedule.id} className="min-h-16 px-4 py-2 flex-row items-center border-b border-ui-border bg-core-surface-white">
              <View style={{ flex: 1.4 }} className="pr-3">
                <Text numberOfLines={1} className="font-poppins-bold text-xs text-ui-text">{schedule.items?.item_name_en || 'Unknown Event'}</Text>
                <Text numberOfLines={1} className="font-poppins text-[10px] text-ui-text-muted mt-0.5">{schedule.items?.item_name_ml || schedule.items?.item_code || '—'}</Text>
              </View>
              <View style={{ flex: 1 }} className="pr-3 items-start">
                <View className="bg-core-success-soft-emerald-50 border border-core-success-soft-emerald-100 px-2 py-1 rounded-md">
                  <Text numberOfLines={1} className="font-poppins-bold text-[9px] text-core-success-emerald-700">{schedule.venues?.name || 'Unknown Venue'}</Text>
                </View>
                {!!schedule.items?.category_codes?.length && (
                  <Text className="font-poppins-bold text-[9px] text-core-primary-text-teal-700 mt-1">{(schedule.items.category_codes as string[]).join(', ')}</Text>
                )}
              </View>
              <View style={{ flex: 1 }} className="pr-3">
                <View className="flex-row items-center">
                  <Calendar size={12} color={coreColor("#64748B", 'textMuted')} />
                  <Text className="font-poppins text-[10px] text-ui-text-muted ml-1.5">{new Date(schedule.start_time).toLocaleDateString()}</Text>
                </View>
                <View className="flex-row items-center mt-1">
                  <Clock size={12} color={coreColor("#64748B", 'textMuted')} />
                  <Text className="font-poppins text-[10px] text-ui-text-muted ml-1.5">
                    {formatScheduleTime(schedule.start_time)} – {formatScheduleTime(schedule.end_time)}
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1.3 }} className="pr-3">
                <ScheduleWorkflowBadges status={schedule.status} isShuffleLocked={schedule.is_shuffle_locked} registrations={getRegistrationsForSchedule(allRegistrations, schedule)} summary={optimizedRead ? summariesBySchedule.get(schedule.id) : undefined} />
              </View>
              <View style={{ width: 300 }} className="flex-row justify-end gap-x-2">
                <TouchableOpacity
                  onPress={() => router.push(`/stage-management/${schedule.id}/checkin` as any)}
                  className="h-8 px-3 rounded-lg border border-ui-border bg-core-surface-white items-center justify-center"
                >
                  <Text className="font-poppins-bold text-[9px] text-ui-text">Check-in</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push(`/stage-management/${schedule.id}/code-letter` as any)}
                  className="h-8 px-3 rounded-lg bg-button-primary items-center justify-center"
                >
                  <Text className="font-poppins-bold text-[9px] text-button-foreground">Code Letters</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => { void openScheduleTopics(schedule); }}
                  disabled={topicActionLoadingId === schedule.id || !!topicActionLoadingId}
                  className="h-8 px-3 rounded-lg border border-ui-border bg-core-surface-white items-center justify-center"
                >
                  <Text className="font-poppins-bold text-[9px] text-ui-text">{topicActionLoadingId === schedule.id ? 'Loading…' : 'Topics'}</Text>
                </TouchableOpacity>
                <ScheduleLifecycleActions scheduleName={schedule.items?.item_name_en || 'Event'} status={schedule.status} disabled={stage.isSettingScheduleStatus} onStatusChange={(status, expectedStatus) => stage.setScheduleStatus({ scheduleId: schedule.id, status, expectedStatus })} />
              </View>
            </View>
          ))}
        </View>
        ) : (
        <View className="mb-4 overflow-hidden rounded-xl border border-ui-border bg-core-surface-white">
          {filteredSchedules.map((schedule: any, index: number) => (
            <AdminMobileScheduleRow
              key={schedule.id}
              schedule={schedule}
              registrations={getRegistrationsForSchedule(allRegistrations, schedule)}
              summary={optimizedRead ? summariesBySchedule.get(schedule.id) : undefined}
              onPress={() => { setActionScheduleId(schedule.id); setShowStatusChoices(false); }}
              last={index === filteredSchedules.length - 1}
            />
          ))}
        </View>
        )
      )}
    </ScrollView>
    <Modal visible={isMobile && !!actionSchedule} transparent animationType="slide" onRequestClose={() => setActionScheduleId(null)}>
      <View className="flex-1 justify-end bg-core-surface-strong-black/50">
        <Pressable accessibilityLabel="Close event actions" onPress={() => setActionScheduleId(null)} className="absolute inset-0" />
        {actionSchedule ? <View style={{ maxHeight: '85%' }} className="w-full max-w-md self-center rounded-t-2xl border border-ui-border bg-core-surface-white px-4 pb-6 pt-3">
          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="mb-3 h-1 w-10 self-center rounded-full bg-core-surface-muted-gray-100" />
            <View className="mb-3 flex-row items-start gap-3">
              <View className="min-w-0 flex-1">
                <Text numberOfLines={2} className="font-poppins-bold text-base text-ui-text">{actionSchedule.items?.item_name_en || 'Unknown Event'}</Text>
                <Text className="mt-0.5 font-poppins text-xs text-ui-text-muted">{actionSchedule.start_time ? new Date(actionSchedule.start_time).toLocaleDateString() : '—'} · {formatScheduleTime(actionSchedule.start_time)} · {actionSchedule.venues?.name || 'Stage'}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close event actions" onPress={() => setActionScheduleId(null)} className="h-10 w-10 items-center justify-center rounded-lg border border-ui-border"><X size={17} color={coreColor('#475569', 'textMuted')} /></TouchableOpacity>
            </View>
            <ScheduleWorkflowBadges status={actionSchedule.status} isShuffleLocked={actionSchedule.is_shuffle_locked} registrations={getRegistrationsForSchedule(allRegistrations, actionSchedule)} summary={optimizedRead ? summariesBySchedule.get(actionSchedule.id) : undefined} />
            <View className="mt-4 gap-2 border-t border-ui-border pt-3">
              <TouchableOpacity accessibilityRole="button" onPress={() => { setActionScheduleId(null); router.push(`/stage-management/${actionSchedule.id}/checkin` as any); }} className="h-12 flex-row items-center justify-between rounded-xl bg-button-primary px-4"><Text className="font-poppins-bold text-sm text-button-foreground">Check-in</Text><ChevronRight size={17} color={coreColor('#FFFFFF', 'buttonForeground')} /></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => { setActionScheduleId(null); router.push(`/stage-management/${actionSchedule.id}/code-letter` as any); }} className="h-12 flex-row items-center justify-between rounded-xl border border-ui-border bg-core-surface-white px-4"><Text className="font-poppins-bold text-sm text-ui-text">Code Letters</Text><ChevronRight size={17} color={coreColor('#64748B', 'textMuted')} /></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => { void openScheduleTopics(actionSchedule); }} disabled={!!topicActionLoadingId} className="h-12 flex-row items-center justify-between rounded-xl border border-ui-border bg-core-surface-white px-4"><Text className="font-poppins-bold text-sm text-ui-text">Manage Topics</Text><ChevronRight size={17} color={coreColor('#64748B', 'textMuted')} /></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showStatusChoices }} onPress={() => setShowStatusChoices((value) => !value)} className="h-11 flex-row items-center justify-between rounded-xl border border-ui-border bg-core-surface-white px-4"><Text className="font-poppins-bold text-xs text-ui-text">Change status</Text><ChevronRight size={16} color={coreColor('#64748B', 'textMuted')} /></TouchableOpacity>
              {showStatusChoices ? <View className="flex-row flex-wrap gap-2 pb-1">
                {(['scheduled', 'ongoing', 'completed'] as const).map((status) => <TouchableOpacity key={status} accessibilityRole="button" accessibilityState={{ disabled: normalizeScheduleLifecycleStatus(actionSchedule.status) === status }} disabled={normalizeScheduleLifecycleStatus(actionSchedule.status) === status || stage.isSettingScheduleStatus} onPress={() => changeActionStatus(status)} className={`min-h-11 flex-1 items-center justify-center rounded-lg border border-ui-border px-2 ${normalizeScheduleLifecycleStatus(actionSchedule.status) === status ? 'bg-ui-muted opacity-60' : 'bg-core-surface-white'}`}><Text numberOfLines={1} className="font-poppins-bold text-[10px] text-ui-text">{getScheduleLifecycleLabel(status)}</Text></TouchableOpacity>)}
              </View> : null}
            </View>
          </ScrollView>
        </View> : null}
      </View>
    </Modal>
    <ScheduleTopicSetupModal
      visible={!!topicSetupScheduleId}
      scheduleId={topicSetupScheduleId}
      initialState={topicSetupInitialState}
      enableOnSave={topicSetupInitialState?.enabled === false}
      onSaved={() => { void stage.schedulesQuery.refetch(); }}
      onClose={closeScheduleTopicSetup}
    />
    </>
  );
}

export function StageManagementDashboard({ venueIdOverride }: { venueIdOverride?: string } = {}) {
  const params = useLocalSearchParams();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { user, role, is_superadmin, initialized } = useAuthStore();
  const hasStageAccess = initialized && !!user && (role === 'admin' || is_superadmin);
  const modeQuery = useQuery({
    queryKey: ['stage-management-read-mode', user?.id],
    queryFn: () => stageManagementService.getManagementReadMode(),
    enabled: hasStageAccess,
    retry: false,
    staleTime: 15_000,
  });

  React.useEffect(() => {
    if (!isFocused || !modeQuery.data) return;
    const canonical = modeQuery.data === 'v2' ? 'v2' : undefined;
    if (params.read !== canonical) router.replace(`/stage-management${canonical ? '?read=v2' : ''}` as any);
  }, [isFocused, modeQuery.data, params.read, router]);

  if (!hasStageAccess || modeQuery.isPending) return <View className="flex-1 items-center justify-center bg-ssf-bg"><Text>Loading Stage management...</Text></View>;
  if (modeQuery.isError) return <View className="flex-1 items-center justify-center bg-ssf-bg px-5"><Text>Stage mode unavailable. Refresh to retry.</Text></View>;
  return <StageManagementDashboardContent venueIdOverride={venueIdOverride} optimizedRead={modeQuery.data === 'v2'} />;
}

export default StageManagementDashboard;
