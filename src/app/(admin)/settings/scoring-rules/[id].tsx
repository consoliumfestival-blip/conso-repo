import { ui } from '@/constants/designSystem';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Trash2, Plus } from 'lucide-react-native';
import { Card, CardContent } from '../../../../components/ui/shadcn/card';
import { Button } from '../../../../components/ui/shadcn/button';
import { Input } from '../../../../components/ui/shadcn/input';
import { Label } from '../../../../components/ui/shadcn/label';
import { useAuthStore } from '../../../../core/store/authStore';
import { scoringRuleRepository } from '../../../../lib/repositories/scoringRuleRepository';
import { getCriterionKey } from '../../../../core/utils/scoringRules';

export default function EditScoringRule() {
  const { id } = useLocalSearchParams();
  const ruleId = Array.isArray(id) ? id[0] : id;
  const isNew = ruleId === 'new';

  const router = useRouter();
  const { tenant_id } = useAuthStore();
  const tenantId = tenant_id;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [rule, setRule] = useState<any>({
    event_name: '',
    event_name_ml: '',
    total_marks: '100',
    time_limit: '',
    guidelines: '',
    is_default: false,
    tenant_id: tenantId,
    entry_mode: 'criteria',
  });

  const [criteria, setCriteria] = useState<any[]>([]);

  useEffect(() => {
    if (!isNew) {
      loadRule();
    }
  }, [isNew]);

  const loadRule = async () => {
    try {
      const { data, error } = await scoringRuleRepository.getRule(ruleId);
      if (error) throw error;
      if (data) {
        setRule({
          ...data,
          total_marks: data.total_marks?.toString() || '100',
          entry_mode: data.entry_mode === 'total_only' ? 'total_only' : 'criteria',
        });
        setCriteria(data.scoring_criteria?.sort((a: any, b: any) => a.sort_order - b.sort_order) || []);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!rule.event_name) {
      Alert.alert('Validation Error', 'Event Name is required.');
      return;
    }

    const isTotalOnly = rule.entry_mode === 'total_only';
    const marksTotal = criteria.reduce((sum, c) => sum + (parseInt(c.marks) || 0), 0);
    const expectedTotal = isTotalOnly ? 100 : (parseInt(rule.total_marks) || 100);

    if (!isTotalOnly && criteria.length === 0) {
      Alert.alert('Validation Error', 'Paperless Criteria mode requires at least one criterion.');
      return;
    }

    if (!isTotalOnly && criteria.some(c => !c.name?.trim() || (parseInt(c.marks) || 0) <= 0)) {
      Alert.alert('Validation Error', 'Every criterion needs a name and a maximum mark greater than zero.');
      return;
    }

    if (!isTotalOnly && marksTotal !== expectedTotal) {
      Alert.alert('Validation Error', `Criteria marks (${marksTotal}) must equal total marks (${expectedTotal}).`);
      return;
    }

    if (!isTotalOnly) {
      const keys = criteria.map(c => getCriterionKey(c.name));
      if (keys.some(k => !k) || new Set(keys).size !== keys.length) {
        Alert.alert('Validation Error', 'Criteria names must be unique and valid.');
        return;
      }
    }

    try {
      setSaving(true);
      const isEditingOriginal = !isNew && rule.tenant_id === tenantId;
      const payload = {
        event_name: rule.event_name.trim(),
        event_name_ml: rule.event_name_ml?.trim() || null,
        total_marks: parseInt(rule.total_marks) || 100,
        time_limit: rule.time_limit?.trim() || null,
        guidelines: rule.guidelines?.trim() || null,
        entry_mode: rule.entry_mode,
        tenant_id: tenantId,
        is_default: false,
      };

      let savedRuleId;
      if (isNew) {
        const { data, error } = await scoringRuleRepository.createRule(payload);
        if (error) throw error;
        savedRuleId = data.id;
      } else {
        const { error } = await scoringRuleRepository.updateRule(ruleId, payload);
        if (error) throw error;
        savedRuleId = ruleId;
      }

      if (rule.entry_mode !== 'total_only') {
        const oldCriteriaIds = new Set<string>(
          isEditingOriginal ? (rule.scoring_criteria || []).map((c: any) => String(c.id)) : [],
        );
        const retainedIds = new Set<string>();

        for (let i = 0; i < criteria.length; i++) {
          const c = criteria[i];
          if (isEditingOriginal && oldCriteriaIds.has(c.id)) {
            const { error } = await scoringRuleRepository.updateCriterion(c.id, {
              name: c.name.trim(),
              marks: parseInt(c.marks),
              sort_order: i,
            });
            if (error) throw error;
            retainedIds.add(c.id);
          } else {
            const { error } = await scoringRuleRepository.createCriterion({
              rule_id: savedRuleId,
              name: c.name.trim(),
              marks: parseInt(c.marks),
              sort_order: i,
            });
            if (error) throw error;
          }
        }

        for (const criterionId of oldCriteriaIds) {
          if (!retainedIds.has(criterionId)) {
            const { error } = await scoringRuleRepository.deleteCriterion(criterionId);
            if (error) throw error;
          }
        }
      }

      Alert.alert('Success', 'Scoring rule saved successfully.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const addCriteria = () => {
    setCriteria([...criteria, { id: `temp_${Date.now()}`, name: '', marks: '20' }]);
  };

  const updateCriteria = (index: number, field: string, value: string) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: value };
    setCriteria(updated);
  };

  const removeCriteria = (index: number) => {
    const updated = [...criteria];
    updated.splice(index, 1);
    setCriteria(updated);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-ssf-bg items-center justify-center">
        <ActivityIndicator color="#0F766E" />
      </View>
    );
  }

  const isGlobalDefault = rule.tenant_id === null && !isNew;
  const isCloning = isGlobalDefault && tenantId;

  return (
    <View className="flex-1 bg-ssf-bg">
      <ScrollView className="flex-1 py-6 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Page Title */}
        <View className="flex-row items-center mb-6">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1.5 bg-ui-muted rounded-full">
            <ArrowLeft size={18} color={ui.colors.text} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-3xl font-poppins-black text-ui-text">
              {isNew ? 'New Rule' : isCloning ? 'Clone Rule' : 'Edit Rule'}
            </Text>
            <Text className="text-sm font-poppins text-ui-text-muted mt-1">
              {isCloning ? 'Editing a global rule creates a custom copy.' : 'Configure event criteria'}
            </Text>
          </View>
        </View>

        {/* Event Details */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <Text className="font-poppins-bold text-ui-text text-base mb-3">Event Details</Text>

            <View className="mb-3">
              <Label>Event Name (English) *</Label>
              <Input
                value={rule.event_name}
                onChangeText={(t) => setRule({ ...rule, event_name: t })}
                placeholder="e.g. Speech"
              />
            </View>

            <View className="mb-3">
              <Label>Event Name (Malayalam)</Label>
              <Input
                value={rule.event_name_ml || ''}
                onChangeText={(t) => setRule({ ...rule, event_name_ml: t })}
                placeholder="e.g. പ്രസംഗം"
              />
            </View>

            <View className="flex-row gap-3 mb-1">
              <View className="flex-1">
                <Label>Total Marks *</Label>
                <Input
                  value={rule.total_marks?.toString()}
                  onChangeText={(t) => setRule({ ...rule, total_marks: t })}
                  keyboardType="number-pad"
                  editable={rule.entry_mode !== 'total_only'}
                  placeholder="100"
                />
              </View>
              <View className="flex-1">
                <Label>Time Limit</Label>
                <Input
                  value={rule.time_limit || ''}
                  onChangeText={(t) => setRule({ ...rule, time_limit: t })}
                  placeholder="e.g. 5m"
                />
              </View>
            </View>

            <View className="mb-1">
              <Label>Guidelines</Label>
              <TextInput
                value={rule.guidelines || ''}
                onChangeText={(t) => setRule({ ...rule, guidelines: t })}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                className="bg-white border border-ui-border rounded-lg px-3 py-2 font-poppins text-sm text-ui-text min-h-[80px] mt-1"
                placeholder="Enter guidelines for judges here..."
                placeholderTextColor={ui.colors.textSubtle}
              />
            </View>
          </CardContent>
        </Card>

        {/* Mark Entry Mode */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <Text className="font-poppins-bold text-ui-text text-base mb-1">Mark Entry Mode</Text>
            <Text className="font-poppins text-xs text-ui-text-muted mb-3">
              Choose how judges record marks for this event.
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setRule({ ...rule, entry_mode: 'criteria' })}
                className={`flex-1 rounded-lg border p-3 ${
                  rule.entry_mode !== 'total_only'
                    ? 'bg-green-50 border-ui-primary'
                    : 'bg-ui-muted border-ui-border'
                }`}
              >
                <Text className="font-poppins-bold text-sm text-ui-text">Paperless Criteria</Text>
                <Text className="font-poppins text-[10px] text-ui-text-muted mt-1">Enter every criterion in the app</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRule({ ...rule, entry_mode: 'total_only', total_marks: '100' })}
                className={`flex-1 rounded-lg border p-3 ${
                  rule.entry_mode === 'total_only'
                    ? 'bg-blue-50 border-blue-500'
                    : 'bg-ui-muted border-ui-border'
                }`}
              >
                <Text className="font-poppins-bold text-sm text-ui-text">Paper Total</Text>
                <Text className="font-poppins text-[10px] text-ui-text-muted mt-1">Enter one final total out of 100</Text>
              </TouchableOpacity>
            </View>
            {rule.entry_mode === 'total_only' && (
              <View className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mt-3">
                <Text className="font-poppins text-xs text-blue-700">
                  Saved criteria will be kept safely and restored if Paperless Criteria is enabled later.
                </Text>
              </View>
            )}
          </CardContent>
        </Card>

        {/* Evaluation Criteria */}
        {rule.entry_mode !== 'total_only' && (
          <>
            <View className="flex-row justify-between items-center mb-3 px-1">
              <Text className="font-poppins-bold text-ui-text text-base">Evaluation Criteria</Text>
              <Text className="font-poppins-bold text-ui-primary text-sm">
                Total: {criteria.reduce((sum, c) => sum + (parseInt(c.marks) || 0), 0)} / {rule.total_marks}
              </Text>
            </View>

            {criteria.map((c, index) => (
              <View key={c.id || index} className="flex-row items-center gap-2 mb-3">
                <Input
                  value={c.name}
                  onChangeText={(t) => updateCriteria(index, 'name', t)}
                  className="flex-1"
                  placeholder="Criteria Name"
                />
                <Input
                  value={c.marks?.toString()}
                  onChangeText={(t) => updateCriteria(index, 'marks', t)}
                  keyboardType="number-pad"
                  className="w-20 text-center"
                  placeholder="Marks"
                />
                <TouchableOpacity onPress={() => removeCriteria(index)} className="p-3 bg-red-50 rounded-lg border border-red-100">
                  <Trash2 size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              onPress={addCriteria}
              className="flex-row items-center justify-center py-4 bg-ui-muted border border-dashed border-ui-border rounded-lg mb-6"
            >
              <Plus size={18} color={ui.colors.textMuted} />
              <Text className="font-poppins-bold text-ui-text-muted ml-2">Add Criterion</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Fixed Save Button */}
      <View className="absolute bottom-0 left-0 right-0 bg-ssf-bg border-t border-ui-border px-4 py-4">
        <Button onPress={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Scoring Rule'}
        </Button>
      </View>
    </View>
  );
}
