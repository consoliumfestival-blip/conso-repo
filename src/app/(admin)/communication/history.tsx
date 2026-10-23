import { coreColor } from '@/constants/coreTheme';
import { ui } from '@/constants/designSystem';
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { ArrowLeft, CheckCircle2, XCircle, Clock } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../core/config/supabase';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';

export default function CommunicationHistory() {
  const router = useRouter();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          notification_logs (
            status
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Process stats for each notification
      const processed = data?.map(notif => {
        const logs = notif.notification_logs || [];
        const delivered = logs.filter((l: any) => l.status === 'delivered' || l.status === 'sent').length;
        const failed = logs.filter((l: any) => l.status === 'failed').length;
        const total = logs.length;
        return { ...notif, stats: { delivered, failed, total } };
      }) || [];

      setHistory(processed);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'bg-core-danger-soft-red-100 text-core-danger-red-800';
      case 'HIGH': return 'bg-core-warning-soft-amber-100 text-core-warning-amber-800';
      case 'LOW': return 'bg-core-surface-muted-gray-100 text-core-text-gray-800';
      default: return 'bg-core-info-soft-blue-100 text-core-info-blue-800';
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View className="bg-core-surface-white p-4 rounded-xl border border-core-border-gray-200 mb-3 shadow-sm">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1">
          <Text className="text-base font-bold text-core-text-gray-900">{item.title}</Text>
          <Text className="text-xs text-core-text-muted-gray-500 mt-0.5">
            {new Date(item.created_at).toLocaleString()}
          </Text>
        </View>
        <View className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(item.priority)}`}>
          <Text className="text-xs">{item.priority}</Text>
        </View>
      </View>
      
      <Text className="text-core-text-gray-700 mb-4">{item.message}</Text>
      
      <View className="flex-row items-center border-t border-core-border-gray-100 pt-3">
        <View className="flex-row items-center mr-4">
          <CheckCircle2 size={16} color={coreColor("#10B981", 'success')} />
          <Text className="text-sm text-core-text-gray-600 ml-1">Sent: {item.stats.delivered}</Text>
        </View>
        <View className="flex-row items-center">
          <XCircle size={16} color={coreColor("#EF4444", 'danger')} />
          <Text className="text-sm text-core-text-gray-600 ml-1">Failed: {item.stats.failed}</Text>
        </View>
        <View className="flex-1" />
        <View className="bg-core-surface-muted-gray-100 px-2 py-1 rounded">
          <Text className="text-xs text-core-text-gray-600 uppercase">{item.type}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-core-surface-muted-gray-50">
      <PageHeader
        title="Notification History"
        subtitle="Recent broadcasts and automated alerts"
        leftComponent={
          <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2">
            <ArrowLeft size={24} color={coreColor("#111827", 'text')} />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View className="flex-1 p-4">
          <SsfTableSkeleton rows={8} columns={4} />
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View className="py-10 items-center">
              <Clock size={48} color={ui.colors.border} className="mb-4" />
              <Text className="text-core-text-muted-gray-500 text-base">No notifications sent yet.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
