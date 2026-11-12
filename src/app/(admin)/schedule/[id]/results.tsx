import { coreColor } from '@/constants/coreTheme';
import { AdminMarkEntryModal } from '../../../../components/ui/AdminMarkEntryModal';
import { DirectMarkEntryModal } from '../../../../components/ui/DirectMarkEntryModal';
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import {
  ArrowLeft, ClipboardList, PenLine,
} from 'lucide-react-native';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useJudges } from '../../../../core/hooks/useJudges';
import { useParticipants } from '../../../../core/hooks/useParticipants';
import { useSchedule } from '../../../../core/hooks/useSchedule';
import { useEntrySizes } from '../../../../core/hooks/useEntrySizes';
import { useFestival } from '../../../../core/hooks/useFestival';
import { isGeneralCategoryCode } from '../../../../core/utils/generalCategory';
import {
  calculateFlexiblePoints,
  calculateGradeFromConfig,
  normalizePointsConfig,
  resolvePointBracket,
  validateFlexiblePointsConfig,
} from '../../../../core/utils/flexiblePointsEngine';
import { createRequestId } from '../../../../core/utils/requestId';
import { completeDirectMarks } from '../../../../core/utils/completeDirectMarks';
import { getScoringRulesForItem } from '../../../../core/utils/scoringRules';
import type { CompetitionPublication } from '../../../../types/scoring';

// ─── Constants ────────────────────────────────────────────────────────────────

type DirectMarkState = {
  marks: Record<number, number>;
  maxMark: number;
};

type ResultEntry = {
  registration_id: string;
  code_letter: string;
  rank: string | null;
  grade: string | null;
};

