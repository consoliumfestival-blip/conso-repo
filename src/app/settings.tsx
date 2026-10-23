import { coreColor } from '@/constants/coreTheme';
import React, { useEffect, useState } from 'react';
import { View, Text, Switch, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Bell, ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../core/config/supabase';
import { useAuthStore } from '../core/store/authStore';
import { PageHeader } from '../components/ui/PageHeader';

import { CoreAccountAppearance } from '@/core/contexts/CoreAppearanceContext';

function SettingsScreen() {
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
    <View className="flex-1 bg-core-surface-muted-gray-50">
      <PageHeader
        title="Settings"
        subtitle="Manage your application preferences"
        leftComponent={
          <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2">
            <ArrowLeft size={24} color={coreColor("#111827", 'text')} />
          </TouchableOpacity>
        }
      />

      <View className="p-4">
        {!user ? (
          <View className="bg-core-surface-white p-4 rounded-xl border border-core-border-gray-200">
            <Text className="text-core-text-gray-600 text-center">You must be logged in to manage settings.</Text>
          </View>
        ) : loading ? (
          <ActivityIndicator size="large" color={coreColor("#3B82F6", 'info')} className="mt-10" />
        ) : (
          <View className="bg-core-surface-white p-4 rounded-xl border border-core-border-gray-200 shadow-sm flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 pr-4">
              <View className={`p-2 rounded-full ${notificationsEnabled ? 'bg-core-info-soft-blue-100' : 'bg-core-surface-muted-gray-100'} mr-3`}>
                <Bell size={24} color={notificationsEnabled ? coreColor("#3B82F6", 'info') : coreColor("#9CA3AF", 'textMuted')} />
              </View>
              <View>
                <Text className="font-bold text-core-text-gray-900 text-base">Notifications</Text>
                <Text className="text-sm text-core-text-muted-gray-500 mt-0.5">
                  Receive event reminders, announcements, and alerts.
                </Text>
              </View>
            </View>
            
            {saving ? (
              <ActivityIndicator size="small" color={coreColor("#3B82F6", 'info')} />
            ) : (
              <Switch
                value={notificationsEnabled}
                onValueChange={toggleNotifications}
                trackColor={{ false: coreColor("#D1D5DB", 'primarySoft'), true: coreColor("#93C5FD", 'primarySoft') }}
                thumbColor={notificationsEnabled ? coreColor("#2563EB", 'primary') : coreColor("#F3F4F6", 'primary')}
              />
            )}
          </View>
        )}

        <View className="mt-6 bg-core-info-soft-blue-50 p-4 rounded-xl border border-core-info-soft-blue-100">
          <Text className="text-core-info-blue-800 text-sm">
            <Text className="font-bold">Note:</Text> Emergency alerts and critical safety broadcasts will always be delivered, even if notifications are turned off.
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function SettingsRoute() { return <CoreAccountAppearance><SettingsScreen /></CoreAccountAppearance>; }
