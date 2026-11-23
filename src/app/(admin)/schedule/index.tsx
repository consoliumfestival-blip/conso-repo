import { coreColor } from '@/constants/coreTheme';
import { ui } from '@/constants/designSystem';
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, TextInput, useWindowDimensions, Modal, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';

import { useSchedule } from '../../../core/hooks/useSchedule';
import { Calendar, MapPin, Plus, Clock, RotateCcw, UserCheck, Edit, Trash2, Search, X, LogIn, Shuffle, FilePenLine, Trophy, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, FileText, Share2, Copy, MessageCircle } from 'lucide-react-native';
import { scheduleOverviewService, ScheduleWorkflowSummary } from '../../../services/scheduleOverviewService';
import { participantService } from '../../../services/participantService';
import { chanceSheetService } from '../../../services/chanceSheetService';

import { useFestival } from '../../../core/hooks/useFestival';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../core/store/authStore';
import { formatScheduleTime } from '@/core/utils/scheduleTime';
import { adminNavigationMode } from '@/core/utils/adminNavigationLayout';

import { SsfSelectMenu } from '../../../components/ui/SsfSelectMenu';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import type { AdminSchedulePdfMode } from '../../../services/schedulePdfService';
import { isGroupCompetition } from '../../../core/utils/groupParticipation';
import { ScheduleLifecycleActions } from '../../../components/schedule/ScheduleLifecycleActions';
import * as Device from 'expo-device';
import { getCompactScheduleActionOrientation, getScheduleActionRows, showScheduleCardActions } from '../../../core/utils/scheduleTabletLayout';
import { getScheduleLifecycleLabel, normalizeScheduleLifecycleStatus } from '../../../core/utils/scheduleLifecycle';
import { stageManagementService } from '../../../services/stageManagementService';
import { getStageCheckinProgress } from '../../../core/utils/stageCheckinProgress';
import { SubstageEditor } from '@/components/schedule/SubstageEditor';
import { normalizedSubstages, supportsSubstages, validateSubstages, type ScheduleSubstage } from '@/core/utils/scheduleSubstages';
import { ScheduleJudgesModal } from '@/components/schedule/ScheduleJudgesModal';

const normalizeCategory = (value: string) => {
  const norm = value.trim().toUpperCase();
  return norm === 'GN' ? 'GENERAL' : norm;
};

type SchedulePdfExportOption = AdminSchedulePdfMode | 'team-attendance' | 'blank' | 'chance-sheet';

const schedulePdfExportOptions: { id: SchedulePdfExportOption; label: string; description: string }[] = [
  { id: 'master', label: 'Master Schedule', description: 'One PDF using the current schedule filters.' },
  { id: 'venue', label: 'Venue-wise Schedule', description: 'One PDF with venue and stage details for filtered schedules.' },
  { id: 'organisation', label: 'Organisation-wise Schedule', description: 'One PDF grouping participants by organisation for filtered schedules.' },
  { id: 'team-attendance', label: 'Team-wise Attendance PDF', description: 'Counts for all completed competitions; page filters do not apply.' },
  { id: 'blank', label: 'Blank Schedule PDF', description: 'An empty timetable for the active items.' },
  { id: 'chance-sheet', label: 'Chance Sheet', description: 'Choose one item and create its printable chance sheet.' },
];

function ScheduleWorkflowBadges({status,summary,isShuffleLocked,isPostponed=false}: {
 status?: string | null; summary?: ScheduleWorkflowSummary; isShuffleLocked?: boolean;
 isPostponed?: boolean;
}) {
  const normalizedStatus = normalizeScheduleLifecycleStatus(status);
  const postponed = normalizedStatus !== 'ongoing' && normalizedStatus !== 'completed'
    && isPostponed;
  const lifecycleLabel = postponed ? 'Postponed' : getScheduleLifecycleLabel(status);
  const lifecycleColor = postponed
    ? '#EA580C'
    : normalizedStatus === 'ongoing'
      ? '#059669'
      : normalizedStatus === 'completed'
        ? '#16A34A'
        : '#2563EB';
  const progress = summary ? getStageCheckinProgress(summary.active_count, summary.verified_count, summary.coded_count, isShuffleLocked) : null;
  const checkInStatus = summary && progress
    ? (progress.checkinDone
      ? `Check-in completed · ${progress.attendanceLabel}`
      : `Check-in pending${summary.active_count > 0 ? ` · ${summary.verified_count}/${summary.active_count}` : ''}`)
    : null;
  const checkInColor = progress?.checkinDone ? '#16A34A' : '#EA580C';

  return (
    <View
      accessible
      accessibilityLabel={`Status: ${lifecycleLabel}${checkInStatus ? `. ${checkInStatus}` : ''}`}
      className="items-start justify-center gap-0.5"
    >
      <Text style={{ color: lifecycleColor }} className="font-poppins-bold text-[10px]">{lifecycleLabel}</Text>
      {checkInStatus ? <Text style={{ color: checkInColor }} className="font-poppins text-[9px]">{checkInStatus}</Text> : null}
    </View>
  );
}

function isPostponedSchedule(schedule: any): boolean {
  const status = normalizeScheduleLifecycleStatus(schedule.status);
  return schedule.is_postponed === true && status !== 'ongoing' && status !== 'completed';
}

const SCHEDULE_WORKFLOW_ACTIONS = [
  { label: 'Judges', path: 'judges' },
  { label: 'Check-in', path: 'checkin' },
  { label: 'Codes', path: 'code-letter' },
  { label: 'Marks', path: 'marks' },
  { label: 'Results', path: 'results' },
] as const;

function ScheduleWorkflowActionButtons({
  scheduleName,
  onNavigate,
  orientation,
}: {
  scheduleName: string;
  onNavigate: (path: string) => void;
  orientation: 'inline' | 'portrait' | 'landscape';
}) {
  const isTabletGrid = orientation !== 'inline';
  const renderActionButton = (action: typeof SCHEDULE_WORKFLOW_ACTIONS[number]) => (
    <TouchableOpacity
      key={action.path}
      accessibilityRole="button"
      accessibilityLabel={`${action.label} for ${scheduleName}`}
      onPress={(event) => {
        event.stopPropagation();
        onNavigate(action.path);
      }}
      style={isTabletGrid ? { flex: 1 } : undefined}
      className={`h-11 px-3 rounded-lg border items-center justify-center ${action.path === 'results' ? 'bg-button-primary border-button-border' : 'bg-core-surface-white border-ui-border'}`}
    >
      <Text className={`font-poppins-bold text-xs ${action.path === 'results' ? 'text-button-foreground' : 'text-ui-text'}`}>{action.label}</Text>
    </TouchableOpacity>
  );

  if (isTabletGrid) {
    const actionRows = getScheduleActionRows(SCHEDULE_WORKFLOW_ACTIONS);
    return (
      <View style={{
        width: orientation === 'landscape' ? 310 : orientation === 'portrait' ? 250 : '100%',
        maxWidth: orientation === 'portrait' ? 250 : 310,
        alignSelf: 'flex-end',
        gap: 8,
        marginTop: orientation === 'portrait' ? 10 : 0,
      }}>
        {actionRows.map((row, index) => (
          <View key={index} style={{ flexDirection: 'row', gap: 8 }}>
            {row.map(renderActionButton)}
          </View>
        ))}
      </View>
    );
  }

  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{SCHEDULE_WORKFLOW_ACTIONS.map(renderActionButton)}</View>;
}

