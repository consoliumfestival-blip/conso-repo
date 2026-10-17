import { ui } from '@/constants/designSystem';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { ArrowLeft, Plus, Edit, UploadCloud, X } from 'lucide-react-native';
import { Card, CardContent } from '../../../../components/ui/shadcn/card';
import { Button } from '../../../../components/ui/shadcn/button';
import { useAuthStore } from '../../../../core/store/authStore';
import { scoringRuleRepository } from '../../../../lib/repositories/scoringRuleRepository';
import { getCriterionKey } from '../../../../core/utils/scoringRules';

export default function ScoringRulesList() {
  const router = useRouter();
  const goBack = useGoBack('/(admin)/settings');
  const { tenant_id } = useAuthStore();
  const tenantId = tenant_id;

  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const { data, error } = await scoringRuleRepository.listRules(tenantId || undefined);
      if (error) throw error;
      setRules(data || []);
    } catch (e) {
      console.error('Error loading rules', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    try {
      if (!jsonText.trim()) {
        Alert.alert('Error', 'Please paste valid JSON');
        return;
      }
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        Alert.alert('Error', 'JSON must be an array of rules');
        return;
      }

      setUploading(true);

      for (const rule of parsed) {
        if (!rule?.event_name || typeof rule.event_name !== 'string') {
          throw new Error('Every rule must have an event_name.');
        }
        const entryMode = rule.entry_mode === 'total_only' ? 'total_only' : 'criteria';
        const importedCriteria = Array.isArray(rule.criteria) ? rule.criteria : [];
        const totalMarks = entryMode === 'total_only' ? 100 : (parseInt(rule.total_marks) || 100);

        if (entryMode === 'criteria') {
          const criteriaTotal = importedCriteria.reduce(
            (sum: number, criterion: any) => sum + (parseInt(criterion.marks) || 0),
            0,
          );
          const criterionKeys = importedCriteria.map((criterion: any) =>
            getCriterionKey(criterion.name || '')
          );
          if (
            importedCriteria.length === 0
            || importedCriteria.some((criterion: any) => !criterion.name?.trim() || (parseInt(criterion.marks) || 0) <= 0)
            || criterionKeys.some((key: string) => !key)
            || new Set(criterionKeys).size !== criterionKeys.length
            || criteriaTotal !== totalMarks
          ) {
            throw new Error(`Invalid criteria for ${rule.event_name}. Criteria must be complete and total ${totalMarks}.`);
          }
        }

        const existing = rules.find(r =>
          r.event_name.toLowerCase() === rule.event_name.toLowerCase() &&
          r.tenant_id === tenantId
        );

        let savedRuleId;

        const payload = {
          event_name: rule.event_name,
          event_name_ml: rule.event_name_ml || null,
          total_marks: totalMarks,
          time_limit: rule.time_limit || null,
          guidelines: rule.guidelines || null,
          entry_mode: entryMode,
          tenant_id: tenantId,
          is_default: false
        };

        if (existing) {
          await scoringRuleRepository.updateRule(existing.id, payload);
          savedRuleId = existing.id;
        } else {
          const { data, error } = await scoringRuleRepository.createRule(payload);
          if (error) throw error;
          savedRuleId = data.id;
        }

        if (entryMode === 'criteria') {
          const oldCriteria = existing
            ? [...(existing.scoring_criteria || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
            : [];

          for (let i = 0; i < importedCriteria.length; i++) {
            const criterion = importedCriteria[i];
            const criterionPayload = {
              name: criterion.name.trim(),
              marks: parseInt(criterion.marks),
              sort_order: criterion.sort_order ?? i,
            };
            const result = oldCriteria[i]
              ? await scoringRuleRepository.updateCriterion(oldCriteria[i].id, criterionPayload)
              : await scoringRuleRepository.createCriterion({
                  rule_id: savedRuleId,
                  ...criterionPayload,
                });
            if (result.error) throw result.error;
          }

          for (const removedCriterion of oldCriteria.slice(importedCriteria.length)) {
            const { error } = await scoringRuleRepository.deleteCriterion(removedCriterion.id);
            if (error) throw error;
          }
        }
      }

      Alert.alert('Success', 'Rules uploaded successfully');
      setShowUploadModal(false);
      setJsonText('');
      setLoading(true);
      loadRules();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Invalid JSON format');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View className="flex-1 bg-ssf-bg">
      <ScrollView className="flex-1 py-6 px-4">
        {/* Page Title — matches schedule page pattern */}
        <View className="flex-row items-center mb-6">
          <TouchableOpacity onPress={goBack} className="mr-3 p-1.5 bg-ui-muted rounded-full">
            <ArrowLeft size={18} color={ui.colors.text} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-3xl font-poppins-black text-ui-text">Scoring Rules</Text>
            <Text className="text-sm font-poppins text-ui-text-muted mt-1">Manage event criteria and maximum marks</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#0F766E" style={{ marginTop: 60 }} />
        ) : (
          <>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="font-poppins-bold text-ui-text text-lg">Event Rules</Text>
              <View className="flex-row gap-2">
                <Button variant="outline" size="sm" onPress={() => setShowUploadModal(true)}>
                  Upload JSON
                </Button>
                <Button variant="outline" size="sm" onPress={() => router.push('/(admin)/settings/scoring-rules/new' as any)}>
                  + Add Custom
                </Button>
              </View>
            </View>

            {rules.map((rule) => (
              <Card key={rule.id} className="mb-3">
                <CardContent className="p-4">
                  <View className="flex-row justify-between items-center mb-2">
                    <View className="flex-1 pr-2">
                      <Text className="font-poppins-bold text-ui-text text-base">{rule.event_name}</Text>
                      {rule.event_name_ml && (
                        <Text className="font-poppins text-ui-text-muted text-xs">{rule.event_name_ml}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push(`/(admin)/settings/scoring-rules/${rule.id}` as any)}
                      className="p-2 bg-ui-muted rounded-full"
                    >
                      <Edit size={16} color="#0F766E" />
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                    <View className="bg-ui-muted px-2 py-0.5 rounded">
                      <Text className="font-poppins-bold text-ui-text text-xs">Total: {rule.total_marks}</Text>
                    </View>
                    {rule.time_limit && (
                      <View className="bg-ui-muted px-2 py-0.5 rounded">
                        <Text className="font-poppins text-ui-text-muted text-xs">{rule.time_limit}</Text>
                      </View>
                    )}
                    {rule.is_default && (
                      <View className="bg-blue-50 px-2 py-0.5 rounded">
                        <Text className="font-poppins-bold text-blue-600 text-xs">Default</Text>
                      </View>
                    )}
                    {rule.tenant_id && (
                      <View className="bg-orange-50 px-2 py-0.5 rounded">
                        <Text className="font-poppins-bold text-orange-600 text-xs">Custom</Text>
                      </View>
                    )}
                    <View className={`px-2 py-0.5 rounded ${rule.entry_mode === 'total_only' ? 'bg-blue-50' : 'bg-green-50'}`}>
                      <Text className={`font-poppins-bold text-xs ${rule.entry_mode === 'total_only' ? 'text-blue-700' : 'text-green-700'}`}>
                        {rule.entry_mode === 'total_only' ? 'Paper Total' : 'Paperless'}
                      </Text>
                    </View>
                  </View>

                  {rule.entry_mode !== 'total_only' && (
                    <View className="mt-3 bg-ui-muted p-2 rounded-lg">
                      <Text className="font-poppins-bold text-xs text-ui-text-muted mb-1">
                        Criteria ({rule.scoring_criteria?.length || 0})
                      </Text>
                      <View className="flex-row flex-wrap gap-1">
                        {rule.scoring_criteria?.sort((a: any, b: any) => a.sort_order - b.sort_order).map((c: any) => (
                          <Text key={c.id} className="font-poppins text-xs text-ui-text bg-white px-2 py-0.5 rounded border border-ui-border">
                            {c.name}: {c.marks}
                          </Text>
                        ))}
                      </View>
                    </View>
                  )}
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      {/* Upload JSON Modal */}
      <Modal visible={showUploadModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-center px-4">
          <View className="bg-white rounded-2xl p-5 max-h-[80%]">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="font-poppins-bold text-lg text-ui-text">Upload Rules JSON</Text>
              <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                <X size={22} color={ui.colors.textSubtle} />
              </TouchableOpacity>
            </View>
            <Text className="font-poppins text-xs text-ui-text-muted mb-3">
              Paste a JSON array containing event_name, entry_mode, total_marks, time_limit, guidelines, and criteria.
            </Text>
            <TextInput
              className="bg-ui-muted border border-ui-border rounded-lg p-3 font-poppins text-xs h-56 text-ui-text"
              multiline
              textAlignVertical="top"
              placeholder='[ { "event_name": "Speech", "criteria": [...] } ]'
              placeholderTextColor={ui.colors.textSubtle}
              value={jsonText}
              onChangeText={setJsonText}
            />
            <View className="mt-4 flex-row gap-3">
              <Button variant="outline" onPress={() => setShowUploadModal(false)}>
                Cancel
              </Button>
              <Button onPress={handleUpload} disabled={uploading}>
                {uploading ? 'Importing...' : 'Import'}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
