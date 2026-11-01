import { coreColor } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, GitCompare, Search, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { programReadService, type ProgramComparisonOption, type ProgramParticipantComparison } from '../../services/programReadService';
import { SsfButton } from '../ui/SsfButton';

type Props = {
  visible: boolean;
  tenantId: string | null;
  festivalId: string | null;
  onClose: () => void;
};

const keyFor = (program: Pick<ProgramComparisonOption, 'item_id' | 'category'>) => `${program.item_id}:${program.category}`;
const labelFor = (program: Pick<ProgramComparisonOption, 'item_code' | 'item_name' | 'category'>) => `${program.item_name || program.item_code} · ${program.category}`;

export function ProgramParticipantComparisonModal({ visible, tenantId, festivalId, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [results, setResults] = useState<ProgramParticipantComparison[] | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState('');
  const optionsQuery = useQuery({
    queryKey: ['program-participant-comparison-options', tenantId, festivalId],
    enabled: visible && !!tenantId && !!festivalId,
    queryFn: () => programReadService.comparisonOptions(tenantId!, festivalId!),
    staleTime: 120_000,
    retry: false,
  });
  const options = optionsQuery.data ?? [];
  const selectedPrograms = useMemo(() => options.filter(option => selectedKeys.includes(keyFor(option))), [options, selectedKeys]);
  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter(option => `${option.item_name} ${option.item_code} ${option.category}`.toLowerCase().includes(term));
  }, [options, search]);

  const resetAndClose = () => {
    setSearch('');
    setSelectedKeys([]);
    setResults(null);
    setCompareError('');
    onClose();
  };
  const toggle = (option: ProgramComparisonOption) => {
    const key = keyFor(option);
    setSelectedKeys(keys => keys.includes(key) ? keys.filter(value => value !== key) : [...keys, key]);
    setResults(null);
    setCompareError('');
  };
  const compare = async () => {
    if (!tenantId || !festivalId || selectedPrograms.length < 2 || isComparing) return;
    setIsComparing(true);
    setCompareError('');
    try {
      setResults(await programReadService.compareParticipants(tenantId, festivalId, selectedPrograms));
    } catch (error) {
      setResults(null);
      setCompareError(error instanceof Error ? error.message : 'Could not compare these programs.');
    } finally {
      setIsComparing(false);
    }
  };

  const isPhone = width < 700;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={resetAndClose}>
    <View className="flex-1 items-center justify-center bg-core-surface-strong-black/40 p-3" style={{ justifyContent: isPhone ? 'flex-end' : 'center' }}>
      <Pressable className="absolute inset-0" accessibilityRole="button" accessibilityLabel="Close participant comparison" onPress={resetAndClose} />
      <View style={{ width: Math.max(0, Math.min(width - 24, 900)), maxHeight: Math.max(0, height - 24) }} className="w-full overflow-hidden rounded-2xl bg-core-surface-white p-4">
        <View className="mb-3 flex-row items-start gap-2">
          <View className="flex-1"><Text className="font-poppins-black text-lg text-ui-text">Compare participants</Text><Text className="mt-1 font-poppins text-xs text-ui-text-muted">Select two or more programs. Only participants assigned to more than one selected program are shown.</Text></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close participant comparison" onPress={resetAndClose} className="min-h-10 min-w-10 items-center justify-center"><X size={19} color={coreColor('#475569', 'text')}/></TouchableOpacity>
        </View>
        {optionsQuery.isLoading ? <View className="items-center py-10"><ActivityIndicator /><Text className="mt-2 font-poppins text-xs text-ui-text-muted">Loading programs…</Text></View>
          : optionsQuery.error ? <View className="gap-2 py-6"><Text className="font-poppins text-sm text-core-danger-red-700">Could not load programs: {optionsQuery.error.message}</Text><SsfButton label="Retry" variant="outline" size="sm" onPress={() => { void optionsQuery.refetch(); }} /></View>
            : <>
              <View className="mb-2 h-10 flex-row items-center rounded-lg border border-ui-border px-3"><Search size={15} color={coreColor('#64748B', 'textMuted')}/><TextInput value={search} onChangeText={setSearch} placeholder="Search program or category" className="ml-2 flex-1 font-poppins text-sm text-ui-text" /><Text className="font-poppins text-[11px] text-ui-text-muted">{selectedPrograms.length} selected</Text></View>
              <ScrollView className="max-h-56 rounded-lg border border-ui-border" keyboardShouldPersistTaps="handled">
                {filteredOptions.map(option => {
                  const selected = selectedKeys.includes(keyFor(option));
                  return <TouchableOpacity key={keyFor(option)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggle(option)} className={`min-h-12 flex-row items-center gap-3 border-b border-ui-border px-3 py-2 ${selected ? 'bg-core-success-soft-emerald-50' : 'bg-core-surface-white'}`}>
                    <View className={`h-5 w-5 items-center justify-center rounded border ${selected ? 'border-core-success-emerald-600 bg-core-success-action-emerald-600' : 'border-core-border-slate-300'}`}>{selected ? <Check size={13} color={coreColor('white', 'onPrimary')}/> : null}</View>
                    <View className="min-w-0 flex-1"><Text className="font-poppins-bold text-xs text-ui-text" numberOfLines={1}>{option.item_name || option.item_code}</Text><Text className="mt-0.5 font-poppins text-[11px] text-ui-text-muted">{option.item_code} · {option.category} · {option.kind === 'group' ? 'Group' : 'Individual'}</Text></View>
                  </TouchableOpacity>;
                })}
                {!filteredOptions.length ? <Text className="p-4 font-poppins text-sm text-ui-text-muted">No matching programs.</Text> : null}
              </ScrollView>
              <View className="mt-3 flex-row flex-wrap items-center gap-2"><SsfButton label={isComparing ? 'Comparing…' : `Compare selected (${selectedPrograms.length})`} onPress={() => void compare()} disabled={isComparing || selectedPrograms.length < 2} /><TouchableOpacity accessibilityRole="button" disabled={!selectedPrograms.length || isComparing} onPress={() => { setSelectedKeys([]); setResults(null); setCompareError(''); }} className="min-h-10 justify-center px-2"><Text className="font-poppins-bold text-xs text-ui-text-muted">Clear</Text></TouchableOpacity></View>
              {selectedPrograms.length === 1 ? <Text className="mt-2 font-poppins text-xs text-core-warning-amber-700">Select one more program to compare.</Text> : null}
              {compareError ? <Text className="mt-3 font-poppins text-xs text-core-danger-red-700">{compareError}</Text> : null}
              {results ? <View className="mt-4 min-h-0 flex-1"><View className="mb-2 flex-row items-center gap-2"><GitCompare size={16} color={coreColor('#1B6B3A', 'primaryText')}/><Text className="font-poppins-bold text-sm text-ui-text">{results.length} shared participant{results.length === 1 ? '' : 's'}</Text></View><ScrollView className="min-h-0 flex-1" contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>{results.length ? results.map(row => <View key={row.participant_id} className="rounded-xl border border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50 p-3"><View className="flex-row items-start gap-2"><AlertTriangle size={16} color={coreColor('#B45309', 'warning')}/><View className="flex-1"><Text className="font-poppins-bold text-sm text-ui-text">{row.participant_name}</Text><Text className="mt-0.5 font-poppins text-xs text-ui-text-muted">Chest {row.chest_number || 'not assigned'} · {row.program_count} selected programs</Text></View></View><View className="mt-2 gap-1">{row.programs.map(program => <Text key={`${program.item_id}:${program.category}`} className="font-poppins text-xs text-ui-text">• {labelFor(program)}{program.group_member ? ' · Group member' : ''}</Text>)}</View></View>) : <View className="items-center rounded-xl border border-ui-border bg-core-surface-muted-slate-100 p-5"><Text className="font-poppins-bold text-sm text-ui-text">No shared participants</Text><Text className="mt-1 text-center font-poppins text-xs text-ui-text-muted">The selected programs do not currently share any active participants.</Text></View>}</ScrollView></View> : null}
            </>}
      </View>
    </View>
  </Modal>;
}
