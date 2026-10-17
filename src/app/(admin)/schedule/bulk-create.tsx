import { ui } from '@/constants/designSystem';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import {
  AlertTriangle,
  ArrowLeft,
  CheckSquare,
  Clock3,
  Coffee,
  Plus,
  Search,
  Square,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react-native';

import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfSelectMenu } from '../../../components/ui/SsfSelectMenu';
import { SsfDatePicker } from '../../../components/ui/SsfDatePicker';
import { useFestival } from '../../../core/hooks/useFestival';
import { useSchedule } from '../../../core/hooks/useSchedule';

type PreviewRow = {
  item: any;
  start: Date;
  end: Date;
  duration: number;
  conflict: boolean;
  duplicate: boolean;
  shiftedBy: string[];
};

type BreakRule = {
  id: string;
  title: string;
  startTime: TimeParts;
  endTime: TimeParts;
};

type TimeParts = {
  hour: string;
  minute: string;
  period: '' | 'AM' | 'PM';
};

const defaultStartTime: TimeParts = { hour: '09', minute: '00', period: 'AM' };
const emptyTime = (): TimeParts => ({ hour: '', minute: '', period: '' });

const to24Hour = (value: TimeParts): string | null => {
  if (!value.hour || !value.minute || !value.period) return null;
  const hour = Number(value.hour);
  const minute = Number(value.minute);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }
  const hour24 = value.period === 'AM'
    ? (hour === 12 ? 0 : hour)
    : (hour === 12 ? 12 : hour + 12);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const toMinutes = (value: TimeParts): number | null => {
  const normalized = to24Hour(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
};

const toDateTime = (date: string, value: TimeParts): Date | null => {
  const normalized = to24Hour(value);
  return normalized ? new Date(`${date}T${normalized}:00`) : null;
};

const getBreakTimeError = (entry: BreakRule): string | null => {
  const start = toMinutes(entry.startTime);
  const end = toMinutes(entry.endTime);
  if (start === null || end === null) return 'Select hour, minute and AM/PM';
  if (end <= start) return 'End must be later';
  return null;
};

function TimePicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: TimeParts;
  onChange: (value: TimeParts) => void;
  ariaLabel: string;
}) {
  const update = (patch: Partial<TimeParts>) => onChange({ ...value, ...patch });
  const hours = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

  if (Platform.OS !== 'web') {
    return (
      <View className="flex-row items-center gap-x-1">
        <TextInput
          value={value.hour}
          onChangeText={(hour) => update({ hour })}
          placeholder="HH"
          keyboardType="numeric"
          accessibilityLabel={`${ariaLabel} hour`}
          style={{ ...nativeInputStyle, width: 52, paddingHorizontal: 8 }}
        />
        <Text className="font-poppins-bold text-xs text-ui-text-muted">:</Text>
        <TextInput
          value={value.minute}
          onChangeText={(minute) => update({ minute })}
          placeholder="MM"
          keyboardType="numeric"
          accessibilityLabel={`${ariaLabel} minute`}
          style={{ ...nativeInputStyle, width: 52, paddingHorizontal: 8 }}
        />
        <TextInput
          value={value.period}
          onChangeText={(period) => update({ period: period.toUpperCase() === 'PM' ? 'PM' : period.toUpperCase() === 'AM' ? 'AM' : '' })}
          placeholder="AM/PM"
          accessibilityLabel={`${ariaLabel} period`}
          style={{ ...nativeInputStyle, width: 72, paddingHorizontal: 8 }}
        />
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <SsfSelectMenu
        value={value.hour}
        onValueChange={(val) => update({ hour: val })}
        placeholder="Hour"
        options={hours.map((hour) => ({ label: String(Number(hour)), value: hour }))}
        style={{ width: 85 }}
        align="center"
      />
      <Text className="font-poppins-bold text-xs text-ui-text-muted">:</Text>
      <SsfSelectMenu
        value={value.minute}
        onValueChange={(val) => update({ minute: val })}
        placeholder="Min"
        options={minutes.map((minute) => ({ label: minute, value: minute }))}
        style={{ width: 85 }}
        align="center"
      />
      <SsfSelectMenu
        value={value.period}
        onValueChange={(val) => update({ period: val as TimeParts['period'] })}
        placeholder="AM/PM"
        options={[{ label: 'AM', value: 'AM' }, { label: 'PM', value: 'PM' }]}
        style={{ width: 95 }}
        align="center"
      />
    </View>
  );
}

const toLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const showMessage = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}: ${message}`);
  else Alert.alert(title, message);
};

export default function BulkCreateSchedule() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { venues, schedules, createSchedules } = useSchedule();
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival } = useActiveFestival();
  const { data: items = [], isLoading } = useItems(festival?.id);

  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('All');
  const [scheduleFilter, setScheduleFilter] = React.useState<'unscheduled' | 'scheduled' | 'all'>('unscheduled');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [venueId, setVenueId] = React.useState('');
  const [date, setDate] = React.useState(() => toLocalDate(new Date()));
  const [startTime, setStartTime] = React.useState<TimeParts>(defaultStartTime);
  const [bufferMinutes, setBufferMinutes] = React.useState('0');
  const [judgeCount, setJudgeCount] = React.useState('3');
  const [breaks, setBreaks] = React.useState<BreakRule[]>([]);
  const [durationOverrides, setDurationOverrides] = React.useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = React.useState(false);

  const categories = React.useMemo(() => {
    const values = new Set<string>();
    items.forEach((item: any) => {
      const codes = Array.isArray(item.category_codes) ? item.category_codes : [item.category_codes];
      codes.filter(Boolean).forEach((code: string) => values.add(code));
    });
    return ['All', ...Array.from(values).sort()];
  }, [items]);

  // Stages are stored as tenant/festival-scoped venues. Prefer venues marked
  // as `stage`, while retaining legacy hall/open venues when classification is
  // not yet populated for a festival.
  const stageOptions = React.useMemo(() => {
    const stageVenues = venues.filter((venue: any) =>
      String(venue.venue_type || '').toLowerCase() === 'stage',
    );
    const selectableVenues = stageVenues.length > 0 ? stageVenues : venues;
    return selectableVenues
      .slice()
      .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')))
      .map((venue: any) => ({
        label: `${venue.name || 'Unnamed stage'}${venue.location ? ` — ${venue.location}` : ''}`,
        value: venue.id,
      }));
  }, [venues]);

  const visibleItems = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item: any) => item.is_active !== false)
      .filter((item: any) => {
        const codes = Array.isArray(item.category_codes) ? item.category_codes : [item.category_codes];
        const isScheduled = schedules.some((schedule: any) => schedule.item_id === item.id);
        const categoryMatch = category === 'All' || codes.includes(category);
        const scheduleMatch = scheduleFilter === 'all'
          || (scheduleFilter === 'scheduled' ? isScheduled : !isScheduled);
        const searchMatch = !query || [item.item_code, item.item_name_en, item.item_name_ml, ...codes]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
        return categoryMatch && scheduleMatch && searchMatch;
      })
      .sort((a: any, b: any) => String(a.item_code || '').localeCompare(String(b.item_code || '')));
  }, [items, category, scheduleFilter, schedules, search]);

  const selectedItems = React.useMemo(
    () => items
      .filter((item: any) => selectedIds.has(item.id))
      .sort((a: any, b: any) => String(a.item_code || '').localeCompare(String(b.item_code || ''))),
    [items, selectedIds],
  );

  const preview = React.useMemo<PreviewRow[]>(() => {
    const startDateTime = toDateTime(date, startTime);
    if (!date || !startDateTime || !venueId) return [];
    let cursor = startDateTime;
    const buffer = Math.max(0, Number(bufferMinutes) || 0);
    const validBreaks = breaks
      .map((entry) => {
        const start = toDateTime(date, entry.startTime);
        const end = toDateTime(date, entry.endTime);
        return start && end ? { ...entry, start, end } : null;
      })
      .filter((entry): entry is BreakRule & { start: Date; end: Date } => Boolean(entry && entry.end > entry.start))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    return selectedItems.map((item: any) => {
      const duration = Math.max(1, Number(durationOverrides[item.id]) || Number(item.duration_minutes) || 15);
      const shiftedBy: string[] = [];
      let start = new Date(cursor);
      let end = new Date(start.getTime() + duration * 60_000);

      for (const breakRule of validBreaks) {
        if (start < breakRule.end && breakRule.start < end) {
          shiftedBy.push(breakRule.title.trim() || 'Break');
          start = new Date(breakRule.end);
          end = new Date(start.getTime() + duration * 60_000);
        }
      }

      const duplicate = schedules.some((schedule: any) => schedule.item_id === item.id);
      const conflict = schedules.some((schedule: any) => {
        if (schedule.venue_id !== venueId) return false;
        const existingStart = new Date(schedule.start_time).getTime();
        const existingEnd = new Date(schedule.end_time).getTime();
        return start.getTime() < existingEnd && existingStart < end.getTime();
      });
      cursor = new Date(end.getTime() + buffer * 60_000);
      return { item, start, end, duration, conflict, duplicate, shiftedBy };
    });
  }, [breaks, bufferMinutes, date, durationOverrides, schedules, selectedItems, startTime, venueId]);

  const selectableVisibleItems = visibleItems.filter(
    (item: any) => !schedules.some((schedule: any) => schedule.item_id === item.id),
  );
  const hasConflicts = preview.some((row) => row.conflict);
  const hasDuplicates = preview.some((row) => row.duplicate);
  const hasInvalidBreaks = breaks.some(
    (entry) => {
      const start = toMinutes(entry.startTime);
      const end = toMinutes(entry.endTime);
      return !entry.title.trim() || start === null || end === null || end <= start;
    },
  );
  const hasOverlappingBreaks = React.useMemo(() => {
    const ordered = breaks
      .map((entry) => ({ start: toMinutes(entry.startTime), end: toMinutes(entry.endTime) }))
      .filter((entry): entry is { start: number; end: number } => entry.start !== null && entry.end !== null && entry.end > entry.start)
      .sort((a, b) => a.start - b.start);
    return ordered.some((entry, index) => index > 0 && entry.start < ordered[index - 1].end);
  }, [breaks]);
  const allVisibleSelected = selectableVisibleItems.length > 0
    && selectableVisibleItems.every((item: any) => selectedIds.has(item.id));

  const toggleItem = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) selectableVisibleItems.forEach((item: any) => next.delete(item.id));
      else selectableVisibleItems.forEach((item: any) => next.add(item.id));
      return next;
    });
  };

  const addBreak = () => {
    setBreaks((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        title: current.length === 0 ? 'Lunch Break' : `Break ${current.length + 1}`,
        startTime: emptyTime(),
        endTime: emptyTime(),
      },
    ]);
  };

  const updateBreak = (id: string, patch: Partial<BreakRule>) => {
    setBreaks((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  };

  const removeBreak = (id: string) => {
    setBreaks((current) => current.filter((entry) => entry.id !== id));
  };

  const handleCreateAll = async () => {
    if (!festival?.id || !venueId || !date || !to24Hour(startTime) || preview.length === 0) {
      showMessage('Missing details', 'Select items, stage, date, and a complete start time (hour, minute, and AM/PM).');
      return;
    }
    if (hasInvalidBreaks || hasOverlappingBreaks) {
      showMessage('Invalid break', 'Complete every break, choose AM/PM, keep the end time later than the start time, and do not overlap breaks.');
      return;
    }
    if (hasDuplicates) {
      showMessage('Duplicate items', 'Items that are already scheduled must be deselected before bulk creation.');
      return;
    }
    if (hasConflicts) {
      const shouldContinue = Platform.OS === 'web'
        ? window.confirm('Some generated slots overlap an existing schedule at this venue. Create them anyway?')
        : true;
      if (!shouldContinue) return;
    }

    setIsSaving(true);
    try {
      const breakContext = breaks.map((entry) => ({
        title: entry.title.trim(),
        start_time: to24Hour(entry.startTime),
        end_time: to24Hour(entry.endTime),
      }));
      const payloads = preview.map((row) => ({
          festival_id: festival.id,
          item_id: row.item.id,
          venue_id: venueId,
          start_time: row.start.toISOString(),
          end_time: row.end.toISOString(),
          status: 'scheduled',
          buffer_minutes: Math.max(0, Number(bufferMinutes) || 0),
          expected_judge_count: Math.max(1, Number(judgeCount) || 3),
          bulk_break_context: breakContext,
      }));
      const createdRows = await createSchedules({ festivalId: festival.id, payloads });
      const created = createdRows.length;
      showMessage('Schedules created', `${created} schedules created successfully.`);
      router.replace('/(admin)/schedule');
    } catch (error: any) {
      showMessage('Bulk save failed', `No schedules were saved. ${error.message || 'Please review the selected items and try again.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <ActivityIndicator color="#0F766E" style={{ marginTop: 48 }} />;
  }

  if (Platform.OS !== 'web' || width < 768) {
    return (
      <View className="flex-1 bg-ui-bg items-center justify-center px-6">
        <View className="w-full max-w-md rounded-xl border border-ui-border bg-white p-6 items-center">
          <WandSparkles size={28} color="#0F766E" />
          <Text className="mt-3 text-lg font-poppins-bold text-ui-text">Desktop feature</Text>
          <Text className="mt-1 text-center font-poppins text-sm text-ui-text-muted">
            Bulk Schedule Builder is available on desktop. Use Add New to create a schedule on this device.
          </Text>
          <SsfButton label="Back to Schedule" onPress={() => router.replace('/(admin)/schedule')} className="mt-5 w-full" />
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-ui-bg px-3 py-3">
      <View className="flex-row items-center justify-between mb-5">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 rounded-xl bg-white border border-ui-border items-center justify-center mr-3">
            <ArrowLeft size={19} color="#334155" />
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-poppins-black text-ui-text">Bulk Schedule Builder</Text>
            <Text className="font-poppins text-xs text-ui-text-muted mt-0.5">Select items and generate sequential time slots.</Text>
          </View>
        </View>
      </View>

      <View className="bg-white border border-ui-border rounded-xl p-4 mb-4">
        <View className="flex-row flex-wrap gap-3">
          <View className="min-w-[210px] flex-1">
            <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted mb-1.5">Stage</Text>
            <SsfSelectMenu
              value={venueId}
              onValueChange={setVenueId}
              accessibilityLabel="Select bulk schedule stage"
              searchable
              searchPlaceholder="Search stage..."
              options={[
                { label: 'Choose stage', value: '' },
                ...stageOptions,
              ]}
            />
          </View>
          <View className="min-w-[170px]">
            <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted mb-1.5">Date</Text>
            {Platform.OS === 'web' ? (
              <SsfDatePicker
                value={date}
                onValueChange={setDate}
                style={{ width: '100%', minWidth: 170 }}
              />
            ) : <TextInput value={date} onChangeText={setDate} style={nativeInputStyle} />}
          </View>
          <View className="min-w-[145px]">
            <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted mb-1.5">Start Time</Text>
            <TimePicker value={startTime} onChange={setStartTime} ariaLabel="Schedule start time" />
          </View>
          <View className="w-[110px]">
            <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted mb-1.5">Buffer</Text>
            <TextInput value={bufferMinutes} onChangeText={setBufferMinutes} keyboardType="numeric" style={nativeInputStyle} />
          </View>
          <View className="w-[110px]">
            <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted mb-1.5">Judges</Text>
            <TextInput value={judgeCount} onChangeText={setJudgeCount} keyboardType="numeric" style={nativeInputStyle} />
          </View>
        </View>
      </View>

      <View className="bg-white border border-ui-border rounded-xl p-4 mb-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <View className="h-9 w-9 rounded-xl bg-amber-50 items-center justify-center mr-3">
              <Coffee size={17} color="#B45309" />
            </View>
            <View>
              <Text className="font-poppins-bold text-sm text-ui-text">Breaks</Text>
              <Text className="font-poppins text-[11px] text-ui-text-muted">
                Overlapping items start automatically after the break ends.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={addBreak}
            className="h-9 px-3 rounded-lg border border-amber-200 bg-amber-50 flex-row items-center justify-center"
          >
            <Plus size={14} color="#B45309" />
            <Text className="ml-1.5 font-poppins-bold text-[11px] text-amber-700">Add Break</Text>
          </TouchableOpacity>
        </View>

        {breaks.length === 0 ? (
          <View className="rounded-xl border border-dashed border-ui-border bg-ui-muted px-4 py-3">
            <Text className="font-poppins text-xs text-ui-text-muted">
              No breaks added. Add lunch, prayer, tea, or any custom interval when required.
            </Text>
          </View>
        ) : (
          <View className="gap-y-2">
            {breaks.map((entry) => {
              const error = getBreakTimeError(entry);
              return (
                <View key={entry.id} className={`flex-row items-center gap-x-2 rounded-xl border p-2 ${error ? 'border-red-200 bg-red-50' : 'border-ui-border bg-ui-muted'}`}>
                  <TextInput
                    value={entry.title}
                    onChangeText={(title) => updateBreak(entry.id, { title })}
                    placeholder="Break title"
                    className="h-10 min-w-[180px] flex-1 rounded-lg border border-ui-border bg-white px-3 font-poppins text-xs outline-none"
                  />
                  <TimePicker
                    value={entry.startTime}
                    onChange={(startTime) => updateBreak(entry.id, { startTime })}
                    ariaLabel={`${entry.title || 'Break'} start time`}
                  />
                  <Text className="font-poppins text-xs text-ui-text-muted">to</Text>
                  <TimePicker
                    value={entry.endTime}
                    onChange={(endTime) => updateBreak(entry.id, { endTime })}
                    ariaLabel={`${entry.title || 'Break'} end time`}
                  />
                  {error && <Text className="font-poppins-bold text-[10px] text-red-600">{error}</Text>}
                  <TouchableOpacity
                    onPress={() => removeBreak(entry.id)}
                    accessibilityLabel={`Remove ${entry.title || 'break'}`}
                    className="h-10 w-10 rounded-lg border border-red-100 bg-white items-center justify-center"
                  >
                    <Trash2 size={15} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {selectedItems.length > 0 && preview.length === 0 && (
        <View className="bg-white border border-amber-200 rounded-xl p-4 mb-4">
          <Text className="font-poppins-bold text-sm text-ui-text">Schedule Preview</Text>
          <Text className="font-poppins text-xs text-amber-700 mt-1">
            {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'} selected. Select a stage, date, and complete start time to show the generated schedule here.
          </Text>
        </View>
      )}

      <View className="bg-white border border-ui-border rounded-xl overflow-hidden mb-4">
        <View className="p-3 border-b border-ui-border">
          <View className="flex-row items-center gap-x-2">
            <View className="flex-1 h-10 px-3 rounded-xl border border-ui-border flex-row items-center">
              <Search size={16} color={ui.colors.textSubtle} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search items..."
                className="flex-1 ml-2 font-poppins text-sm outline-none"
              />
              {!!search && <TouchableOpacity onPress={() => setSearch('')}><X size={15} color={ui.colors.textSubtle} /></TouchableOpacity>}
            </View>
            <SsfSelectMenu
              value={category}
              onValueChange={setCategory}
              accessibilityLabel="Filter bulk items by category"
              width={150}
              compact
              active={category !== 'All'}
              options={categories.map((value) => ({ label: value === 'All' ? 'Category: All' : value, value }))}
            />
          </View>
          <View className="flex-row items-center mt-3">
            {([
              { value: 'unscheduled', label: 'Unscheduled' },
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'all', label: 'All Items' },
            ] as const).map((option) => {
              const active = scheduleFilter === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setScheduleFilter(option.value)}
                  className={`h-8 px-3 rounded-lg border items-center justify-center mr-2 ${active ? 'bg-teal-50 border-teal-200' : 'bg-white border-ui-border'}`}
                >
                  <Text className={`font-poppins-bold text-[10px] ${active ? 'text-teal-700' : 'text-ui-text-muted'}`}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Text className="ml-auto font-poppins text-[10px] text-ui-text-muted">{visibleItems.length} items</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ minWidth: 900, width: '100%' }}>
            <View className="h-11 px-4 flex-row items-center bg-ui-muted border-b border-ui-border">
              <TouchableOpacity onPress={toggleVisible} style={{ width: 42 }}>
                {allVisibleSelected ? <CheckSquare size={18} color="#0F766E" /> : <Square size={18} color={ui.colors.textSubtle} />}
              </TouchableOpacity>
              <Text style={{ flex: 0.8 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Code</Text>
              <Text style={{ flex: 2.4 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Item</Text>
              <Text style={{ flex: 0.8 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Category</Text>
              <Text style={{ width: 100 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Duration</Text>
              <Text style={{ flex: 1.2 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Generated Slot</Text>
              <Text style={{ width: 100 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Status</Text>
            </View>
            {visibleItems.map((item: any) => {
              const selected = selectedIds.has(item.id);
              const row = preview.find((candidate) => candidate.item.id === item.id);
              const existingSchedule = schedules
                .filter((schedule: any) => schedule.item_id === item.id)
                .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
              const isAlreadyScheduled = !!existingSchedule;
              const codes = Array.isArray(item.category_codes) ? item.category_codes.join(', ') : item.category_codes;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => toggleItem(item.id)}
                  disabled={isAlreadyScheduled}
                  className={`min-h-14 px-4 flex-row items-center border-b border-ui-border ${selected ? 'bg-teal-50' : 'bg-white'} ${isAlreadyScheduled ? 'opacity-70' : ''}`}
                >
                  <View style={{ width: 42 }}>
                    {selected ? <CheckSquare size={18} color="#0F766E" /> : <Square size={18} color={ui.colors.textSubtle} />}
                  </View>
                  <Text style={{ flex: 0.8 }} className="font-poppins-bold text-xs text-ui-text">{item.item_code || '—'}</Text>
                  <Text style={{ flex: 2.4 }} numberOfLines={1} className="font-poppins text-xs text-ui-text pr-3">
                    {item.item_name_en || item.item_name_ml || 'Unnamed item'}
                  </Text>
                  <Text style={{ flex: 0.8 }} className="font-poppins text-xs text-ui-text-muted">{codes || '—'}</Text>
                  <View style={{ width: 100, paddingRight: 16 }}>
                    <TextInput
                      value={durationOverrides[item.id] ?? String(item.duration_minutes || 15)}
                      onChangeText={(value) => setDurationOverrides((current) => ({ ...current, [item.id]: value }))}
                      onPressIn={(event) => event.stopPropagation()}
                      keyboardType="numeric"
                      className="h-8 px-2 rounded-lg border border-ui-border bg-white font-poppins text-xs"
                    />
                  </View>
                  <Text style={{ flex: 1.2 }} className="font-poppins text-xs text-ui-text">
                    {existingSchedule ? (
                      <>
                        <Text className="font-poppins-bold text-[10px] text-ui-text-muted">
                          {new Date(existingSchedule.start_time).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                        </Text>
                        {`\n${new Date(existingSchedule.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(existingSchedule.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </>
                    ) : row ? (
                      <>
                        {`${row.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${row.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        {!!row.shiftedBy.length && (
                          <Text className="font-poppins-bold text-[9px] text-amber-700">{`\nAfter ${row.shiftedBy.join(', ')}`}</Text>
                        )}
                      </>
                    ) : '—'}
                  </Text>
                  <View style={{ width: 100, alignItems: 'flex-start' }}>
                    {isAlreadyScheduled ? <StatusBadge label="Scheduled" tone="blue" />
                      : row?.conflict ? <StatusBadge label="Conflict" tone="red" />
                      : row ? <StatusBadge label="Ready" tone="green" />
                      : <StatusBadge label="Draft" tone="gray" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {selectedItems.length > 0 && preview.length > 0 && (
        <View className="bg-white border border-ui-border rounded-xl overflow-hidden mb-4">
          <View className="p-4 border-b border-ui-border flex-row items-center justify-between">
            <View>
              <Text className="font-poppins-bold text-sm text-ui-text">Schedule Preview</Text>
              <Text className="font-poppins text-[11px] text-ui-text-muted mt-0.5">
                Review the selected items and generated timings before creating schedules.
              </Text>
            </View>
            <View className={`px-2.5 py-1 rounded-full border ${preview.length === selectedItems.length ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <Text className={`font-poppins-bold text-[10px] ${preview.length === selectedItems.length ? 'text-emerald-700' : 'text-amber-700'}`}>
                {preview.length}/{selectedItems.length} ready
              </Text>
            </View>
          </View>

          {preview.length === 0 ? (
            <View className="px-4 py-5">
              <Text className="font-poppins text-xs text-amber-700">
                Select a stage, date, and complete start time to generate the preview.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ minWidth: 920 }}>
                <View className="h-11 px-4 flex-row items-center bg-ui-muted border-b border-ui-border">
                  <Text style={{ width: 110 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Code</Text>
                  <Text style={{ flex: 1.8 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Item</Text>
                  <Text style={{ width: 125 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Date</Text>
                  <Text style={{ width: 180 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Scheduled Time</Text>
                  <Text style={{ width: 100 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Duration</Text>
                  <Text style={{ flex: 1.2 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Break Rule</Text>
                  <Text style={{ width: 105 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Status</Text>
                </View>
                {preview.map((row) => (
                  <View key={row.item.id} className="min-h-14 px-4 flex-row items-center border-b border-ui-border bg-white">
                    <Text style={{ width: 110 }} className="font-poppins-bold text-xs text-ui-text">
                      {row.item.item_code || '—'}
                    </Text>
                    <Text style={{ flex: 1.8 }} numberOfLines={1} className="font-poppins text-xs text-ui-text pr-3">
                      {row.item.item_name_en || row.item.item_name_ml || 'Unnamed item'}
                    </Text>
                    <Text style={{ width: 125 }} className="font-poppins text-xs text-ui-text-muted">
                      {row.start.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                    <Text style={{ width: 180 }} className="font-poppins-bold text-xs text-teal-700">
                      {row.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                      {' – '}
                      {row.end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </Text>
                    <Text style={{ width: 100 }} className="font-poppins text-xs text-ui-text-muted">
                      {row.duration} min
                    </Text>
                    <Text style={{ flex: 1.2 }} numberOfLines={1} className="font-poppins text-xs text-amber-700">
                      {row.shiftedBy.length ? `After ${row.shiftedBy.join(', ')}` : '—'}
                    </Text>
                    <View style={{ width: 105 }}>
                      {row.conflict
                        ? <StatusBadge label="Conflict" tone="red" />
                        : <StatusBadge label="Ready" tone="green" />}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {(hasConflicts || hasDuplicates || hasInvalidBreaks || hasOverlappingBreaks) && (
        <View className={`mb-4 p-3 rounded-xl border flex-row items-start gap-x-2 ${(hasDuplicates || hasInvalidBreaks || hasOverlappingBreaks) ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
          <AlertTriangle size={17} color={(hasDuplicates || hasInvalidBreaks || hasOverlappingBreaks) ? '#DC2626' : '#B45309'} />
          <Text className={`flex-1 font-poppins text-xs ${hasDuplicates ? 'text-red-700' : 'text-amber-700'}`}>
            {hasInvalidBreaks || hasOverlappingBreaks
              ? 'Complete each break with hour, minute, and AM/PM. Breaks must be ordered without overlap.'
              : hasDuplicates
              ? 'Already-scheduled items must be deselected. Time conflicts are warnings and can still be created.'
              : 'Warning: some slots overlap an existing schedule. You can still create them after confirmation.'}
          </Text>
        </View>
      )}

      <View className="bg-white border border-ui-border rounded-xl p-4 flex-row items-center justify-between gap-4 mb-16">
        <View>
          <Text className="font-poppins-black text-ui-text">{selectedItems.length} items selected</Text>
          <View className="flex-row items-center gap-x-1 mt-1">
            <Clock3 size={13} color={ui.colors.textMuted} />
            <Text className="font-poppins text-xs text-ui-text-muted">
              {preview.length ? `${preview[0].start.toLocaleString()} → ${preview[preview.length - 1].end.toLocaleString()}` : 'Configure stage and time to preview.'}
            </Text>
          </View>
        </View>
        <SsfButton
          label={isSaving ? 'Creating...' : `Create ${selectedItems.length} Schedules`}
          icon={isSaving ? undefined : <WandSparkles size={15} color={ui.colors.surface} />}
          onPress={handleCreateAll}
          disabled={isSaving || selectedItems.length === 0 || !venueId || !to24Hour(startTime) || hasDuplicates || hasInvalidBreaks || hasOverlappingBreaks}
        />
      </View>
    </ScrollView>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'green' | 'red' | 'gray' | 'blue' }) {
  const classes = tone === 'green'
    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : tone === 'red'
      ? 'bg-red-50 border-red-200 text-red-700'
      : tone === 'blue'
        ? 'bg-blue-50 border-blue-200 text-blue-700'
      : 'bg-slate-50 border-slate-200 text-slate-600';
  const [, border, text] = classes.split(' ');
  return (
    <View className={`px-2 py-1 rounded-full border ${classes.split(' ')[0]} ${border}`}>
      <Text className={`font-poppins-bold text-[9px] uppercase ${text}`}>{label}</Text>
    </View>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  padding: '0 12px',
  borderRadius: 12,
  border: '1px solid #D8E0EA',
  background: ui.colors.surface,
  color: ui.colors.text,
  fontFamily: 'Poppins_400Regular',
  outline: 'none',
};

const timeSelectStyle: React.CSSProperties = {
  height: 44,
  padding: '0 8px',
  borderRadius: 12,
  border: '1px solid #D8E0EA',
  background: ui.colors.surface,
  color: ui.colors.text,
  fontFamily: 'Poppins_400Regular',
  outline: 'none',
};

const nativeInputStyle = {
  height: 44,
  paddingHorizontal: 12,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: ui.colors.border,
  backgroundColor: ui.colors.surface,
  color: ui.colors.text,
  fontFamily: 'Poppins_400Regular',
} as const;
