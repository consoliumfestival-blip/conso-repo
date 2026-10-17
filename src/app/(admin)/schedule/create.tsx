import { ui } from '@/constants/designSystem';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, TextInput, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfSelectMenu, SsfSelectOption } from '@/components/ui/SsfSelectMenu';
import { SsfDatePicker } from '@/components/ui/SsfDatePicker';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { useSchedule } from '../../../core/hooks/useSchedule';
import { useFestival } from '../../../core/hooks/useFestival';
import { ArrowLeft, AlertTriangle } from 'lucide-react-native';

import { SmartTimeInput } from '@/components/ui/SmartTimeInput';

export default function CreateSchedule() {
  const router = useRouter();
  const goBack = useGoBack('/(admin)/schedule');
  const { width } = useWindowDimensions();
  const isCompactLayout = width < 640;
  
  const { venues, schedules, createSchedule, isCreatingSchedule } = useSchedule();
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival } = useActiveFestival();
  const { data: items, isLoading: isLoadingItems } = useItems(festival?.id);

  const [itemId, setItemId] = useState('');
  const [venueId, setVenueId] = useState('');
  
  const [startDate, setStartDate] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.localStorage.getItem('ssf_last_schedule_date') || '';
    }
    return '';
  });
  const [startTimeStr, setStartTimeStr] = useState('09:00');
  const [endDate, setEndDate] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.localStorage.getItem('ssf_last_schedule_date') || '';
    }
    return '';
  });
  const [endTimeStr, setEndTimeStr] = useState('10:00');

  const [judgeCount, setJudgeCount] = useState(3);
  
  // Custom dropdown state
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
  const [itemSearchText, setItemSearchText] = useState('');

  const checkForConflicts = () => {
    if (!venueId || !startDate || !startTimeStr || !endDate || !endTimeStr) return null;
    
    const start = new Date(`${startDate}T${startTimeStr}`).getTime();
    const end = new Date(`${endDate}T${endTimeStr}`).getTime();

    const conflicts = schedules.filter((s: any) => {
      if (s.venue_id !== venueId) return false;
      const sStart = new Date(s.start_time).getTime();
      const sEnd = new Date(s.end_time).getTime();
      // Overlap condition: start1 < end2 AND start2 < end1
      return start < sEnd && sStart < end;
    });

    return conflicts.length > 0 ? conflicts : null;
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSave = async () => {
    if (!itemId || !venueId || !startDate || !startTimeStr || !endDate || !endTimeStr) {
      return showAlert('Error', 'Please fill all fields');
    }

    const startDateTime = new Date(`${startDate}T${startTimeStr}`);
    const endDateTime = new Date(`${endDate}T${endTimeStr}`);

    if (startDateTime >= endDateTime) {
      return showAlert('Error', 'End time must be after start time');
    }

    const conflicts = checkForConflicts();
    if (conflicts) {
      const msg = `Venue is already booked for ${conflicts.map((c: any) => c.items?.item_name_en).join(', ')}`;
      if (Platform.OS === 'web') {
        if (!window.confirm(`Conflict Detected: ${msg}.\nDo you still want to proceed?`)) return;
      } else {
         // React Native Alert can't pause execution easily without wrapping in Promise,
         // so we block it strictly here for simplicity unless explicitly bypassed.
         return Alert.alert('Conflict Detected', msg);
      }
    }

    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.localStorage.setItem('ssf_last_schedule_date', startDate);
      }
      await createSchedule({
        item_id: itemId,
        venue_id: venueId,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        status: 'scheduled',
        expected_judge_count: judgeCount,
      });
      goBack();
    } catch (error: any) {
      showAlert('Error', error.message);
    }
  };

  if (isLoadingItems) return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 40 }} />;

  const conflicts = checkForConflicts();

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-3 px-3">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-ssf-surface rounded-full">
          <ArrowLeft size={24} color={ui.colors.text} />
        </TouchableOpacity>
        <Text className="text-2xl font-poppins-black text-ssf-text">Create Schedule</Text>
      </View>

      <SsfCard className="gap-y-4">
        <View style={{ position: 'relative', zIndex: 100 }}>
          <Text className="font-poppins text-ssf-text-muted mb-2">Select Item *</Text>
          <SsfSelectMenu
            value={itemId}
            onValueChange={setItemId}
            placeholder="-- Choose an Item --"
            searchable={true}
            searchPlaceholder="Search by name, code or category..."
            options={items ? items.map((i: any) => ({
              label: `[${i.item_code}] ${i.item_name_en} (${Array.isArray(i.category_codes) ? i.category_codes.join(',') : i.category_codes})`,
              value: i.id
            })) : []}
          />
        </View>

        <View style={{ zIndex: 90 }}>
          <Text className="font-poppins text-ssf-text-muted mb-2">Select Venue *</Text>
          <SsfSelectMenu
            value={venueId}
            onValueChange={setVenueId}
            placeholder="-- Choose a Venue --"
            options={venues.map((v: any) => ({
              label: `${v.name} ${v.capacity ? `(Cap: ${v.capacity})` : ''}`,
              value: v.id
            }))}
          />
        </View>

        <View style={{ flexDirection: isCompactLayout ? 'column' : 'row', gap: 16 }}>
          <View style={{ flex: isCompactLayout ? undefined : 1 }}>
            <Text className="font-poppins text-ssf-text-muted mb-2">Start Time *</Text>
            <View style={{ flexDirection: isCompactLayout ? 'column' : 'row', gap: 8 }}>
              <SsfDatePicker
                value={startDate}
                onValueChange={setStartDate}
                style={{ flex: isCompactLayout ? undefined : 1, width: isCompactLayout ? '100%' : undefined }}
              />
              <SmartTimeInput value={startTimeStr} onChange={setStartTimeStr} fullWidth={isCompactLayout} />
            </View>
          </View>
          <View style={{ flex: isCompactLayout ? undefined : 1 }}>
            <Text className="font-poppins text-ssf-text-muted mb-2">End Time *</Text>
            <View style={{ flexDirection: isCompactLayout ? 'column' : 'row', gap: 8 }}>
              <SsfDatePicker
                value={endDate}
                onValueChange={setEndDate}
                style={{ flex: isCompactLayout ? undefined : 1, width: isCompactLayout ? '100%' : undefined }}
              />
              <SmartTimeInput value={endTimeStr} onChange={setEndTimeStr} fullWidth={isCompactLayout} />
            </View>
          </View>
        </View>

        {/* Judge Count Selector */}
        <View>
          <Text className="font-poppins text-ssf-text-muted mb-2">Number of Judges *</Text>
          <View className="flex-row gap-x-2">
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity
                key={n}
                onPress={() => setJudgeCount(n)}
                className={`flex-1 py-3 rounded-xl border items-center ${
                  judgeCount === n
                    ? 'bg-ssf-primary border-ssf-primary'
                    : 'bg-white border-ssf-border'
                }`}
              >
                <Text className={`font-poppins-black text-base ${
                  judgeCount === n ? 'text-white' : 'text-ssf-text'
                }`}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {conflicts && conflicts.length > 0 && (
          <View className="bg-red-50 border border-red-200 p-3 rounded-xl flex-row items-start gap-x-2 mt-2">
            <AlertTriangle size={18} color="#DC2626" className="mt-0.5" />
            <View className="flex-1">
              <Text className="font-poppins-bold text-red-700 text-sm">Venue Conflict Detected</Text>
              <Text className="font-poppins text-red-600 text-xs">
                This venue is already booked for {conflicts.map((c: any) => c.items?.item_name_en).join(', ')} during this time.
              </Text>
            </View>
          </View>
        )}

        <SsfButton 
          label={isCreatingSchedule ? 'Saving...' : 'Create Schedule'} 
          onPress={handleSave} 
          disabled={isCreatingSchedule || !!(conflicts && Platform.OS !== 'web')}
          className="mt-4"
        />
      </SsfCard>
    </ScrollView>
  );
}
