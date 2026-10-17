import { ui } from '@/constants/designSystem';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react-native';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfInput } from '../../../components/ui/SsfInput';
import { useFestival } from '../../../core/hooks/useFestival';
import { supabase } from '../../../core/config/supabase';
import {
  FlexiblePointsConfig,
  PointBracket,
  PointsMode,
  normalizePointsConfig,
  validateFlexiblePointsConfig,
} from '../../../core/utils/flexiblePointsEngine';

const modeOptions: { key: PointsMode; label: string; description: string }[] = [
  { key: 'official', label: 'Official', description: 'Locked SSF defaults' },
  { key: 'hybrid', label: 'Hybrid', description: 'Official base with festival overrides' },
  { key: 'custom', label: 'Custom', description: 'Fully configurable rules' },
];

const numberValue = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function PointsSettings() {
  const router = useRouter();
  const { useActiveFestival, usePointsConfig, useUpdatePoints } = useFestival();
  const { data: festival } = useActiveFestival();
  const { data: storedConfig, isLoading } = usePointsConfig(festival?.id);
  const updatePoints = useUpdatePoints();
  const [form, setForm] = useState<FlexiblePointsConfig>(() => normalizePointsConfig());
  const [changeReason, setChangeReason] = useState('');
  const [versions, setVersions] = useState<any[]>([]);

  const fetchVersions = React.useCallback(async () => {
    if (!festival?.id) return;
    const { data } = await supabase
      .from('points_config_versions')
      .select('id, config_version, change_reason, created_at')
      .eq('festival_id', festival.id)
      .order('config_version', { ascending: false })
      .limit(5);
    setVersions(data ?? []);
  }, [festival?.id]);

  useEffect(() => {
    if (storedConfig) setForm(normalizePointsConfig(storedConfig));
  }, [storedConfig]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const errors = useMemo(() => validateFlexiblePointsConfig(form), [form]);
  const isOfficial = form.mode === 'official';

  const updateThreshold = (key: keyof FlexiblePointsConfig['thresholds'], value: string) => {
    setForm((current) => ({
      ...current,
      thresholds: { ...current.thresholds, [key]: numberValue(value) },
    }));
  };

  const updateRankPoint = (index: number, value: string) => {
    setForm((current) => {
      const rankPoints = [...current.rankPoints] as FlexiblePointsConfig['rankPoints'];
      rankPoints[index] = numberValue(value);
      return { ...current, rankPoints };
    });
  };

  const updateBracketPoint = (bracketIndex: number, gradeIndex: number, value: string) => {
    setForm((current) => {
      const brackets = current.brackets.map((bracket, index) => {
        if (index !== bracketIndex) return bracket;
        const points = [...bracket.points] as PointBracket['points'];
        points[gradeIndex] = numberValue(value);
        return { ...bracket, points };
      });
      return { ...current, brackets };
    });
  };

  const updateGroupBracketPoint = (bracketIndex: number, gradeIndex: number, value: string) => {
    setForm((current) => {
      const groupBrackets = current.groupBrackets.map((bracket, index) => {
        if (index !== bracketIndex) return bracket;
        const points = [...bracket.points] as PointBracket['points'];
        points[gradeIndex] = numberValue(value);
        return { ...bracket, points };
      });
      return { ...current, groupBrackets };
    });
  };

  const updateBracketRange = (
    bracketIndex: number,
    field: 'min' | 'max',
    value: string,
  ) => {
    setForm((current) => {
      const brackets = current.brackets.map((bracket, index) => {
        if (index !== bracketIndex) return bracket;
        const nextValue = Math.max(1, Math.trunc(numberValue(value, 1)));
        const updated = { ...bracket, [field]: nextValue };
        return {
          ...updated,
          key: updated.max === updated.min
            ? String(updated.min)
            : `${updated.min}-${updated.max}`,
          label: updated.max === updated.min
            ? String(updated.min)
            : `${updated.min}–${updated.max}`,
        };
      });
      const groupBrackets = current.groupBrackets.map((bracket, index) =>
        index === bracketIndex
          ? {
              ...bracket,
              key: brackets[bracketIndex].key,
              label: brackets[bracketIndex].label,
              min: brackets[bracketIndex].min,
              max: brackets[bracketIndex].max,
            }
          : bracket);
      return { ...current, brackets, groupBrackets };
    });
  };

  const addBracket = () => {
    setForm((current) => {
      const last = current.brackets[current.brackets.length - 1];
      const min = (last?.max ?? last?.min ?? 0) + 1;
      const max = min + 4;
      const bracket: PointBracket = {
        key: `${min}-${max}`,
        label: `${min}–${max}`,
        min,
        max,
        points: [0, 0, 0, 0],
        enabled: true,
      };
      return {
        ...current,
        brackets: [...current.brackets, bracket],
        groupBrackets: [
          ...current.groupBrackets,
          { ...bracket, points: [...bracket.points] as PointBracket['points'] },
        ],
      };
    });
  };

  const removeBracket = (bracketIndex: number) => {
    setForm((current) => {
      if (current.brackets.length <= 1) return current;
      return {
        ...current,
        brackets: current.brackets.filter((_, index) => index !== bracketIndex),
        groupBrackets: current.groupBrackets.filter((_, index) => index !== bracketIndex),
      };
    });
  };

  const restoreOfficialDefaults = () => {
    setForm((current) => ({
      ...normalizePointsConfig(),
      mode: current.mode,
      version: current.version,
    }));
  };

  const enableOfficialOverrides = () => {
    setForm((current) => ({ ...current, mode: 'hybrid' }));
  };

  const handleSave = async () => {
    if (errors.length > 0) {
      Alert.alert('Validation Error', errors[0]);
      return;
    }

    const nextVersion = form.version + 1;
    try {
      await updatePoints.mutateAsync({
        id: (storedConfig as any)?.id,
        festival_id: festival?.id,
        rank_1_points: form.rankPoints[0],
        rank_2_points: form.rankPoints[1],
        rank_3_points: form.rankPoints[2],
        points_mode: form.mode,
        grade_thresholds: {
          a_plus: form.thresholds.aPlus,
          a: form.thresholds.a,
          b: form.thresholds.b,
          c: form.thresholds.c,
        },
        point_brackets: form.brackets,
        group_point_brackets: form.separateGroupBrackets
          ? form.groupBrackets
          : form.brackets,
        separate_group_brackets: form.separateGroupBrackets,
        auto_bracket_selection: form.autoBracketSelection,
        allow_bracket_override: form.allowBracketOverride,
        less_than_3_teams_rule: form.rule12Enabled,
        rule12_min_teams: form.rule12MinTeams,
        rule12_behavior: form.rule12Behavior,
        enable_grace_marks: form.enableGraceMarks,
        config_version: nextVersion,
        change_reason: changeReason.trim() || 'Points configuration updated',
      });
      setForm((current) => ({ ...current, version: nextVersion }));
      setChangeReason('');
      await fetchVersions();
      Alert.alert('Success', `Points configuration version ${nextVersion} saved.`);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update points configuration.');
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-ssf-bg items-center justify-center">
        <ActivityIndicator color="#065F46" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-ssf-bg">
      <ScrollView className="flex-1 py-6 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Page Title — matches schedule page pattern */}
        <View className="flex-row items-center justify-between mb-6">
          <View className="flex-1 pr-3">
            <Text className="text-3xl font-poppins-black text-ui-text">Points System</Text>
            <Text className="text-sm font-poppins text-ui-text-muted mt-1">
              One flexible rule set for results and leaderboards
            </Text>
          </View>
          <View className="bg-ui-muted border border-ui-border rounded-xl px-3 py-2 items-center">
            <Text className="font-poppins text-[9px] uppercase text-ui-text-muted">Version</Text>
            <Text className="font-poppins-black text-lg text-ui-text">{form.version}</Text>
          </View>
        </View>
        <SsfCard className="mb-5">
          <Text className="font-poppins-black text-lg text-ssf-text">Configuration Mode</Text>
          <Text className="font-poppins text-xs text-gray-500 mt-1 mb-4">
            Keep official defaults or allow controlled festival-specific changes.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {modeOptions.map((option) => {
              const selected = form.mode === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setForm((current) => {
                    if (option.key === 'official') {
                      return {
                        ...normalizePointsConfig(),
                        mode: 'official',
                        version: current.version,
                      };
                    }
                    return { ...current, mode: option.key };
                  })}
                  className={`flex-1 min-w-[140px] rounded-xl border p-3 ${
                    selected ? 'bg-ssf-primary border-ssf-primary' : 'bg-gray-50 border-gray-200'
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text className={`font-poppins-bold ${selected ? 'text-white' : 'text-ssf-text'}`}>
                    {option.label}
                  </Text>
                  <Text className={`font-poppins text-[10px] mt-1 ${selected ? 'text-white/70' : 'text-gray-500'}`}>
                    {option.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {isOfficial && (
            <View className="flex-row items-center bg-emerald-50 border border-emerald-200 rounded-xl p-3 mt-4">
              <ShieldCheck size={18} color="#047857" />
              <View className="flex-1 ml-2 pr-2">
                <Text className="font-poppins-bold text-xs text-emerald-900">
                  Official values are protected
                </Text>
                <Text className="font-poppins text-[10px] text-emerald-800 mt-0.5">
                  Enable overrides to edit these values without changing the official template.
                </Text>
              </View>
              <TouchableOpacity
                onPress={enableOfficialOverrides}
                className="flex-row items-center bg-ssf-primary px-3 py-2 rounded-lg"
                accessibilityRole="button"
                accessibilityLabel="Enable editing with official values"
              >
                <Pencil size={13} color={ui.colors.surface} />
                <Text className="font-poppins-bold text-[10px] text-white ml-1">
                  Enable Editing
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </SsfCard>

        <SsfCard className="mb-5">
          <Text className="font-poppins-black text-lg text-ssf-text mb-4">Rank Points</Text>
          <View className="flex-row gap-3">
            {['1st', '2nd', '3rd'].map((label, index) => (
              <SsfInput
                key={label}
                label={label}
                value={String(form.rankPoints[index])}
                onChangeText={(value) => updateRankPoint(index, value)}
                editable={!isOfficial}
                keyboardType="numeric"
                className="flex-1"
              />
            ))}
          </View>
        </SsfCard>

        <SsfCard className="mb-5">
          <Text className="font-poppins-black text-lg text-ssf-text">Grade Thresholds</Text>
          <Text className="font-poppins text-xs text-gray-500 mt-1 mb-4">
            Minimum percentage required for each grade.
          </Text>
          <View className="flex-row flex-wrap gap-x-3">
            {([
              ['A+', 'aPlus'],
              ['A', 'a'],
              ['B', 'b'],
              ['C', 'c'],
            ] as const).map(([label, key]) => (
              <SsfInput
                key={key}
                label={`${label} minimum`}
                value={String(form.thresholds[key])}
                onChangeText={(value) => updateThreshold(key, value)}
                editable={!isOfficial}
                keyboardType="numeric"
                className="w-[47%] flex-grow"
              />
            ))}
          </View>
        </SsfCard>

        <SsfCard className="mb-5">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1 pr-3">
              <Text className="font-poppins-black text-lg text-ssf-text">
                Participant Brackets
              </Text>
              <Text className="font-poppins text-xs text-gray-500 mt-1">
                Grade points resolved from eligible participant/team count.
              </Text>
            </View>
            {isOfficial ? (
              <TouchableOpacity
                onPress={enableOfficialOverrides}
                className="flex-row items-center bg-ssf-primary px-3 py-2 rounded-lg"
                accessibilityRole="button"
                accessibilityLabel="Edit official grade point brackets"
              >
                <Pencil size={14} color={ui.colors.surface} />
                <Text className="font-poppins-bold text-[10px] text-white ml-1">
                  Edit Brackets
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={restoreOfficialDefaults}
                className="flex-row items-center bg-gray-100 px-3 py-2 rounded-lg"
                accessibilityRole="button"
                accessibilityLabel="Restore official point defaults"
              >
                <RotateCcw size={14} color="#4B5563" />
                <Text className="font-poppins-bold text-[10px] text-gray-600 ml-1">
                  Restore
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="min-w-[620px] border border-emerald-100 rounded-xl overflow-hidden">
              <View className="flex-row bg-emerald-100 px-2 py-3">
                {['Range', 'A+', 'A', 'B', 'C', ''].map((heading, index) => (
                  <Text
                    key={heading}
                    className={`font-poppins-bold text-xs text-emerald-900 text-center ${
                      index === 0 ? 'w-40' : index === 5 ? 'w-12' : 'w-28'
                    }`}
                  >
                    {heading}
                  </Text>
                ))}
              </View>
              {form.brackets.map((bracket, bracketIndex) => (
                <View key={bracket.key} className="flex-row items-center px-2 py-2 border-t border-gray-100 bg-white">
                  <View className="w-40 flex-row gap-x-1 px-1">
                    <SsfInput
                      value={String(bracket.min)}
                      onChangeText={(value) => updateBracketRange(bracketIndex, 'min', value)}
                      editable={!isOfficial}
                      keyboardType="numeric"
                      className="flex-1 mb-0"
                      accessibilityLabel={`${bracket.label} bracket minimum`}
                    />
                    <SsfInput
                      value={String(bracket.max ?? bracket.min)}
                      onChangeText={(value) => updateBracketRange(bracketIndex, 'max', value)}
                      editable={!isOfficial}
                      keyboardType="numeric"
                      className="flex-1 mb-0"
                      accessibilityLabel={`${bracket.label} bracket maximum`}
                    />
                  </View>
                  {bracket.points.map((point, gradeIndex) => (
                    <View key={`${bracket.key}-${gradeIndex}`} className="w-28 px-2">
                      <SsfInput
                        value={String(point)}
                        onChangeText={(value) => updateBracketPoint(bracketIndex, gradeIndex, value)}
                        editable={!isOfficial}
                        keyboardType="numeric"
                        className="mb-0"
                        accessibilityLabel={`${bracket.label} participant bracket, ${['A+', 'A', 'B', 'C'][gradeIndex]} points`}
                      />
                    </View>
                  ))}
                  <View className="w-12 items-center">
                    {!isOfficial && (
                      <TouchableOpacity
                        onPress={() => removeBracket(bracketIndex)}
                        disabled={form.brackets.length <= 1}
                        className="p-2 rounded-lg bg-red-50"
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${bracket.label} bracket`}
                      >
                        <Trash2 size={14} color="#DC2626" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
          {!isOfficial && (
            <TouchableOpacity
              onPress={addBracket}
              className="self-start flex-row items-center bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg mt-3"
              accessibilityRole="button"
              accessibilityLabel="Add participant bracket"
            >
              <Plus size={14} color="#047857" />
              <Text className="font-poppins-bold text-[10px] text-emerald-700 ml-1">
                Add bracket
              </Text>
            </TouchableOpacity>
          )}

          <View className="flex-row justify-between items-center mt-5 pt-4 border-t border-gray-100">
            <View className="flex-1 pr-4">
              <Text className="font-poppins-bold text-sm text-ssf-text">
                Separate group-event brackets
              </Text>
              <Text className="font-poppins text-[10px] text-gray-500 mt-1">
                Use a different grade-point table for team/group events.
              </Text>
            </View>
            <Switch
              value={form.separateGroupBrackets}
              disabled={isOfficial}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  separateGroupBrackets: value,
                  groupBrackets: value && current.groupBrackets.length === 0
                    ? current.brackets.map((bracket) => ({
                        ...bracket,
                        points: [...bracket.points] as PointBracket['points'],
                      }))
                    : current.groupBrackets,
                }))}
              trackColor={{ false: '#9CA3AF', true: '#065F46' }}
            />
          </View>

          {form.separateGroupBrackets && (
            <View className="mt-4">
              <Text className="font-poppins-bold text-sm text-ssf-text mb-3">
                Group / Team Grade Points
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="min-w-[620px] border border-blue-100 rounded-xl overflow-hidden">
                  <View className="flex-row bg-blue-100 px-2 py-3">
                    {['Teams', 'A+', 'A', 'B', 'C'].map((heading, index) => (
                      <Text
                        key={heading}
                        className={`font-poppins-bold text-xs text-blue-900 text-center ${
                          index === 0 ? 'w-32' : 'w-28'
                        }`}
                      >
                        {heading}
                      </Text>
                    ))}
                  </View>
                  {form.groupBrackets.map((bracket, bracketIndex) => (
                    <View key={bracket.key} className="flex-row items-center px-2 py-2 border-t border-gray-100 bg-white">
                      <Text className="w-32 font-poppins-bold text-sm text-gray-700 text-center">
                        {bracket.label}
                      </Text>
                      {bracket.points.map((point, gradeIndex) => (
                        <View key={`${bracket.key}-${gradeIndex}`} className="w-28 px-2">
                          <SsfInput
                            value={String(point)}
                            onChangeText={(value) =>
                              updateGroupBracketPoint(bracketIndex, gradeIndex, value)}
                            keyboardType="numeric"
                            className="mb-0"
                            accessibilityLabel={`${bracket.label} team bracket, ${['A+', 'A', 'B', 'C'][gradeIndex]} points`}
                          />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          <View className="flex-row justify-between items-center mt-5 pt-4 border-t border-gray-100">
            <View className="flex-1 pr-4">
              <Text className="font-poppins-bold text-sm text-ssf-text">
                Automatic bracket selection
              </Text>
              <Text className="font-poppins text-[10px] text-gray-500 mt-1">
                Resolve the bracket from eligible registration count.
              </Text>
            </View>
            <Switch
              value={form.autoBracketSelection}
              disabled={isOfficial}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, autoBracketSelection: value }))}
              trackColor={{ false: '#9CA3AF', true: '#065F46' }}
            />
          </View>
          <View className="flex-row justify-between items-center mt-4 pt-4 border-t border-gray-100">
            <View className="flex-1 pr-4">
              <Text className="font-poppins-bold text-sm text-ssf-text">
                Allow bracket override
              </Text>
              <Text className="font-poppins text-[10px] text-gray-500 mt-1">
                Permit an admin to replace the automatically resolved bracket.
              </Text>
            </View>
            <Switch
              value={form.allowBracketOverride}
              disabled={isOfficial}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, allowBracketOverride: value }))}
              trackColor={{ false: '#9CA3AF', true: '#065F46' }}
            />
          </View>
        </SsfCard>

        <SsfCard className="mb-5">
          <View className="flex-row justify-between items-center">
            <View className="flex-1 pr-4">
              <Text className="font-poppins-black text-lg text-ssf-text">Rule 12</Text>
              <Text className="font-poppins text-xs text-gray-500 mt-1">
                For events below the minimum team count, award grade points without rank points.
              </Text>
            </View>
            <Switch
              value={form.rule12Enabled}
              disabled={isOfficial}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, rule12Enabled: value }))}
              trackColor={{ false: '#9CA3AF', true: '#065F46' }}
            />
          </View>
          {form.rule12Enabled && (
            <View className="mt-4 pt-4 border-t border-gray-100">
              <SsfInput
                label="Minimum teams"
                value={String(form.rule12MinTeams)}
                onChangeText={(value) =>
                  setForm((current) => ({
                    ...current,
                    rule12MinTeams: Math.max(1, Math.trunc(numberValue(value, 1))),
                  }))}
                editable={!isOfficial}
                keyboardType="numeric"
              />
              <Text className="font-poppins-bold text-xs text-ssf-text mb-2">
                When Rule 12 applies
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {([
                  ['grade_only', 'Grade points only'],
                  ['rank_and_grade', 'Rank + grade points'],
                  ['no_points', 'No points'],
                ] as const).map(([value, label]) => {
                  const selected = form.rule12Behavior === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      disabled={isOfficial}
                      onPress={() =>
                        setForm((current) => ({ ...current, rule12Behavior: value }))}
                      className={`px-3 py-2 rounded-lg border ${
                        selected
                          ? 'bg-ssf-primary border-ssf-primary'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <Text className={`font-poppins-bold text-[10px] ${
                        selected ? 'text-white' : 'text-gray-600'
                      }`}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </SsfCard>

        <SsfCard className="mb-5">
          <View className="flex-row justify-between items-center">
            <View className="flex-1 pr-4">
              <Text className="font-poppins-black text-lg text-ssf-text">Grace Marks</Text>
              <Text className="font-poppins text-xs text-gray-500 mt-1">
                Enable the ability to award grace marks to groups. The marks will be added to their final leaderboard points.
              </Text>
            </View>
            <Switch
              value={form.enableGraceMarks}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, enableGraceMarks: value }))}
              trackColor={{ false: '#9CA3AF', true: '#065F46' }}
            />
          </View>
        </SsfCard>

        {errors.length > 0 && (
          <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            {errors.map((error) => (
              <Text key={error} className="font-poppins text-xs text-red-700 mb-1">
                • {error}
              </Text>
            ))}
          </View>
        )}

        <SsfInput
          label="Change reason"
          placeholder="Why are these points rules changing?"
          value={changeReason}
          onChangeText={setChangeReason}
        />

        {versions.length > 0 && (
          <SsfCard className="mb-5">
            <Text className="font-poppins-black text-lg text-ssf-text">
              Recent Versions
            </Text>
            <Text className="font-poppins text-xs text-gray-500 mt-1 mb-3">
              Published results keep the exact configuration version used.
            </Text>
            {versions.map((version) => (
              <View
                key={version.id}
                className="flex-row items-center justify-between py-2 border-t border-gray-100"
              >
                <View className="flex-1 pr-3">
                  <Text className="font-poppins-bold text-sm text-ssf-text">
                    Version {version.config_version}
                  </Text>
                  <Text className="font-poppins text-[10px] text-gray-500">
                    {version.change_reason || 'Configuration updated'}
                  </Text>
                </View>
                <Text className="font-poppins text-[10px] text-gray-400">
                  {new Date(version.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </SsfCard>
        )}

        <SsfButton
          label="Save Points Configuration"
          onPress={handleSave}
          isLoading={updatePoints.isPending}
          disabled={errors.length > 0}
          className="w-full mb-3"
        />
        <SsfButton
          label="Cancel"
          variant="ghost"
          onPress={() => router.back()}
          className="w-full"
        />
      </ScrollView>
    </View>
  );
}