type ZeroMarkSummary = { registrationId: string; codeLetter: string; judges: string[] };

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const goBack = useGoBack('/(admin)/schedule');

  const { schedules } = useSchedule();
  const schedule = schedules?.find((s: any) => s.id === scheduleId);
  const { usePointsConfig, useActiveFestival } = useFestival();

  // Resolve festival_id: use schedule's festival_id if set, else fall back to active festival
  const { data: activeFestival } = useActiveFestival();
  const resolvedFestivalId: string | null = schedule?.festival_id ?? activeFestival?.id ?? null;

  const {
    useMarkEntries,
    useResults,
    publishResults: publishResultsMutation,
    unlockScheduleMarks,
    useJudgeSubmissionSummary,
  } = useJudges();

  const publication = React.useRef<{ signature: string; id: string } | null>(null);

  const { useScheduleRegistrations } = useParticipants();
  const { data: itemRegistrations, isLoading } = useScheduleRegistrations(scheduleId);
  const registrations = React.useMemo(
    () => (itemRegistrations || []).filter((registration: any) =>
      registration.status !== 'rejected' && registration.is_verified === true && !!registration.code_letter
    ),
    [itemRegistrations],
  );
  // Label-only refreshes must not rerun score/rank calculation over unsaved
  // result edits. Participant eligibility changes still update these IDs.
  const registrationIdentity = registrations.map((registration: any) => registration.id).sort().join('|');
  const scoringRegistrationIds = React.useMemo(() => registrationIdentity ? registrationIdentity.split('|') : [], [registrationIdentity]);
  const {
    data: markEntries,
    isLoading: markEntriesLoading,
    isError: markEntriesError,
  } = useMarkEntries(scheduleId, 30000, true);
  const { data: existingResults } = useResults(scheduleId);
  const { data: pointsConfig, error: pointsConfigError } = usePointsConfig(resolvedFestivalId ?? undefined);
  const {
    data: judgeSummary,
    isLoading: judgeSummaryLoading,
    isError: judgeSummaryError,
  } = useJudgeSubmissionSummary(scheduleId);
  const flexiblePointsConfig = React.useMemo(
    () => normalizePointsConfig(pointsConfig),
    [pointsConfig],
  );

  const scoringErrors = validateFlexiblePointsConfig(flexiblePointsConfig);

  const isGeneralItem = React.useMemo(() => {
    const codes = (schedule?.items?.category_codes as string[]) || [];
    return codes.some(isGeneralCategoryCode);
  }, [schedule?.items?.category_codes]);

  // ── Mode selection ────────────────────────────────────────────────────────
  // 'none' = not chosen, 'marks' = judges used system, 'direct' = direct entry
  const [mode, setMode] = useState<'none' | 'marks' | 'direct'>('none');
  const [manualGeneralSize, setManualGeneralSize] = useState<number | null>(null);

  // ── Result state ──────────────────────────────────────────────────────────
  const [results, setResults] = useState<Record<string, ResultEntry>>({});
  const [directMarks, setDirectMarks] = useState<Record<string, DirectMarkState>>({});
  const [directEntryModal, setDirectEntryModal] = useState<{ visible: boolean, regId: string, judgeIndex: number, participantName: string, codeLetter: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);
  const [editingRegistration, setEditingRegistration] = useState<any>(null);
  const [showZeroMarkConfirmation, setShowZeroMarkConfirmation] = useState(false);
  const [zeroMarksExpanded, setZeroMarksExpanded] = useState(false);
  const [zeroMarkSummary, setZeroMarkSummary] = useState<ZeroMarkSummary[]>([]);
  const [zeroConfirmationSignature, setZeroConfirmationSignature] = useState('');
  
  const [officialBracket, setOfficialBracket] = useState<string>('');
  const [bracketManuallyOverridden, setBracketManuallyOverridden] = useState(false);
  const [forceRepublishConfirmed, setForceRepublishConfirmed] = useState(false);
  const [unlockDialogVisible, setUnlockDialogVisible] = useState(false);
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockError, setUnlockError] = useState('');
  
  const hasInitialized = React.useRef(false);

  React.useEffect(() => {
    setOfficialBracket(schedule?.official_participant_bracket || '');
  }, [schedule?.id, schedule?.official_participant_bracket]);

  // Init results from existing results or registrations
  React.useEffect(() => {
    if (registrations && existingResults !== undefined) {
      setResults(prev => {
        let changed = false;
        const next = { ...prev };
        
        // Ensure all registrations exist in results
        (registrations as any[]).forEach(reg => {
          if (!next[reg.id]) {
            next[reg.id] = {
              registration_id: reg.id,
              code_letter: reg.code_letter,
              rank: null,
              grade: null,
            };
            changed = true;
          } else if (next[reg.id].code_letter !== reg.code_letter) {
            next[reg.id] = { ...next[reg.id], code_letter: reg.code_letter };
            changed = true;
          }
        });
        
        // Load existing results on first pass
        if (!hasInitialized.current) {
          const existingRows = existingResults as any[];
          const hasPublishedRows = existingRows.some(res =>
            res.published === true || res.result_status === 'published'
          );
          setPublished(hasPublishedRows);
          
          const savedMethod = existingRows.find(res => res.collection_method)?.collection_method;
          if (savedMethod === 'manual' || savedMethod === 'judges') {
            setMode(savedMethod === 'manual' ? 'direct' : 'marks');
          }
          
          existingRows.forEach(res => {
            const inputs = res.collection_method === 'manual' ? res.points_calculation?.inputs : null;
            if (Array.isArray(inputs) && inputs.length && inputs.every(input => Number.isFinite(input.total)
              && Number.isFinite(input.maximum) && input.maximum > 0 && input.maximum === inputs[0].maximum)) {
              setDirectMarks(current => current[res.registration_id] ? current : { ...current,
                [res.registration_id]: { maxMark: inputs[0].maximum, marks: Object.fromEntries(inputs.map((input, index) => [index + 1, input.total])) } });
            }
            if (next[res.registration_id]) {
              next[res.registration_id] = {
                ...next[res.registration_id],
                rank: res.rank ? res.rank.toString() + (res.rank === 1 ? 'st' : res.rank === 2 ? 'nd' : res.rank === 3 ? 'rd' : 'th') : null,
                grade: res.grade,
              };
            }
          });
          
          hasInitialized.current = true;
          changed = true;
        }
        
        return changed ? next : prev;
      });
    }
  }, [registrations, existingResults, schedule]);

  const isGroupEvent =
    schedule?.items?.participation_type === 'group'
    || (registrations as any[])?.some((registration) => registration.is_group_registration === true)
    || false;

  const { data: entrySizes } = useEntrySizes(scheduleId, registrations as any[]);
  const configuredGroupSize = React.useMemo(() => {
    const item = schedule?.items;
    const count = Number(item?.group_min_members);
    return item?.participation_type === 'group' && item?.source === 'custom'
      && Number.isSafeInteger(count) && count > 0 && count === Number(item?.group_max_members) ? count : null;
  }, [schedule?.items]);
  const defaultGroupSize = React.useMemo(() => {
    if (configuredGroupSize !== null) return configuredGroupSize;
    if (!entrySizes) return 1;
    const sizes = Object.values(entrySizes) as number[];
    if (sizes.length === 0) return 1;
    return Math.max(...sizes); // Safe assumption: all entries in a group event have the same size.
  }, [entrySizes, configuredGroupSize]);

  const effectiveGroupSize = React.useMemo(() => {
    if (isGeneralItem && flexiblePointsConfig.memberBracketsEnabled && configuredGroupSize === null && manualGeneralSize !== null)
      return manualGeneralSize;
    return defaultGroupSize;
  }, [isGeneralItem, manualGeneralSize, defaultGroupSize, configuredGroupSize, flexiblePointsConfig.memberBracketsEnabled]);

  const automaticBracket = resolvePointBracket(
    flexiblePointsConfig,
    effectiveGroupSize,
    isGroupEvent,
  );
  const resolvedBracketKey =
    !flexiblePointsConfig.memberBracketsEnabled || !isGroupEvent
      ? (automaticBracket?.key ?? '')
      : flexiblePointsConfig.autoBracketSelection && !bracketManuallyOverridden && !published
        ? automaticBracket?.key ?? officialBracket
        : officialBracket;

  // ── Judge marks helper ─────────────────────────────────────────────────────
  const getJudgeMarks = React.useCallback(
    (regId: string) =>
      (markEntries as any[])?.filter(m => m.registration_id === regId) ?? [],
    [markEntries],
  );

  const getMarkSummary = React.useCallback((regId: string) => {
    const entries = getJudgeMarks(regId).filter((e: any) => e.is_final === true);
    if (!entries.length || entries.some((entry: any) => !Number.isFinite(Number(entry.max_mark_snapshot)) || Number(entry.max_mark_snapshot) <= 0)) return null;
    const rawAverage = entries.reduce(
      (sum: number, entry: any) => sum + Number(entry.total_mark ?? 0),
      0,
    ) / entries.length;
    const percentageAverage = entries.reduce((sum: number, entry: any) => {
      const maximum = Number(entry.max_mark_snapshot);
      return sum + ((Number(entry.total_mark ?? 0) / maximum) * 100);
    }, 0) / entries.length;
    const maxima = [...new Set(entries.map((entry: any) => Number(entry.max_mark_snapshot)))];

    return {
      rawAverage: Math.round(rawAverage * 100) / 100,
      percentageAverage,
      commonMaximum: maxima.length === 1 ? maxima[0] : null,
    };
  }, [getJudgeMarks]);

  const getDirectMarkSummary = React.useCallback((regId: string) => {
    const entry = directMarks[regId];
    if (!entry || !entry.marks) return null;
    const values = Object.values(entry.marks);
    if (values.length === 0) return null;
    
    const sum = values.reduce((a, b) => a + b, 0);
    const rawAverage = sum / values.length;
    const maxMark = entry.maxMark;
    if (!Number.isFinite(maxMark) || maxMark <= 0) return null;
    const percentageAverage = (rawAverage / maxMark) * 100;
    
    return {
      rawAverage: Math.round(rawAverage * 100) / 100,
      percentageAverage,
      commonMaximum: maxMark,
      count: values.length,
    };
  }, [directMarks]);

  const getPointsPreview = (registrationId: string, grade: string | null, rank: string | null) => {
    if (published && !forceRepublishConfirmed) {
      const recorded = (existingResults as any[] | undefined)?.find(r => r.registration_id === registrationId);
      return { total: recorded?.points_awarded ?? '—', rankPts: recorded?.points_calculation?.rank_points ?? '—',
        gradePts: recorded?.points_calculation?.grade_points ?? '—', rule12Applies: recorded?.points_calculation?.rule12_applied === true };
    }
    const rankNum = typeof rank === 'string' ? parseInt(rank.replace(/\D/g, ''), 10) : null;
    
    if (scoringErrors.length || !resolvePointBracket(flexiblePointsConfig, effectiveGroupSize, isGroupEvent, resolvedBracketKey)) {
      return { total: '—', rankPts: '—', gradePts: '—', rule12Applies: false };
    }
    const calculation = calculateFlexiblePoints({
      grade,
      rank: Number.isFinite(rankNum) ? rankNum : null,
      groupSize: effectiveGroupSize,
      competingTeamsCount: (registrations as any[]).length,
      isGroup: isGroupEvent,
      config: flexiblePointsConfig,
      itemId: schedule?.item_id,
      bracketOverride: resolvedBracketKey,
    });

    return {
      ...calculation,
      rankPts: calculation.rankPoints,
      gradePts: calculation.gradePoints,
    };
  };

  const expectedJudges = schedule?.expected_judge_count || 3;
  const activeJudgeSummary: any[] = React.useMemo(
    () => Array.isArray(judgeSummary)
      ? [...judgeSummary].sort((left: any, right: any) => String(left.judge_name ?? '').localeCompare(String(right.judge_name ?? '')))
      : [],
    [judgeSummary],
  );
  const assignedJudgeIds = React.useMemo(
    () => new Set(activeJudgeSummary.map((judge: any) => judge.judge_id)),
    [activeJudgeSummary],
  );
  const judgeAssignmentCountMismatch = mode === 'marks' && activeJudgeSummary.length !== expectedJudges;
  const missingJudgeSlots = React.useCallback((reg: any): string[] => {
    if (mode === 'direct') {
      const marks = directMarks[reg.id]?.marks ?? {};
      const missing = Array.from({ length: expectedJudges }, (_, index) => index + 1)
        .filter(slot => marks[slot] === undefined)
        .map(slot => `Judge ${slot}`);
      const unexpected = Object.keys(marks)
        .map(Number)
        .filter(slot => !Number.isInteger(slot) || slot < 1 || slot > expectedJudges)
        .map(slot => `Unexpected Judge ${slot}`);
      const invalid = Object.entries(marks)
        .filter(([, total]) => !Number.isFinite(Number(total))
          || Number(total) < 0
          || !Number.isFinite(Number(directMarks[reg.id]?.maxMark))
          || Number(total) > Number(directMarks[reg.id]?.maxMark))
        .map(([slot]) => `Invalid Judge ${slot}`);
      return [...missing, ...unexpected, ...invalid];
    }

    const submittedJudgeIds = new Set(getJudgeMarks(reg.id)
      .filter((mark: any) => mark.is_final === true
        && assignedJudgeIds.has(mark.judge_id)
        && mark.total_mark !== null
        && mark.total_mark !== undefined
        && Number.isFinite(Number(mark.total_mark))
        && Number.isFinite(Number(mark.max_mark_snapshot))
        && Number(mark.max_mark_snapshot) > 0
        && Number(mark.total_mark) >= 0
        && Number(mark.total_mark) <= Number(mark.max_mark_snapshot))
      .map((mark: any) => mark.judge_id));
    return activeJudgeSummary
      .filter((judge: any) => !submittedJudgeIds.has(judge.judge_id))
      .map((judge: any, index: number) => judge.judge_name || `Judge ${index + 1}`);
  }, [mode, directMarks, expectedJudges, getJudgeMarks, assignedJudgeIds, activeJudgeSummary]);

  // Overall readiness banner for the schedule
  const overallReadiness = React.useMemo(() => {
    if (published) return { label: '✅ Results Published', color: 'bg-core-success-soft-green-100', textColor: 'text-core-success-green-800' };
    
    const regs = (registrations as any[]) || [];
    if (!regs.length) return null;

    if (judgeAssignmentCountMismatch) {
      return {
        label: `🟠 ${activeJudgeSummary.length}/${expectedJudges} active judge assignments`,
        color: 'bg-orange-50',
        textColor: 'text-orange-700',
      };
    }
    
    let fullyReadyCount = 0;
    let anySubmissions = false;

    regs.forEach(reg => {
      const marksCount = mode === 'direct'
        ? Object.keys(directMarks[reg.id]?.marks ?? {}).length
        : getJudgeMarks(reg.id).filter((mark: any) => mark.is_final === true && assignedJudgeIds.has(mark.judge_id)).length;
      if (marksCount > 0) anySubmissions = true;
      if (missingJudgeSlots(reg).length === 0) fullyReadyCount++;
    });

    if (fullyReadyCount === regs.length && regs.length > 0) {
      return { label: '🟢 All judges submitted — Ready for Calculation', color: 'bg-core-success-soft-green-50', textColor: 'text-core-success-green-700' };
    }
    if (anySubmissions) {
      return { label: `🟠 ${fullyReadyCount}/${regs.length} participants ready`, color: 'bg-core-warning-soft-orange-50', textColor: 'text-core-warning-orange-700' };
    }
    return { label: '🟡 Waiting for judge submissions', color: 'bg-core-warning-soft-yellow-50', textColor: 'text-core-warning-yellow-700' };
  }, [registrations, expectedJudges, published, getJudgeMarks, mode, directMarks, activeJudgeSummary, assignedJudgeIds, missingJudgeSlots, judgeAssignmentCountMismatch]);

  const hasAtLeastOneResult = React.useMemo(() => {
    return Object.values(results).some(
      r => (r.rank && r.rank !== '-') || (r.grade && r.grade !== '-')
    );
  }, [results]);

  const autoFill = React.useCallback(() => {
    if (!scoringRegistrationIds.length || (!forceRepublishConfirmed && (published ||
      (!hasInitialized.current && (existingResults as any[] | undefined)?.some(r => r.published === true || r.result_status === 'published'))))) return;

    // 1. Calculate avgs and grades
    const scores = scoringRegistrationIds.map(registrationId => {
      const markSummary = mode === 'direct' ? getDirectMarkSummary(registrationId) : getMarkSummary(registrationId);
      const normalizedAverage = markSummary?.percentageAverage ?? null;
      let grade = normalizedAverage !== null
        ? calculateGradeFromConfig(normalizedAverage, 100, flexiblePointsConfig)
        : null;
      // Convert null to '-'
      if (!grade) grade = '-';
      return {
        id: registrationId,
        avg: normalizedAverage ?? 0,
        grade,
      };
    });

    // 2. Sort to assign ranks (standard competition ranking: 1, 2, 2, 4)
    const sorted = [...scores].sort((a, b) => b.avg - a.avg);
    
    let currentRank = 1;
    let previousAvg = -1;
    const rankMapping: Record<string, string> = {};
    
    sorted.forEach((item, index) => {
      if (item.avg === 0) {
        rankMapping[item.id] = '-';
        return;
      }
      if (item.avg !== previousAvg) {
        currentRank = index + 1;
      }
      previousAvg = item.avg;
      
      let rStr = '-';
      if (currentRank === 1) rStr = '1st';
      else if (currentRank === 2) rStr = '2nd';
      else if (currentRank === 3) rStr = '3rd';
      else if (currentRank === 4) rStr = '4th';
      else if (currentRank === 5) rStr = '5th';
      
      rankMapping[item.id] = rStr;
    });

    setResults(prev => {
      const next = { ...prev };
      scores.forEach(s => {
        if (next[s.id]) {
          next[s.id] = {
            ...next[s.id],
            grade: s.grade,
            rank: rankMapping[s.id]
          };
        }
      });
      return next;
    });
  }, [scoringRegistrationIds, getMarkSummary, getDirectMarkSummary, flexiblePointsConfig, mode, published, forceRepublishConfirmed, existingResults]);

  // Run auto-calculation whenever in marks or direct mode and data is available
  React.useEffect(() => {
    if (mode === 'marks' || mode === 'direct') {
      autoFill();
    }
  }, [mode, autoFill, directMarks, markEntries]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handlePublish = async (confirmedZeroSignature?: string) => {
    if (pointsConfigError || !pointsConfig || scoringErrors.length) {
      const message = pointsConfigError?.message || scoringErrors[0] || 'Configure points before publishing.';
      if (Platform.OS === 'web') window.alert(message); else Alert.alert('Points configuration', message);
      return;
    }
    if (!resolvedBracketKey) {
      if (Platform.OS === 'web') window.alert('Validation Error: Please select the Official Participant Bracket before publishing.');
      else Alert.alert('Validation Error', 'Please select the Official Participant Bracket before publishing.');
      return;
    }

    let zeroSummary: ZeroMarkSummary[] = [];
    const confirmedMissingMarks: NonNullable<CompetitionPublication['confirmedMissingMarks']> = [];
    if (mode === 'marks' || mode === 'direct') {
      const regs = (registrations as any[]) || [];

      if (mode === 'marks') {
        if (markEntriesLoading || judgeSummaryLoading) {
          const message = 'Wait for judge assignments and submitted marks to finish loading before publishing.';
          if (Platform.OS === 'web') window.alert(message); else Alert.alert('Marks are loading', message);
          return;
        }
        if (markEntriesError || judgeSummaryError || !markEntries || !judgeSummary) {
          const message = 'Judge assignments or marks could not be loaded. Refresh this page and try again.';
          if (Platform.OS === 'web') window.alert(message); else Alert.alert('Unable to verify marks', message);
          return;
        }
        if (activeJudgeSummary.length !== expectedJudges) {
          const message = `This schedule requires ${expectedJudges} active judge assignments, but ${activeJudgeSummary.length} are active. Correct the assignments before publishing.`;
          if (Platform.OS === 'web') window.alert(message); else Alert.alert('Judge assignment count', message);
          return;
        }
      }

      const missingRows = regs.flatMap(reg => {
        const missing = missingJudgeSlots(reg);
        return missing.length > 0 ? [`Code ${reg.code_letter}: ${missing.join(', ')}`] : [];
      });
      const hasInvalidDirectMarks = mode === 'direct' && regs.some(reg =>
        missingJudgeSlots(reg).some(slot => !/^Judge \d+$/.test(slot)));
      if (missingRows.length > 0 && hasInvalidDirectMarks) {
        const message = `Every required judge slot must have a submitted mark. Missing marks for ${missingRows.length} participant(s):\n\n${missingRows.join('\n')}`;
        if (Platform.OS === 'web') window.alert(message); else Alert.alert('Required marks are missing', message);
        return;
      }

      if (mode === 'marks') {
        for (const reg of regs) {
          for (const judge of activeJudgeSummary) {
            const mark = getJudgeMarks(reg.id).find((entry: any) => entry.judge_id === judge.judge_id);
            if (mark?.is_final === true) {
              if (mark.total_mark == null || !Number.isFinite(Number(mark.total_mark)) || Number(mark.total_mark) < 0
                || !Number.isFinite(Number(mark.max_mark_snapshot)) || Number(mark.max_mark_snapshot) <= 0
                || Number(mark.total_mark) > Number(mark.max_mark_snapshot)) {
                const message = `Code ${reg.code_letter} has an invalid final mark. Review it before publishing.`;
                if (Platform.OS === 'web') window.alert(message); else Alert.alert('Invalid mark', message);
                return;
              }
            } else {
              confirmedMissingMarks.push({ registration_id: reg.id, judge_id: judge.judge_id,
                mark_id: mark?.id ?? null, updated_at: mark?.updated_at ?? null,
                snapshot: mark ? { criteria_scores: mark.criteria_scores ?? null, total_mark: mark.total_mark ?? null,
                  entry_mode_snapshot: mark.entry_mode_snapshot ?? null, max_mark_snapshot: mark.max_mark_snapshot ?? null,
                  criteria_snapshot: mark.criteria_snapshot ?? null, is_draft: mark.is_draft ?? null } : null });
            }
          }
        }
      }
      zeroSummary = regs.flatMap(reg => {
        const zeroJudges = mode === 'direct'
          ? Array.from({ length: expectedJudges }, (_, index) => index + 1)
            .filter(slot => directMarks[reg.id]?.marks?.[slot] === undefined || directMarks[reg.id]?.marks?.[slot] === 0)
            .map(slot => `Judge ${slot}`)
          : activeJudgeSummary.flatMap((judge: any, index: number) => {
            const mark = getJudgeMarks(reg.id).find((entry: any) => entry.judge_id === judge.judge_id);
            const name = judge.judge_name || `Judge ${index + 1}`;
            if (!mark) return [`${name}: 0`];
            if (mark.is_final !== true) return [`${name}: saved draft will be submitted; blank fields become 0`];
            return Number(mark.total_mark) === 0 ? [`${name}: 0`] : [];
          });
        return zeroJudges.length > 0 ? [{ registrationId: reg.id, codeLetter: reg.code_letter, judges: zeroJudges }] : [];
      });
    }

    // Lock guard for republishing
    if (published && !forceRepublishConfirmed) {
      const warnMsg = 'Republishing will recalculate grade points using the currently selected official participant bracket. Are you sure you want to republish?';
      if (Platform.OS === 'web') {
        const confirmed = window.confirm(warnMsg);
        if (!confirmed) return;
        setForceRepublishConfirmed(true);
        return;
      } else {
        Alert.alert('Republish Warning', warnMsg, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, Republish', style: 'destructive', onPress: () => setForceRepublishConfirmed(true) }
        ]);
        return;
      }
    }

    const zeroSignature = JSON.stringify({ zeroSummary, confirmedMissingMarks });
    if (zeroSummary.length > 0 && confirmedZeroSignature !== zeroSignature) {
      setZeroMarkSummary(zeroSummary);
      setZeroConfirmationSignature(zeroSignature);
      setZeroMarksExpanded(false);
      setShowZeroMarkConfirmation(true);
      return;
    }
    
    setSaving(true);
    try {
      if (!resolvedFestivalId) {
        throw new Error('Festival is missing for this schedule.');
      }

      // Participants without any direct entries have no stored maximum yet.
      // Resolve it using the same rule as the direct-entry dialog.
      let defaultMaximum: number | undefined;
      if ((mode === 'direct' && (registrations as any[]).some(registration => !directMarks[registration.id]))
        || (mode === 'marks' && confirmedMissingMarks.length > 0)) {
        if (!schedule) throw new Error('Schedule details are not loaded.');
        const rules = await getScoringRulesForItem(schedule.items?.item_name_en, schedule.items?.item_name_ml,
          schedule.items?.type, schedule.tenant_id);
        defaultMaximum = rules.total_marks;
      }

      const input: CompetitionPublication = {
        scheduleId: scheduleId as string,
        expectedVersion: flexiblePointsConfig.version,
        mode: mode === 'direct' ? 'manual' : 'judges',
        bracket: resolvedBracketKey,
        groupSize: isGeneralItem && flexiblePointsConfig.memberBracketsEnabled && configuredGroupSize === null ? manualGeneralSize : null,
        requestId: '',
        ...(mode === 'marks' && confirmedMissingMarks.length ? { confirmedMissingMarks, zeroMaximum: defaultMaximum } : {}),
        entries: (registrations as any[]).map(registration => ({
          registration_id: registration.id,
          ...(mode === 'direct' ? { raw_marks: Object.entries(completeDirectMarks(directMarks[registration.id]?.marks ?? {}, expectedJudges))
            .map(([slot, total]) => ({
              judge_slot: Number(slot),
              total,
              maximum: directMarks[registration.id]?.maxMark ?? defaultMaximum ?? 0,
            }))
            .sort((left, right) => left.judge_slot - right.judge_slot) } : {}),
        })),
      };
      const signature = JSON.stringify(input);
      if (!publication.current || publication.current.signature !== signature) {
        publication.current = { signature, id: createRequestId() };
      }
      input.requestId = publication.current.id;
      await publishResultsMutation.mutateAsync(input);
      publication.current = null;

      setPublished(true);
      setForceRepublishConfirmed(false); // reset lock
      if (Platform.OS === 'web') {
        window.alert('✅ Results Published: Results have been saved. (Posters can be generated from Media Center -> Poster Studio)');
      } else {
        Alert.alert('✅ Results Published', 'Results have been saved. (Posters can be generated from Media Center -> Poster Studio)');
      }
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert('Error: ' + e.message);
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const closeUnlockDialog = () => {
    setUnlockDialogVisible(false);
    setUnlockCode('');
    setUnlockError('');
  };

  const confirmUnlock = () => {
    if (unlockScheduleMarks.isPending) return;
    if (!schedule?.tenant_id || unlockCode.trim().toLowerCase() !== schedule.tenant_id.toLowerCase()) {
      setUnlockError('Tenant ID does not match this schedule.');
      return;
    }
    unlockScheduleMarks.mutate(scheduleId, {
      onSuccess: () => {
        setPublished(false);
        setForceRepublishConfirmed(false);
        closeUnlockDialog();
      },
    });
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────
  if (isLoading) return <ActivityIndicator color={coreColor("#1B6B3A", 'primaryText')} style={{ marginTop: 60 }} />;

  // ── Mode selector screen ───────────────────────────────────────────────────
  if (mode === 'none') {
    return (
      <View className="flex-1 bg-ssf-bg">
        <View className="border-b border-ui-border bg-core-surface-white px-4 py-3">
          <View className="flex-row items-center mb-2">
            <TouchableOpacity onPress={goBack} className="mr-3 h-9 w-9 items-center justify-center rounded-lg border border-ui-border bg-core-surface-white">
              <ArrowLeft size={18} color={coreColor("#0F172A", 'overlay')} />
            </TouchableOpacity>
            <Text className="text-lg font-poppins-black text-ssf-text flex-1" numberOfLines={1}>
              Result Entry
            </Text>
          </View>
          <Text className="ml-12 text-[11px] font-poppins text-ssf-text-muted">
            {schedule?.items?.item_name_ml ?? 'Event'}
          </Text>
        </View>

        <View className="flex-1 px-4 pt-5 gap-y-3">
          <Text className="font-poppins-bold text-ssf-text text-lg mb-2 text-center">
            How were marks collected?
          </Text>

          {/* Mode A: Judges used the system */}
          <TouchableOpacity
            onPress={() => setMode('marks')}
            className="bg-core-surface-white border border-ssf-primary rounded-lg p-4"
          >
            <View className="flex-row items-center gap-x-3 mb-2">
              <View className="w-10 h-10 rounded-full bg-ssf-primary/10 items-center justify-center">
                <ClipboardList size={20} color={coreColor("#1B6B3A", 'primaryText')} />
              </View>
              <Text className="font-poppins-black text-ssf-text text-base">
                Judges Used the System
              </Text>
            </View>
            <Text className="font-poppins text-ssf-text-muted text-sm">
              ജഡ്ജിമാർ system-ൽ marks enter ചെയ്തിട്ടുണ്ട്. 3 judges-ന്റെ marks കണ്ട് final rank + grade confirm ചെയ്യാം.
            </Text>
          </TouchableOpacity>

          {/* Mode B: Direct entry */}
          {(!markEntries || (markEntries as any[]).length === 0) && (
            <TouchableOpacity
              onPress={() => setMode('direct')}
              className="bg-core-surface-white border border-core-border-gray-200 rounded-lg p-4"
            >
              <View className="flex-row items-center gap-x-3 mb-2">
                <View className="w-10 h-10 rounded-full bg-core-surface-muted-gray-100 items-center justify-center">
                  <PenLine size={20} color={coreColor("#6B7280", 'text')} />
                </View>
                <Text className="font-poppins-black text-ssf-text text-base">
                  Direct Entry (Manual)
                </Text>
              </View>
              <Text className="font-poppins text-ssf-text-muted text-sm">
                ജഡ്ജിമാർ system use ചെയ്തിട്ടില്ല. Committee തീരുമാനിച്ച rank + grade directly enter ചെയ്യുക.
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── Entry screen (shared for both modes) ──────────────────────────────────
  return (
    <View className="flex-1 bg-ssf-bg">
      {/* Header */}
      <View className="border-b border-ui-border bg-core-surface-white px-4 py-3">
        <View className="flex-row items-center mb-1">
          <TouchableOpacity onPress={() => setMode('none')} className="mr-3 h-9 w-9 items-center justify-center rounded-lg border border-ui-border bg-core-surface-white">
            <ArrowLeft size={18} color={coreColor("#0F172A", 'overlay')} />
          </TouchableOpacity>
          <Text className="text-lg font-poppins-black text-ssf-text flex-1" numberOfLines={1}>
            {mode === 'marks' ? '📊 Mark-Based Result' : '✏️ Direct Entry'}
          </Text>
        </View>
        <Text className="ml-12 text-[11px] font-poppins text-ssf-text-muted">
          {schedule?.items?.item_name_ml ?? 'Event'} 
          {published && schedule?.official_participant_bracket && ` · Official Bracket: ${schedule.official_participant_bracket}`}
        </Text>
      </View>

      <ScrollView className="flex-1 px-3 pt-3" contentContainerStyle={{ width: '100%', maxWidth: 960, alignSelf: 'center' }}>
        {(pointsConfigError || scoringErrors.length > 0) && <Text className="font-poppins text-core-danger-red-700 mb-3">{pointsConfigError?.message || scoringErrors[0]}</Text>}
        {/* Readiness Banner (marks mode only) */}
        {mode === 'marks' && overallReadiness && (
          <View className={`${overallReadiness.color} border border-core-warning-soft-amber-200 rounded-lg px-3 py-2.5 mb-3`}>
            <Text className={`font-poppins-bold text-[12px] ${overallReadiness.textColor}`}>
              {overallReadiness.label}
            </Text>
            {judgeSummary && (judgeSummary as any[]).length > 0 && (
              <View className="mt-1.5 gap-y-0.5">
                {(judgeSummary as any[]).map((j: any, idx: number) => {
                  const submitted = new Set(((markEntries as any[]) ?? [])
                    .filter((entry: any) => entry.judge_id === j.judge_id
                      && entry.is_final === true
                      && scoringRegistrationIds.includes(entry.registration_id))
                    .map((entry: any) => entry.registration_id)).size;
                  const total = scoringRegistrationIds.length;
                  return (
                    <Text key={j.judge_id} className="font-poppins text-[10px] text-core-text-gray-600">
                      {idx + 1}. {j.judge_name}:{' '}
                      {submitted >= total && total > 0 ? '✅ Submitted' : submitted > 0 ? `⏳ ${submitted}/${total}` : '❌ Pending'}
                    </Text>
                  );
                })}
              </View>
            )}
          </View>
        )}

          {/* General Item Member Slot & Warning */}
          {isGeneralItem && flexiblePointsConfig.memberBracketsEnabled && configuredGroupSize === null && (
            <SsfCard className={`mb-3 p-3 ${!isGroupEvent ? 'border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50' : 'border-core-info-soft-blue-200 bg-core-info-soft-blue-50'}`}>
              {!isGroupEvent && (
                <View className="mb-3">
                  <Text className="font-poppins-bold text-core-warning-amber-900 text-[12px] mb-1">
                    Warning: General Item Registered as Individual
                  </Text>
                  <Text className="font-poppins text-[10px] text-core-warning-amber-800 leading-4">
                    ശ്രദ്ധിക്കുക: ഇതൊരു ജനറൽ ഐറ്റം ആണ്, എന്നാൽ സെറ്റിംഗ്സിൽ &apos;Individual&apos; എന്നാണ് കൊടുത്തിരിക്കുന്നത്. ശരിയായ ഗ്രേഡ് പോയിൻ്റ് ലഭിക്കുന്നതിന് ദയവായി Settings -&gt; Items പോയി ഇതിനെ &apos;Group&apos; ആക്കി മാറ്റുക.
                  </Text>
                </View>
              )}
              
              <View>
                <Text className="font-poppins-bold text-core-info-blue-900 text-[12px] mb-1">
                  General Item Members Count
                </Text>
                <Text className="font-poppins text-[10px] text-core-info-blue-800 mb-2 leading-4">
                  ഈ ജനറൽ ഐറ്റത്തിൽ എത്ര പേർ പങ്കെടുത്തു എന്ന് താഴെ നിന്ന് സെലക്ട് ചെയ്യുക. ഇതിനനുസരിച്ചായിരിക്കും ഗ്രേഡ് പോയിൻ്റ് കണക്കാക്കുക.
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                    <TouchableOpacity
                      key={num}
                      onPress={() => setManualGeneralSize(num)}
                      disabled={!isGroupEvent}
                      className={`px-3 py-1.5 rounded-md border ${manualGeneralSize === num ? 'bg-ssf-primary border-ssf-primary' : 'bg-core-surface-white border-ui-border'} ${!isGroupEvent ? 'opacity-50' : ''}`}
                    >
                      <Text className={`font-poppins-bold text-xs ${manualGeneralSize === num ? 'text-core-on-primary-white' : 'text-ui-text'}`}>{num}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </SsfCard>
          )}

        {/* Official Participant Bracket Configuration */}
        {isGroupEvent && flexiblePointsConfig.memberBracketsEnabled && (
        <SsfCard className="mb-3 border-core-info-soft-blue-200 p-3">
          <Text className="font-poppins-bold text-core-info-blue-900 text-[12px] mb-0.5">
            👥 ഈ മത്സരത്തിൽ ഒരു ടീമിൽ എത്ര കുട്ടികളുണ്ട്?
          </Text>
          <Text className="font-poppins text-[10px] text-core-info-blue-700 mb-2 leading-4">
            {flexiblePointsConfig.autoBracketSelection && !bracketManuallyOverridden
              ? `${configuredGroupSize !== null ? 'Configured for this item' : 'Calculated from registrations'}: ${defaultGroupSize} members per entry → ${resolvedBracketKey} bracket selected automatically.`
              : 'Select the participant bracket for grade calculation. Manual overrides are stored with the result.'}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {(flexiblePointsConfig.separateGroupBrackets ? flexiblePointsConfig.groupBrackets : flexiblePointsConfig.brackets).filter((bracket) => bracket.enabled).map((bracket) => {
              const isSelected = resolvedBracketKey === bracket.key;
              // If published, strictly disable other buttons unless forceRepublish is toggled
              const isDisabled =
                (published && !forceRepublishConfirmed && !isSelected)
                || (!flexiblePointsConfig.allowBracketOverride
                  && flexiblePointsConfig.autoBracketSelection
                  && !isSelected);
              return (
                <TouchableOpacity
                  key={bracket.key}
                  onPress={() => {
                    setOfficialBracket(bracket.key);
                    setBracketManuallyOverridden(true);
                  }}
                  disabled={isDisabled}
                  className={`h-8 px-3 rounded-lg border items-center justify-center ${
                    isSelected 
                      ? 'bg-core-primary-blue-600 border-core-primary-blue-600'
                      : isDisabled 
                        ? 'bg-core-surface-muted-gray-100 border-core-border-gray-200 opacity-50'
                        : 'bg-core-surface-white border-core-info-soft-blue-200'
                  }`}
                >
                  <Text className={`font-poppins-bold text-[10px] ${isSelected ? 'text-core-on-primary-white' : isDisabled ? 'text-core-text-muted-gray-400' : 'text-core-info-blue-800'}`}>
                    {bracket.label} {bracket.max === 1 ? 'Person' : 'People'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SsfCard>
        )}

        {(registrations as any[])?.map(reg => {
          const entry = results[reg.id];
          const judgeMarks = getJudgeMarks(reg.id);
          const markSummary = mode === 'direct' ? getDirectMarkSummary(reg.id) : getMarkSummary(reg.id);
          const avg = markSummary?.rawAverage ?? null;
          const ptsPreview = getPointsPreview(reg.id, entry?.grade ?? null, entry?.rank ?? null);
          const directEntryMarksCount = directMarks[reg.id] ? Object.keys(directMarks[reg.id].marks).length : 0;

          return (
            <SsfCard key={reg.id} className="mb-2.5 border-core-success-soft-emerald-100 p-3">
              {/* Code Letter + avg (if marks mode) */}
              <View className="flex-row justify-between items-center mb-2 pb-2 border-b border-core-border-gray-100">
                <View className="flex-row items-center gap-x-2">
                  <View className="w-9 h-9 rounded-lg bg-core-success-soft-emerald-50 border border-core-success-soft-emerald-200 items-center justify-center">
                    <Text className="font-poppins-black text-core-success-emerald-700 text-sm">
                      {reg.code_letter}
                    </Text>
                  </View>
                  <View>
                    <Text className="font-poppins-bold text-[12px] text-ssf-text">Code: {reg.code_letter}</Text>
                    <Text className="font-poppins text-[10px] text-ssf-text-muted">
                      Chest #{reg.participants?.chest_number}
                    </Text>
                  </View>
                </View>

                {/* Show avg for both marks and direct mode */}
                {(mode === 'marks' || mode === 'direct') && avg !== null && (
                  <View className="bg-core-success-soft-emerald-50 border border-core-success-soft-emerald-100 px-2 py-1 rounded-md">
                    <Text className="font-poppins-bold text-core-success-emerald-700 text-[10px]">
                      {markSummary?.commonMaximum
                        ? `Avg: ${avg}/${markSummary.commonMaximum}`
                        : `Avg: ${markSummary?.percentageAverage}%`}
                    </Text>
                  </View>
                )}
              </View>

              {/* Judge marks breakdown — marks mode only */}
              {mode === 'marks' && (
                <View className="border-l-2 border-core-info-soft-blue-200 pl-3 py-1 mb-2">
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="font-poppins-bold text-[10px] text-ssf-text-muted">
                    Judge Marks:
                    </Text>
                    {!published && (
                      <TouchableOpacity onPress={() => setEditingRegistration(reg)} className="bg-core-info-soft-blue-50 border border-core-info-soft-blue-200 px-2 py-1 rounded shadow-sm">
                        <Text className="text-core-info-blue-700 font-poppins-bold text-[10px]">?? Edit Marks</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {judgeMarks.map((m: any, i: number) => (
                    <View key={m.id} className="flex-row justify-between mb-1">
                      <Text className="font-poppins text-[10px] text-ssf-text">
                        {m.judges?.name ?? `Judge ${i + 1}`}
                      </Text>
                      <Text className="font-poppins-bold text-[10px] text-ui-primary-text">
                        {m.total_mark}/{m.max_mark_snapshot ?? '—'} {m.is_final ? '✓' : '(draft)'}
                      </Text>
                    </View>
                  ))}
                  {judgeMarks.length === 0 && (
                     <Text className="font-poppins text-[10px] text-core-text-muted-gray-500 italic mt-1">No marks submitted yet.</Text>
                  )}
                  {judgeMarks.length > 0 && judgeMarks.length < expectedJudges && (
                    <Text className="font-poppins text-[10px] text-core-warning-orange-600 mt-1">
                      ?? Only {judgeMarks.length}/{expectedJudges} judges submitted
                    </Text>
                  )}
                </View>
              )}

              {/* Direct Entry Marks breakdown */}
              {mode === 'direct' && (
                <View className="border-l-2 border-core-info-soft-purple-200 pl-3 py-1 mb-3">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="font-poppins-bold text-[10px] text-ssf-text-muted">
                      Enter Marks ({directEntryMarksCount}/{expectedJudges} Judges)
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {Array.from({ length: expectedJudges }).map((_, i) => {
                      const judgeIndex = i + 1;
                      const hasMark = directMarks[reg.id]?.marks?.[judgeIndex] !== undefined;
                      const markValue = directMarks[reg.id]?.marks?.[judgeIndex];
                      const maxVal = directMarks[reg.id]?.maxMark ?? '—';
                      
                      return (
                        <TouchableOpacity
                          key={judgeIndex}
                          onPress={() => setDirectEntryModal({
                            visible: true,
                            regId: reg.id,
                            judgeIndex,
                            participantName: reg.participants?.name ?? 'Unknown',
                            codeLetter: reg.code_letter,
                          })}
                          disabled={published}
                          className={`flex-row items-center justify-between px-3 py-1.5 rounded-lg border ${hasMark ? 'bg-core-info-soft-purple-50 border-core-info-soft-purple-200' : 'bg-core-surface-white border-dashed border-core-border-gray-300'} ${published ? 'opacity-70' : ''}`}
                        >
                          <Text className={`font-poppins text-[10px] ${hasMark ? 'text-core-info-purple-800' : 'text-core-text-muted-gray-500'}`}>
                            Judge {judgeIndex}
                          </Text>
                          {hasMark && (
                            <Text className="font-poppins-bold text-[10px] text-core-info-purple-900 ml-2">
                              {markValue}/{maxVal}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Rank selector */}
              <View className="mb-2">
                <Text className="font-poppins-bold text-ssf-text text-[11px] mb-1.5">
                  🏆 Final Rank
                </Text>
                {(mode === 'marks' || mode === 'direct') ? (
                  <View className="h-9 flex-row items-center justify-between rounded-lg border border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50 px-3">
                    <Text className="font-poppins-bold text-[11px] text-core-success-emerald-800">
                      {entry?.rank && entry.rank !== '-' ? entry.rank : 'No rank'}
                    </Text>
                    <Text className="font-poppins text-[9px] text-core-success-emerald-700">Calculated from marks</Text>
                  </View>
                ) : (
                  <View />
                )}
              </View>

              {/* Grade selector */}
              <View>
                <Text className="font-poppins-bold text-ssf-text text-[11px] mb-1.5">
                  📊 Final Grade
                </Text>
                {(mode === 'marks' || mode === 'direct') ? (
                  <View className="h-9 flex-row items-center justify-between rounded-lg border border-core-info-soft-blue-200 bg-core-info-soft-blue-50 px-3">
                    <Text className="font-poppins-black text-[11px] text-core-info-blue-800">
                      {entry?.grade && entry.grade !== '-' ? entry.grade : 'No grade'}
                    </Text>
                    <Text className="font-poppins text-[9px] text-core-info-blue-700">Calculated from marks</Text>
                  </View>
                ) : (
                  <View />
                )}
              </View>

              {/* Point Preview per Participant for Audit Visibility */}
              <View className="mt-3 pt-2 border-t border-core-border-gray-100 flex-row justify-between items-center">
                <Text className="font-poppins-bold text-[10px] text-ssf-text-muted">
                  Points Preview:
                </Text>
                <View className="flex-row items-center gap-x-2">
                  <Text className="font-poppins text-[10px] text-core-text-gray-600">
                    Rnk: <Text className="font-poppins-bold">{ptsPreview.rankPts}</Text>
                  </Text>
                  <Text className="font-poppins text-[10px] text-core-text-muted-gray-400">+</Text>
                  <Text className="font-poppins text-[10px] text-core-text-gray-600">
                    Grd: <Text className="font-poppins-bold text-core-success-green-700">{ptsPreview.gradePts}</Text>
                  </Text>
                  <Text className="font-poppins text-[10px] text-core-text-muted-gray-400">=</Text>
                  <View className="bg-ssf-primary/10 px-2 py-0.5 rounded">
                    <Text className="font-poppins-bold text-[11px] text-ui-primary-text">
                      {ptsPreview.total} pts
                    </Text>
                  </View>
                </View>
              </View>
              {ptsPreview.rule12Applies && (
                <View className="self-start bg-core-warning-soft-amber-50 border border-core-warning-soft-amber-200 px-2 py-1 rounded-lg mt-2">
                  <Text className="font-poppins-bold text-[10px] text-core-warning-amber-700">
                    Rule 12 applied · {flexiblePointsConfig.rule12Behavior === 'grade_only'
                      ? 'rank points removed'
                      : flexiblePointsConfig.rule12Behavior === 'no_points'
                        ? 'no points awarded'
                        : 'rank and grade points retained'}
                  </Text>
                </View>
              )}

            </SsfCard>
          );
        })}
        <View className="h-3" />
      </ScrollView>

      {/* Action buttons */}
      <View className="border-t border-ui-border bg-core-surface-white px-3 py-3">
        {published && forceRepublishConfirmed && (
          <View className="bg-core-danger-soft-red-50 border border-core-danger-soft-red-200 p-2 rounded-t-xl -mb-2 z-0 flex-row items-center justify-center">
            <Text className="font-poppins-bold text-[10px] text-core-danger-red-600 text-center">
              ⚠️ Republishing is unlocked. Points will be re-calculated with new bracket!
            </Text>
          </View>
        )}
        <View className="flex-row gap-x-2">
          {published && (mode === 'marks' || mode === 'direct') && (
            <TouchableOpacity
              onPress={() => {
                setUnlockCode('');
                setUnlockError('');
                setUnlockDialogVisible(true);
              }}
              disabled={unlockScheduleMarks.isPending}
              className={`h-12 px-4 rounded-xl items-center justify-center border border-core-danger-soft-red-200 bg-core-danger-soft-red-50 ${unlockScheduleMarks.isPending ? 'opacity-50' : ''}`}
            >
              <Text className="font-poppins-bold text-core-danger-red-700">🔓 Unlock Marks</Text>
            </TouchableOpacity>
          )}
          <View className="flex-1">
            <SsfButton
              label={(published && !forceRepublishConfirmed) ? '✅ Results Published' : '🚀 Publish Results'}
              onPress={() => { void handlePublish(); }}
              isLoading={saving}
              disabled={!hasAtLeastOneResult && !((mode === 'direct' || mode === 'marks') && registrations.length > 0)}
              className={`${published && !forceRepublishConfirmed ? 'opacity-80' : ''} ${!hasAtLeastOneResult && registrations.length === 0 ? 'opacity-50' : ''}`}
            />
          </View>
        </View>
      </View>

      <Modal visible={unlockDialogVisible} transparent animationType="fade" onRequestClose={() => { if (!unlockScheduleMarks.isPending) closeUnlockDialog(); }}>
        <View className="flex-1 bg-black/40 items-center justify-center p-4">
          <View className="w-full max-w-md rounded-2xl bg-core-surface-white p-5">
            <Text className="font-poppins-bold text-lg text-ssf-text">Unlock Marks</Text>
            <Text className="font-poppins text-sm text-ssf-text-muted mt-2 mb-4">
              {mode === 'direct'
                ? 'Enter this schedule’s tenant ID to unpublish the results. You can then edit direct-entry marks and publish again.'
                : 'Enter this schedule’s tenant ID to unpublish the results. Judge marks remain finalized; you can edit and save corrections.'}
            </Text>
            <TextInput
              accessibilityLabel="Tenant ID unlock code"
              placeholder="Tenant ID"
              secureTextEntry
              value={unlockCode}
              onChangeText={(value) => { setUnlockCode(value); setUnlockError(''); }}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!unlockScheduleMarks.isPending}
              onSubmitEditing={confirmUnlock}
              className="h-11 rounded-lg border border-ui-border px-3 font-poppins text-ssf-text"
            />
            {!!unlockError && <Text accessibilityRole="alert" className="mt-2 font-poppins text-sm text-core-danger-red-700">{unlockError}</Text>}
            <View className="mt-4 flex-row justify-end gap-2">
              <TouchableOpacity onPress={closeUnlockDialog} disabled={unlockScheduleMarks.isPending} className="h-11 justify-center rounded-lg border border-ui-border px-4">
                <Text className="font-poppins-bold text-ssf-text">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmUnlock} disabled={unlockScheduleMarks.isPending || !unlockCode.trim()} className={`h-11 justify-center rounded-lg bg-core-danger-red-700 px-4 ${unlockScheduleMarks.isPending || !unlockCode.trim() ? 'opacity-50' : ''}`}>
                <Text className="font-poppins-bold text-white">{unlockScheduleMarks.isPending ? 'Unlocking…' : 'Unlock'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showZeroMarkConfirmation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowZeroMarkConfirmation(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center px-4 py-6">
          <View className="w-full max-w-lg max-h-[85%] overflow-hidden rounded-2xl bg-white shadow-xl">
            <View className="px-5 py-4 border-b border-amber-200 bg-amber-50">
              <Text className="font-poppins-bold text-lg text-amber-900">Review marks before publishing</Text>
              <Text className="font-poppins text-sm text-amber-800 mt-1">
                {mode === 'direct'
                  ? `${zeroMarkSummary.length} participant(s) have at least one zero or blank judge mark. Blank marks will be submitted as 0.`
                  : `${zeroMarkSummary.length} participant(s) have zero, missing or draft marks. Missing marks become 0; draft scores are preserved and submitted.`}
              </Text>
              <Text className="font-poppins text-sm text-amber-800 mt-1">Publishing closes this event&#39;s active judge codes.</Text>
            </View>
            <TouchableOpacity
              onPress={() => setZeroMarksExpanded(value => !value)}
              className="px-5 py-3 border-b border-slate-100"
              accessibilityRole="button"
            >
              <Text className="font-poppins-bold text-sm text-slate-800">
                {zeroMarksExpanded ? 'Hide details' : `View affected participants (${zeroMarkSummary.length})`}
              </Text>
            </TouchableOpacity>
            {zeroMarksExpanded && (
              <ScrollView className="px-5 py-2" keyboardShouldPersistTaps="handled">
                {zeroMarkSummary.map(row => (
                  <View key={row.registrationId} className="py-2 border-b border-slate-100">
                    <Text className="font-poppins-bold text-sm text-slate-800">Code {row.codeLetter}</Text>
                    <Text className="font-poppins text-xs text-slate-600 mt-0.5">{row.judges.join(', ')}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <View className="flex-row gap-3 p-4 border-t border-slate-100">
              <TouchableOpacity
                onPress={() => setShowZeroMarkConfirmation(false)}
                className="flex-1 h-11 rounded-xl border border-slate-300 items-center justify-center"
              >
                <Text className="font-poppins-bold text-slate-700">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={saving}
                onPress={() => {
                  const signature = zeroConfirmationSignature;
                  setShowZeroMarkConfirmation(false);
                  void handlePublish(signature);
                }}
                className={`flex-1 h-11 rounded-xl items-center justify-center ${saving ? 'bg-slate-400' : 'bg-amber-700'}`}
              >
                <Text className="font-poppins-bold text-white">Confirm & Publish</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Re-Entry Modal */}
      {editingRegistration && schedule && activeFestival && (
        <AdminMarkEntryModal
          visible={true}
          onClose={() => setEditingRegistration(null)}
          scheduleId={scheduleId as string}
          registrationId={editingRegistration.id}
          participantName={editingRegistration.participants?.name ?? 'Unknown'}
          codeLetter={registrations.find((reg: any) => reg.id === editingRegistration.id)?.code_letter ?? editingRegistration.code_letter}
          tenantId={schedule.tenant_id}
          itemNameEn={schedule.items?.item_name_en}
          itemNameMl={schedule.items?.item_name_ml}
          itemType={schedule.items?.type}
          existingMarks={getJudgeMarks(editingRegistration.id)}
          assignedJudges={schedule.assigned_judges}
        />
      )}

      {/* Direct Mark Entry Modal */}
      {directEntryModal && schedule && activeFestival && (
        <DirectMarkEntryModal
          visible={true}
          onClose={() => setDirectEntryModal(null)}
          onSave={(marks, maxMark) => {
             setDirectMarks(prev => {
                const regState = prev[directEntryModal.regId] || { marks: {}, maxMark };
                return {
                   ...prev,
                   [directEntryModal.regId]: {
                      ...regState,
                      marks: { ...regState.marks, ...marks },
                      maxMark
                   }
                };
             });
          }}
          participantName={directEntryModal.participantName}
          codeLetter={registrations.find((reg: any) => reg.id === directEntryModal.regId)?.code_letter ?? directEntryModal.codeLetter}
          tenantId={schedule.tenant_id}
          itemNameEn={schedule.items?.item_name_en}
          itemNameMl={schedule.items?.item_name_ml}
          itemType={schedule.items?.type}
          judgeIndex={directEntryModal.judgeIndex}
          judgeCount={expectedJudges}
          initialMarks={directMarks[directEntryModal.regId]?.marks ?? {}}
        />
      )}
    </View>
  );
}
