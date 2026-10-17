import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfInput } from '../../../components/ui/SsfInput';
import { useAuthStore } from '../../../core/store/authStore';
import { useFestival } from '../../../core/hooks/useFestival';
import { useOrganisations } from '../../../core/hooks/useOrganisations';
import { graceMarksService } from '../../../services/graceMarksService';

export default function GraceMarksScreen() {
  const { tenant_id } = useAuthStore();
  const { useActiveFestival, usePointsConfig } = useFestival();
  const { data: festival, isLoading: isFestivalLoading } = useActiveFestival();
  const { data: config, isLoading: isConfigLoading } = usePointsConfig(festival?.id);
  const { childOrganisations, isLoadingChildren } = useOrganisations();
  const queryClient = useQueryClient();

  const festivalId = festival?.id;
  const groups = childOrganisations || [];

  const graceMarksQuery = useQuery({
    queryKey: ['grace-marks', festivalId],
    queryFn: () => graceMarksService.getGraceMarks(festivalId!),
    enabled: !!festivalId,
  });

  const [formState, setFormState] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (graceMarksQuery.data) {
      const newState: Record<string, string> = {};
      graceMarksQuery.data.forEach((gm) => {
        newState[gm.org_id] = String(gm.points);
      });
      setFormState(newState);
    }
  }, [graceMarksQuery.data]);

  const handleSave = async () => {
    if (!festivalId) return;
    setIsSaving(true);
    try {
      const promises = Object.entries(formState).map(([orgId, pointsStr]) => {
        const points = parseInt(pointsStr, 10);
        if (isNaN(points)) return null;
        return graceMarksService.upsertGraceMark({
          festival_id: festivalId,
          org_id: orgId,
          points,
        });
      });
      await Promise.all(promises.filter(Boolean));
      queryClient.invalidateQueries({ queryKey: ['grace-marks', festivalId] });
      queryClient.invalidateQueries({ queryKey: ['admin-leaderboard', festivalId] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard', festivalId] });
      Alert.alert('Success', 'Grace marks saved successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save grace marks');
    } finally {
      setIsSaving(false);
    }
  };

  if (isFestivalLoading || isConfigLoading || childOrganisationsQuery.isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#065F46" />
      </View>
    );
  }

  if (!config?.enableGraceMarks) {
    return (
      <View className="flex-1 p-5 bg-gray-50 items-center justify-center">
        <Text className="font-poppins-bold text-lg text-gray-500 text-center mb-2">
          Grace Marks are Disabled
        </Text>
        <Text className="font-poppins text-sm text-gray-400 text-center px-4">
          Enable Grace Marks in the Points Configuration settings to use this feature.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 p-5">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="mb-6">
          <Text className="font-poppins-black text-2xl text-ssf-text">Grace Marks</Text>
          <Text className="font-poppins text-xs text-gray-500 mt-1">
            Assign grace marks to groups. These will be added to their final leaderboard score.
          </Text>
        </View>

        <SsfCard className="mb-6">
          {groups.length === 0 ? (
            <Text className="font-poppins text-sm text-gray-500 italic p-4 text-center">
              No participating groups found.
            </Text>
          ) : (
            groups.map((group, index) => (
              <View 
                key={group.id} 
                className={`flex-row items-center justify-between py-4 ${
                  index !== groups.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <View className="flex-1 pr-4">
                  <Text className="font-poppins-bold text-base text-ssf-text">
                    {group.name}
                  </Text>
                  {group.org_type && (
                    <Text className="font-poppins text-[10px] text-gray-400 uppercase mt-1">
                      {group.org_type}
                    </Text>
                  )}
                </View>
                <View className="w-24">
                  <SsfInput
                    label=""
                    placeholder="0"
                    keyboardType="numeric"
                    value={formState[group.id] || ''}
                    onChangeText={(val) => setFormState(prev => ({ ...prev, [group.id]: val }))}
                  />
                </View>
              </View>
            ))
          )}
        </SsfCard>

        {groups.length > 0 && (
          <SsfButton
            label="Save Grace Marks"
            onPress={handleSave}
            isLoading={isSaving}
            className="mb-8"
          />
        )}
      </ScrollView>
    </View>
  );
}
