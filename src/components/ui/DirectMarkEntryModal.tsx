import { ui } from '@/constants/designSystem';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Platform, Modal, TextInput } from 'react-native';
import { X, Save, AlertTriangle, UserCircle } from 'lucide-react-native';
import { SsfButton } from './SsfButton';
import { getScoringRulesForItem, formatCriteriaForUI, ScoringEntryMode } from '../../core/utils/scoringRules';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (totalMark: number, maxMark: number) => void;
  participantName: string;
  codeLetter: string;
  tenantId: string;
  itemNameEn: string;
  itemNameMl: string;
  itemType: string;
  judgeIndex: number;
  initialTotal?: number;
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
  initialTotal,
}: Props) {
  
  const [loading, setLoading] = useState(true);
  const [eventCriteria, setEventCriteria] = useState<any[]>([]);
  const [entryMode, setEntryMode] = useState<ScoringEntryMode>('criteria');
  const [eventTotalMarks, setEventTotalMarks] = useState(100);
  
  const [scores, setScores] = useState<Record<string, number>>({});
  
  useEffect(() => {
    if (visible) {
      loadCriteria();
      if (initialTotal !== undefined) {
        setScores({ total: initialTotal });
      } else {
        setScores({});
      }
    }
  }, [visible, initialTotal]);

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

  const handleSubmit = () => {
    const total = getTotal();
    onSave(total, eventTotalMarks);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/50 justify-end sm:justify-center p-4">
        <View className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg mx-auto overflow-hidden flex-shrink-1">
          <View className="flex-row items-center justify-between p-4 border-b border-ui-border bg-blue-50">
            <View>
              <View className="flex-row items-center gap-2">
                <UserCircle size={16} color="#2563EB" />
                <Text className="font-poppins-bold text-blue-700 uppercase text-[10px] tracking-wider">
                  Direct Entry - Judge {judgeIndex}
                </Text>
              </View>
              <Text className="font-poppins-bold text-base text-ui-text mt-1">{participantName}</Text>
              <Text className="font-poppins text-xs text-ui-text-muted">Code: {codeLetter}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="w-8 h-8 rounded-full bg-blue-100 items-center justify-center">
              <X size={20} color="#2563EB" />
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <View className="p-8 items-center"><Text>Loading rules...</Text></View>
          ) : (
            <ScrollView className="p-4" keyboardShouldPersistTaps="handled">
              
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
                label="Save Marks" 
                onPress={handleSubmit} 
                className="w-full bg-blue-600"
              />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
