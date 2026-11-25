import { Modal } from '@/components/ui/CoreModal';
import { SsfButton } from '@/components/ui/SsfButton';
import { scheduleTopicDrawService, type ScheduleTopic } from '@/services/scheduleTopicDrawService';
import { Plus, Trash2, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type ScheduleTopicDraft = { id?: string; topic_text: string; is_active?: boolean };

type Props = {
  visible: boolean;
  scheduleId?: string | null;
  draftTopics?: ScheduleTopicDraft[];
  onDraftTopicsChange?: (topics: ScheduleTopicDraft[]) => void;
  onClose: () => void;
};

const containsArabic = (value: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(value);

export function ScheduleTopicSetupModal({ visible, scheduleId, draftTopics = [], onDraftTopicsChange, onClose }: Props) {
  const [topics, setTopics] = useState<ScheduleTopicDraft[]>(draftTopics);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    if (!scheduleId) {
      setTopics(draftTopics.length ? draftTopics : [{ topic_text: '' }]);
      return;
    }
    let current = true;
    setLoading(true);
    scheduleTopicDrawService.getState(scheduleId)
      .then((state) => {
        if (current) setTopics(state.topics.map((topic: ScheduleTopic) => ({ id: topic.id, topic_text: topic.topic_text, is_active: topic.is_active })));
      })
      .catch((loadError: any) => {
        if (current) setError(loadError?.message || 'Could not load topics.');
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [visible, scheduleId, draftTopics]);

  const updateTopic = (index: number, topic_text: string) => {
    setTopics((current) => current.map((topic, currentIndex) => currentIndex === index ? { ...topic, topic_text } : topic));
  };

  const addTopic = () => setTopics((current) => [...current, { topic_text: '' }]);

  const removeDraft = (index: number) => setTopics((current) => current.filter((_, currentIndex) => currentIndex !== index));

  const save = async () => {
    setError('');
    const cleanTopics = topics.map((topic) => ({ ...topic, topic_text: topic.topic_text.trim() })).filter((topic) => topic.topic_text);
    if (scheduleId && cleanTopics.length) {
      setSaving(true);
      try {
        const persisted = cleanTopics.map((topic) => topic.id ? topic : ({ topic_text: topic.topic_text }));
        const saved = await scheduleTopicDrawService.saveTopics(scheduleId, persisted as any);
        setTopics(saved);
        onClose();
      } catch (saveError: any) {
        setError(saveError?.message || 'Could not save topics.');
      } finally {
        setSaving(false);
      }
      return;
    }
    onDraftTopicsChange?.(cleanTopics.map(({ id, topic_text }) => ({ ...(id ? { id } : {}), topic_text })));
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
                    {!topic.id ? (
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove new topic ${index + 1}`} onPress={() => removeDraft(index)} className="h-11 w-11 items-center justify-center rounded-lg border border-ui-border">
                        <Trash2 size={16} color="#64748B" />
                      </TouchableOpacity>
                    ) : null}
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity accessibilityRole="button" onPress={addTopic} className="mt-1 h-10 flex-row items-center justify-center gap-2 self-start rounded-lg border border-ui-border px-3">
                <Plus size={15} color="#0F766E" /><Text className="font-poppins-bold text-xs text-ui-primary-text">Add topic</Text>
              </TouchableOpacity>
              {error ? <Text accessibilityLiveRegion="polite" className="mt-3 font-poppins text-xs text-core-danger-red-700">{error}</Text> : null}
            </ScrollView>
          )}

          <View className="flex-row justify-end gap-2 border-t border-ui-border px-4 py-3">
            <SsfButton label="Cancel" variant="outline" size="sm" onPress={onClose} />
            <SsfButton label="Save topics" size="sm" isLoading={saving} disabled={loading || saving} onPress={save} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
