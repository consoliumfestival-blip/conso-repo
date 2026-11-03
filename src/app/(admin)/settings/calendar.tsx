import { coreColor } from '@/constants/coreTheme';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Platform, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
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
    chest_number_template: 'category' as 'category' | 'team',
    gender_mode: 'both' as 'boys_only' | 'girls_only' | 'both',
    team_leader_on_stage_locked: false,
    team_leader_off_stage_locked: false,
    team_leader_substitution_locked: false,
  });

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [templateFor100, setTemplateFor100] = useState<'category' | 'team'>('category');

  useEffect(() => {
    if (festival) {
      const savedTemplate = festival.chest_number_template ?? 'category';
      const savedRange = festival.chest_number_category_range ?? 100;
      setTemplateFor100(savedTemplate);
      setFormData({
        custom_name: festival.custom_name || '',
        start_date: festival.start_date ? festival.start_date.split('T')[0] : '',
        end_date: festival.end_date ? festival.end_date.split('T')[0] : '',
        registration_open: festival.registration_open ? festival.registration_open.split('T')[0] : '',
        registration_close: festival.registration_close ? festival.registration_close.split('T')[0] : '',
        chest_number_category_range: savedRange,
        chest_number_template: savedRange === 1000 ? 'team' : savedTemplate,
        gender_mode: festival.gender_mode ?? 'both',
        team_leader_on_stage_locked: festival.team_leader_on_stage_locked ?? false,
        team_leader_off_stage_locked: festival.team_leader_off_stage_locked ?? false,
        team_leader_substitution_locked: festival.team_leader_substitution_locked ?? false,
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

    const numberingChanged = festival && (
      (festival.chest_number_template ?? 'category') !== formData.chest_number_template ||
      (festival.chest_number_category_range ?? 100) !== formData.chest_number_category_range
    );
    if (numberingChanged) {
      const message = 'Saving will renumber every existing participant using the selected template and range. If any participant cannot be numbered, nothing will be saved. Continue?';
      const confirmed = Platform.OS === 'web'
        ? window.confirm(message)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Change chest numbering', message, [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) },
            ], { cancelable: true, onDismiss: () => resolve(false) });
          });
      if (!confirmed) return;
    }

    try {
      await updateFestival.mutateAsync({
        id: festival?.id,
        ...formData,
        // PostgreSQL date columns accept NULL for an unset registration window, not "".
        registration_open: formData.registration_open.trim() || null,
        registration_close: formData.registration_close.trim() || null,
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
        <View className="flex-row items-center gap-2 bg-core-success-soft-green-50 border border-core-success-soft-green-200 rounded-xl p-4 mb-4">
          <CheckCircle2 size={18} color={coreColor("#16A34A", 'success')} />
          <Text className="font-poppins-bold text-core-success-green-800 text-sm">Calendar Updated!</Text>
        </View>
      )}

      {/* Error Banner */}
      {error !== '' && (
        <View className="bg-core-danger-soft-red-50 border border-core-danger-soft-red-200 rounded-xl p-4 mb-4">
          <Text className="font-poppins-bold text-core-danger-red-700 text-sm">{error}</Text>
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
                placeholder={`e.g., Festival ${formData.start_date.slice(0, 4) || new Date().getFullYear()}`}
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Festival Gender</CardTitle>
        </CardHeader>
        <CardContent>
          <Text className="mb-3 text-xs font-poppins text-ui-text-muted">
            This setting applies to the entire festival and all its categories.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {([
              { value: 'boys_only', label: 'Boys Only' },
              { value: 'girls_only', label: 'Girls Only' },
              { value: 'both', label: 'Both' },
            ] as const).map((option) => (
              <Button
                key={option.value}
                variant={formData.gender_mode === option.value ? 'default' : 'outline'}
                onPress={() => setFormData({ ...formData, gender_mode: option.value })}
              >
                {option.label}
              </Button>
            ))}
          </View>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Team Leader Program Locks</CardTitle>
        </CardHeader>
        <CardContent>
          <Text className="mb-3 text-xs font-poppins text-ui-text-muted">
            When locked, Team Leaders can view participants but cannot add, edit, deselect, remove, or mark programs complete for that stage.
          </Text>
          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-4 rounded-lg border border-ui-border bg-white px-3 py-2.5">
              <View className="flex-1">
                <Text className="font-poppins-bold text-sm text-ui-text">Lock On Stage programs</Text>
                <Text className="mt-0.5 font-poppins text-xs text-ui-text-muted">Read-only for Team Leaders</Text>
              </View>
              <Switch
                accessibilityLabel="Lock Team Leader On Stage programs"
                value={formData.team_leader_on_stage_locked}
                onValueChange={(value) => setFormData((current) => ({ ...current, team_leader_on_stage_locked: value }))}
              />
            </View>
            <View className="flex-row items-center justify-between gap-4 rounded-lg border border-ui-border bg-white px-3 py-2.5">
              <View className="flex-1">
                <Text className="font-poppins-bold text-sm text-ui-text">Lock Off Stage programs</Text>
                <Text className="mt-0.5 font-poppins text-xs text-ui-text-muted">Read-only for Team Leaders</Text>
              </View>
              <Switch
                accessibilityLabel="Lock Team Leader Off Stage programs"
                value={formData.team_leader_off_stage_locked}
                onValueChange={(value) => setFormData((current) => ({ ...current, team_leader_off_stage_locked: value }))}
              />
            </View>
            <View className="flex-row items-center justify-between gap-4 rounded-lg border border-ui-border bg-white px-3 py-2.5">
              <View className="flex-1">
                <Text className="font-poppins-bold text-sm text-ui-text">Lock substitution requests</Text>
                <Text className="mt-0.5 font-poppins text-xs text-ui-text-muted">Prevents new Team Leader requests; existing requests remain available for Admin review.</Text>
              </View>
              <Switch
                accessibilityLabel="Lock new Team Leader substitution requests"
                value={formData.team_leader_substitution_locked}
                onValueChange={(value) => setFormData((current) => ({ ...current, team_leader_substitution_locked: value }))}
              />
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
          <View className="mb-4">
            <Label>Numbering template</Label>
            <select
              value={formData.chest_number_template}
              onChange={(event) => {
                const template = event.target.value as 'category' | 'team';
                setTemplateFor100(template);
                setFormData({ ...formData, chest_number_template: template });
              }}
              disabled={formData.chest_number_category_range === 1000 && formData.chest_number_template === 'team'}
              className="flex h-10 w-full rounded-lg border border-ui-border bg-core-surface-white px-3 py-2 text-sm font-poppins text-ui-text"
            >
              <option value="category">By category (current template)</option>
              <option value="team">By team (sub-organisation)</option>
            </select>
          </View>
          <View>
            <Label>{formData.chest_number_category_range === 1000 ? 'Team and category numbering' : `Participants per ${formData.chest_number_template === 'team' ? 'team' : 'category'}`}</Label>
            <select
              value={String(formData.chest_number_category_range)}
              onChange={(event) => {
                const range = Number(event.target.value) as 100 | 1000;
                setFormData({ ...formData, chest_number_category_range: range,
                  chest_number_template: range === 1000 ? 'team' : templateFor100 });
              }}
              className="flex h-10 w-full rounded-lg border border-ui-border bg-core-surface-white px-3 py-2 text-sm font-poppins text-ui-text"
            >
              <option value="100">Under 100 (default): 100–199, 200–299…</option>
              <option value="1000">Team + category: teams 1000, 2000…; categories 1100, 1200…</option>
            </select>
            <Text className="text-xs font-poppins text-ui-text-muted mt-2">{formData.chest_number_category_range === 1000
              ? 'Each team gets 1000 numbers. Within that team, each category gets 100 numbers, starting at 1100, 1200… The limit is nine categories per festival and 100 participants per team/category. Existing category order determines the initial blocks; new categories take the next free block.'
              : `Each ${formData.chest_number_template === 'team' ? 'team' : 'category'} receives its own range.`} Saving a new template or range automatically renumbers existing participants. If any participant cannot fit, the entire save is rejected.</Text>
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
