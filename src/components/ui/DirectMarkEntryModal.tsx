import { coreColor } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Platform, TextInput } from 'react-native';
import { X, UserCircle } from 'lucide-react-native';
import { SsfButton } from './SsfButton';
import { getScoringRulesForItem, formatCriteriaForUI, ScoringEntryMode } from '../../core/utils/scoringRules';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (marks: Record<number, number>, maxMark: number) => void;
  participantName: string;
  codeLetter: string;
  tenantId: string;
  itemNameEn: string;
  itemNameMl: string;
  itemType: string;
  judgeIndex: number;
  judgeCount: number;
  initialMarks: Record<number, number>;
}

export function DirectMarkEntryModal({
  visible,
  onClose,
  onSave,
  participantName,
  codeLetter,
  tenantId,
  itemNameEn,
  itemNameMl,
  itemType,
  judgeIndex,
  judgeCount,
  initialMarks,
}: Props) {
  
  const [loading, setLoading] = useState(true);
  const [eventCriteria, setEventCriteria] = useState<any[]>([]);
  const [entryMode, setEntryMode] = useState<ScoringEntryMode>('criteria');
  const [eventTotalMarks, setEventTotalMarks] = useState(NaN);
  const [ruleError, setRuleError] = useState('');
  
  const [selectedJudge, setSelectedJudge] = useState(judgeIndex);
  const [scoresByJudge, setScoresByJudge] = useState<Record<number, Record<string, number>>>({});
  const scores = scoresByJudge[selectedJudge] ?? {};
  
  // Snapshot the selected registration's marks when this dialog opens.
  useEffect(() => {
    if (visible) {
      loadCriteria();
      setSelectedJudge(judgeIndex);
      setScoresByJudge(Object.fromEntries(Object.entries(initialMarks).map(([index, total]) =>
        [Number(index), { total }])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, judgeIndex]);

  const loadCriteria = async () => {
    setLoading(true);
    setEventTotalMarks(NaN); setRuleError('');
    try {
      const rules = await getScoringRulesForItem(itemNameEn, itemNameMl, itemType as any, tenantId);
      setEventCriteria(formatCriteriaForUI(rules.criteria));
      setEntryMode(rules.entry_mode);
      setEventTotalMarks(rules.total_marks);
    } catch (e: any) {
      setRuleError(e.message || 'Unable to load scoring configuration.');
    } finally {
      setLoading(false);
    }
  };

  const updateScore = (key: string, val: number, max: number) => {
    if (val > max) {
      if (Platform.OS === 'web') window.alert(`Maximum mark is ${max}`);
      return;
    }
    setScoresByJudge(prev => {
      const current = prev[selectedJudge] ?? {};
      const criteria = { ...current };
      delete criteria.total;
      return { ...prev, [selectedJudge]: key === 'total' ? { total: val } : { ...criteria, [key]: val } };
    });
  };

  const getTotal = (judgeScores = scores) => {
    return entryMode === 'total_only'
      ? Number(judgeScores.total ?? 0)
      : Object.values(judgeScores).reduce((a, b) => a + b, 0);
  };

  const handleSubmit = () => {
    if (!Number.isFinite(eventTotalMarks) || eventTotalMarks <= 0) {
      Alert.alert('Scoring configuration required', 'Configure maximum marks for this competition first.'); return;
    }
    const marks = Object.fromEntries(Object.entries(scoresByJudge)
      .filter(([, judgeScores]) => Object.keys(judgeScores).length > 0)
      .map(([index, judgeScores]) => [Number(index), getTotal(judgeScores)]));
    if (Object.values(marks).some(total => !Number.isFinite(total) || total < 0 || total > eventTotalMarks)) {
      Alert.alert('Invalid marks', 'Check each judge mark before saving.'); return;
    }
    onSave(marks, eventTotalMarks);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-core-surface-strong-black/50 justify-end sm:justify-center p-4">
        <View className="bg-core-surface-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg mx-auto overflow-hidden flex-shrink-1">
          <View className="flex-row items-center justify-between p-4 border-b border-ui-border bg-core-info-soft-blue-50">
            <View>
              <View className="flex-row items-center gap-2">
                <UserCircle size={16} color={coreColor("#2563EB", 'info')} />
                <Text className="font-poppins-bold text-core-info-blue-700 uppercase text-[10px] tracking-wider">
                  Direct Entry - Judge {selectedJudge}
                </Text>
              </View>
              <Text className="font-poppins-bold text-base text-ui-text mt-1">{participantName}</Text>
              <Text className="font-poppins text-xs text-ui-text-muted">Code: {codeLetter}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="w-8 h-8 rounded-full bg-core-info-soft-blue-100 items-center justify-center">
              <X size={20} color={coreColor("#2563EB", 'info')} />
            </TouchableOpacity>
          </View>
          
          {ruleError ? <Text className="p-3 text-core-danger-red-700 font-poppins text-xs">{ruleError}</Text> : null}
          {loading ? (
            <View className="p-8 items-center"><Text>Loading rules...</Text></View>
          ) : (
            <ScrollView className="p-4" keyboardShouldPersistTaps="handled">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                <View className="flex-row gap-2">
                  {Array.from({ length: judgeCount }, (_, index) => index + 1).map(index => (
                    <TouchableOpacity key={index} accessibilityRole="button" accessibilityLabel={`Judge ${index}`} onPress={() => setSelectedJudge(index)} className={`rounded-lg border px-3 py-2 ${selectedJudge === index ? 'bg-core-info-soft-blue-50 border-core-info-blue-700' : 'bg-core-surface-white border-ui-border'}`}>
                      <Text className="font-poppins-bold text-xs text-ui-text">Judge {index}{scoresByJudge[index] && Object.keys(scoresByJudge[index]).length > 0 ? ' ✓' : ''}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              
              {/* Mark Entry UI */}
              <View className="bg-core-surface-muted-slate-50 rounded-xl border border-core-border-slate-200 p-4 mb-4">
                {entryMode === 'total_only' ? (
                  <View className="flex-row items-center justify-between">
                    <Text className="font-poppins text-core-text-slate-700">Total Marks</Text>
                    <View className="flex-row items-center bg-core-surface-white border border-core-border-slate-300 rounded-lg overflow-hidden">
                      <TextInput
                        keyboardType="numeric"
                        value={scores.total !== undefined ? scores.total.toString() : ''}
                        onChangeText={(val) => updateScore('total', Number(val), eventTotalMarks)}
                        style={{ width: 60, height: 40, textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}
                      />
                      <View className="bg-core-surface-muted-slate-100 h-full px-2 justify-center border-l border-core-border-slate-200">
                        <Text className="font-poppins text-xs text-core-text-muted-slate-500">/ {eventTotalMarks}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  eventCriteria.map(c => (
                    <View key={c.key} className="mb-3 flex-row justify-between items-center border-b border-core-border-slate-200 pb-3 last:border-b-0 last:pb-0 last:mb-0">
                      <View className="flex-1 pr-4">
                        <Text className="font-poppins text-core-text-slate-700 text-sm">{c.label}</Text>
                        <Text className="font-poppins text-core-text-muted-slate-400 text-[10px]">Max {c.max} marks</Text>
                      </View>
                      <View className="flex-row items-center bg-core-surface-white border border-core-border-slate-300 rounded-lg overflow-hidden">
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
                  <View className="mt-4 pt-3 border-t border-core-border-slate-200 flex-row justify-between items-center">
                    <Text className="font-poppins-bold text-core-text-slate-700 text-sm">Total Calculated</Text>
                    <Text className="font-poppins-black text-lg text-core-text-slate-800">{getTotal()} <Text className="text-xs text-core-text-muted-slate-500 font-poppins">/ {eventTotalMarks}</Text></Text>
                  </View>
                )}
              </View>

              <SsfButton 
                label="Save Entered Marks"
                onPress={handleSubmit} 
                disabled={loading || !!ruleError || Object.keys(scoresByJudge).length === 0}
                className="w-full bg-core-primary-blue-600"
              />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