export default function ScheduleDashboard() {
  const router = useRouter();
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival, isLoading: isLoadingFest } = useActiveFestival();
  const { data: activeItems = [], isLoading: isLoadingItems } = useItems(festival?.id);
  const { tenant_id, user } = useAuthStore();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;
  const isTabletFilters = width >= 600 && width < 1200;
  // Compact schedule cards need workflow actions visible at tablet and
  // constrained-window widths. Width is reliable on web where device-type
  // detection may report UNKNOWN (for example tablet browsers in desktop mode).
  const showInlineScheduleActions = showScheduleCardActions(width);
  const screenWidth = Platform.OS === 'web' && typeof window !== 'undefined' ? window.screen.width : width;
  const screenHeight = Platform.OS === 'web' && typeof window !== 'undefined' ? window.screen.height : height;
  const maxTouchPoints = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0;
  const tabletScheduleOrientation = getCompactScheduleActionOrientation(
    Device.deviceType === Device.DeviceType.TABLET,
    width,
    height,
    screenWidth,
    screenHeight,
    maxTouchPoints,
  );
  const navigationMode = adminNavigationMode(width);
  const sidebarWidth = navigationMode === 'desktop' ? 64 : navigationMode === 'tablet' ? 236 : 0;
  const filterContentWidth = width - sidebarWidth - 60; // Page, panel, and border spacing.
  const tabletFilterColumnWidth = Math.max(120, Math.floor((filterContentWidth - 8) / 2));
  // Let the viewport, not a potentially stale browser device classification,
  // decide when to use phone cards. Tablet and desktop viewports use the table.
  const isCompactScheduleLayout = width < 600
    || (maxTouchPoints > 0 && Math.min(screenWidth, screenHeight) < 600);
  const isCompactScheduleTable = width < 1200;

  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');
  const [mobileActionMenuId, setMobileActionMenuId] = React.useState<string | null>(null);
  const [postponedExpanded, setPostponedExpanded] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState('All');
  const [selectedCategory, setSelectedCategory] = React.useState('All');
  const [selectedVenue, setSelectedVenue] = React.useState('All');
  const [selectedStatus, setSelectedStatus] = React.useState('All');
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [chanceSheetSearchQuery, setChanceSheetSearchQuery] = React.useState('');
  const [chanceSheetItemPickerOpen, setChanceSheetItemPickerOpen] = React.useState(false);
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
  const chanceSheetSchedulesQuery = useQuery({
    queryKey: ['chance-sheet-active-schedules', tenant_id, festival?.id],
    queryFn: () => scheduleOverviewService.allFiltered({
      tenantId: tenant_id!,
      festivalId: festival!.id,
      timezone: scheduleTimezone,
    }),
    enabled: chanceSheetItemPickerOpen && !!tenant_id && !!festival?.id,
    staleTime: 0,
    retry: false,
  });
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  React.useEffect(() => {
    setPage(1);
  }, [tenant_id, festival?.id, debouncedSearchQuery, selectedItem, selectedCategory, selectedVenue, selectedStatus, selectedDate, pageSize]);

  const isSearchDebouncing = searchQuery.trim() !== debouncedSearchQuery;
  const chanceSheetScheduledItemIds = React.useMemo(() => new Set(
    (chanceSheetSchedulesQuery.data ?? [])
      .filter((schedule: any) =>
        !schedule.is_postponed
        && ['scheduled', 'ongoing'].includes(normalizeScheduleLifecycleStatus(schedule.status) ?? ''),
      )
      .map((schedule: any) => String(schedule.item_id ?? schedule.items?.id ?? ''))
      .filter(Boolean),
  ), [chanceSheetSchedulesQuery.data]);
  const filteredChanceSheetItems = React.useMemo(() => {
    const query = chanceSheetSearchQuery.trim().toLocaleLowerCase();
    return (activeItems as any[]).filter((item) => {
      if (!item?.id || !chanceSheetScheduledItemIds.has(String(item.id))) return false;
      if (!query) return true;
      const categories = Array.isArray(item.category_codes) ? item.category_codes : item.category_codes ? [item.category_codes] : [];
      return [item.item_name_en, item.item_name_ml, item.item_code, ...categories]
        .some((value) => String(value ?? '').toLocaleLowerCase().includes(query));
    });
  }, [activeItems, chanceSheetScheduledItemIds, chanceSheetSearchQuery]);
  const { schedules, totalSchedules, totalFilteredSchedules, hasScheduleData, isLoadingSchedules, isErrorSchedules, refetchSchedules, venues, isLoadingVenues, deleteSchedule, setScheduleStatus, setSchedulePostponed, updateSchedule, updateScheduleAssignment } = useSchedule({
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
  const [schedulePdfExportOpen, setSchedulePdfExportOpen] = React.useState(false);
  const [judgePanelSchedule, setJudgePanelSchedule] = React.useState<any | null>(null);
  const [updatingVisibilityId, setUpdatingVisibilityId] = React.useState<string | null>(null);
  const [assignmentSchedule, setAssignmentSchedule] = React.useState<any | null>(null);
  const [assignmentVenueId, setAssignmentVenueId] = React.useState('');
  const [assignmentVenueSearch, setAssignmentVenueSearch] = React.useState('');
  const [assignmentVenuePickerOpen, setAssignmentVenuePickerOpen] = React.useState(false);
  const [assignmentSubstages, setAssignmentSubstages] = React.useState<ScheduleSubstage[]>([]);
  const [assignmentSubstagesChanged, setAssignmentSubstagesChanged] = React.useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = React.useState(false);
  const openJudgePanel = (schedule: any) => setJudgePanelSchedule(schedule);
  const saveRequiredJudgeCount = async (scheduleId: string, count: number) => {
    await updateSchedule({ id: scheduleId, payload: { expected_judge_count: count } });
  };
  const [shareSchedule, setShareSchedule] = React.useState<any | null>(null);
  const [shareStageUrl, setShareStageUrl] = React.useState<string | null>(null);
  const [shareError, setShareError] = React.useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = React.useState<string | null>(null);
  const [isLoadingShareDetails, setIsLoadingShareDetails] = React.useState(false);
  const [isCopyingShareDetails, setIsCopyingShareDetails] = React.useState(false);
  const shareRequestId = React.useRef(0);

  const assignmentItem = (activeItems as any[]).find((item) => item.id === assignmentSchedule?.item_id);
  const canEditAssignmentSubstages = supportsSubstages(assignmentItem);
  const assignmentSubstagesQuery = useQuery({
    queryKey: ['stage-admin-substages', assignmentSchedule?.id],
    queryFn: () => stageManagementService.getScheduleSubstages(assignmentSchedule!.id),
    enabled: !!assignmentSchedule?.id && canEditAssignmentSubstages,
    retry: false,
  });
  const assignmentVenueConflictQuery = useQuery({
    queryKey: ['schedule-venue-conflict', tenant_id, festival?.id, assignmentSchedule?.id, assignmentVenueId],
    queryFn: () => scheduleOverviewService.venueConflictCount(
      tenant_id!, festival!.id, assignmentVenueId, assignmentSchedule!.start_time,
      assignmentSchedule!.end_time, assignmentSchedule!.id,
    ),
    enabled: !!assignmentSchedule?.id && !!assignmentVenueId
      && assignmentVenueId !== (assignmentSchedule?.venue_id || assignmentSchedule?.venues?.id || '')
      && !!tenant_id && !!festival?.id,
    retry: false,
  });
  React.useEffect(() => {
    if (!assignmentSubstagesQuery.data) return;
    setAssignmentSubstages(assignmentSubstagesQuery.data);
    setAssignmentSubstagesChanged(false);
  }, [assignmentSubstagesQuery.data]);

  const openScheduleAssignment = (schedule: any) => {
    if (schedule.is_shuffle_locked) {
      if (Platform.OS === 'web') window.alert('Cannot edit schedule after event is locked.');
      else Alert.alert('Locked', 'Cannot edit schedule after event is locked.');
      return;
    }
    setAssignmentVenueId(schedule.venue_id || schedule.venues?.id || '');
    setAssignmentVenueSearch('');
    setAssignmentVenuePickerOpen(false);
    setAssignmentSubstagesChanged(false);
    setAssignmentSubstages([]);
    setAssignmentSchedule(schedule);
  };

  const closeScheduleAssignment = () => {
    if (isSavingAssignment) return;
    setAssignmentSchedule(null);
    setAssignmentSubstagesChanged(false);
  };

  const confirmVenueConflict = (count: number) => new Promise<boolean>((resolve) => {
    const message = `This venue overlaps ${count} existing schedule${count === 1 ? '' : 's'} at this time. Continue?`;
    if (Platform.OS === 'web') {
      resolve(window.confirm(message));
      return;
    }
    Alert.alert('Venue conflict', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', onPress: () => resolve(true) },
    ]);
  });

  const saveScheduleAssignment = async () => {
    if (!assignmentSchedule || isSavingAssignment) return;
    if (assignmentSubstagesQuery.isLoading || assignmentVenueConflictQuery.isLoading) return;
    if (assignmentSubstagesChanged && assignmentSubstagesQuery.isError) {
      const message = 'Sub-stage settings could not be loaded. Retry before saving them.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Unable to save', message);
      return;
    }
    if (assignmentVenueConflictQuery.isError) {
      const message = 'Venue conflict check could not be completed. Retry before saving.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Unable to save', message);
      return;
    }
    if (assignmentSubstagesChanged && canEditAssignmentSubstages) {
      const validationError = validateSubstages(assignmentSubstages);
      if (validationError) {
        if (Platform.OS === 'web') window.alert(validationError);
        else Alert.alert('Invalid sub-stages', validationError);
        return;
      }
    }
    if (assignmentVenueConflictQuery.data && !await confirmVenueConflict(assignmentVenueConflictQuery.data)) return;

    const nextVenueId = assignmentVenueId || null;
    const currentVenueId = assignmentSchedule.venue_id || assignmentSchedule.venues?.id || null;
    const updateSubstages = assignmentSubstagesChanged && canEditAssignmentSubstages;
    if (nextVenueId === currentVenueId && !updateSubstages) {
      setAssignmentSchedule(null);
      return;
    }

    setIsSavingAssignment(true);
    try {
      await updateScheduleAssignment({
        scheduleId: assignmentSchedule.id,
        venueId: nextVenueId,
        updateSubstages,
        substageConfig: updateSubstages ? normalizedSubstages(assignmentSubstages) : null,
      });
      if (updateSubstages) {
        await queryClient.invalidateQueries({ queryKey: ['stage-admin-substages', assignmentSchedule.id] });
      }
      setAssignmentSchedule(null);
    } catch (error: any) {
      const message = error?.message || 'Unable to update this schedule.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Update failed', message);
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const openScheduleShare = async (schedule: any) => {
    const requestId = ++shareRequestId.current;
    setShareSchedule(schedule);
    setShareStageUrl(null);
    setShareError(null);
    setShareFeedback(null);
    setIsLoadingShareDetails(true);

    const venueId = schedule.venue_id || schedule.venues?.id;
    const festivalId = schedule.festival_id || festival?.id;
    if (!venueId || !festivalId) {
      setShareError(!venueId ? 'Assign a venue before sharing stage details.' : 'Festival details are unavailable for this schedule.');
      setIsLoadingShareDetails(false);
      return;
    }
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      setShareError('Open Schedule Management in a browser to create a shareable stage link.');
      setIsLoadingShareDetails(false);
      return;
    }

    try {
      const readMode = await stageManagementService.getManagementReadMode();
      if (requestId !== shareRequestId.current) return;
      const readQuery = readMode === 'v2' ? '?read=v2' : '';
      setShareStageUrl(`${window.location.origin}/stage-management/venue/${encodeURIComponent(venueId)}${readQuery}`);
    } catch (error: any) {
      if (requestId !== shareRequestId.current) return;
      setShareError(error?.message || 'Unable to load stage sharing details.');
    } finally {
      if (requestId === shareRequestId.current) setIsLoadingShareDetails(false);
    }
  };

  const closeScheduleShare = () => {
    shareRequestId.current += 1;
    setShareSchedule(null);
    setShareStageUrl(null);
    setShareError(null);
    setShareFeedback(null);
    setIsLoadingShareDetails(false);
    setIsCopyingShareDetails(false);
  };

  const shareMessage = React.useMemo(() => {
    if (!shareSchedule || !shareStageUrl) return '';
    const itemName = shareSchedule.items?.item_name_en
      || shareSchedule.items?.item_name_ml
      || 'Unnamed item';
    const categoryCodes = Array.isArray(shareSchedule.items?.category_codes)
      ? shareSchedule.items.category_codes
      : shareSchedule.items?.category_codes ? [shareSchedule.items.category_codes] : [];
    return [
      `Item: ${itemName}`,
      `Category: ${categoryCodes.map((code: unknown) => String(code).trim()).filter(Boolean).join(', ') || '—'}`,
      `Stage: ${shareSchedule.venues?.name || 'Stage'}`,
      `Stage link: ${shareStageUrl}`,
    ].join('\n');
  }, [shareSchedule, shareStageUrl]);

  const copyScheduleShare = async () => {
    if (!shareMessage) return;
    setIsCopyingShareDetails(true);
    try {
      if (typeof navigator === 'undefined') throw new Error('Clipboard access is unavailable in this browser.');
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareMessage);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareMessage;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        let copied = false;
        try {
          textArea.select();
          copied = document.execCommand('copy');
        } finally {
          document.body.removeChild(textArea);
        }
        if (!copied) throw new Error('Clipboard access is unavailable in this browser.');
      }
      setShareError(null);
      setShareFeedback('Copied stage details to clipboard.');
    } catch (error: any) {
      setShareError(error?.message || 'Unable to copy stage details.');
    } finally {
      setIsCopyingShareDetails(false);
    }
  };

  const sendScheduleShareToWhatsApp = () => {
    if (!shareMessage || typeof window === 'undefined') return;
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    setShareError(null);
    setShareFeedback(null);
    const opened = window.open(url, '_blank');
    if (!opened) {
      setShareError('Allow pop-ups to open WhatsApp.');
      return;
    }
    opened.opener = null;
  };

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
        label: name,
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
    { id: 'postponed', name: 'Postponed' },
    { id: 'ongoing', name: 'Started' },
    { id: 'scheduled', name: 'Scheduled' },
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
  const postponedSchedules = React.useMemo(
    () => filteredSchedules.filter(isPostponedSchedule),
    [filteredSchedules],
  );
  const regularSchedules = React.useMemo(
    () => filteredSchedules.filter((schedule: any) => !isPostponedSchedule(schedule)),
    [filteredSchedules],
  );
  const tableSchedules = React.useMemo(
    () => [...postponedSchedules, ...regularSchedules],
    [postponedSchedules, regularSchedules],
  );
  const displayedFilteredCount = isSearchDebouncing ? 0 : totalFilteredSchedules;
  const pageCount = Math.max(1, Math.ceil(displayedFilteredCount / pageSize));
  React.useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

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
    if (!festival?.id) {
      const message = isLoadingFest ? 'Festival details are still loading. Please try again.' : 'No active festival is available.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Festival unavailable', message);
      return;
    }
    if (!totalFilteredSchedules) {
      if (Platform.OS === 'web') window.alert('No schedules found for the current filters.');
      else Alert.alert('No schedules', 'No schedules found for the current filters.');
      return;
    }
    const exportFilters = {
      tenantId: tenant_id!, festivalId: festival.id,
      search: debouncedSearchQuery,
      itemId: selectedItem === 'All' ? null : selectedItem,
      category: selectedCategory === 'All' ? null : selectedCategory,
      venueId: selectedVenue === 'All' ? null : selectedVenue,
      date: selectedDate,
      workflowStatus: selectedStatus === 'All' ? null : selectedStatus,
      timezone: scheduleTimezone,
    };
    try {
      exportLock.current = true;
      setIsExportingSchedule(true);
      const [allSchedules,allRegistrations,participants,{downloadAdminSchedulePdf}]=await Promise.all([scheduleOverviewService.allFiltered(exportFilters),participantService.listRegistrationsByFestival<any>(festival.id),participantService.listParticipants<any>(),import('../../../services/schedulePdfService')]);
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

  const exportChanceSheet = async (item: any) => {
    if (exportLock.current) return;
    if (!festival?.id || !tenant_id) {
      const message = isLoadingFest ? 'Festival details are still loading. Please try again.' : 'No active festival or tenant is available.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Festival unavailable', message);
      return;
    }
    if (!item?.id) {
      if (Platform.OS === 'web') window.alert('Select an active item to create its chance sheet.');
      else Alert.alert('Item unavailable', 'Select an active item to create its chance sheet.');
      return;
    }

    try {
      exportLock.current = true;
      setChanceSheetItemPickerOpen(false);
      setIsExportingSchedule(true);
      const [{ downloadChanceSheetPdf }, sheetRows] = await Promise.all([
        import('../../../services/schedulePdfService'),
        chanceSheetService.loadRows({
          itemId: item.id,
          tenantId: tenant_id,
          festivalId: festival.id,
        }),
      ]);

      const itemCategories = Array.isArray(item.category_codes)
        ? item.category_codes
        : item.category_codes ? [item.category_codes] : [];
      const itemName = String(item.item_name_en || item.item_name_ml || 'Unnamed item');
      const category = itemCategories.map((value: unknown) => normalizeCategory(String(value))).filter(Boolean).join(', ');
      const result = await downloadChanceSheetPdf({
        festivalName: festival?.custom_name || null,
        festivalYear: festival?.festival_year || null,
        itemCode: item.item_code || null,
        itemName,
        category,
        participationType: isGroupCompetition(item) ? 'group' : 'individual',
        rows: sheetRows,
      });
      const message = `Chance sheet PDF downloaded: ${result.entryCount} ${isGroupCompetition(item) ? 'groups' : 'participants'}.`;
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Export complete', message);
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error?.message || 'Unable to generate the chance sheet PDF.');
      else Alert.alert('Export failed', error?.message || 'Unable to generate the chance sheet PDF.');
    } finally {
      exportLock.current = false;
      setIsExportingSchedule(false);
    }
  };

  const exportTeamAttendancePdf = async () => {
    if (exportLock.current) return;
    if (!festival?.id || !tenant_id) {
      const message = isLoadingFest ? 'Festival details are still loading. Please try again.' : 'No active festival or tenant is available.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Festival unavailable', message);
      return;
    }
    try {
      exportLock.current = true;
      setIsExportingSchedule(true);
      const exportFilters = {
        tenantId: tenant_id, festivalId: festival.id,
        timezone: scheduleTimezone,
      };
      const allSchedules = await scheduleOverviewService.allFiltered(exportFilters);
      const completedSchedules = allSchedules.filter((schedule: any) => normalizeScheduleLifecycleStatus(schedule.status) === 'completed');
      if (!completedSchedules.length) throw new Error('No completed competitions were found in the active festival.');

      const [{ loadAdminScheduleAttendanceData }, { downloadTeamAttendancePdf }] = await Promise.all([
        import('../../../services/participantExportService'),
        import('../../../services/schedulePdfService'),
      ]);
      const attendanceData = await loadAdminScheduleAttendanceData(
        festival.id,
        completedSchedules.map((schedule: any) => schedule.item_id),
      );
      const result = downloadTeamAttendancePdf({
        festivalName: festival.custom_name || (festival.festival_year ? `Festival ${festival.festival_year}` : null),
        schedules: completedSchedules as any,
        ...attendanceData,
      });
      const message = `Team attendance summary PDF downloaded: ${result.teamRowCount} team rows across ${result.itemCount} completed competitions.`;
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Export complete', message);
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error?.message || 'Unable to generate team-wise attendance PDF.');
      else Alert.alert('Export failed', error?.message || 'Unable to generate team-wise attendance PDF.');
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

  const selectSchedulePdfExport = (option: SchedulePdfExportOption) => {
    setSchedulePdfExportOpen(false);
    if (option === 'chance-sheet') {
      setChanceSheetSearchQuery('');
      setChanceSheetItemPickerOpen(true);
    } else if (option === 'team-attendance') {
      void exportTeamAttendancePdf();
    } else if (option === 'blank') {
      void exportBlankSchedule();
    } else {
      void exportSchedulePdf(option);
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
        <View className="mb-4 flex-row flex-wrap items-start justify-between gap-3">
          <View className="min-w-[220px] flex-1">
            <Text className="text-3xl font-poppins-black text-ssf-text">Schedules</Text>
            <Text className="text-xs font-poppins text-ssf-text-muted mt-1">
              {isSearchDebouncing ? 'Updating results…' : totalFilteredSchedules === 0 ? '0 schedules' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalFilteredSchedules)} of ${totalFilteredSchedules}`}
              {' · '}{venues.length} venues{' · '}{totalSchedules} scheduled events
            </Text>
          </View>
          <View className="flex-row flex-wrap items-center justify-end gap-1.5">
          <TouchableOpacity
            onPress={() => setSchedulePdfExportOpen(true)}
            disabled={isExportingSchedule}
            accessibilityRole="button"
            accessibilityLabel="Export schedule PDF"
            accessibilityState={{ disabled: isExportingSchedule, busy: isExportingSchedule }}
            className={`min-h-10 flex-row items-center gap-2 rounded-lg px-4 py-2 ${isExportingSchedule ? 'bg-core-surface-muted-gray-100' : 'bg-button-primary'}`}
          >
            {isExportingSchedule ? <Clock size={15} color={ui.colors.primaryText} /> : <Download size={15} color={ui.colors.buttonForeground} />}
            <Text className={`font-poppins-bold text-xs ${isExportingSchedule ? 'text-ui-text-muted' : 'text-button-foreground'}`}>{isExportingSchedule ? 'Preparing…' : 'Export'}</Text>
          </TouchableOpacity>
          <TouchableOpacity className="h-9 flex-row items-center justify-center gap-x-1.5 rounded-md border border-button-border bg-core-surface-white px-2" onPress={() => router.push('/(admin)/schedule/venues')} accessibilityRole="button" accessibilityLabel="Manage venues"><MapPin size={14} color={coreColor('#0F766E', 'buttonText')} /><Text className="font-poppins-bold text-[11px] text-button-text">Venues</Text></TouchableOpacity>
          <TouchableOpacity className="h-9 flex-row items-center justify-center rounded-md border border-button-border bg-core-surface-white px-2" onPress={() => router.push('/(admin)/schedule/import-json' as any)}><Text className="font-poppins-bold text-[11px] text-button-text">Import JSON</Text></TouchableOpacity>
          {!isMobile && Platform.OS === 'web' && <TouchableOpacity className="h-9 flex-row items-center justify-center gap-x-1.5 rounded-md border border-button-border bg-core-surface-white px-2" onPress={() => router.push('/(admin)/schedule/bulk-create' as any)}><Plus size={14} color={coreColor('#0F766E', 'buttonText')} /><Text className="font-poppins-bold text-[11px] text-button-text">Bulk Create</Text></TouchableOpacity>}
          <TouchableOpacity className="h-9 flex-row items-center justify-center gap-x-1.5 rounded-md border border-button-border bg-ssf-primary/10 px-2" onPress={() => router.push('/(admin)/schedule/create')}><Plus size={14} color={coreColor('#1B6B3A', 'buttonText')} /><Text className="font-poppins-bold text-[11px] text-button-text">Add New</Text></TouchableOpacity>
          </View>
        </View>

      {isErrorSchedules && <View className="mb-2"><Text className="font-poppins text-xs text-core-danger-red-700">Schedules could not be loaded.</Text><SsfButton label="Retry schedules" size="sm" variant="outline" onPress={()=>{void refetchSchedules();}} /></View>}
      {availableDatesQuery.isError && <View className="mb-2"><Text className="font-poppins text-xs text-core-danger-red-700">Available schedule dates could not be loaded.</Text><SsfButton label="Retry dates" size="sm" variant="outline" onPress={()=>{void availableDatesQuery.refetch();}} /></View>}

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
        <View className="mb-6">
          <View className="flex-row flex-wrap items-center gap-2">
            <SsfSelectMenu
              value={selectedItem}
              onValueChange={(value) => { setSelectedItem(value); setPage(1); }}
              accessibilityLabel="Filter by item"
              searchable={false}
              width={isTabletFilters ? Math.min(250, tabletFilterColumnWidth) : isMobile ? Math.max(220, width - 56) : 250}
              keepInViewport={isTabletFilters}
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
              searchable={false}
              width={isTabletFilters ? Math.min(148, tabletFilterColumnWidth) : isMobile ? Math.max(120, (width - 72) / 2) : 148}
              keepInViewport={isTabletFilters}
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
              searchable={false}
              width={isTabletFilters ? Math.min(164, tabletFilterColumnWidth) : isMobile ? Math.max(120, (width - 72) / 2) : 164}
              keepInViewport={isTabletFilters}
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
              searchable={false}
              width={isTabletFilters ? Math.min(210, tabletFilterColumnWidth) : isMobile ? Math.max(220, width - 56) : 210}
              keepInViewport={isTabletFilters}
              compact
              active={selectedStatus !== 'All'}
              options={statusesList.map((item) => ({
                label: item.id === 'All' ? 'Status: All' : `Status: ${item.name}`,
                value: item.id,
              }))}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={selectedDate ? `Date filter: ${selectedDate}` : 'Filter by schedule date'}
              onPress={() => setCalendarOpen(true)}
              className={`h-9 px-3 rounded-lg border flex-row items-center justify-center ${selectedDate ? 'border-button-border bg-core-info-soft-blue-50' : 'border-ui-border bg-core-surface-white'}`}
            >
              <Calendar size={13} color={selectedDate ? coreColor('#1D4ED8', 'buttonText') : ui.colors.textMuted} />
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
                  backgroundColor: ui.colors.surface,
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
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1 ml-1">Filter by Status</Text>
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
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1.5 ml-1">Filter by Status</Text>
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
        !isCompactScheduleLayout ? (
        <View className="w-full bg-core-surface-white border border-ui-border rounded-xl overflow-hidden">
            <View className={`${isCompactScheduleTable ? 'min-h-10 px-2 py-2' : 'h-10 px-3'} flex-row items-center bg-ui-muted border-b border-ui-border`}>
              <Text style={{ flex: 1.15, minWidth: 0 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Competition</Text>
              <Text style={{ flex: 0.95, minWidth: 0 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Venue / Stage</Text>
              <Text style={{ flex: 1, minWidth: 0 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Date & Time</Text>
              <Text style={{ flex: 1, minWidth: 0 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Status</Text>
              <Text style={{ flex: 2.4, minWidth: 0 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted text-right">Actions</Text>
            </View>
            {postponedSchedules.length > 0 && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${postponedExpanded ? 'Collapse' : 'Expand'} postponed schedules`}
                accessibilityState={{ expanded: postponedExpanded }}
                onPress={() => setPostponedExpanded((expanded) => !expanded)}
                className="min-h-10 flex-row items-center justify-between border-b border-ui-border px-3 py-2 bg-core-surface-white"
              >
                <View className="flex-row items-center gap-2">
                  <Text style={{ color: '#EA580C' }} className="font-poppins-bold text-xs">Postponed</Text>
                  <Text className="font-poppins text-[10px] text-ui-text-muted">{postponedSchedules.length} on this page</Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text className="font-poppins-bold text-[10px] text-ui-text-muted">{postponedExpanded ? 'Hide' : 'Show'}</Text>
                  {postponedExpanded ? <ChevronUp size={14} color={ui.colors.textMuted} /> : <ChevronDown size={14} color={ui.colors.textMuted} />}
                </View>
              </TouchableOpacity>
            )}
            {tableSchedules.map((schedule: any) => (
              isPostponedSchedule(schedule) && !postponedExpanded ? null : (
              <View key={schedule.id} className={`${isCompactScheduleTable ? 'min-h-12 px-2 py-1.5' : 'min-h-12 px-3 py-1.5'} flex-row items-center border-b border-ui-border bg-core-surface-white`}>
                <View style={{ flex: 1.15, minWidth: 0 }} className="pr-2">
                  <Text className="font-poppins-bold text-xs text-ui-text" numberOfLines={1}>{schedule.items?.item_name_en || 'Unknown Event'}</Text>
                  <Text className="font-poppins text-[9px] text-ui-text-muted mt-0.5" numberOfLines={1}>
                    {Array.isArray(schedule.items?.category_codes) && schedule.items.category_codes.length > 0
                      ? schedule.items.category_codes.join(', ')
                      : '—'}
                  </Text>
                </View>
                <View style={{ flex: 0.95, minWidth: 0 }} className="pr-2">
                  <View className="flex-row items-center gap-1">
                    <Text className="font-poppins text-[10px] text-ui-text flex-1" numberOfLines={1}>{schedule.venues?.name || 'Not assigned'}</Text>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Assign venue and stages for ${schedule.items?.item_name_en || 'event'}`}
                      disabled={!!schedule.is_shuffle_locked} onPress={() => openScheduleAssignment(schedule)}
                      className={`h-7 w-7 rounded-md border border-ui-border bg-core-surface-white items-center justify-center ${schedule.is_shuffle_locked ? 'opacity-50' : ''}`}>
                      <MapPin size={13} color={ui.colors.primaryText} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0 }} className="pr-2">
                  <View className="flex-row items-center">
                    <Calendar size={12} color={ui.colors.textMuted} />
                    <Text className="font-poppins text-[10px] text-ui-text-muted ml-1.5">{new Date(schedule.start_time).toLocaleDateString()}</Text>
                  </View>
                  <View className="flex-row items-center mt-1">
                    <Clock size={12} color={ui.colors.textMuted} />
                    <Text className="font-poppins text-[10px] text-ui-text-muted ml-1.5">
                      {formatScheduleTime(schedule.start_time)} – {formatScheduleTime(schedule.end_time)}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0 }} className="pr-2">
                  <ScheduleWorkflowBadges
                    status={schedule.status}
                    summary={workflowMap.get(schedule.id)}
                    isShuffleLocked={schedule.is_shuffle_locked}
                    isPostponed={schedule.is_postponed === true}
                  />
                </View>
                <View style={{
                  flex: 2.4,
                  minWidth: 0,
                  flexWrap: isCompactScheduleTable ? 'wrap' : 'nowrap',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  columnGap: 4,
                  rowGap: 4,
                }} className="flex-row">
                  {[
                    { label: 'Judges', path: 'judges' },
                    { label: 'Check-in', path: 'checkin' },
                    { label: 'Codes', path: 'code-letter' },
                    { label: 'Marks', path: 'marks' },
                    { label: 'Results', path: 'results' },
                  ].map((action) => (
                    <TouchableOpacity
                      key={action.path}
                      accessibilityRole="button"
                      accessibilityLabel={`${action.label} for ${schedule.items?.item_name_en || 'event'}`}
                      onPress={() => action.path === 'judges'
                        ? openJudgePanel(schedule)
                        : router.push(`/(admin)/schedule/${schedule.id}/${action.path}` as any)}
                      className={`h-8 px-2 rounded-lg border items-center justify-center ${action.path === 'results' ? 'bg-button-primary border-button-border' : 'bg-core-surface-white border-ui-border'}`}
                    >
                      <Text className={`font-poppins-bold text-[9px] ${action.path === 'results' ? 'text-button-foreground' : 'text-ui-text'}`}>{action.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Share stage details for ${schedule.items?.item_name_en || 'event'}`}
                    onPress={() => void openScheduleShare(schedule)}
                    className="h-8 w-8 rounded-lg border border-core-primary-soft-teal-200 bg-core-primary-soft-teal-50 items-center justify-center"
                  >
                    <Share2 size={14} color={coreColor('#0F766E', 'buttonText')} />
                  </TouchableOpacity>
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
                  <View style={{ width: 34, height: 34, flexShrink: 0 }}>
                    <ScheduleLifecycleActions
                      scheduleName={schedule.items?.item_name_en || 'Event'}
                      status={schedule.status}
                      isPostponed={schedule.is_postponed === true}
                      additionalItems={[{
                        label: 'Manage judges',
                        icon: <UserCheck size={15} color={coreColor('#0F766E', 'primaryText')} />,
                        onPress: () => openJudgePanel(schedule),
                      }, {
                        label: updatingVisibilityId === schedule.id
                          ? 'Saving public visibility…'
                          : schedule.is_public_visible !== false ? 'Hide from public schedule' : 'Show on public schedule',
                        disabled: !!updatingVisibilityId,
                        onPress: () => { void togglePublicVisibility(schedule); },
                      }]}
                      onPostponedChange={(nextValue, expectedValue) => setSchedulePostponed({ scheduleId: schedule.id, isPostponed: nextValue, expectedIsPostponed: expectedValue })}
                      onStatusChange={(status, expectedStatus) => setScheduleStatus({ id: schedule.id, status, expectedStatus })}
                    />
                  </View>
                </View>
              </View>
              )
            ))}
        </View>
        ) : (
        <View>
          {filteredSchedules.map((schedule: any) => {
            const scheduleName = schedule.items?.item_name_en || 'Unknown Event';
            const scheduleCategoryCodes = Array.isArray(schedule.items?.category_codes)
              ? schedule.items.category_codes as string[]
              : [];
            const hasTabletSideActionLayout = tabletScheduleOrientation !== null;
            const cardLifecycleActions = (
              <ScheduleLifecycleActions
                scheduleName={scheduleName}
                status={schedule.status}
                isPostponed={schedule.is_postponed === true}
                onPostponedChange={(nextValue, expectedValue) => setSchedulePostponed({ scheduleId: schedule.id, isPostponed: nextValue, expectedIsPostponed: expectedValue })}
                onStatusChange={(status, expectedStatus) => setScheduleStatus({ id: schedule.id, status, expectedStatus })}
                accessibilityLabel={`Actions for ${scheduleName}`}
                triggerLabel={showInlineScheduleActions && !tabletScheduleOrientation ? 'Event actions' : undefined}
                open={mobileActionMenuId === schedule.id}
                onOpenChange={(nextOpen) => setMobileActionMenuId(nextOpen ? schedule.id : null)}
                additionalItems={[
                  ...(!showInlineScheduleActions ? [
                    { label: 'Check-in', icon: <LogIn size={15} color={ui.colors.textMuted} />, onPress: () => router.push(`/(admin)/schedule/${schedule.id}/checkin` as any) },
                    { label: 'Code letters', icon: <Shuffle size={15} color={ui.colors.textMuted} />, onPress: () => router.push(`/(admin)/schedule/${schedule.id}/code-letter` as any) },
                    { label: 'Marks', icon: <FilePenLine size={15} color={ui.colors.textMuted} />, onPress: () => router.push(`/(admin)/schedule/${schedule.id}/marks` as any) },
                    { label: 'Results', icon: <Trophy size={15} color={coreColor('#0F766E', 'primaryText')} />, onPress: () => router.push(`/(admin)/schedule/${schedule.id}/results` as any) },
                  ] : []),
                  {
                    label: 'Share stage details',
                    icon: <Share2 size={15} color={coreColor('#0F766E', 'primaryText')} />,
                    onPress: () => void openScheduleShare(schedule),
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
                    icon: <Trash2 size={15} color={coreColor('#DC2626', 'danger')} />,
                    onPress: () => handleDelete(schedule.id, scheduleName),
                  },
                ]}
              />
            );
            const scheduleDetails = (
              <>
                <View style={tabletScheduleOrientation ? { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 5 } : undefined}>
                  <View className={`${tabletScheduleOrientation ? '' : 'mt-1.5'} flex-row items-center gap-1`}>
                    <Text numberOfLines={1} className="font-poppins text-[10px] text-ssf-text-muted">{schedule.venues?.name || 'Not assigned'}</Text>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Assign venue and stages for ${scheduleName}`}
                      disabled={!!schedule.is_shuffle_locked}
                      onPress={(event) => { event.stopPropagation(); openScheduleAssignment(schedule); }}
                      className={`h-7 w-7 rounded-md border border-ui-border bg-core-surface-white items-center justify-center ${schedule.is_shuffle_locked ? 'opacity-50' : ''}`}>
                      <MapPin size={13} color={ui.colors.primaryText} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`${schedule.is_public_visible !== false ? 'Hide' : 'Show'} ${scheduleName} on public schedule`}
                    disabled={!!updatingVisibilityId}
                    onPress={(event) => {
                      event.stopPropagation();
                      togglePublicVisibility(schedule);
                    }}
                    className={tabletScheduleOrientation ? 'border border-ui-border rounded-md px-2 py-1.5 bg-core-surface-white' : 'self-start border border-ui-border rounded-md px-2 py-1.5 mt-1.5 bg-core-surface-white'}
                  >
                    <Text className="font-poppins-bold text-[10px] text-ui-text">
                      {updatingVisibilityId === schedule.id ? 'Saving…' : schedule.is_public_visible !== false ? 'Public · Hide' : 'Private · Show'}
                    </Text>
                  </TouchableOpacity>
                  {!showInlineScheduleActions && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Manage judges for ${scheduleName}`}
                      onPress={(event) => { event.stopPropagation(); openJudgePanel(schedule); }}
                      className="h-7 flex-row items-center gap-1 rounded-md border border-ui-border bg-core-surface-white px-2"
                    >
                      <UserCheck size={13} color={ui.colors.primaryText} />
                      <Text className="font-poppins-bold text-[10px] text-ui-text">Judges</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View className={`${tabletScheduleOrientation ? 'mb-1.5 mt-1' : 'mb-2'} flex-row flex-wrap items-center gap-x-3 gap-y-1`}>
                  <View className="flex-row items-center gap-x-1">
                    <Clock size={13} color={coreColor('#6B7280', 'text')} />
                    <Text className="font-poppins text-[10px] text-core-text-gray-600">
                      {formatScheduleTime(schedule.start_time)} - {formatScheduleTime(schedule.end_time)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-x-1">
                    <Calendar size={13} color={coreColor('#6B7280', 'text')} />
                    <Text className="font-poppins text-[10px] text-core-text-gray-600">{new Date(schedule.start_time).toLocaleDateString()}</Text>
                  </View>
                </View>
                <ScheduleWorkflowBadges
                  status={schedule.status}
                  summary={workflowMap.get(schedule.id)}
                  isShuffleLocked={schedule.is_shuffle_locked}
                  isPostponed={schedule.is_postponed === true}
                />
              </>
            );
            const scheduleActionButtons = showInlineScheduleActions ? (
              <ScheduleWorkflowActionButtons
                scheduleName={scheduleName}
                onNavigate={(path) => path === 'judges'
                  ? openJudgePanel(schedule)
                  : router.push(`/(admin)/schedule/${schedule.id}/${path}` as any)}
                orientation={tabletScheduleOrientation ?? 'inline'}
              />
            ) : null;

            return (
              <TouchableOpacity
                key={schedule.id}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel={`Open actions for ${scheduleName}`}
                onPress={() => setMobileActionMenuId(schedule.id)}
                className={`border-b border-ui-border px-1 ${tabletScheduleOrientation ? 'py-2' : 'py-3'}`}
              >
                <View className="mb-1.5 flex-row justify-between items-start">
                  <View className="flex-1 min-w-0 mr-2">
                    <Text className={`font-poppins-bold ${tabletScheduleOrientation ? 'text-[13px]' : 'text-[14px]'}`} numberOfLines={1}>{scheduleName}</Text>
                    {!!scheduleCategoryCodes.length && <Text className="font-poppins text-[10px] text-ssf-text-muted mt-0.5" numberOfLines={1}>{scheduleCategoryCodes.join(', ')}</Text>}
                    {false && schedule.items?.item_name_ml ? (
                      <Text className="font-poppins text-[10px] text-ssf-text-muted" numberOfLines={1}>{schedule.items.item_name_ml}</Text>
                    ) : null}
                  </View>
                  {cardLifecycleActions}
                </View>

                {hasTabletSideActionLayout ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>{scheduleDetails}</View>
                    {scheduleActionButtons}
                  </View>
                ) : (
                  <View>
                    {scheduleDetails}
                    {scheduleActionButtons}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
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
      <Modal transparent visible={!!shareSchedule} animationType="fade" onRequestClose={closeScheduleShare}>
        <Pressable onPress={closeScheduleShare} className="flex-1 bg-black/40 items-center justify-center px-4 py-6">
          <Pressable onPress={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-xl border border-ui-border bg-core-surface-white p-4" style={{ maxHeight: '90%' }}>
            <View className="mb-4 flex-row items-start justify-between">
              <View className="mr-3 flex-1">
                <Text className="font-poppins-bold text-base text-ui-text">Share stage details</Text>
                <Text className="mt-1 font-poppins text-xs text-ui-text-muted">Copy the details or open WhatsApp to choose a recipient.</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close stage sharing dialog" onPress={closeScheduleShare} className="h-9 w-9 items-center justify-center rounded-lg border border-ui-border">
                <X size={16} color={ui.colors.textMuted} />
              </TouchableOpacity>
            </View>
            {isLoadingShareDetails ? (
              <View className="min-h-32 items-center justify-center gap-2">
                <ActivityIndicator color={ui.colors.primary} />
                <Text className="font-poppins text-xs text-ui-text-muted">Loading stage link…</Text>
              </View>
            ) : shareMessage ? (
              <ScrollView className="max-h-64 rounded-lg border border-ui-border bg-core-surface-muted-gray-50 p-3" nestedScrollEnabled>
                <Text selectable className="font-poppins text-xs leading-6 text-ui-text">{shareMessage}</Text>
              </ScrollView>
            ) : (
              <View className="min-h-24 justify-center rounded-lg border border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50 p-3">
                <Text className="font-poppins text-xs text-core-warning-amber-800">{shareError || 'Stage sharing details are unavailable.'}</Text>
              </View>
            )}
            {shareError && shareMessage ? <Text accessibilityRole="alert" className="mt-3 font-poppins text-xs text-core-danger-red-700">{shareError}</Text> : null}
            {shareFeedback ? <Text accessibilityLiveRegion="polite" className="mt-3 font-poppins text-xs text-core-success-green-700">{shareFeedback}</Text> : null}
            <View className="mt-4 flex-row flex-wrap justify-end gap-2">
              <TouchableOpacity accessibilityRole="button" disabled={!shareMessage || isCopyingShareDetails} onPress={() => void copyScheduleShare()} className={`h-10 flex-row items-center justify-center gap-2 rounded-lg border px-4 ${shareMessage ? 'border-ui-border bg-core-surface-white' : 'border-core-border-gray-200 bg-core-surface-muted-gray-100 opacity-50'}`}>
                {isCopyingShareDetails ? <ActivityIndicator size="small" color={ui.colors.text} /> : <Copy size={15} color={ui.colors.text} />}
                <Text className="font-poppins-bold text-xs text-ui-text">{isCopyingShareDetails ? 'Copying…' : 'Copy'}</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" disabled={!shareMessage} onPress={sendScheduleShareToWhatsApp} className={`h-10 flex-row items-center justify-center gap-2 rounded-lg border px-4 ${shareMessage ? 'border-core-success-action-emerald-700 bg-core-success-action-emerald-700' : 'border-core-border-gray-200 bg-core-surface-muted-gray-100 opacity-50'}`}>
                <MessageCircle size={15} color="#FFFFFF" />
                <Text numberOfLines={1} className="font-poppins-bold text-xs text-core-on-primary-white">Send to WhatsApp</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal transparent visible={schedulePdfExportOpen} animationType="fade" onRequestClose={() => !isExportingSchedule && setSchedulePdfExportOpen(false)}>
        <Pressable onPress={() => !isExportingSchedule && setSchedulePdfExportOpen(false)} className="flex-1 bg-black/40 items-center justify-center px-4 py-6">
          <Pressable onPress={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-xl border border-ui-border bg-core-surface-white p-4" style={{ maxHeight: '90%' }}>
            <View className="flex-row items-center justify-between mb-1">
              <Text className="font-poppins-bold text-base text-ui-text">Export schedule PDF</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close PDF export options" disabled={isExportingSchedule} onPress={() => setSchedulePdfExportOpen(false)} className="h-9 w-9 items-center justify-center rounded-lg border border-ui-border">
                <X size={16} color={ui.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text className="font-poppins text-xs text-ui-text-muted mb-3">Choose one PDF. Only the selected file will be generated.</Text>
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator>
              {schedulePdfExportOptions.map((option) => {
                const usesPageFilters = option.id === 'master' || option.id === 'venue' || option.id === 'organisation';
                const disabled = isExportingSchedule || (usesPageFilters && isSearchDebouncing);
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => selectSchedulePdfExport(option.id)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={`Generate ${option.label}`}
                    accessibilityState={{ disabled, busy: isExportingSchedule }}
                    className={`mb-2 min-h-14 flex-row items-center gap-3 rounded-lg border border-ui-border px-3 py-2 ${disabled ? 'bg-core-surface-muted-gray-100 opacity-60' : 'bg-core-surface-white'}`}
                  >
                    <FileText size={17} color={disabled ? ui.colors.textMuted : ui.colors.primaryText} />
                    <View className="flex-1">
                      <Text className="font-poppins-bold text-xs text-ui-text">{option.label}</Text>
                      <Text className="font-poppins text-[10px] text-ui-text-muted mt-0.5">{option.description}</Text>
                    </View>
                    {isExportingSchedule ? <Text className="font-poppins-bold text-[10px] text-ui-text-muted">Preparing…</Text> : <Download size={15} color={ui.colors.textMuted} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text className="font-poppins text-[10px] text-ui-text-muted mt-1">
              Filtered schedule PDFs use the current filters. Team attendance includes all completed competitions. Items available for the blank schedule: {Math.max(0, itemsList.length - 1)}.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal transparent visible={chanceSheetItemPickerOpen} animationType="fade" onRequestClose={() => !isExportingSchedule && setChanceSheetItemPickerOpen(false)}>
        <Pressable onPress={() => !isExportingSchedule && setChanceSheetItemPickerOpen(false)} className="flex-1 bg-black/40 items-center justify-center px-4 py-6">
          <Pressable onPress={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-xl border border-ui-border bg-core-surface-white p-4" style={{ maxHeight: '90%' }}>
            <View className="flex-row items-center justify-between mb-1">
              <Text className="font-poppins-bold text-base text-ui-text">Choose item for Chance Sheet</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close item selection" disabled={isExportingSchedule} onPress={() => setChanceSheetItemPickerOpen(false)} className="h-9 w-9 items-center justify-center rounded-lg border border-ui-border">
                <X size={16} color={ui.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text className="font-poppins text-xs text-ui-text-muted mb-3">Only scheduled or started competitions are listed. Search by item name, code, or category.</Text>
            <View className="flex-row items-center bg-core-surface-white border border-ui-border rounded-lg px-3 h-10 mb-3">
              <Search size={16} color={ui.colors.textMuted} />
              <TextInput
                className="flex-1 ml-2 font-poppins text-xs text-ui-text outline-none"
                placeholder="Search active schedule items…"
                placeholderTextColor={ui.colors.textMuted}
                value={chanceSheetSearchQuery}
                onChangeText={setChanceSheetSearchQuery}
                accessibilityLabel="Search active schedule items"
                returnKeyType="search"
              />
              {!!chanceSheetSearchQuery && (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear item search" onPress={() => setChanceSheetSearchQuery('')}>
                  <X size={15} color={ui.colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator>
              {(isLoadingItems || chanceSheetSchedulesQuery.isLoading) && <Text className="py-6 text-center font-poppins text-xs text-ui-text-muted">Loading active schedules…</Text>}
              {chanceSheetSchedulesQuery.isError && (
                <View className="items-center py-5">
                  <Text className="font-poppins text-xs text-ui-text-muted text-center mb-2">Active schedules could not be loaded.</Text>
                  <TouchableOpacity accessibilityRole="button" onPress={() => void chanceSheetSchedulesQuery.refetch()} className="min-h-9 justify-center rounded-lg border border-ui-border px-3">
                    <Text className="font-poppins-bold text-[10px] text-ui-text">Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!isLoadingItems && !chanceSheetSchedulesQuery.isLoading && !chanceSheetSchedulesQuery.isError && filteredChanceSheetItems.map((item) => {
                const itemName = item.item_name_en || item.item_name_ml || 'Unnamed item';
                const categories = (Array.isArray(item.category_codes) ? item.category_codes : item.category_codes ? [item.category_codes] : [])
                  .map((value: unknown) => normalizeCategory(String(value))).filter(Boolean).join(', ');
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => void exportChanceSheet(item)}
                    disabled={isExportingSchedule}
                    accessibilityRole="button"
                    accessibilityLabel={`Generate Chance Sheet for ${itemName}`}
                    accessibilityState={{ disabled: isExportingSchedule, busy: isExportingSchedule }}
                    className={`mb-2 min-h-14 flex-row items-center gap-3 rounded-lg border border-ui-border px-3 py-2 ${isExportingSchedule ? 'bg-core-surface-muted-gray-100 opacity-60' : 'bg-core-surface-white'}`}
                  >
                    <FileText size={17} color={ui.colors.primaryText} />
                    <View className="flex-1">
                      <Text className="font-poppins-bold text-xs text-ui-text">{itemName}</Text>
                      <Text className="font-poppins text-[10px] text-ui-text-muted mt-0.5">{categories || 'No category'} · {isGroupCompetition(item) ? 'Group' : 'Individual'}</Text>
                    </View>
                    {isExportingSchedule ? <Text className="font-poppins-bold text-[10px] text-ui-text-muted">Preparing…</Text> : <Download size={15} color={ui.colors.textMuted} />}
                  </TouchableOpacity>
                );
              })}
              {!isLoadingItems && !chanceSheetSchedulesQuery.isLoading && !chanceSheetSchedulesQuery.isError && !filteredChanceSheetItems.length && (
                <Text className="py-6 text-center font-poppins text-xs text-ui-text-muted">
                  {chanceSheetScheduledItemIds.size === 0
                    ? 'No active schedules are available for this festival.'
                    : 'No active schedule items match this search.'}
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
              {calendarCells.map((date,index)=>date ? <TouchableOpacity key={date} disabled={!dateSet.has(date)} accessibilityRole="button" accessibilityLabel={`Select ${date}`} onPress={()=>{setSelectedDate(date);setPage(1);setCalendarOpen(false);}} style={{width:'14.2857%'}} className={`h-10 items-center justify-center rounded-lg ${selectedDate===date?'bg-button-primary':dateSet.has(date)?'bg-core-surface-white':'bg-core-surface-white opacity-40'}`}><Text className={`font-poppins text-xs ${selectedDate===date?'text-button-foreground':dateSet.has(date)?'text-ui-text':'text-ui-text-muted'}`}>{Number(date.slice(-2))}</Text></TouchableOpacity>:<View key={`empty-${index}`} style={{width:'14.2857%'}} className="h-10" />)}
            </View>
            <View className="flex-row items-center justify-between mt-3">
              <TouchableOpacity accessibilityRole="button" onPress={()=>{setSelectedDate(null);setPage(1);setCalendarOpen(false);}} className="h-9 px-3 items-center justify-center rounded-lg border border-ui-border"><Text className="font-poppins-bold text-[10px] text-ui-text">All dates</Text></TouchableOpacity>
              <Text className="font-poppins text-[10px] text-ui-text-muted">{availableDatesQuery.isLoading?'Loading dates…':`${dateSet.size} scheduled dates`}</Text>
            </View>
          </View>
        </View>
      </Modal>
      <Modal transparent visible={!!assignmentSchedule} animationType="fade" onRequestClose={closeScheduleAssignment}>
        <Pressable onPress={closeScheduleAssignment} className="flex-1 bg-black/40 items-center justify-center px-4 py-6">
          <Pressable onPress={(event) => event.stopPropagation()} className="w-full max-w-xl max-h-full bg-core-surface-white border border-ui-border rounded-xl p-4">
            <View className="flex-row items-start justify-between gap-3 mb-3">
              <View className="flex-1">
                <Text className="font-poppins-bold text-base text-ui-text">Venue and stage assignment</Text>
                <Text className="font-poppins text-xs text-ui-text-muted mt-1">{assignmentSchedule?.items?.item_name_en || 'Schedule'}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close venue and stage assignment" disabled={isSavingAssignment}
                onPress={closeScheduleAssignment} className="h-9 w-9 items-center justify-center rounded-lg border border-ui-border">
                <X size={16} color={ui.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: Math.min(height * 0.65, 560) }} keyboardShouldPersistTaps="handled">
              <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted mb-1.5">Venue / Stage</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose venue or stage" accessibilityState={{ expanded: assignmentVenuePickerOpen }}
                onPress={() => setAssignmentVenuePickerOpen((open) => !open)} className="h-10 flex-row items-center justify-between rounded-lg border border-ui-border bg-core-surface-white px-3">
                <Text className="flex-1 font-poppins text-xs text-ui-text" numberOfLines={1}>
                  {venues.find((venue: any) => venue.id === assignmentVenueId)?.name || 'Unassigned'}
                </Text>
                <ChevronDown size={15} color={ui.colors.textMuted} />
              </TouchableOpacity>
              {assignmentVenuePickerOpen && (
                <View className="mt-2 overflow-hidden rounded-lg border border-ui-border">
                  <View className="h-10 flex-row items-center border-b border-ui-border px-3">
                    <Search size={14} color={ui.colors.textMuted} />
                    <TextInput value={assignmentVenueSearch} onChangeText={setAssignmentVenueSearch} placeholder="Search venue or stage..."
                      placeholderTextColor={ui.colors.textMuted} accessibilityLabel="Search venues and stages"
                      className="h-10 flex-1 ml-2 font-poppins text-xs text-ui-text outline-none" />
                  </View>
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
                    {[{ id: '', name: 'Unassigned' }, ...venues.filter((venue: any) => String(venue.name ?? '').toLowerCase().includes(assignmentVenueSearch.trim().toLowerCase()))].map((venue: any) => (
                      <TouchableOpacity key={venue.id || 'unassigned'} accessibilityRole="button" accessibilityState={{ selected: assignmentVenueId === venue.id }}
                        onPress={() => { setAssignmentVenueId(venue.id); setAssignmentVenueSearch(''); setAssignmentVenuePickerOpen(false); }}
                        className={`min-h-10 justify-center border-b border-ui-border px-3 ${assignmentVenueId === venue.id ? 'bg-ui-muted' : 'bg-core-surface-white'}`}>
                        <Text className="font-poppins text-xs text-ui-text">{venue.name}</Text>
                      </TouchableOpacity>
                    ))}
                    {!venues.some((venue: any) => String(venue.name ?? '').toLowerCase().includes(assignmentVenueSearch.trim().toLowerCase())) && assignmentVenueSearch.trim() !== '' && (
                      <Text className="px-3 py-3 font-poppins text-xs text-ui-text-muted">No venues match this search.</Text>
                    )}
                  </ScrollView>
                </View>
              )}
              {assignmentVenueId && assignmentVenueConflictQuery.isLoading && (
                <View className="flex-row items-center gap-2 mt-2"><ActivityIndicator size="small" color={ui.colors.primaryText} /><Text className="font-poppins text-xs text-ui-text-muted">Checking venue availability…</Text></View>
              )}
              {!!assignmentVenueConflictQuery.data && assignmentVenueConflictQuery.data > 0 && (
                <Text className="font-poppins text-xs text-core-danger-red-700 mt-2">
                  This venue has {assignmentVenueConflictQuery.data} overlapping schedule{assignmentVenueConflictQuery.data === 1 ? '' : 's'}. Saving will ask you to confirm.
                </Text>
              )}
              {assignmentVenueConflictQuery.isError && (
                <View className="mt-2 flex-row items-center justify-between gap-2 rounded-lg border border-ui-border p-2">
                  <Text className="flex-1 font-poppins text-xs text-core-danger-red-700">Venue conflict check failed.</Text>
                  <TouchableOpacity accessibilityRole="button" onPress={() => void assignmentVenueConflictQuery.refetch()}><Text className="font-poppins-bold text-xs text-ui-primary-text">Retry</Text></TouchableOpacity>
                </View>
              )}
              {canEditAssignmentSubstages && (
                <View className="mt-4">
                  {assignmentSubstagesQuery.isLoading || isLoadingItems ? (
                    <View className="flex-row items-center gap-2 py-3"><ActivityIndicator size="small" color={ui.colors.primaryText} /><Text className="font-poppins text-xs text-ui-text-muted">Loading stage settings…</Text></View>
                  ) : assignmentSubstagesQuery.isError ? (
                    <View className="rounded-lg border border-ui-border p-3">
                      <Text className="font-poppins text-xs text-core-danger-red-700">Sub-stage settings could not be loaded.</Text>
                      <TouchableOpacity accessibilityRole="button" onPress={() => void assignmentSubstagesQuery.refetch()} className="mt-2 self-start"><Text className="font-poppins-bold text-xs text-ui-primary-text">Retry</Text></TouchableOpacity>
                    </View>
                  ) : (
                    <SubstageEditor stages={assignmentSubstages} onChange={(next) => { setAssignmentSubstages(next); setAssignmentSubstagesChanged(true); }} />
                  )}
                </View>
              )}
              {!canEditAssignmentSubstages && !isLoadingItems && assignmentSchedule && (
                <Text className="font-poppins text-xs text-ui-text-muted mt-4">Sub-stage settings are not used for this competition.</Text>
              )}
            </ScrollView>
            <View className="flex-row justify-end gap-2 mt-4">
              <TouchableOpacity accessibilityRole="button" disabled={isSavingAssignment} onPress={closeScheduleAssignment} className="h-10 px-4 justify-center rounded-lg border border-ui-border">
                <Text className="font-poppins-bold text-xs text-ui-text">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: isSavingAssignment || assignmentSubstagesQuery.isLoading || assignmentVenueConflictQuery.isLoading, busy: isSavingAssignment }}
                disabled={isSavingAssignment || assignmentSubstagesQuery.isLoading || assignmentVenueConflictQuery.isLoading || (canEditAssignmentSubstages && isLoadingItems)}
                onPress={() => void saveScheduleAssignment()} className="h-10 px-4 justify-center rounded-lg bg-button-primary">
                <Text className="font-poppins-bold text-xs text-button-foreground">{isSavingAssignment ? 'Saving…' : 'Save assignment'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {judgePanelSchedule ? (
        <ScheduleJudgesModal
          schedule={judgePanelSchedule}
          visible
          onClose={() => setJudgePanelSchedule(null)}
          onUpdateRequiredCount={saveRequiredJudgeCount}
        />
      ) : null}
    </>
  );
}
