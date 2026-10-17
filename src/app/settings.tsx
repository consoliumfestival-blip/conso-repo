import React, { useEffect, useState } from 'react';
import { View, Text, Switch, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Bell, ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../core/config/supabase';
import { useAuthStore } from '../core/store/authStore';
import { PageHeader } from '../components/ui/PageHeader';

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPreferences();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_enabled')
        .eq('id', user?.id)
        .single();

      if (error) throw error;
      
      // If null, default is true based on migration
      if (data && data.notification_enabled !== null) {
        setNotificationsEnabled(data.notification_enabled);
      }
    } catch (error) {
      console.error('Failed to fetch preferences', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleNotifications = async (value: boolean) => {
    setNotificationsEnabled(value);
    if (!user) return;

    setSaving(true);
    try {
      await supabase
        .from('profiles')
        .update({ notification_enabled: value })
        .eq('id', user.id);
    } catch (error) {
      console.error('Failed to update preferences', error);
      // Revert on error
      setNotificationsEnabled(!value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <PageHeader
        title="Settings"
        subtitle="Manage your application preferences"
        leftComponent={
          <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2">
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
        }
      />

      <View className="p-4">
        {!user ? (
          <View className="bg-white p-4 rounded-xl border border-gray-200">
            <Text className="text-gray-600 text-center">You must be logged in to manage settings.</Text>
          </View>
        ) : loading ? (
          <ActivityIndicator size="large" color="#3B82F6" className="mt-10" />
        ) : (
          <View className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 pr-4">
              <View className={`p-2 rounded-full ${notificationsEnabled ? 'bg-blue-100' : 'bg-gray-100'} mr-3`}>
                <Bell size={24} color={notificationsEnabled ? "#3B82F6" : "#9CA3AF"} />
              </View>
              <View>
                <Text className="font-bold text-gray-900 text-base">Notifications</Text>
                <Text className="text-sm text-gray-500 mt-0.5">
                  Receive event reminders, announcements, and alerts.
                </Text>
              </View>
            </View>
            
            {saving ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <Switch
                value={notificationsEnabled}
                onValueChange={toggleNotifications}
                trackColor={{ false: "#D1D5DB", true: "#93C5FD" }}
                thumbColor={notificationsEnabled ? "#2563EB" : "#F3F4F6"}
              />
            )}
          </View>
        )}

        <View className="mt-6 bg-blue-50 p-4 rounded-xl border border-blue-100">
          <Text className="text-blue-800 text-sm">
            <Text className="font-bold">Note:</Text> Emergency alerts and critical safety broadcasts will always be delivered, even if notifications are turned off.
          </Text>
        </View>
      </View>
    </View>
  );
}
