import { ui } from '@/constants/designSystem';
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useFestival } from '../../../core/hooks/useFestival';
import { ArrowLeft, AlertTriangle, CheckCircle } from 'lucide-react-native';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';

export default function ChestNumberGeneration() {
  const goBack = useGoBack('/(admin)/participants');
  const { participants, isLoadingList } = useParticipants();
  const { useActiveFestival } = useFestival();
  const { data: festival } = useActiveFestival();

  const categoryStats = useMemo(() => {
    const stats = new Map<string, { category: string; total: number; numeric: number }>();
    participants.forEach((participant: any) => {
      const category = String(participant.category_code || 'Uncategorised').trim();
      const current = stats.get(category) ?? { category, total: 0, numeric: 0 };
      current.total += 1;
      if (/^\d+$/.test(String(participant.chest_number || ''))) current.numeric += 1;
      stats.set(category, current);
    });
    return Array.from(stats.values()).sort((a, b) => a.category.localeCompare(b.category));
  }, [participants]);

  const range = festival?.chest_number_category_range ?? 100;

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-white rounded-full border border-ssf-border">
          <ArrowLeft size={20} color={ui.colors.text} />
        </TouchableOpacity>
        <Text className="text-2xl font-poppins-black text-ssf-text">Chest Numbers</Text>
      </View>

      <View className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-4 flex-row gap-x-3">
        <AlertTriangle size={22} color={ui.colors.info} />
        <View className="flex-1">
          <Text className="font-poppins-bold text-blue-800">Numeric category ranges</Text>
          <Text className="font-poppins text-xs text-blue-700 mt-1">
            Category 1 starts at {range}, category 2 starts at {range * 2}, and so on. Each category can contain up to {range} participants.
          </Text>
        </View>
      </View>

      {isLoadingList ? (
        <SsfTableSkeleton rows={6} columns={3} compact />
      ) : categoryStats.length === 0 ? (
        <SsfCard><Text className="font-poppins text-ssf-text-muted">No participants found for this festival.</Text></SsfCard>
      ) : categoryStats.map((stat) => (
        <SsfCard key={stat.category} className="mb-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="font-poppins-bold text-ssf-text">Category {stat.category}</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">{stat.total} participants · {stat.numeric}/{stat.total} numeric chest numbers</Text>
            </View>
            {stat.numeric === stat.total ? <CheckCircle size={20} color="#15803D" /> : <AlertTriangle size={20} color={ui.colors.warning} />}
          </View>
        </SsfCard>
      ))}
    </ScrollView>
  );
}
