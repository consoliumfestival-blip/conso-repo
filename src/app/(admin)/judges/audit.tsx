import { ui } from '@/constants/designSystem';
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Search, ShieldCheck } from 'lucide-react-native';
import { useJudges } from '../../../core/hooks/useJudges';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';

const actionOptions = [
  'All',
  'CODE_GENERATED',
  'CODE_REGENERATED',
  'CODE_VALIDATED',
  'CODE_USED',
  'LOGIN_REQUESTED',
  'LOGIN_APPROVED',
  'LOGIN_REJECTED',
  'MARKS_UPDATED',
  'MARKS_SUBMITTED',
  'JUDGE_ASSIGNED',
  'JUDGE_REMOVED',
];

const actionLabel = (action: string) =>
  action
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const actionColors = (action: string) => {
  if (action.includes('REJECTED') || action.includes('REMOVED')) {
    return { background: 'bg-red-100', text: 'text-red-700' };
  }
  if (action.includes('APPROVED') || action.includes('SUBMITTED')) {
    return { background: 'bg-green-100', text: 'text-green-700' };
  }
  if (action.includes('GENERATED') || action.includes('ASSIGNED')) {
    return { background: 'bg-blue-100', text: 'text-blue-700' };
  }
  return { background: 'bg-amber-100', text: 'text-amber-700' };
};

export default function JudgeAuditPage() {
  const router = useRouter();
  const { useJudgeActivityLogs } = useJudges();
  const { data: logs = [], isLoading, error, refetch } = useJudgeActivityLogs();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState('All');

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (logs as any[]).filter((log) => {
      const judgeName = log.judges?.name || 'Deleted judge';
      const item = log.schedules?.items;
      const eventName = item?.item_name_en || item?.item_name_ml || 'Deleted event';
      const itemCode = item?.item_code || '';
      const matchesAction =
        selectedAction === 'All' || log.action_type === selectedAction;
      const matchesSearch =
        !query
        || judgeName.toLowerCase().includes(query)
        || eventName.toLowerCase().includes(query)
        || itemCode.toLowerCase().includes(query)
        || log.action_type.toLowerCase().includes(query);
      return matchesAction && matchesSearch;
    });
  }, [logs, searchQuery, selectedAction]);

  return (
    <View className="flex-1 bg-ssf-bg">
      <View className="bg-ssf-primary pt-14 pb-6 px-5">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-2 mr-3 rounded-full bg-white/10"
            accessibilityRole="button"
            accessibilityLabel="Back to Judge Panel"
          >
            <ArrowLeft size={22} color={ui.colors.surface} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="font-poppins-black text-white text-2xl">
              Judge Audit Log
            </Text>
            <Text className="font-poppins text-white/70 text-xs mt-1">
              Login, access-code, assignment and marks activity
            </Text>
          </View>
          <ShieldCheck size={26} color="#FBBF24" />
        </View>
      </View>

      <View className="px-4 pt-4">
        <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-3 h-11">
          <Search size={17} color="#9CA3AF" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search judge, event or action..."
            className="flex-1 ml-2 font-poppins text-sm text-ssf-text"
            accessibilityLabel="Search judge audit log"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3 mb-3"
          contentContainerStyle={{ gap: 8 }}
        >
          {actionOptions.map((action) => {
            const selected = selectedAction === action;
            return (
              <TouchableOpacity
                key={action}
                onPress={() => setSelectedAction(action)}
                className={`px-3 py-2 rounded-full border ${
                  selected
                    ? 'bg-ssf-primary border-ssf-primary'
                    : 'bg-white border-gray-200'
                }`}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${actionLabel(action)}`}
                accessibilityState={{ selected }}
              >
                <Text className={`font-poppins-bold text-[10px] ${
                  selected ? 'text-white' : 'text-gray-600'
                }`}>
                  {actionLabel(action)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View className="flex-1 p-4">
          <SsfTableSkeleton rows={8} columns={5} />
        </View>
      ) : error ? (
        <View className="mx-4 mt-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <Text className="font-poppins-bold text-red-700 text-sm">
            Unable to load audit history.
          </Text>
          <Text className="font-poppins text-red-600 text-xs mt-1">
            {(error as Error).message}
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            className="self-start mt-3 bg-red-600 rounded-lg px-4 py-2"
            accessibilityRole="button"
            accessibilityLabel="Retry loading audit history"
          >
            <Text className="font-poppins-bold text-white text-xs">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredLogs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <ShieldCheck size={48} color={ui.colors.border} />
          <Text className="font-poppins-bold text-gray-500 mt-3">
            No matching audit activity
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 32 }}>
          <Text className="font-poppins-bold text-gray-500 text-xs mb-2">
            {filteredLogs.length} record{filteredLogs.length === 1 ? '' : 's'}
          </Text>
          <View className="gap-y-2">
            {filteredLogs.map((log: any) => {
              const colors = actionColors(log.action_type);
              const item = log.schedules?.items;
              const eventName =
                item?.item_name_en || item?.item_name_ml || 'Deleted event';
              return (
                <View
                  key={log.id}
                  className="bg-white rounded-xl border border-gray-100 p-4"
                >
                  <View className="flex-row justify-between items-start gap-x-3">
                    <View className="flex-1">
                      <Text className="font-poppins-bold text-ssf-text text-sm">
                        {log.judges?.name || 'Deleted judge'}
                      </Text>
                      <Text className="font-poppins text-gray-500 text-xs mt-0.5">
                        {eventName}
                        {item?.item_code ? ` (${item.item_code})` : ''}
                      </Text>
                    </View>
                    <View className={`${colors.background} rounded-full px-2.5 py-1`}>
                      <Text className={`font-poppins-bold text-[9px] ${colors.text}`}>
                        {actionLabel(log.action_type)}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row justify-between mt-3 border-t border-gray-100 pt-2">
                    <Text className="font-poppins text-gray-400 text-[10px]">
                      {new Date(log.created_at).toLocaleString()}
                    </Text>
                    <Text className="font-poppins-bold text-gray-400 text-[10px]">
                      {log.actor_type}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
