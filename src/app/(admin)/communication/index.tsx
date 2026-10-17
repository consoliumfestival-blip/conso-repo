import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { Megaphone, Bell, Clock, AlertTriangle, Send, History } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../core/config/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { PageHeader } from '../../../components/ui/PageHeader';

const QUICK_ANNOUNCEMENTS = [
  { id: '1', icon: '☕', title: 'Tea Ready', message: 'Tea and snacks are ready at the food counter.', priority: 'NORMAL' },
  { id: '2', icon: '🍽', title: 'Food Ready', message: 'Meals are now being served.', priority: 'NORMAL' },
  { id: '3', icon: '🕌', title: 'Prayer Time', message: 'Prayer time has started. Programs are paused.', priority: 'NORMAL' },
  { id: '4', icon: '🎤', title: 'Program Started', message: 'Programs have resumed on all stages.', priority: 'NORMAL' },
  { id: '5', icon: '⚠', title: 'Judges Report', message: 'Judges, please report to your assigned stages immediately.', priority: 'HIGH' },
  { id: '6', icon: '📢', title: 'Volunteers Report', message: 'All volunteers please report to the main office.', priority: 'NORMAL' },
];

export default function CommunicationCenter() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ upcoming: 0, sentToday: 0, failed: 0 });
  const [customTitle, setCustomTitle] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [customPriority, setCustomPriority] = useState('NORMAL');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Sent today
      const { count: sentCount } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      // Failed deliveries today
      const { count: failedCount } = await supabase
        .from('notification_logs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', today.toISOString());

      // Upcoming automated reminders (approximate next 2 hours)
      const twoHours = new Date(Date.now() + 2 * 3600000);
      const { count: upcomingCount } = await supabase
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .eq('notification_sent', false)
        .lte('start_time', twoHours.toISOString())
        .gte('start_time', new Date().toISOString());

      setStats({
        upcoming: upcomingCount || 0,
        sentToday: sentCount || 0,
        failed: failedCount || 0,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleSendQuick = (announcement: any) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Send announcement: "${announcement.title}"?`)) {
        sendNotification(announcement.title, announcement.message, announcement.priority, 'announcement');
      }
    } else {
      Alert.alert(
        'Confirm Send',
        `Send announcement: "${announcement.title}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send', style: 'default', onPress: () => sendNotification(announcement.title, announcement.message, announcement.priority, 'announcement') }
        ]
      );
    }
  };

  const handleSendCustom = () => {
    if (!customTitle || !customMessage) {
      Alert.alert('Error', 'Please fill in both title and message.');
      return;
    }
    
    if (Platform.OS === 'web') {
      if (window.confirm(`Send custom notification to all users?`)) {
        sendNotification(customTitle, customMessage, customPriority, 'announcement');
        setCustomTitle('');
        setCustomMessage('');
      }
    } else {
      Alert.alert(
        'Confirm Send',
        `Send custom notification to all users?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send', style: 'default', onPress: () => {
            sendNotification(customTitle, customMessage, customPriority, 'announcement');
            setCustomTitle('');
            setCustomMessage('');
          }}
        ]
      );
    }
  };

  const sendNotification = async (title: string, message: string, priority: string, type: string) => {
    setIsSending(true);
    try {
      let { data, error } = await supabase.functions.invoke('send-notification', {
        body: { title, message, priority, type }
      });

      console.log("Invoke response:", data, error);

      // Automatically handle stale sessions if the function throws an auth error
      if (error && (error.message.includes('non-2xx') || error.message.includes('JWT') || error.message.includes('Unauthorized'))) {
        console.log("Session might be stale, attempting to refresh...");
        const { error: refreshError } = await supabase.auth.refreshSession();
        
        if (!refreshError) {
          // Retry the function call once after refreshing session
          const retry = await supabase.functions.invoke('send-notification', {
            body: { title, message, priority, type }
          });
          data = retry.data;
          error = retry.error;
        } else {
          // If refresh fails, they really need to log in again
          throw new Error('Your login session has expired. Please refresh the page or log in again.');
        }
      }

      if (error) {
        throw new Error(error.message || 'Failed to send notification');
      }

      if (Platform.OS === 'web') {
        window.alert('Notification sent successfully');
      } else {
        Alert.alert('Success', 'Notification sent successfully');
      }
      fetchStats();
    } catch (error: any) {
      console.error(error);
      if (Platform.OS === 'web') {
        window.alert('Error: ' + (error.message || 'Failed to send notification'));
      } else {
        Alert.alert('Error', error.message || 'Failed to send notification');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <PageHeader
        title="Communication Center"
        subtitle="Manage alerts, announcements, and automated reminders"
        rightComponent={
          <TouchableOpacity 
            onPress={() => router.push('/(admin)/communication/history')}
            className="flex-row items-center bg-white border border-gray-200 px-3 py-2 rounded-lg"
          >
            <History size={18} color="#4B5563" />
            <Text className="ml-2 font-medium text-gray-700">History</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView className="flex-1 p-4">
        {/* Stats Widgets */}
        <View className="flex-row flex-wrap justify-between mb-6">
          <View className="bg-white p-4 rounded-xl border border-gray-200 w-[31%] items-center shadow-sm">
            <Clock size={24} color="#3B82F6" className="mb-2" />
            <Text className="text-2xl font-bold text-gray-900">{stats.upcoming}</Text>
            <Text className="text-xs text-gray-500 text-center mt-1">Upcoming Reminders</Text>
          </View>
          <View className="bg-white p-4 rounded-xl border border-gray-200 w-[31%] items-center shadow-sm">
            <Send size={24} color="#10B981" className="mb-2" />
            <Text className="text-2xl font-bold text-gray-900">{stats.sentToday}</Text>
            <Text className="text-xs text-gray-500 text-center mt-1">Sent Today</Text>
          </View>
          <View className="bg-white p-4 rounded-xl border border-gray-200 w-[31%] items-center shadow-sm">
            <AlertTriangle size={24} color="#EF4444" className="mb-2" />
            <Text className="text-2xl font-bold text-gray-900">{stats.failed}</Text>
            <Text className="text-xs text-gray-500 text-center mt-1">Failed Deliveries</Text>
          </View>
        </View>

        {/* Quick Announcements */}
        <Text className="text-lg font-bold text-gray-900 mb-3">Quick Announcements</Text>
        <View className="flex-row flex-wrap justify-between mb-6">
          {QUICK_ANNOUNCEMENTS.map(item => (
            <TouchableOpacity
              key={item.id}
              onPress={() => handleSendQuick(item)}
              disabled={isSending}
              className={`bg-white border border-gray-200 rounded-xl p-4 w-[48%] mb-3 shadow-sm flex-row items-center ${isSending ? 'opacity-50' : ''}`}
            >
              <Text className="text-2xl mr-3">{item.icon}</Text>
              <View className="flex-1">
                <Text className="font-bold text-gray-900">{item.title}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom Announcement */}
        <Text className="text-lg font-bold text-gray-900 mb-3">Custom Announcement</Text>
        <View className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-10">
          <Text className="text-sm font-medium text-gray-700 mb-1">Title</Text>
          <TextInput
            value={customTitle}
            onChangeText={setCustomTitle}
            placeholder="e.g. Stage B Participants"
            className="border border-gray-300 rounded-lg p-3 mb-4 text-gray-900"
          />

          <Text className="text-sm font-medium text-gray-700 mb-1">Message</Text>
          <TextInput
            value={customMessage}
            onChangeText={setCustomMessage}
            placeholder="Type your message here..."
            multiline
            numberOfLines={4}
            className="border border-gray-300 rounded-lg p-3 mb-4 text-gray-900 h-24 text-top align-top"
          />

          <Text className="text-sm font-medium text-gray-700 mb-2">Priority</Text>
          <View className="flex-row gap-2 mb-6">
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map(p => (
              <TouchableOpacity
                key={p}
                onPress={() => setCustomPriority(p)}
                className={`px-3 py-1.5 rounded-full border ${customPriority === p ? 'bg-primary-50 border-primary-500' : 'bg-gray-50 border-gray-200'}`}
              >
                <Text className={`text-xs font-medium ${customPriority === p ? 'text-primary-700' : 'text-gray-600'}`}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={handleSendCustom}
            disabled={isSending || !customTitle || !customMessage}
            className={`bg-primary-600 rounded-xl p-4 flex-row justify-center items-center ${(!customTitle || !customMessage || isSending) ? 'opacity-50' : ''}`}
          >
            {isSending ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Megaphone size={20} color="white" />
                <Text className="text-white font-bold ml-2">Send Broadcast</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
