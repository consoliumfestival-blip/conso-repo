import { ui } from '@/constants/designSystem';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Platform, Modal, TextInput } from 'react-native';
import { X, Save, AlertTriangle, UserCircle } from 'lucide-react-native';
import { SsfButton } from './SsfButton';
import { useJudges } from '../../core/hooks/useJudges';
import { getScoringRulesForItem, formatCriteriaForUI, ScoringEntryMode } from '../../core/utils/scoringRules';

interface Props {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  registrationId: string;
  participantName: string;
  codeLetter: string;
  tenantId: string;
  itemNameEn: string;
  itemNameMl: string;
  itemType: string;
  existingMarks: any[];
  assignedJudges?: { judge_id: string; judge_name: string }[];
}

export function AdminMarkEntryModal({
  visible,
  onClose,
  scheduleId,
  registrationId,
  participantName,
  codeLetter,
  tenantId,
  itemNameEn,
  itemNameMl,
  itemType,
  existingMarks,
  assignedJudges = [],
}: Props) {
  const { adminUpsertMark } = useJudges();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [eventCriteria, setEventCriteria] = useState<any[]>([]);
  const [entryMode, setEntryMode] = useState<ScoringEntryMode>('criteria');
  const [eventTotalMarks, setEventTotalMarks] = useState(100);
  
  const [selectedJudgeId, setSelectedJudgeId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  
  // Extract unique judges from assignedJudges or existing marks
  const judges = assignedJudges.length > 0 
    ? assignedJudges.map((j: any) => j.judge_id)
    : Array.from(new Set(existingMarks.map(m => m.judge_id)));

  useEffect(() => {
    if (visible) {
      loadCriteria();
      if (judges.length > 0) {
        handleSelectJudge(judges[0]);
      } else {
        // If no judges exist, we shouldn't really be editing a mark, but we allow creating one?
        // Let's generate a pseudo UUID for an admin override if none exists.
        const mockJudgeId = '00000000-0000-0000-0000-000000000000';
        handleSelectJudge(mockJudgeId);
      }
    }
  }, [visible]);

  const loadCriteria = async () => {
    setLoading(true);
    try {
      const rules = await getScoringRulesForItem(itemNameEn, itemNameMl, itemType as any, tenantId);
      setEventCriteria(formatCriteriaForUI(rules.criteria));
      setEntryMode(rules.entry_mode);
      setEventTotalMarks(rules.entry_mode === 'total_only' ? 100 : rules.total_marks);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectJudge = (judgeId: string) => {
    setSelectedJudgeId(judgeId);
    const existingMark = existingMarks.find(m => m.judge_id === judgeId);
    if (existingMark) {
      if (existingMark.entry_mode_snapshot === 'total_only') {
        setScores({ total: Number(existingMark.total_mark ?? 0) });
      } else {
        setScores(existingMark.criteria_scores || {});
      }
    } else {
      setScores({});
    }
  };

  const updateScore = (key: string, val: number, max: number) => {
    if (val > max) {
      if (Platform.OS === 'web') window.alert(`Maximum mark is ${max}`);
      return;
    }
    setScores(prev => ({ ...prev, [key]: val }));
  };

  const getTotal = () => {
    return entryMode === 'total_only'
      ? Number(scores.total ?? 0)
      : Object.values(scores).reduce((a, b) => a + b, 0);
  };

  const handleSubmit = async () => {
    if (!selectedJudgeId) return;
    setSubmitting(true);
    try {
      const total = getTotal();
      const criteriaSnapshot = eventCriteria.map(c => ({
        key: c.key,
        label: c.label,
        max: c.max,
      }));
      
      await adminUpsertMark({
        scheduleId,
        judgeId: selectedJudgeId,
        registrationId,
        criteriaScores: entryMode === 'total_only' ? {} : scores,
        totalMark: total,
        maxMark: eventTotalMarks,
        criteriaSnapshot: entryMode === 'criteria' ? criteriaSnapshot : [],
        status: 'final',
      });
      
      if (Platform.OS === 'web') {
        window.alert('Mark updated successfully!');
      } else {
        Alert.alert('Success', 'Mark updated successfully!');
      }
      onClose();
    } catch (err: any) {
      if (Platform.OS === 'web') {
        window.alert(err.message);
      } else {
        Alert.alert('Error', err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/50 justify-end sm:justify-center p-4">
        <View className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg mx-auto overflow-hidden flex-shrink-1">
          <View className="flex-row items-center justify-between p-4 border-b border-ui-border bg-orange-50">
            <View>
              <View className="flex-row items-center gap-2">
                <AlertTriangle size={16} color="#EA580C" />
                <Text className="font-poppins-bold text-orange-600 uppercase text-[10px] tracking-wider">Admin Re-Entry</Text>
              </View>
              <Text className="font-poppins-bold text-base text-ui-text mt-1">{participantName}</Text>
              <Text className="font-poppins text-xs text-ui-text-muted">Code: {codeLetter}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="w-8 h-8 rounded-full bg-orange-100 items-center justify-center">
              <X size={20} color="#EA580C" />
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <View className="p-8 items-center"><Text>Loading rules...</Text></View>
          ) : (
            <ScrollView className="p-4" keyboardShouldPersistTaps="handled">
              
              {/* Judge Selector (if multiple) */}
              {judges.length > 1 && (
                <View className="mb-4">
                  <Text className="font-poppins-bold text-xs text-slate-500 uppercase mb-2">Select Judge to Edit</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View className="flex-row gap-2">
                      {judges.map((jId: string, idx: number) => (
                        <TouchableOpacity
                          key={jId}
                          onPress={() => handleSelectJudge(jId)}
                          className={`flex-row items-center px-3 py-2 rounded-xl border ${selectedJudgeId === jId ? 'bg-orange-100 border-orange-300' : 'bg-slate-50 border-slate-200'}`}
                        >
                          <UserCircle size={14} color={selectedJudgeId === jId ? '#EA580C' : ui.colors.textMuted} />
                          <Text className={`font-poppins ml-2 text-xs ${selectedJudgeId === jId ? 'text-orange-700' : 'text-slate-600'}`}>
  {assignedJudges.find((j: any) => j.judge_id === jId)?.judge_name || `Judge ${idx + 1}`}
</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Mark Entry UI */}
              <View className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-4">
                {entryMode === 'total_only' ? (
                  <View className="flex-row items-center justify-between">
                    <Text className="font-poppins text-slate-700">Total Marks</Text>
                    <View className="flex-row items-center bg-white border border-slate-300 rounded-lg overflow-hidden">
                      <TextInput
                        keyboardType="numeric"
                        value={scores.total !== undefined ? scores.total.toString() : ''}
                        onChangeText={(val) => updateScore('total', Number(val), 100)}
                        style={{ width: 60, height: 40, textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}
                      />
                      <View className="bg-slate-100 h-full px-2 justify-center border-l border-slate-200">
                        <Text className="font-poppins text-xs text-slate-500">/ 100</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  eventCriteria.map(c => (
                    <View key={c.key} className="mb-3 flex-row justify-between items-center border-b border-slate-200 pb-3 last:border-b-0 last:pb-0 last:mb-0">
                      <View className="flex-1 pr-4">
                        <Text className="font-poppins text-slate-700 text-sm">{c.label}</Text>
                        <Text className="font-poppins text-slate-400 text-[10px]">Max {c.max} marks</Text>
                      </View>
                      <View className="flex-row items-center bg-white border border-slate-300 rounded-lg overflow-hidden">
                        <TextInput
                          keyboardType="numeric"
                          value={scores[c.key] !== undefined ? scores[c.key].toString() : ''}
                          onChangeText={(val) => updateScore(c.key, Number(val), c.max)}
                          style={{ width: 50, height: 36, textAlign: 'center', fontSize: 14, fontWeight: 'bold' }}
                        />
                      </View>
                    </View>
                  ))
                )}
                
                {entryMode === 'criteria' && (
                  <View className="mt-4 pt-3 border-t border-slate-200 flex-row justify-between items-center">
                    <Text className="font-poppins-bold text-slate-700 text-sm">Total Calculated</Text>
                    <Text className="font-poppins-black text-lg text-slate-800">{getTotal()} <Text className="text-xs text-slate-500 font-poppins">/ {eventTotalMarks}</Text></Text>
                  </View>
                )}
              </View>

              <SsfButton 
                label={submitting ? "Saving..." : "Save Admin Re-Entry"} 
                onPress={handleSubmit} 
                disabled={submitting} 
                className="w-full bg-orange-600"
              />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
