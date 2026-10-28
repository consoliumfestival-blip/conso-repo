import { coreColor } from '@/constants/coreTheme';
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, TextInput, useWindowDimensions, RefreshControl, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { useStageManagement } from '../../../core/hooks/useStageManagement';
import { Calendar, MapPin, Clock, Search, X, Lock, Bell, RefreshCw, Copy, Check, ExternalLink, RotateCcw } from 'lucide-react-native';
import { SsfSelectMenu } from '../../../components/ui/SsfSelectMenu';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import { useAuthStore } from '../../../core/store/authStore';
import { getCurrentOriginAppUrl } from '@/core/utils/appUrls';
import { ScheduleLifecycleActions } from '../../../components/schedule/ScheduleLifecycleActions';
import { getScheduleLifecycleLabel, normalizeScheduleLifecycleStatus } from '../../../core/utils/scheduleLifecycle';
import type { StageRegistrationSummary } from '../../../services/stageManagementService';

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
  
  const checkinDone = (activeCount > 0 && verifiedCount === activeCount) || isShuffleLocked;
  const checkinPending = activeCount > verifiedCount;
  
  const codesShuffled = (verifiedCount > 0 && codedCount === verifiedCount) || isShuffleLocked;
  const codesPending = verifiedCount > codedCount;

  const badges: { label: string; bg: string; text: string }[] = [];

  // Check-in status (Malayalam highlighted text as requested)
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
      {status ? <View className={`h-6 flex-row items-center px-2 rounded-md self-start border ${normalizeScheduleLifecycleStatus(status) === 'completed' ? 'bg-core-surface-muted-slate-100 border-core-border-slate-200' : normalizeScheduleLifecycleStatus(status) === 'ongoing' ? 'bg-core-success-soft-emerald-50 border-core-success-soft-emerald-200' : 'bg-core-info-soft-blue-50 border-core-info-soft-blue-200'}`}><Text className={`font-poppins-bold text-[9px] ${normalizeScheduleLifecycleStatus(status) === 'completed' ? 'text-core-text-slate-700' : normalizeScheduleLifecycleStatus(status) === 'ongoing' ? 'text-core-success-emerald-700' : 'text-core-info-blue-700'}`}>{getScheduleLifecycleLabel(status)}</Text></View> : null}
      {badges.map((badge) => (
        <View key={badge.label} className={`h-6 flex-row items-center px-2 rounded-md self-start ${badge.bg}`}>
          <Text className={`font-poppins-bold text-[9px] ${badge.text}`}>{badge.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function StageManagementDashboard({ venueIdOverride }: { venueIdOverride?: string } = {}) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const optimizedRead = params.read === 'v2';
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
  const [selectedSchedulePeriod, setSelectedSchedulePeriod] = React.useState<'upcoming' | 'past'>('upcoming');
  const [scheduleFilterNow, setScheduleFilterNow] = React.useState(() => Date.now());
  const [copiedVenueId, setCopiedVenueId] = React.useState<string | null>(null);
  const [copiedPinVenueId, setCopiedPinVenueId] = React.useState<string | null>(null);

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

  const copyStagePin = async (venueId: string, pin?: string) => {
    if (!pin) {
      Alert.alert('PIN unavailable', 'Refresh Stage Management after applying the stage portal migration.');
      return;
    }
    try {
      if (Platform.OS !== 'web' || !navigator?.clipboard?.writeText) throw new Error('Clipboard is unavailable on this device.');
      await navigator.clipboard.writeText(pin);
      setCopiedPinVenueId(venueId);
      setTimeout(() => setCopiedPinVenueId((current) => current === venueId ? null : current), 1800);
    } catch (error: any) {
      Alert.alert('Copy failed', error.message || 'Unable to copy the stage PIN.');
    }
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
    return schedules.filter((schedule: any) => {
      const isPast = isPastSchedule(schedule, scheduleFilterNow);
      const matchesSchedulePeriod = selectedSchedulePeriod === 'past' ? isPast : !isPast;

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
        const checkinDone = activeCount > 0 && verifiedCount === activeCount;
        const checkinPending = activeCount > verifiedCount;
        
        const codesShuffled = verifiedCount > 0 && codedCount === verifiedCount;
        const codesPending = verifiedCount > codedCount;

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
      
      return matchesSchedulePeriod && matchesSearch && matchesCategory && matchesVenue && matchesStatus;
    });
  }, [schedules, scheduleFilterNow, selectedSchedulePeriod, searchQuery, selectedCategory, selectedVenue, selectedStatus, allRegistrations, summariesBySchedule, optimizedRead]);

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
        ) : isMobile ? (
          <View className="gap-y-3 pb-5">
            {venues.map((venue: any) => {
              const stageSchedules = schedules.filter((schedule: any) =>
                schedule.venue_id === venue.id || schedule.venues?.id === venue.id
              );
              const copied = copiedVenueId === venue.id;
              const copiedPin = copiedPinVenueId === venue.id;

              return (
                <SsfCard key={venue.id} className="p-3">
                  <View className="flex-row items-start gap-3">
                    <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-core-success-soft-emerald-50">
                      <MapPin size={18} color={coreColor("#047857", 'success')} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-poppins-bold text-sm text-ui-text" numberOfLines={2}>{venue.name}</Text>
                      <Text className="mt-0.5 font-poppins text-xs text-ui-text-muted">Independent check-in and code-letter workspace</Text>
                      <View className="mt-2 self-start rounded-full border border-core-border-slate-200 bg-core-surface-muted-slate-50 px-2.5 py-1">
                        <Text className="font-poppins-bold text-[10px] text-core-text-slate-600">{stageSchedules.length} events</Text>
                      </View>
                    </View>
                  </View>

                  <View className="mt-3 flex-row items-center justify-between rounded-lg border border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50 pl-3">
                    <Text className="font-poppins-bold text-xs text-core-warning-amber-900">PIN {venue.pin || '—'}</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Copy PIN for ${venue.name}`}
                      onPress={() => copyStagePin(venue.id, venue.pin)}
                      className={`h-11 min-w-11 items-center justify-center rounded-r-lg px-3 ${copiedPin ? 'bg-core-success-soft-emerald-50' : 'bg-core-surface-white/60'}`}
                    >
                      {copiedPin ? <Check size={16} color={coreColor("#047857", 'success')} /> : <Copy size={16} color={coreColor("#92400E", 'warning')} />}
                    </TouchableOpacity>
                  </View>

                  <View className="mt-3 flex-row gap-2">
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => openStagePortal(venue.id)}
                      className="h-11 flex-1 flex-row items-center justify-center rounded-lg bg-core-primary-teal-700 px-2"
                    >
                      <ExternalLink size={15} color={coreColor("#FFFFFF", 'onPrimary')} />
                      <Text className="ml-1.5 font-poppins-bold text-xs text-core-on-primary-white">Open Stage</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Copy stage link for ${venue.name}`}
                      onPress={() => copyStageLink(venue.id)}
                      className={`h-11 flex-1 flex-row items-center justify-center rounded-lg border px-2 ${copied ? 'border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50' : 'border-ui-border bg-core-surface-white'}`}
                    >
                      {copied ? <Check size={15} color={coreColor("#047857", 'success')} /> : <Copy size={15} color={coreColor("#475569", 'text')} />}
                      <Text className={`ml-1.5 font-poppins-bold text-xs ${copied ? 'text-core-success-emerald-700' : 'text-core-text-slate-700'}`}>{copied ? 'Copied' : 'Copy link'}</Text>
                    </TouchableOpacity>
                  </View>
                </SsfCard>
              );
            })}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
            <View className="flex-1 bg-core-surface-white border border-ui-border rounded-xl overflow-hidden" style={{ minWidth: 820 }}>
              <View className="h-11 px-4 flex-row items-center bg-ui-muted border-b border-ui-border">
                <Text style={{ flex: 1.2 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Stage</Text>
                <Text style={{ flex: 1.8 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Workspace</Text>
                <Text style={{ width: 120 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Events</Text>
                <Text style={{ width: 385 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted text-right">Stage link & PIN</Text>
              </View>
              {venues.map((venue: any) => {
                const stageSchedules = schedules.filter((schedule: any) =>
                  schedule.venue_id === venue.id || schedule.venues?.id === venue.id
                );
                const copied = copiedVenueId === venue.id;
                return (
                  <View key={venue.id} className="min-h-16 px-4 flex-row items-center border-b border-ui-border bg-core-surface-white">
                    <View style={{ flex: 1.2 }} className="flex-row items-center pr-4">
                      <View className="h-8 w-8 rounded-lg bg-core-success-soft-emerald-50 items-center justify-center mr-2.5">
                        <MapPin size={15} color={coreColor("#047857", 'success')} />
                      </View>
                      <Text numberOfLines={1} className="flex-1 font-poppins-bold text-xs text-ui-text">{venue.name}</Text>
                    </View>
                    <Text style={{ flex: 1.8 }} numberOfLines={1} className="font-poppins text-xs text-ui-text-muted pr-4">
                      Independent check-in and code-letter workspace
                    </Text>
                    <View style={{ width: 120, alignItems: 'flex-start' }}>
                      <View className="px-2.5 py-1 rounded-full bg-core-surface-muted-slate-50 border border-core-border-slate-200">
                        <Text className="font-poppins-bold text-[9px] text-core-text-slate-600">{stageSchedules.length} events</Text>
                      </View>
                    </View>
                    <View style={{ width: 385 }} className="flex-row items-center justify-end gap-x-2">
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Copy PIN for ${venue.name}`}
                        onPress={() => copyStagePin(venue.id, venue.pin)}
                        className={`h-8 px-3 rounded-lg border flex-row items-center justify-center ${copiedPinVenueId === venue.id ? 'bg-core-success-soft-emerald-50 border-core-success-soft-emerald-200' : 'bg-core-warning-soft-amber-50 border-core-warning-soft-amber-200'}`}
                      >
                        <Text className="font-poppins-bold text-[10px] text-core-warning-amber-800 mr-1.5">PIN {venue.pin || '—'}</Text>
                        {copiedPinVenueId === venue.id ? <Check size={13} color={coreColor("#047857", 'success')} /> : <Copy size={13} color={coreColor("#92400E", 'warning')} />}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => openStagePortal(venue.id)}
                        className="h-8 px-3 rounded-lg bg-core-primary-teal-700 flex-row items-center justify-center"
                      >
                        <ExternalLink size={13} color={coreColor("#FFFFFF", 'onPrimary')} />
                        <Text className="ml-1.5 font-poppins-bold text-[10px] text-core-on-primary-white">Open Stage</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Copy stage link for ${venue.name}`}
                        onPress={() => copyStageLink(venue.id)}
                        className={`h-8 px-3 rounded-lg border flex-row items-center justify-center ${
                          copied ? 'bg-core-success-soft-emerald-50 border-core-success-soft-emerald-200' : 'bg-core-surface-white border-ui-border'
                        }`}
                      >
                        {copied ? <Check size={13} color={coreColor("#047857", 'success')} /> : <Copy size={13} color={coreColor("#475569", 'text')} />}
                        <Text className={`ml-1.5 font-poppins-bold text-[10px] ${copied ? 'text-core-success-emerald-700' : 'text-core-text-slate-600'}`}>
                          {copied ? 'Copied' : 'Copy Link'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView 
      className="flex-1 bg-ssf-bg py-6 px-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-xl font-poppins-black text-ui-text">{activeVenue?.name || 'All Stages'}</Text>
          <Text className="font-poppins text-xs text-ssf-text-muted mt-1">
            {filteredSchedules.length} {selectedSchedulePeriod === 'upcoming' ? 'upcoming' : 'past'} events
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
              {selectedSchedulePeriod === 'upcoming' ? 'Upcoming Events' : 'Past Events'}
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
        <View className="bg-core-surface-white border border-ui-border rounded-xl p-3 mb-5">
          <View className="flex-row flex-wrap items-center gap-2">
            <SsfSelectMenu
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              accessibilityLabel="Filter by category"
              width={isMobile ? Math.max(120, (width - 72) / 2) : 148}
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
              width={isMobile ? Math.max(220, width - 56) : 200}
              compact
              active={selectedStatus !== 'All'}
              options={statusesList.map((item) => ({
                label: item.id === 'All' ? 'Workflow: All' : `Workflow: ${item.name}`,
                value: item.id,
              }))}
            />
            <SsfSelectMenu
              value={selectedSchedulePeriod}
              onValueChange={(value) => setSelectedSchedulePeriod(value as 'upcoming' | 'past')}
              accessibilityLabel="Filter schedules by time"
              width={isMobile ? Math.max(220, width - 56) : 180}
              compact
              active={selectedSchedulePeriod !== 'upcoming'}
              options={[
                { label: 'When: Upcoming', value: 'upcoming' },
                { label: 'When: Past', value: 'past' },
              ]}
            />
            {(selectedCategory !== 'All' || selectedVenue !== venueIdOverride || selectedStatus !== 'All' || selectedSchedulePeriod !== 'upcoming') && (
              <TouchableOpacity
                onPress={() => {
                  setSelectedCategory('All');
                  setSelectedVenue(venueIdOverride || 'All');
                  setSelectedStatus('All');
                  setSelectedSchedulePeriod('upcoming');
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
                  backgroundColor: coreColor('#FFF', 'surface'),
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
                  backgroundColor: coreColor('#FFF', 'surface'),
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
              setSelectedSchedulePeriod('upcoming');
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
            <Text style={{ width: 235 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted text-right">Actions</Text>
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
                    {new Date(schedule.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(schedule.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1.3 }} className="pr-3">
                <ScheduleWorkflowBadges status={schedule.status} isShuffleLocked={schedule.is_shuffle_locked} registrations={getRegistrationsForSchedule(allRegistrations, schedule)} summary={optimizedRead ? summariesBySchedule.get(schedule.id) : undefined} />
              </View>
              <View style={{ width: 235 }} className="flex-row justify-end gap-x-2">
                <TouchableOpacity
                  onPress={() => router.push(`/stage-management/${schedule.id}/checkin` as any)}
                  className="h-8 px-3 rounded-lg border border-ui-border bg-core-surface-white items-center justify-center"
                >
                  <Text className="font-poppins-bold text-[9px] text-ui-text">Check-in</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push(`/stage-management/${schedule.id}/code-letter` as any)}
                  className="h-8 px-3 rounded-lg bg-core-primary-teal-700 items-center justify-center"
                >
                  <Text className="font-poppins-bold text-[9px] text-core-on-primary-white">Code Letters</Text>
                </TouchableOpacity>
                <ScheduleLifecycleActions scheduleName={schedule.items?.item_name_en || 'Event'} status={schedule.status} disabled={stage.isSettingScheduleStatus} onStatusChange={(status, expectedStatus) => stage.setScheduleStatus({ scheduleId: schedule.id, status, expectedStatus })} />
              </View>
            </View>
          ))}
        </View>
        ) : (
        <View className="gap-y-4">
          {filteredSchedules.map((schedule: any) => (
            <SsfCard key={schedule.id} className="p-4">
              {/* Card Header: Title + Actions */}
              <View className="mb-2">
                {/* Top row: title left */}
                  <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-2">
                    <Text className="font-poppins-bold text-base" numberOfLines={2}>{schedule.items?.item_name_en || 'Unknown Event'}</Text>
                    {schedule.items?.item_name_ml ? (
                      <Text className="font-poppins text-xs text-ssf-text-muted mt-0.5" numberOfLines={1}>{schedule.items.item_name_ml}</Text>
                    ) : null}
                    <ScheduleLifecycleActions scheduleName={schedule.items?.item_name_en || 'Event'} status={schedule.status} disabled={stage.isSettingScheduleStatus} onStatusChange={(status, expectedStatus) => stage.setScheduleStatus({ scheduleId: schedule.id, status, expectedStatus })} />
                  </View>
                </View>

                {/* Venue badge — below title row on all sizes */}
                <View className="mt-2 self-start">
                  <View className="bg-core-success-soft-green-100 px-2 py-1 rounded">
                    <Text className="font-poppins-bold text-xs text-core-success-green-800">{schedule.venues?.name || 'Unknown Venue'}</Text>
                  </View>
                </View>

                {/* Category Badges */}
                {schedule.items?.category_codes && schedule.items.category_codes.length > 0 && (
                  <View className="flex-row flex-wrap gap-1 mt-2">
                    {(schedule.items.category_codes as string[]).map((code: string) => (
                      <View key={code} className="bg-ssf-primary/10 border border-ssf-primary/20 px-2 py-0.5 rounded-full">
                        <Text className="font-poppins-bold text-[10px] text-ui-primary-text">{code}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              
              {/* Time & Date row */}
              <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 mb-3">
                <View className="flex-row items-center gap-x-1">
                  <Clock size={13} color={coreColor("#6B7280", 'text')} />
                  <Text className="font-poppins text-xs text-core-text-gray-600">
                    {new Date(schedule.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(schedule.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View className="flex-row items-center gap-x-1">
                  <Calendar size={13} color={coreColor("#6B7280", 'text')} />
                  <Text className="font-poppins text-xs text-core-text-gray-600">
                    {new Date(schedule.start_time).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              <ScheduleWorkflowBadges 
                status={schedule.status}
                isShuffleLocked={schedule.is_shuffle_locked}
                registrations={getRegistrationsForSchedule(allRegistrations, schedule)}
                summary={optimizedRead ? summariesBySchedule.get(schedule.id) : undefined}
              />

              {/* Action buttons — 2×2 grid on mobile */}
              <View className="flex-row flex-wrap gap-2 border-t border-core-border-gray-100 pt-3 mt-3">
                <View className="flex-row gap-x-2 w-full">
                  <SsfButton 
                    label="Check-In" 
                    variant="outline" 
                    size="md"
                    className="flex-1"
                    onPress={() => router.push(`/stage-management/${schedule.id}/checkin` as any)}
                  />
                  <SsfButton 
                    label="Code Letters" 
                    variant="outline" 
                    size="md"
                    className="flex-1"
                    onPress={() => router.push(`/stage-management/${schedule.id}/code-letter` as any)}
                  />
                </View>
              </View>
            </SsfCard>
          ))}
        </View>
        )
      )}
    </ScrollView>
  );
}

export default StageManagementDashboard;
