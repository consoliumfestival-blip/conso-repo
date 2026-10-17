import { ui } from '@/constants/designSystem';
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { ArrowLeft, UserCheck, Save, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useJudges } from '../../../../core/hooks/useJudges';
import { useParticipants } from '../../../../core/hooks/useParticipants';
import { useSchedule } from '../../../../core/hooks/useSchedule';
import { calculateGrade } from '../../../../services/judgeService';
import { useAuthStore } from '../../../../core/store/authStore';

import { getScoringRulesForItem, formatCriteriaForUI } from '../../../../core/utils/scoringRules';

export default function MarkEntryPage() {
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const goBack = useGoBack('/(admin)/schedule');
  const { tenant_id } = useAuthStore();

  const { schedules } = useSchedule();
  const schedule = schedules?.find((s: any) => s.id === scheduleId);

  const {
    judges,
    useMarkEntries,
    saveMarkEntry,
    finalizeMarkEntry,
    useJudgeSubmissionSummary,
  } = useJudges();

  // Keep mark entry aligned with the Code Letter page. Both pages must read
  // the same item registrations; the old schedule RPC applied a stricter
  // organisation-tree filter and could hide participants that already had
  // code letters assigned.
  const { useScheduleRegistrations } = useParticipants();
  const { data: itemRegistrations, isLoading: loadingRegs } = useScheduleRegistrations(scheduleId);
  const registrations = React.useMemo(
    () => (itemRegistrations || []).filter((registration: any) =>
      registration.status !== 'rejected' && registration.is_verified === true && !!registration.code_letter
    ),
    [itemRegistrations],
  );
  const { data: markEntries, refetch: refetchMarks } = useMarkEntries(scheduleId);
  const { data: judgeSummary } = useJudgeSubmissionSummary(scheduleId);

  // Local state: marks[registrationId][judgeId] = { criteria_scores, total_mark }
  const [marks, setMarks] = useState<Record<string, Record<string, Record<string, number>>>>({});
  const [selectedJudge, setSelectedJudge] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [eventCriteria, setEventCriteria] = useState<any[]>([]);

  // Sync loaded marks from database to local state so Admin can see judge inputs
  React.useEffect(() => {
    if (markEntries && Array.isArray(markEntries)) {
      setMarks(prev => {
        // Use deep clone to ensure React re-renders correctly on nested changes
        const newMarks = JSON.parse(JSON.stringify(prev));
        let hasChanges = false;
        
        markEntries.forEach(entry => {
          if (!newMarks[entry.registration_id]) {
            newMarks[entry.registration_id] = {};
            hasChanges = true;
          }
          
          const currentScores = newMarks[entry.registration_id][entry.judge_id];
          const dbScores = entry.criteria_scores || {};
          
          // If the scores in local state differ from DB, sync them!
          if (JSON.stringify(currentScores) !== JSON.stringify(dbScores)) {
            newMarks[entry.registration_id][entry.judge_id] = dbScores;
            hasChanges = true;
          }
        });
        
        return hasChanges ? newMarks : prev;
      });
    }
  }, [markEntries]);

  // Load criteria based on schedule item
  React.useEffect(() => {
    const fetchRules = async () => {
      if (schedule?.items) {
        const itemNameEn = schedule.items.item_name_en || '';
        const itemNameMl = schedule.items.item_name_ml || '';
        const itemType = schedule.items.item_type || 'stage';
        const rules = await getScoringRulesForItem(itemNameEn, itemNameMl, itemType as any, tenant_id || undefined);
        setEventCriteria(formatCriteriaForUI(rules.criteria));
      }
    };
    fetchRules();
  }, [schedule, tenant_id]);

  const judge = judges.find((j: any) => j.id === selectedJudge);

  const getTotal = (regId: string, judgeId: string) => {
    const scores = marks[regId]?.[judgeId] ?? {};
    return Object.values(scores).reduce((a, b) => a + b, 0);
  };

  // Get existing entry for a reg + judge
  const getEntry = (regId: string, judgeId: string) =>
    (markEntries as any[])?.find(
      m => m.registration_id === regId && m.judge_id === judgeId
    );

  if (loadingRegs) return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 60 }} />;

  return (
    <View className="flex-1 bg-ssf-bg">
      {/* Header */}
      <View className="border-b border-ui-border bg-white px-4 py-3">
        <View className="flex-row items-center mb-2">
          <TouchableOpacity onPress={goBack} className="mr-3 h-9 w-9 items-center justify-center rounded-lg border border-ui-border bg-white">
            <ArrowLeft size={18} color={ui.colors.text} />
          </TouchableOpacity>
          <Text className="text-lg font-poppins-black text-ssf-text flex-1" numberOfLines={1}>
            Mark Entry
          </Text>
        </View>
        <Text className="ml-12 text-[11px] font-poppins text-ssf-text-muted">
          {schedule?.items?.item_name_ml ?? 'Event'}
        </Text>

        {/* Judge Status Panel */}
        {judgeSummary && (judgeSummary as any[]).length > 0 && (
          <View className="mt-3 rounded-lg border border-ui-border bg-ui-muted p-3 gap-y-1.5">
            <Text className="font-poppins-bold text-ssf-text text-xs mb-1">Judge Status</Text>
            {(judgeSummary as any[]).map((j: any, idx: number) => {
              const total = Number(j.total_assigned) || 0;
              const submitted = Number(j.submitted_count) || 0;
              const allDone = submitted >= total && total > 0;
              const partial = submitted > 0 && !allDone;
              return (
                <View key={j.judge_id} className="flex-row items-center justify-between">
                  <Text className="font-poppins text-ssf-text text-xs flex-1" numberOfLines={1}>
                    {idx + 1}. {j.judge_name}
                  </Text>
                  <View className={`px-2 py-0.5 rounded-full ${
                    allDone ? 'bg-green-100' : partial ? 'bg-yellow-100' : 'bg-slate-100'
                  }`}>
                    <Text className={`font-poppins-bold text-xs ${
                      allDone ? 'text-green-700' : partial ? 'text-yellow-700' : 'text-slate-500'
                    }`}>
                      {allDone ? `✅ Submitted (${submitted}/${total})` :
                       partial ? `⏳ Partial (${submitted}/${total})` :
                       '❌ Pending'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Judge selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3 -mx-1">
          {judges.map((j: any) => (
            <TouchableOpacity
              key={j.id}
              onPress={() => setSelectedJudge(j.id)}
              className={`mx-1 px-3 py-1.5 rounded-full border ${
                selectedJudge === j.id
                  ? 'bg-ssf-primary border-ssf-primary'
                  : 'border-ui-border bg-white'
              }`}
            >
              <Text className={`font-poppins-bold text-xs ${
                selectedJudge === j.id ? 'text-white' : 'text-ssf-text'
              }`}>
                {j.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {!selectedJudge ? (
        <View className="flex-1 items-center justify-center px-6">
          <UserCheck size={48} color="#9CA3AF" />
          <Text className="font-poppins-bold text-ssf-text-muted mt-3 text-center">
            Select a judge above to start entering marks
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pt-4">
          {(!registrations || registrations.length === 0) ? (
            <SsfCard className="items-center py-8">
              <AlertCircle size={36} color="#9CA3AF" />
              <Text className="font-poppins text-ssf-text-muted mt-2 text-center">
                No participants with code letters found.{'\n'}Complete the Code Letter Draw first.
              </Text>
            </SsfCard>
          ) : (
            (registrations as any[]).map((reg) => {
              const entry = getEntry(reg.id, selectedJudge);
              const total = getTotal(reg.id, selectedJudge);
              const grade = calculateGrade(total, 100);
              const isSaving = saving === reg.id;
              const isFinalized = entry?.is_final === true;

              return (
                <SsfCard key={reg.id} className="mb-4">
                  {/* Code Letter header — judge sees CODE not name */}
                  <View className="flex-row justify-between items-center mb-3 pb-3 border-b border-gray-100">
                    <View className="flex-row items-center gap-x-2">
                      <View className="w-10 h-10 rounded-full bg-ssf-primary items-center justify-center">
                        <Text className="font-poppins-black text-white text-lg">
                          {reg.code_letter}
                        </Text>
                      </View>
                      <View>
                        <Text className="font-poppins-bold text-ssf-text">
                          Code: {reg.code_letter}
                        </Text>
                        <Text className="font-poppins text-xs text-ssf-text-muted">
                          {/* Judges see code letter only, not name */}
                          Participant #{reg.participants?.chest_number ?? '?'}
                        </Text>
                      </View>
                    </View>
                    {/* Grade badge */}
                    <View className={`px-3 py-1 rounded-full ${
                      grade === 'A+' ? 'bg-green-100' :
                      grade === 'A' ? 'bg-blue-50' :
                      grade === 'B' ? 'bg-yellow-50' :
                      grade === 'C' ? 'bg-orange-50' : 'bg-gray-50'
                    }`}>
                      <Text className={`font-poppins-black text-lg ${
                        grade === 'A+' ? 'text-green-700' :
                        grade === 'A' ? 'text-blue-700' :
                        grade === 'B' ? 'text-yellow-700' :
                        grade === 'C' ? 'text-orange-700' : 'text-gray-400'
                      }`}>{total > 0 ? `${grade}` : '—'}</Text>
                    </View>
                  </View>

                  {/* Criteria inputs */}
                  {eventCriteria.map(c => (
                    <View key={c.key} className="mb-3">
                      <View className="flex-row justify-between mb-1">
                        <Text className="font-poppins text-ssf-text text-sm">{c.label}</Text>
                        <Text className="font-poppins-bold text-ssf-primary text-sm">
                          {marks[reg.id]?.[selectedJudge]?.[c.key] ?? 0} / {c.max}
                        </Text>
                      </View>
                      <View className="flex-row gap-x-1 flex-wrap">
                        {Array.from({ length: c.max / 5 + 1 }, (_, i) => i * 5).map(val => (
                          <TouchableOpacity
                            key={val}
                            disabled={true}
                            className={`px-2.5 py-1 rounded-lg mb-1 border ${
                              (marks[reg.id]?.[selectedJudge]?.[c.key] ?? -1) === val
                                ? 'bg-ssf-primary border-ssf-primary'
                                : 'bg-gray-100 border-gray-200 opacity-80'
                            }`}
                          >
                            <Text className={`font-poppins-bold text-xs ${
                              (marks[reg.id]?.[selectedJudge]?.[c.key] ?? -1) === val
                                ? 'text-white' : 'text-gray-600'
                            }`}>{val}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ))}

                  {/* Total */}
                  <View className="bg-gray-50 rounded-xl p-3 mb-3 flex-row justify-between">
                    <Text className="font-poppins-bold text-ssf-text">Total Mark</Text>
                    <Text className="font-poppins-black text-ssf-primary text-lg">{total} / 100</Text>
                  </View>

                  {/* Status indicator */}
                  {entry && (
                    <View className={`flex-row items-center gap-x-2 mb-3 px-3 py-2 rounded-lg ${
                      entry.is_final ? 'bg-green-50' : 'bg-yellow-50'
                    }`}>
                      <CheckCircle2 size={14} color={entry.is_final ? '#16A34A' : ui.colors.warning} />
                      <Text className={`font-poppins text-xs ${entry.is_final ? 'text-green-700' : 'text-yellow-700'}`}>
                        {entry.is_final ? 'Finalized' : 'Draft saved'}
                      </Text>
                    </View>
                  )}

                </SsfCard>
              );
            })
          )}
          
          <View className="h-16" />
        </ScrollView>
      )}
    </View>
  );
}
