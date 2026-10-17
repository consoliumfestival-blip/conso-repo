import { AdminMarkEntryModal } from '../../../../components/ui/AdminMarkEntryModal';
import { DirectMarkEntryModal } from '../../../../components/ui/DirectMarkEntryModal';
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
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
import { useEntrySizes } from './useEntrySizes';
import { useFestival } from '../../../../core/hooks/useFestival';
import {
  calculateFlexiblePoints,
  calculateGradeFromConfig,
  normalizePointsConfig,
  resolvePointBracket,
} from '../../../../core/utils/flexiblePointsEngine';
import { pointsService } from '../../../../services/pointsService';

// ─── Constants ────────────────────────────────────────────────────────────────
const RANKS = ['1st', '2nd', '3rd', '4th', '5th'] as const;
const GRADES = ['A+', 'A', 'B', 'C', '-'] as const;

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

  const { updateSchedule } = useSchedule();

  const { useScheduleRegistrations } = useParticipants();
  const { data: itemRegistrations, isLoading } = useScheduleRegistrations(scheduleId);
  const registrations = React.useMemo(
    () => (itemRegistrations || []).filter((registration: any) =>
      registration.status !== 'rejected' && registration.is_verified === true && !!registration.code_letter
    ),
    [itemRegistrations],
  );
  const { data: markEntries } = useMarkEntries(scheduleId);
  const { data: existingResults } = useResults(scheduleId);
  const { data: pointsConfig } = usePointsConfig(resolvedFestivalId ?? undefined);
  const { data: judgeSummary } = useJudgeSubmissionSummary(scheduleId);
  const flexiblePointsConfig = React.useMemo(
    () => normalizePointsConfig(pointsConfig),
    [pointsConfig],
  );

  const isGeneralItem = React.useMemo(() => {
    const codes = (schedule?.items?.category_codes as string[]) || [];
    return codes.includes('GN') || codes.includes('GENERAL');
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
  
  const [officialBracket, setOfficialBracket] = useState<string>('1');
  const [bracketManuallyOverridden, setBracketManuallyOverridden] = useState(false);
  const [forceRepublishConfirmed, setForceRepublishConfirmed] = useState(false);
  
  const hasInitialized = React.useRef(false);

  // Init results from existing results or registrations
  React.useEffect(() => {
    if (schedule) {
      setOfficialBracket(schedule.official_participant_bracket || '1');
    }
    
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
  const defaultGroupSize = React.useMemo(() => {
    if (!entrySizes) return 1;
    const sizes = Object.values(entrySizes) as number[];
    if (sizes.length === 0) return 1;
    return Math.max(...sizes); // Safe assumption: all entries in a group event have the same size.
  }, [entrySizes]);

  const effectiveGroupSize = React.useMemo(() => {
    if (isGeneralItem && manualGeneralSize !== null) return manualGeneralSize;
    return defaultGroupSize;
  }, [isGeneralItem, manualGeneralSize, defaultGroupSize]);

  const automaticBracket = resolvePointBracket(
    flexiblePointsConfig,
    effectiveGroupSize,
    isGroupEvent,
  );
  const resolvedBracketKey =
    !isGroupEvent
      ? (automaticBracket?.key ?? '1')
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
    const entries = getJudgeMarks(regId).filter((e: any) => e.is_final || e.total_mark != null);
    if (!entries.length) return null;
    const rawAverage = entries.reduce(
      (sum: number, entry: any) => sum + Number(entry.total_mark ?? 0),
      0,
    ) / entries.length;
    const percentageAverage = entries.reduce((sum: number, entry: any) => {
      const maximum = Number(entry.max_mark_snapshot) || 100;
      return sum + ((Number(entry.total_mark ?? 0) / maximum) * 100);
    }, 0) / entries.length;
    const maxima = [...new Set(entries.map((entry: any) => Number(entry.max_mark_snapshot) || 100))];

    return {
      rawAverage: Math.round(rawAverage * 100) / 100,
      percentageAverage: Math.round(percentageAverage * 100) / 100,
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
    const maxMark = entry.maxMark || 100;
    const percentageAverage = (rawAverage / maxMark) * 100;
    
    return {
      rawAverage: Math.round(rawAverage * 100) / 100,
      percentageAverage: Math.round(percentageAverage * 100) / 100,
      commonMaximum: maxMark,
      count: values.length,
    };
  }, [directMarks]);

  const getAvgMark = React.useCallback(
    (regId: string) => {
      if (mode === 'direct') return getDirectMarkSummary(regId)?.rawAverage ?? null;
      return getMarkSummary(regId)?.rawAverage ?? null;
    },
    [getMarkSummary, getDirectMarkSummary, mode],
  );

  const getPointsPreview = (grade: string | null, rank: string | null) => {
    const rankNum = typeof rank === 'string' ? parseInt(rank.replace(/\D/g, ''), 10) : null;
    
    const calculation = calculateFlexiblePoints({
      grade,
      rank: Number.isFinite(rankNum) ? rankNum : null,
      groupSize: effectiveGroupSize,
      competingTeamsCount: (registrations as any[]).length,
      isGroup: isGroupEvent,
      config: flexiblePointsConfig,
      bracketOverride: resolvedBracketKey,
    });

    return {
      ...calculation,
      rankPts: calculation.rankPoints,
      gradePts: calculation.gradePoints,
    };
  };

  const expectedJudges = schedule?.expected_judge_count || 3;

  // Overall readiness banner for the schedule
  const overallReadiness = React.useMemo(() => {
    if (published) return { label: '✅ Results Published', color: 'bg-green-100', textColor: 'text-green-800' };
    
    const regs = (registrations as any[]) || [];
    if (!regs.length) return null;
    
    let fullyReadyCount = 0;
    let anySubmissions = false;

    regs.forEach(reg => {
      if (mode === 'direct') {
         const marksCount = directMarks[reg.id] ? Object.keys(directMarks[reg.id].marks).length : 0;
         if (marksCount > 0) anySubmissions = true;
         if (marksCount >= expectedJudges) fullyReadyCount++;
      } else {
         const marks = getJudgeMarks(reg.id).filter((m: any) => m.is_final || m.total_mark != null);
         if (marks.length > 0) anySubmissions = true;
         if (marks.length >= expectedJudges) fullyReadyCount++;
      }
    });

    if (fullyReadyCount === regs.length && regs.length > 0) {
      return { label: '🟢 All judges submitted — Ready for Calculation', color: 'bg-green-50', textColor: 'text-green-700' };
    }
    if (anySubmissions) {
      return { label: `🟠 ${fullyReadyCount}/${regs.length} participants ready`, color: 'bg-orange-50', textColor: 'text-orange-700' };
    }
    return { label: '🟡 Waiting for judge submissions', color: 'bg-yellow-50', textColor: 'text-yellow-700' };
  }, [registrations, expectedJudges, published, getJudgeMarks, mode, directMarks]);

  const hasAtLeastOneResult = React.useMemo(() => {
    return Object.values(results).some(
      r => (r.rank && r.rank !== '-') || (r.grade && r.grade !== '-')
    );
  }, [results]);

  const autoFill = React.useCallback(() => {
    if (!registrations) return;

    // 1. Calculate avgs and grades
    const scores = (registrations as any[]).map(reg => {
      const markSummary = mode === 'direct' ? getDirectMarkSummary(reg.id) : getMarkSummary(reg.id);
      const normalizedAverage = markSummary?.percentageAverage ?? null;
      let grade = normalizedAverage !== null
        ? calculateGradeFromConfig(normalizedAverage, 100, flexiblePointsConfig)
        : null;
      // Convert null to '-'
      if (!grade) grade = '-';
      return {
        id: reg.id,
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
  }, [registrations, markEntries, getMarkSummary, getDirectMarkSummary, flexiblePointsConfig, mode]);

  // Run auto-calculation whenever in marks or direct mode and data is available
  React.useEffect(() => {
    if (mode === 'marks' || mode === 'direct') {
      autoFill();
    }
  }, [mode, autoFill, directMarks, markEntries]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!officialBracket) {
      if (Platform.OS === 'web') window.alert('Validation Error: Please select the Official Participant Bracket before publishing.');
      else Alert.alert('Validation Error', 'Please select the Official Participant Bracket before publishing.');
      return;
    }

    if (mode === 'marks' || mode === 'direct') {
      const regs = (registrations as any[]) || [];
      let missingMarksCount = 0;
      let anySubmissions = false;

      regs.forEach(reg => {
        let count = 0;
        if (mode === 'direct') {
          count = directMarks[reg.id] ? Object.keys(directMarks[reg.id].marks).length : 0;
        } else {
          count = getJudgeMarks(reg.id).filter((m: any) => m.is_final || m.total_mark != null).length;
        }
        
        if (count === 0) {
          missingMarksCount++;
        } else {
          anySubmissions = true;
        }
      });

      if (anySubmissions && missingMarksCount > 0) {
        const warnMsg = `⚠️ WARNING: ${missingMarksCount} participant(s) have NOT received any marks! Are you absolutely sure you want to publish the results now?`;
        
        if (Platform.OS === 'web') {
          const confirmed = window.confirm(warnMsg);
          if (!confirmed) return;
        } else {
          const confirmed = await new Promise((resolve) => {
            Alert.alert('Incomplete Marks Warning', warnMsg, [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Publish Anyway', style: 'destructive', onPress: () => resolve(true) }
            ]);
          });
          if (!confirmed) return;
        }
      }
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
    
    setSaving(true);
    try {
      if (!resolvedFestivalId) {
        throw new Error('Festival is missing for this schedule.');
      }

      const payloads = await Promise.all(Object.values(results).map(async (r) => {
        const cleanedRank = typeof r.rank === 'string' ? r.rank.replace(/\D/g, '') : '';
        const rankNum = cleanedRank && cleanedRank.length > 0 ? parseInt(cleanedRank, 10) : null;
        
        // The server is authoritative; the shared client engine is used for preview.
        const normalizedGrade = r.grade && r.grade !== '-' ? r.grade : null;
        
        const calculation = await pointsService.calculateAward({
          festivalId: resolvedFestivalId,
          grade: normalizedGrade,
          rank: rankNum,
          groupSize: effectiveGroupSize,                        // members per team entry → picks bracket
          competingTeamsCount: (registrations as any[]).length, // total teams competing → Rule 12 check
          isGroup: isGroupEvent,
          bracketOverride: resolvedBracketKey,
        });
        const avgMark = getAvgMark(r.registration_id);

        return {
          tenant_id: schedule?.tenant_id,
          festival_id: resolvedFestivalId,   // always populated via fallback
          item_id: schedule?.item_id,
          schedule_id: scheduleId,
          registration_id: r.registration_id,
          total_score: avgMark,
          rank: rankNum,
          grade: normalizedGrade,
          points_awarded: calculation.total,
          grade_only: calculation.grade_only,
          points_config_version: calculation.config_version,
          points_calculation: {
            rank_points: calculation.rank_points,
            grade_points: calculation.grade_points,
            bracket_key: calculation.bracket_key,
            bracket_label: calculation.bracket_label,
            participant_count: calculation.participant_count,
            is_group: calculation.is_group,
            rule12_applied: calculation.rule12_applied,
            rule12_behavior: calculation.rule12_behavior,
            points_mode: calculation.points_mode,
            grade_thresholds: flexiblePointsConfig.thresholds,
          },
          published: true,
          published_at: new Date().toISOString(),
          result_status: 'published',
          public_visible: false,
          collection_method: mode === 'direct' ? 'manual' : 'judges',
        };
      }));

      // Update both results and the schedule's official bracket together
      await Promise.all([
        publishResultsMutation.mutateAsync(payloads),
        updateSchedule({ id: scheduleId, payload: { official_participant_bracket: resolvedBracketKey } })
      ]);
      
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

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const setField = (regId: string, field: 'rank' | 'grade', value: string) => {
    setResults(prev => ({
      ...prev,
      [regId]: { ...prev[regId], [field]: value === '-' ? null : value },
    }));
  };

  if (isLoading) return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 60 }} />;

  // ── Mode selector screen ───────────────────────────────────────────────────
  if (mode === 'none') {
    return (
      <View className="flex-1 bg-ssf-bg">
        <View className="border-b border-ui-border bg-white px-4 py-3">
          <View className="flex-row items-center mb-2">
            <TouchableOpacity onPress={goBack} className="mr-3 h-9 w-9 items-center justify-center rounded-lg border border-ui-border bg-white">
              <ArrowLeft size={18} color="#0F172A" />
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
            className="bg-white border border-ssf-primary rounded-lg p-4"
          >
            <View className="flex-row items-center gap-x-3 mb-2">
              <View className="w-10 h-10 rounded-full bg-ssf-primary/10 items-center justify-center">
                <ClipboardList size={20} color="#1B6B3A" />
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
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <View className="flex-row items-center gap-x-3 mb-2">
                <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
                  <PenLine size={20} color="#6B7280" />
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
      <View className="border-b border-ui-border bg-white px-4 py-3">
        <View className="flex-row items-center mb-1">
          <TouchableOpacity onPress={() => setMode('none')} className="mr-3 h-9 w-9 items-center justify-center rounded-lg border border-ui-border bg-white">
            <ArrowLeft size={18} color="#0F172A" />
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
        {/* Readiness Banner (marks mode only) */}
        {mode === 'marks' && overallReadiness && (
          <View className={`${overallReadiness.color} border border-amber-200 rounded-lg px-3 py-2.5 mb-3`}>
            <Text className={`font-poppins-bold text-[12px] ${overallReadiness.textColor}`}>
              {overallReadiness.label}
            </Text>
            {judgeSummary && (judgeSummary as any[]).length > 0 && (
              <View className="mt-1.5 gap-y-0.5">
                {(judgeSummary as any[]).map((j: any, idx: number) => {
                  const submitted = Number(j.submitted_count) || 0;
                  const total = Number(j.total_assigned) || 0;
                  return (
                    <Text key={j.judge_id} className="font-poppins text-[10px] text-gray-600">
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
          {isGeneralItem && (
            <SsfCard className={`mb-3 p-3 ${!isGroupEvent ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
              {!isGroupEvent && (
                <View className="mb-3">
                  <Text className="font-poppins-bold text-amber-900 text-[12px] mb-1">
                    Warning: General Item Registered as Individual
                  </Text>
                  <Text className="font-poppins text-[10px] text-amber-800 leading-4">
                    ശ്രദ്ധിക്കുക: ഇതൊരു ജനറൽ ഐറ്റം ആണ്, എന്നാൽ സെറ്റിംഗ്സിൽ 'Individual' എന്നാണ് കൊടുത്തിരിക്കുന്നത്. ശരിയായ ഗ്രേഡ് പോയിൻ്റ് ലഭിക്കുന്നതിന് ദയവായി Settings -&gt; Items പോയി ഇതിനെ 'Group' ആക്കി മാറ്റുക.
                  </Text>
                </View>
              )}
              
              <View>
                <Text className="font-poppins-bold text-blue-900 text-[12px] mb-1">
                  General Item Members Count
                </Text>
                <Text className="font-poppins text-[10px] text-blue-800 mb-2 leading-4">
                  ഈ ജനറൽ ഐറ്റത്തിൽ എത്ര പേർ പങ്കെടുത്തു എന്ന് താഴെ നിന്ന് സെലക്ട് ചെയ്യുക. ഇതിനനുസരിച്ചായിരിക്കും ഗ്രേഡ് പോയിൻ്റ് കണക്കാക്കുക.
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                    <TouchableOpacity
                      key={num}
                      onPress={() => setManualGeneralSize(num)}
                      disabled={!isGroupEvent}
                      className={`px-3 py-1.5 rounded-md border ${manualGeneralSize === num ? 'bg-ssf-primary border-ssf-primary' : 'bg-white border-ui-border'} ${!isGroupEvent ? 'opacity-50' : ''}`}
                    >
                      <Text className={`font-poppins-bold text-xs ${manualGeneralSize === num ? 'text-white' : 'text-ui-text'}`}>{num}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </SsfCard>
          )}

        {/* Official Participant Bracket Configuration */}
        {isGroupEvent && (
        <SsfCard className="mb-3 border-blue-200 p-3">
          <Text className="font-poppins-bold text-blue-900 text-[12px] mb-0.5">
            👥 ഈ മത്സരത്തിൽ ഒരു ടീമിൽ എത്ര കുട്ടികളുണ്ട്?
          </Text>
          <Text className="font-poppins text-[10px] text-blue-700 mb-2 leading-4">
            {flexiblePointsConfig.autoBracketSelection && !bracketManuallyOverridden
              ? `Calculated from ${defaultGroupSize} members per entry → ${resolvedBracketKey} default bracket selected automatically.`
              : 'Select the participant bracket for grade calculation. Manual overrides are stored with the result.'}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {flexiblePointsConfig.brackets.filter((bracket) => bracket.enabled).map((bracket) => {
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
                      ? 'bg-blue-600 border-blue-600' 
                      : isDisabled 
                        ? 'bg-gray-100 border-gray-200 opacity-50' 
                        : 'bg-white border-blue-200'
                  }`}
                >
                  <Text className={`font-poppins-bold text-[10px] ${isSelected ? 'text-white' : isDisabled ? 'text-gray-400' : 'text-blue-800'}`}>
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
          const ptsPreview = getPointsPreview(entry?.grade ?? null, entry?.rank ?? null);
          const directEntryMarksCount = directMarks[reg.id] ? Object.keys(directMarks[reg.id].marks).length : 0;

          return (
            <SsfCard key={reg.id} className="mb-2.5 border-emerald-100 p-3">
              {/* Code Letter + avg (if marks mode) */}
              <View className="flex-row justify-between items-center mb-2 pb-2 border-b border-gray-100">
                <View className="flex-row items-center gap-x-2">
                  <View className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 items-center justify-center">
                    <Text className="font-poppins-black text-emerald-700 text-sm">
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
                  <View className="bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md">
                    <Text className="font-poppins-bold text-emerald-700 text-[10px]">
                      {markSummary?.commonMaximum
                        ? `Avg: ${avg}/${markSummary.commonMaximum}`
                        : `Avg: ${markSummary?.percentageAverage}%`}
                    </Text>
                  </View>
                )}
              </View>

              {/* Judge marks breakdown — marks mode only */}
              {mode === 'marks' && (
                <View className="border-l-2 border-blue-200 pl-3 py-1 mb-2">
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="font-poppins-bold text-[10px] text-ssf-text-muted">
                    Judge Marks:
                    </Text>
                    {!published && (
                      <TouchableOpacity onPress={() => setEditingRegistration(reg)} className="bg-blue-50 border border-blue-200 px-2 py-1 rounded shadow-sm">
                        <Text className="text-blue-700 font-poppins-bold text-[10px]">?? Edit Marks</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {judgeMarks.map((m: any, i: number) => (
                    <View key={m.id} className="flex-row justify-between mb-1">
                      <Text className="font-poppins text-[10px] text-ssf-text">
                        {m.judges?.name ?? `Judge ${i + 1}`}
                      </Text>
                      <Text className="font-poppins-bold text-[10px] text-ssf-primary">
                        {m.total_mark}/{m.max_mark_snapshot || 100} {m.is_final ? '✓' : '(draft)'}
                      </Text>
                    </View>
                  ))}
                  {judgeMarks.length === 0 && (
                     <Text className="font-poppins text-[10px] text-gray-500 italic mt-1">No marks submitted yet.</Text>
                  )}
                  {judgeMarks.length > 0 && judgeMarks.length < expectedJudges && (
                    <Text className="font-poppins text-[10px] text-orange-600 mt-1">
                      ?? Only {judgeMarks.length}/{expectedJudges} judges submitted
                    </Text>
                  )}
                </View>
              )}

              {/* Direct Entry Marks breakdown */}
              {mode === 'direct' && (
                <View className="border-l-2 border-purple-200 pl-3 py-1 mb-3">
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
                      const maxVal = directMarks[reg.id]?.maxMark || 100;
                      
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
                          className={`flex-row items-center justify-between px-3 py-1.5 rounded-lg border ${hasMark ? 'bg-purple-50 border-purple-200' : 'bg-white border-dashed border-gray-300'} ${published ? 'opacity-70' : ''}`}
                        >
                          <Text className={`font-poppins text-[10px] ${hasMark ? 'text-purple-800' : 'text-gray-500'}`}>
                            Judge {judgeIndex}
                          </Text>
                          {hasMark && (
                            <Text className="font-poppins-bold text-[10px] text-purple-900 ml-2">
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
                  <View className="h-9 flex-row items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3">
                    <Text className="font-poppins-bold text-[11px] text-emerald-800">
                      {entry?.rank && entry.rank !== '-' ? entry.rank : 'No rank'}
                    </Text>
                    <Text className="font-poppins text-[9px] text-emerald-700">Calculated from marks</Text>
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
                  <View className="h-9 flex-row items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3">
                    <Text className="font-poppins-black text-[11px] text-blue-800">
                      {entry?.grade && entry.grade !== '-' ? entry.grade : 'No grade'}
                    </Text>
                    <Text className="font-poppins text-[9px] text-blue-700">Calculated from marks</Text>
                  </View>
                ) : (
                  <View />
                )}
              </View>

              {/* Point Preview per Participant for Audit Visibility */}
              <View className="mt-3 pt-2 border-t border-gray-100 flex-row justify-between items-center">
                <Text className="font-poppins-bold text-[10px] text-ssf-text-muted">
                  Points Preview:
                </Text>
                <View className="flex-row items-center gap-x-2">
                  <Text className="font-poppins text-[10px] text-gray-600">
                    Rnk: <Text className="font-poppins-bold">{ptsPreview.rankPts}</Text>
                  </Text>
                  <Text className="font-poppins text-[10px] text-gray-400">+</Text>
                  <Text className="font-poppins text-[10px] text-gray-600">
                    Grd: <Text className="font-poppins-bold text-green-700">{ptsPreview.gradePts}</Text>
                  </Text>
                  <Text className="font-poppins text-[10px] text-gray-400">=</Text>
                  <View className="bg-ssf-primary/10 px-2 py-0.5 rounded">
                    <Text className="font-poppins-bold text-[11px] text-ssf-primary">
                      {ptsPreview.total} pts
                    </Text>
                  </View>
                </View>
              </View>
              {ptsPreview.rule12Applies && (
                <View className="self-start bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg mt-2">
                  <Text className="font-poppins-bold text-[10px] text-amber-700">
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
      <View className="border-t border-ui-border bg-white px-3 py-3">
        {published && forceRepublishConfirmed && (
          <View className="bg-red-50 border border-red-200 p-2 rounded-t-xl -mb-2 z-0 flex-row items-center justify-center">
            <Text className="font-poppins-bold text-[10px] text-red-600 text-center">
              ⚠️ Republishing is unlocked. Points will be re-calculated with new bracket!
            </Text>
          </View>
        )}
        <View className="flex-row gap-x-2">
          {mode === 'marks' && (
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === 'web') {
                  const ans = window.prompt("Security Check: Enter Admin Password (Tenant ID) to unlock marks:");
                  if (ans === schedule?.tenant_id) {
                    unlockScheduleMarks.mutate(scheduleId, { onSuccess: () => setPublished(false) });
                  } else if (ans !== null) {
                    window.alert("Incorrect Password! Marks were not unlocked.");
                  }
                } else {
                  Alert.alert(
                    "Unlock All Marks",
                    "Security Notice: Unlocking will unpublish results and allow mark edits. Proceed?",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Yes, Unlock All", style: "destructive", onPress: () => unlockScheduleMarks.mutate(scheduleId, { onSuccess: () => setPublished(false) }) }
                    ]
                  );
                }
              }}
              disabled={unlockScheduleMarks.isPending}
              className={`h-12 px-4 rounded-xl items-center justify-center border border-red-200 bg-red-50 ${unlockScheduleMarks.isPending ? 'opacity-50' : ''}`}
            >
              <Text className="font-poppins-bold text-red-700">🔓 Unlock Marks</Text>
            </TouchableOpacity>
          )}
          <View className="flex-1">
            <SsfButton
              label={(published && !forceRepublishConfirmed) ? '✅ Results Published' : '🚀 Publish Results'}
              onPress={handlePublish}
              isLoading={saving}
              disabled={!hasAtLeastOneResult}
              className={`${published && !forceRepublishConfirmed ? 'opacity-80' : ''} ${!hasAtLeastOneResult ? 'opacity-50' : ''}`}
            />
          </View>
        </View>
      </View>

      {/* Admin Re-Entry Modal */}
      {editingRegistration && schedule && activeFestival && (
        <AdminMarkEntryModal
          visible={true}
          onClose={() => setEditingRegistration(null)}
          scheduleId={scheduleId as string}
          registrationId={editingRegistration.id}
          participantName={editingRegistration.participants?.name ?? 'Unknown'}
          codeLetter={editingRegistration.code_letter}
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
          onSave={(totalMark, maxMark) => {
             setDirectMarks(prev => {
                const regState = prev[directEntryModal.regId] || { marks: {}, maxMark: 100 };
                return {
                   ...prev,
                   [directEntryModal.regId]: {
                      ...regState,
                      marks: {
                         ...regState.marks,
                         [directEntryModal.judgeIndex]: totalMark
                      },
                      maxMark
                   }
                };
             });
          }}
          participantName={directEntryModal.participantName}
          codeLetter={directEntryModal.codeLetter}
          tenantId={schedule.tenant_id}
          itemNameEn={schedule.items?.item_name_en}
          itemNameMl={schedule.items?.item_name_ml}
          itemType={schedule.items?.type}
          judgeIndex={directEntryModal.judgeIndex}
          initialTotal={directMarks[directEntryModal.regId]?.marks?.[directEntryModal.judgeIndex]}
        />
      )}
    </View>
  );
}