import { Modal } from '@/components/ui/CoreModal';
import { SsfButton } from '@/components/ui/SsfButton';
import { scheduleTopicDrawService, type ScheduleTopic, type ScheduleTopicDrawState } from '@/services/scheduleTopicDrawService';
import {
  DEFAULT_TOPIC_DURATION_MINUTES,
  MAX_TOPIC_DURATION_MINUTES,
  topicDurationMinutesToSeconds,
} from '@/core/utils/scheduleTopicSetup';
import { Plus, Trash2, X } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type ScheduleTopicDraft = { id?: string; topic_text: string; is_active?: boolean };
const EMPTY_TOPIC_DRAFTS: ScheduleTopicDraft[] = [];

type Props = {
  visible: boolean;
  scheduleId?: string | null;
  initialState?: ScheduleTopicDrawState;
  draftTopics?: ScheduleTopicDraft[];
  draftDurationMinutes?: string;
  onDraftTopicsChange?: (topics: ScheduleTopicDraft[]) => void;
  onDraftDurationMinutesChange?: (minutes: string) => void;
  enableOnSave?: boolean;
  onSaved?: () => void;
  onClose: () => void;
};

const containsArabic = (value: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(value);

export function ScheduleTopicSetupModal({
  visible,
  scheduleId,
  initialState,
  draftTopics = EMPTY_TOPIC_DRAFTS,
  draftDurationMinutes = String(DEFAULT_TOPIC_DURATION_MINUTES),
  onDraftTopicsChange,
  onDraftDurationMinutesChange,
  enableOnSave = false,
  onSaved,
  onClose,
}: Props) {
  const [topics, setTopics] = useState<ScheduleTopicDraft[]>(draftTopics);
  const [durationMinutes, setDurationMinutes] = useState(draftDurationMinutes);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingTopicId, setDeletingTopicId] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!visible) return;
    setError('');
    if (!scheduleId) {
      setLoading(false);
      setTopics(draftTopics.length ? draftTopics : [{ topic_text: '' }]);
      setDurationMinutes(draftDurationMinutes);
      return;
    }
    if (initialState) {
      setLoading(false);
      setTopics(initialState.topics.map((topic) => ({ id: topic.id, topic_text: topic.topic_text, is_active: topic.is_active })));
      setDurationMinutes(String(Math.floor(initialState.participant_duration_seconds / 60)));
      return;
    }
    let current = true;
    setLoading(true);
    scheduleTopicDrawService.getState(scheduleId)
      .then((state) => {
        if (current) {
          setTopics(state.topics.map((topic: ScheduleTopic) => ({ id: topic.id, topic_text: topic.topic_text, is_active: topic.is_active })));
          setDurationMinutes(String(Math.floor(state.participant_duration_seconds / 60)));
        }
      })
      .catch((loadError: any) => {
        if (current) setError(loadError?.message || 'Could not load topics.');
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [visible, scheduleId, initialState, draftTopics, draftDurationMinutes]);

  const updateTopic = (index: number, topic_text: string) => {
    setTopics((current) => current.map((topic, currentIndex) => currentIndex === index ? { ...topic, topic_text } : topic));
  };

  const addTopic = () => setTopics((current) => [...current, { topic_text: '' }]);

  const removeDraft = (index: number) => setTopics((current) => current.filter((_, currentIndex) => currentIndex !== index));

  const removeSavedTopic = async (topicId: string, topicText: string) => {
    const prompt = `“${topicText}” will be removed from the draw pool. Existing draw history will be kept.`;
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete topic?\n\n${prompt}`)
      : await new Promise<boolean>((resolve) => Alert.alert('Delete topic?', prompt, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) }));
    if (!confirmed || !scheduleId || saving || deletingTopicId) return;

    setError('');
    setDeletingTopicId(topicId);
    try {
      await scheduleTopicDrawService.deleteTopic(scheduleId, topicId);
      setTopics((current) => current.filter((topic) => topic.id !== topicId));
      await queryClient.invalidateQueries({ queryKey: ['schedule-topic-draw-state', scheduleId] });
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Could not delete topic.');
    } finally {
      setDeletingTopicId('');
    }
  };

  const save = async () => {
    setError('');
    const durationSeconds = topicDurationMinutesToSeconds(durationMinutes);
    if (durationSeconds === null) {
      setError(`Enter a whole number of minutes from 1 to ${MAX_TOPIC_DURATION_MINUTES.toLocaleString()}.`);
      return;
    }
    const cleanTopics = topics.map((topic) => ({ ...topic, topic_text: topic.topic_text.trim() })).filter((topic) => topic.topic_text);
    if (enableOnSave && cleanTopics.length === 0) {
      setError('Add at least one topic before enabling Topic Draw.');
      return;
    }
    if (scheduleId) {
      setSaving(true);
      try {
        const persisted = cleanTopics.map((topic) => topic.id ? topic : ({ topic_text: topic.topic_text }));
        const saved = enableOnSave
          ? await scheduleTopicDrawService.saveTopicsAndEnable(scheduleId, persisted as any, durationSeconds)
          : await scheduleTopicDrawService.saveTopics(scheduleId, persisted as any, durationSeconds);
        setTopics(saved);
        await queryClient.invalidateQueries({ queryKey: ['schedule-topic-draw-state', scheduleId] });
        onSaved?.();
        onClose();
      } catch (saveError: any) {
        setError(saveError?.message || 'Could not save topics.');
      } finally {
        setSaving(false);
      }
      return;
    }
    onDraftTopicsChange?.(cleanTopics.map(({ id, topic_text }) => ({ ...(id ? { id } : {}), topic_text })));
    onDraftDurationMinutesChange?.(durationMinutes);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-3 py-5">
        <Pressable accessibilityRole="button" accessibilityLabel="Close topic setup" onPress={onClose} className="absolute inset-0" />
        <View className="max-h-[88%] w-full max-w-2xl overflow-hidden rounded-2xl border border-ui-border bg-core-surface-white shadow-xl">
          <View className="flex-row items-center justify-between border-b border-ui-border px-4 py-3">
            <View className="min-w-0 flex-1 pr-3">
              <Text className="font-poppins-bold text-base text-ui-text">Schedule topics</Text>
              <Text className="mt-0.5 font-poppins text-xs text-ui-text-muted">Add or edit the topics available for this schedule.</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="h-9 w-9 items-center justify-center rounded-lg border border-ui-border">
              <X size={17} color="#334155" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="min-h-36 items-center justify-center"><ActivityIndicator /><Text className="mt-2 font-poppins text-xs text-ui-text-muted">Loading topics…</Text></View>
          ) : (
            <ScrollView className="px-4 py-3" keyboardShouldPersistTaps="handled">
              <View className="mb-3">
                {enableOnSave ? <Text className="mb-2 font-poppins text-xs text-ui-text-muted">Saving will enable Topic Draw for this schedule. Code letters remain locked.</Text> : null}
                <Text className="mb-1 font-poppins-bold text-xs text-ui-text">Time per participant (minutes) *</Text>
                <TextInput
                  value={durationMinutes}
                  onChangeText={setDurationMinutes}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={4}
                  accessibilityLabel="Time per participant in minutes"
                  placeholder="5"
                  placeholderTextColor="#64748B"
                  className="h-10 rounded-lg border border-ui-border bg-core-surface-white px-3 font-poppins text-sm text-ui-text"
                />
                <Text className="mt-1 font-poppins text-[10px] text-ui-text-muted">From 1 minute to 24 hours. The timer starts when the topic is shown.</Text>
              </View>
              {topics.map((topic, index) => {
                const rtl = containsArabic(topic.topic_text);
                return (
                  <View key={topic.id ?? `draft-${index}`} className="mb-2">
                    {topic.id && typeof topic.is_active === 'boolean' ? <Text className={`mb-1 font-poppins-bold text-[10px] ${topic.is_active ? 'text-core-success-green-700' : 'text-ui-text-muted'}`}>{topic.is_active ? 'Active in Stage Management' : 'Disabled in Stage Management'}</Text> : null}
                    <View className="flex-row items-start gap-2">
                    <TextInput
                      value={topic.topic_text}
                      onChangeText={(value) => updateTopic(index, value)}
                      multiline
                      textAlignVertical="top"
                      placeholder={`Topic ${index + 1}`}
                      placeholderTextColor="#64748B"
                      accessibilityLabel={`Topic ${index + 1}`}
                      style={{ writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }}
                      className="min-h-12 flex-1 rounded-lg border border-ui-border bg-core-surface-white px-3 py-2.5 font-poppins text-sm text-ui-text"
                    />
                    {topic.id ? (
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete topic ${index + 1}`} disabled={saving || !!deletingTopicId} onPress={() => { void removeSavedTopic(topic.id!, topic.topic_text); }} className="h-11 w-11 items-center justify-center rounded-lg border border-core-danger-soft-red-200 bg-core-danger-soft-red-50">
                        {deletingTopicId === topic.id ? <ActivityIndicator size="small" color="#B91C1C" /> : <Trash2 size={16} color="#B91C1C" />}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove new topic ${index + 1}`} disabled={saving || !!deletingTopicId} onPress={() => removeDraft(index)} className="h-11 w-11 items-center justify-center rounded-lg border border-ui-border">
                        <Trash2 size={16} color="#64748B" />
                      </TouchableOpacity>
                    )}
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity accessibilityRole="button" disabled={saving || !!deletingTopicId} onPress={addTopic} className="mt-1 h-10 flex-row items-center justify-center gap-2 self-start rounded-lg border border-ui-border px-3">
                <Plus size={15} color="#0F766E" /><Text className="font-poppins-bold text-xs text-ui-primary-text">Add topic</Text>
              </TouchableOpacity>
              {error ? <Text accessibilityLiveRegion="polite" className="mt-3 font-poppins text-xs text-core-danger-red-700">{error}</Text> : null}
            </ScrollView>
          )}

          <View className="flex-row justify-end gap-2 border-t border-ui-border px-4 py-3">
            <SsfButton label="Cancel" variant="outline" size="sm" disabled={saving || !!deletingTopicId} onPress={onClose} />
            <SsfButton label="Save topics" size="sm" isLoading={saving} disabled={loading || saving || !!deletingTopicId} onPress={save} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
