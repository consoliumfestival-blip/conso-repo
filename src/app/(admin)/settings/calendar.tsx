import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2, Calendar as CalendarIcon } from 'lucide-react-native';
import { useFestival } from '../../../core/hooks/useFestival';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/shadcn/card';
import { Button } from '../../../components/ui/shadcn/button';
import { Input } from '../../../components/ui/shadcn/input';
import { Label } from '../../../components/ui/shadcn/label';
import { SsfDatePicker } from '../../../components/ui/SsfDatePicker';

export default function FestivalCalendarSettings() {
  const router = useRouter();
  const { useActiveFestival, useUpdateFestival } = useFestival();
  const { data: festival, isLoading } = useActiveFestival();
  const updateFestival = useUpdateFestival();

  const [formData, setFormData] = useState({
    custom_name: '',
    start_date: '',
    end_date: '',
    registration_open: '',
    registration_close: '',
    chest_number_category_range: 100 as 100 | 1000,
  });

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (festival) {
      setFormData({
        custom_name: festival.custom_name || '',
        start_date: festival.start_date ? festival.start_date.split('T')[0] : '',
        end_date: festival.end_date ? festival.end_date.split('T')[0] : '',
        registration_open: festival.registration_open ? festival.registration_open.split('T')[0] : '',
        registration_close: festival.registration_close ? festival.registration_close.split('T')[0] : '',
        chest_number_category_range: festival.chest_number_category_range ?? 100,
      });
    }
  }, [festival]);

  const handleSave = async () => {
    setError('');
    setSaved(false);

    if (!formData.start_date || !formData.end_date) {
      setError('Start Date and End Date are required.');
      return;
    }
    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      setError('End Date cannot be before Start Date.');
      return;
    }

    const festivalYear = Number(formData.start_date.slice(0, 4));
    if (!Number.isInteger(festivalYear) || festivalYear < 1900 || festivalYear > 2200) {
      setError('Start Date must contain a valid festival year.');
      return;
    }

    try {
      await updateFestival.mutateAsync({
        id: festival?.id,
        ...formData,
        festival_year: festivalYear,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message || 'Failed to update calendar');
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-ssf-bg items-center justify-center">
        <Text className="font-poppins text-ui-text-muted">Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      {/* Page Title — matches schedule page pattern */}
      <View className="mb-6">
        <Text className="text-3xl font-poppins-black text-ui-text">Festival Calendar</Text>
        <Text className="text-sm font-poppins text-ui-text-muted mt-1">Set the festival timeline</Text>
      </View>

      {/* Success Banner */}
      {saved && (
        <View className="flex-row items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
          <CheckCircle2 size={18} color="#16A34A" />
          <Text className="font-poppins-bold text-green-800 text-sm">Calendar Updated!</Text>
        </View>
      )}

      {/* Error Banner */}
      {error !== '' && (
        <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <Text className="font-poppins-bold text-red-700 text-sm">{error}</Text>
        </View>
      )}

      {/* Festival Details Card */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Festival Details</CardTitle>
        </CardHeader>
        <CardContent>
          <View className="space-y-4">
            <View>
              <Label>Festival Name (Optional)</Label>
              <Input
                placeholder={`e.g., Sahithyolsav ${formData.start_date.slice(0, 4) || new Date().getFullYear()}`}
                value={formData.custom_name}
                onChangeText={(text) => setFormData({ ...formData, custom_name: text })}
              />
            </View>

            <View>
              <Label>Festival Start Date *</Label>
              {Platform.OS === 'web' ? (
                <SsfDatePicker
                  value={formData.start_date || ''}
                  onValueChange={(val) => setFormData({ ...formData, start_date: val })}
                  style={{ width: '100%', height: 40 }}
                />
              ) : (
                <Input
                  placeholder="YYYY-MM-DD"
                  value={formData.start_date}
                  onChangeText={(text) => setFormData({ ...formData, start_date: text })}
                />
              )}
            </View>

            <View>
              <Label>Festival End Date *</Label>
              {Platform.OS === 'web' ? (
                <SsfDatePicker
                  value={formData.end_date || ''}
                  onValueChange={(val) => setFormData({ ...formData, end_date: val })}
                  style={{ width: '100%', height: 40 }}
                />
              ) : (
                <Input
                  placeholder="YYYY-MM-DD"
                  value={formData.end_date}
                  onChangeText={(text) => setFormData({ ...formData, end_date: text })}
                />
              )}
            </View>
          </View>
        </CardContent>
      </Card>

      {/* Registration Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Registration Window</CardTitle>
        </CardHeader>
        <CardContent>
          <View className="space-y-4">
            <View>
              <Label>Registration Opens</Label>
              {Platform.OS === 'web' ? (
                <SsfDatePicker
                  value={formData.registration_open || ''}
                  onValueChange={(val) => setFormData({ ...formData, registration_open: val })}
                  style={{ width: '100%', height: 40 }}
                />
              ) : (
                <Input
                  placeholder="YYYY-MM-DD"
                  value={formData.registration_open}
                  onChangeText={(text) => setFormData({ ...formData, registration_open: text })}
                />
              )}
              <Text className="text-xs font-poppins text-ui-text-muted mt-1">Leave blank if registration is already open</Text>
            </View>

            <View>
              <Label>Registration Deadline</Label>
              {Platform.OS === 'web' ? (
                <SsfDatePicker
                  value={formData.registration_close || ''}
                  onValueChange={(val) => setFormData({ ...formData, registration_close: val })}
                  style={{ width: '100%', height: 40 }}
                />
              ) : (
                <Input
                  placeholder="YYYY-MM-DD"
                  value={formData.registration_close}
                  onChangeText={(text) => setFormData({ ...formData, registration_close: text })}
                />
              )}
              <Text className="text-xs font-poppins text-ui-text-muted mt-1">Last date to register participants</Text>
            </View>
          </View>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Chest Number Range</CardTitle>
        </CardHeader>
        <CardContent>
          <View>
            <Label>Participants per category</Label>
            <select
              value={String(formData.chest_number_category_range)}
              onChange={(event) => setFormData({ ...formData, chest_number_category_range: Number(event.target.value) as 100 | 1000 })}
              className="flex h-10 w-full rounded-lg border border-ui-border bg-white px-3 py-2 text-sm font-poppins text-ui-text"
            >
              <option value="100">Under 100 (default): 100–199, 200–299…</option>
              <option value="1000">Under 1000: 1000–1999, 2000–2999…</option>
            </select>
            <Text className="text-xs font-poppins text-ui-text-muted mt-2">Changing this setting affects future generation. Use Chest Numbers → Regenerate All to replace existing numbers.</Text>
          </View>
        </CardContent>
      </Card>

      {/* Actions */}
      <View className="gap-3 mb-8">
        <Button
          variant="default"
          onPress={handleSave}
          disabled={updateFestival.isPending}
        >
          {updateFestival.isPending ? 'Saving...' : 'Save Calendar'}
        </Button>

        <Button
          variant="outline"
          onPress={() => router.push('/(admin)/settings/categories' as any)}
        >
          Manage Categories
        </Button>

        <Button
          variant="ghost"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/settings' as any)}
        >
          ← Back
        </Button>
      </View>
    </ScrollView>
  );
}
