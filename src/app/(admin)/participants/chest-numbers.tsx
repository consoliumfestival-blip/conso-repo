import { coreColor } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import { ui } from '@/constants/designSystem';
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, TextInput, KeyboardAvoidingView } from 'react-native';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useFestival } from '../../../core/hooks/useFestival';
import { ArrowLeft, AlertTriangle, CheckCircle, LockKeyhole } from 'lucide-react-native';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import { Button } from '../../../components/ui/shadcn/button';
import { useChestNumberOrder } from '../../../core/hooks/useChestNumberOrder';
import { ChestTeamOrderRow } from '../../../components/participants/ChestTeamOrderRow';
import type { ChestOrderState } from '../../../services/chestNumberService';

export default function ChestNumberGeneration() {
  const { useActiveFestival } = useFestival();
  const festivalQuery = useActiveFestival();
  if (festivalQuery.isLoading) return <SsfTableSkeleton rows={4} columns={2} compact />;
  if (festivalQuery.error) return <SsfCard><Text>Unable to load the festival.</Text><Button variant="outline" onPress={() => { void festivalQuery.refetch(); }}>Retry</Button></SsfCard>;
  const festival = festivalQuery.data;
  if (!festival) return <SsfCard><Text>Select an active festival to manage chest numbers.</Text></SsfCard>;
  return festival.chest_number_template === 'team'
    ? <TeamChestNumbers key={festival.id} festivalId={festival.id} />
    : <CategoryChestNumbers festival={festival} />;
}

function TeamChestNumbers({ festivalId }: { festivalId: string }) {
  const goBack = useGoBack('/(admin)/participants');
  const { query, save, lock, regenerate } = useChestNumberOrder(festivalId);
  const [draft, setDraft] = useState<{ base: ChestOrderState; ids: string[]; categoryCodes: string[]; enabled: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<'lock' | 'unlock' | 'regenerate' | null>(null);
  const [code, setCode] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [drag, setDrag] = useState<{ id: string; dy: number; target: number } | null>(null);
  const layouts = useRef(new Map<string, { y: number; height: number }>());
  const origin = useRef<{ id: string; center: number } | null>(null);
  const categoryLayouts = useRef(new Map<string, { y: number; height: number }>());
  const categoryOrigin = useRef<{ id: string; center: number } | null>(null);
  const [categoryDrag, setCategoryDrag] = useState<{ id: string; dy: number; target: number } | null>(null);
  const busy = save.isPending || lock.isPending || regenerate.isPending;
  const state = draft?.base ?? query.data;
  const locked = !!query.data?.locked;
  const ids = draft?.ids ?? state?.teams.map(team => team.id) ?? [];
  const categoryCodes = draft?.categoryCodes ?? state?.categories.map(category => category.code) ?? [];
  const categoryEnabled = draft?.enabled ?? state?.category_order_enabled ?? false;
  const stale = !!draft && !!query.data && (draft.base.revision !== query.data.revision ||
    draft.base.range !== query.data.range || draft.base.teams.map(team => team.id).join() !== query.data.teams.map(team => team.id).join() ||
    draft.base.categories.map(category => category.code).join() !== query.data.categories.map(category => category.code).join());

  const updateDraft = (nextIds: string[], nextCategories: string[], nextEnabled: boolean) => {
    if (!state) return;
    const base = draft?.base ?? state;
    const changed = nextIds.join() !== base.teams.map(team => team.id).join() ||
      nextCategories.join() !== base.categories.map(category => category.code).join() || nextEnabled !== base.category_order_enabled;
    setDraft(changed ? { base, ids: nextIds, categoryCodes: nextCategories, enabled: nextEnabled } : null);
    setNotice('');
  };

  const move = (from: number, to: number) => {
    if (!state || busy || locked || stale || from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    updateDraft(next, categoryCodes, categoryEnabled);
  };
  const moveCategory = (from: number, to: number) => {
    if (!state || busy || locked || stale || from === to || from < 0 || to < 0 || from >= categoryCodes.length || to >= categoryCodes.length) return;
    const next = [...categoryCodes];
    next.splice(to, 0, next.splice(from, 1)[0]);
    updateDraft(ids, next, categoryEnabled);
  };
  const handleDrag = (id: string, dy: number, phase: 'start' | 'move' | 'end' | 'cancel') => {
    if (phase === 'cancel') { origin.current = null; setDrag(null); return; }
    if (locked || busy || stale) { origin.current = null; setDrag(null); return; }
    if (phase === 'start') {
      const layout = layouts.current.get(id);
      if (!layout) return;
      origin.current = { id, center: layout.y + layout.height / 2 };
    }
    if (origin.current?.id !== id) return;
    const center = origin.current.center + dy;
    let target = ids.indexOf(id);
    let distance = Infinity;
    ids.forEach((key, index) => {
      const layout = layouts.current.get(key);
      if (!layout) return;
      const delta = Math.abs(center - (layout.y + layout.height / 2));
      if (delta < distance) { distance = delta; target = index; }
    });
    if (phase === 'end') { move(ids.indexOf(id), target); origin.current = null; setDrag(null); }
    else setDrag({ id, dy, target });
  };
  const handleCategoryDrag = (id: string, dy: number, phase: 'start' | 'move' | 'end' | 'cancel') => {
    if (phase === 'cancel' || locked || busy || stale) { categoryOrigin.current = null; setCategoryDrag(null); return; }
    if (phase === 'start') {
      const layout = categoryLayouts.current.get(id);
      if (!layout) return;
      categoryOrigin.current = { id, center: layout.y + layout.height / 2 };
    }
    if (categoryOrigin.current?.id !== id) return;
    const center = categoryOrigin.current.center + dy;
    let target = categoryCodes.indexOf(id);
    let distance = Infinity;
    categoryCodes.forEach((key, index) => {
      const layout = categoryLayouts.current.get(key);
      if (!layout) return;
      const delta = Math.abs(center - (layout.y + layout.height / 2));
      if (delta < distance) { distance = delta; target = index; }
    });
    if (phase === 'end') { moveCategory(categoryCodes.indexOf(id), target); categoryOrigin.current = null; setCategoryDrag(null); }
    else setCategoryDrag({ id, dy, target });
  };
  const openDialog = (next: 'lock' | 'unlock' | 'regenerate') => { setDialogError(''); setCode(''); setDialog(next); };
  const confirm = async () => {
    if (!query.data || busy) return;
    setDialogError('');
    try {
      if (dialog === 'regenerate') {
        const result = await regenerate.mutateAsync();
        setNotice(`Regenerated ${result.participant_count} chest numbers.`);
      } else {
        const next = await lock.mutateAsync({ state: query.data, locked: dialog === 'lock', code });
        if (!next.locked) setDraft(null);
        setNotice(next.locked ? 'Chest numbers are finally locked.' : 'Unlocked. Existing order and numbers have been retained.');
      }
      setDialog(null); setCode('');
    } catch (error: any) { setDialogError(error.message || 'Unable to update chest-number settings.'); }
  };

  return (
    <ScrollView scrollEnabled={!drag && !categoryDrag} className="flex-1 bg-ssf-bg" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View className="flex-row items-center mb-5 gap-3">
        <TouchableOpacity accessibilityLabel="Back to participants" onPress={goBack} className="p-2 bg-core-surface-white rounded-full border border-ssf-border"><ArrowLeft size={20} color={ui.colors.text} /></TouchableOpacity>
        <Text className="text-2xl font-poppins-black text-ssf-text flex-1">Chest Numbers</Text>
      </View>
      {query.isLoading ? <SsfTableSkeleton rows={4} columns={2} compact /> : query.error && !query.data ? (
        <SsfCard><Text className="font-poppins text-core-danger-red-700 mb-3">{query.error.message}</Text><Button variant="outline" onPress={() => { void query.refetch(); }}>Retry</Button></SsfCard>
      ) : state ? (
        <>
          <View className="bg-core-info-soft-blue-50 border border-core-info-soft-blue-200 p-3 rounded-xl mb-4 flex-row gap-3">
            {locked ? <LockKeyhole size={20} color={ui.colors.info} /> : <AlertTriangle size={20} color={ui.colors.info} />}
            <View className="flex-1"><Text className="font-poppins-bold text-core-info-blue-800">{locked ? 'Chest numbers locked' : 'Team number order'}</Text>
              <Text className="font-poppins text-xs text-core-info-blue-700 mt-1">{locked ? 'Unlock with the tenant ID to change the order or regenerate numbers.' : `Drag a team or use the arrows. The first team gets ${state.range}–${state.range * 2 - 1}. Save before final locking.`}</Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2 mb-3">
            {locked ? <Button variant="outline" disabled={busy} onPress={() => openDialog('unlock')}>Unlock</Button> : (
              <>
                {!!draft && <Button disabled={busy || stale} loading={save.isPending} onPress={async () => {
                  try { await save.mutateAsync({ state: draft.base, teamIds: draft.ids, categoryCodes: draft.categoryCodes, enabled: draft.enabled }); setDraft(null); setNotice('Order and chest numbers saved.'); }
                  catch (error: any) { setNotice(error.message || 'Unable to save chest-number order.'); }
                }}>Save order</Button>}
                {!!draft && <Button variant="ghost" disabled={busy} onPress={() => { setDraft(null); setNotice(''); void query.refetch(); }}>Discard changes</Button>}
                <Button variant="outline" disabled={busy || !!draft || !ids.length} onPress={() => openDialog('lock')}>Final Lock</Button>
                <Button variant="outline" disabled={busy || !!draft} onPress={() => openDialog('regenerate')}>Regenerate All</Button>
              </>
            )}
          </View>
          {stale && <Text accessibilityRole="alert" className="font-poppins text-sm text-core-danger-red-700 mb-3">Saved settings or teams changed. Discard changes to load the current order.</Text>}
          {!!notice && <Text accessibilityRole="alert" className="font-poppins text-sm text-ssf-text mb-3">{notice}</Text>}
          {!!draft && <Text className="font-poppins text-xs text-ssf-text-muted mb-3">Preview only. Save order will reassign existing chest numbers.</Text>}
          {!ids.length ? <SsfCard><Text className="font-poppins text-ssf-text-muted">No teams found for this festival.</Text></SsfCard> : <View>
            {ids.map((id, index) => {
              const team = state.teams.find(team => team.id === id)!;
              const maxSlot = Math.max(0, ...state.teams.map(team => team.slot_number ?? 0));
              const unallocatedIndex = state.teams.slice(0, index + 1).filter(team => team.slot_number === null).length;
              const slot = draft ? index + 1 : team.slot_number ?? maxSlot + unallocatedIndex;
              return <ChestTeamOrderRow key={id} team={team} index={index} count={ids.length} range={state.range} slot={slot}
                disabled={locked || busy || stale} dragging={drag?.id === id} offset={drag?.id === id ? drag.dy : 0}
                dropTarget={!!drag && drag.target === index} onMove={move} onDrag={handleDrag}
                onLayout={(key, y, height) => { layouts.current.set(key, { y, height }); }} />;
            })}
          </View>}
          {state.category_order_available && <><View className="mt-3 mb-3 flex-row flex-wrap items-center gap-2">
            <View className="flex-1 min-w-0">
              <Text className="font-poppins-bold text-ssf-text">Category order within each team</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">One shared order for every team. OFF keeps the existing team-wise numbering.</Text>
            </View>
            <Button variant="outline" disabled={locked || busy || stale} onPress={() => updateDraft(ids, categoryCodes, !categoryEnabled)}>
              {categoryEnabled ? 'ON · Turn off' : 'OFF · Turn on'}
            </Button>
          </View>
          {categoryCodes.length === 0 ? <SsfCard><Text className="font-poppins text-ssf-text-muted">No categories available.</Text></SsfCard> :
            categoryCodes.map((code, index) => {
              const category = state.categories.find(item => item.code === code)!;
              return <ChestTeamOrderRow key={code} team={{ id: code, name: category.name, total: category.total, numeric: 0, slot_number: null }}
                category index={index} count={categoryCodes.length} range={state.range} slot={0}
                disabled={locked || busy || stale} dragging={categoryDrag?.id === code} offset={categoryDrag?.id === code ? categoryDrag.dy : 0}
                dropTarget={!!categoryDrag && categoryDrag.target === index} onMove={moveCategory} onDrag={handleCategoryDrag}
                onLayout={(key, y, height) => { categoryLayouts.current.set(key, { y, height }); }} />;
            })}</>}
        </>
      ) : null}
      <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) setDialog(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-core-surface-strong-black/40 items-center justify-center p-4">
          <View accessibilityViewIsModal className="bg-core-surface-white rounded-2xl p-5 w-full max-w-md">
            <Text className="font-poppins-bold text-lg text-ssf-text">{dialog === 'unlock' ? 'Unlock chest numbers' : dialog === 'lock' ? 'Final lock chest numbers?' : 'Regenerate all chest numbers?'}</Text>
            <Text className="font-poppins text-sm text-ssf-text-muted mt-2 mb-4">{dialog === 'unlock' ? 'Enter the tenant ID as the unlock code. Existing numbers will stay as they are.' : dialog === 'lock' ? `This prevents team/category reordering and regeneration until unlocked.${categoryEnabled ? ' Adding participants or changing their category/team will also require unlocking.' : ''}` : 'This reassigns all participant numbers using the saved team and category order.'}</Text>
            {dialog === 'unlock' && <TextInput accessibilityLabel="Unlock code (Tenant ID)" placeholder="Unlock code (Tenant ID)" secureTextEntry
              value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} editable={!busy}
              onSubmitEditing={() => { if (code.trim()) void confirm(); }}
              className="border border-ssf-border rounded-lg px-3 mb-3 font-poppins text-ssf-text" style={{ height: 40 }} />}
            {!!dialogError && <Text accessibilityRole="alert" className="text-core-danger-red-700 font-poppins text-sm mb-3">{dialogError}</Text>}
            <View className="flex-row justify-end gap-2">
              <Button variant="ghost" disabled={busy} onPress={() => { setDialog(null); setCode(''); }}>Cancel</Button>
              <Button loading={busy} disabled={busy || (dialog === 'unlock' && !code.trim())} onPress={() => { void confirm(); }}>{dialog === 'unlock' ? 'Unlock' : dialog === 'lock' ? 'Final Lock' : 'Regenerate'}</Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

function CategoryChestNumbers({ festival }: { festival: { id: string; chest_number_template?: 'category' | 'team'; chest_number_category_range?: 100 | 1000 } }) {
  const goBack = useGoBack('/(admin)/participants');
  const { participants, isLoadingList, regenerateChestNumbers, isRegeneratingChestNumbers } = useParticipants();
  const [notice, setNotice] = useState('');
  const isTeamTemplate = festival?.chest_number_template === 'team';

  const categoryStats = useMemo(() => {
    const stats = new Map<string, { category: string; total: number; numeric: number }>();
    participants.filter((participant: any) => participant.festival_id === festival?.id).forEach((participant: any) => {
      const category = isTeamTemplate
        ? String(participant.organisations?.name || participant.organisation_id || 'No team').trim()
        : String(participant.category_code || 'Uncategorised').trim();
      const key = isTeamTemplate ? String(participant.organisation_id || 'no-team') : category;
      const current = stats.get(key) ?? { category, total: 0, numeric: 0 };
      current.total += 1;
      if (/^\d+$/.test(String(participant.chest_number || ''))) current.numeric += 1;
      stats.set(key, current);
    });
    return Array.from(stats.values()).sort((a, b) => a.category.localeCompare(b.category));
  }, [participants, isTeamTemplate, festival?.id]);

  const range = festival?.chest_number_category_range ?? 100;

  const confirmRegenerate = () => {
    if (!festival?.id || isRegeneratingChestNumbers) return;
    const run = async () => {
      setNotice('');
      try {
        const result = await regenerateChestNumbers(festival.id);
        setNotice(`Regenerated ${result.participant_count} chest numbers.`);
      } catch (error: any) {
        setNotice(error?.message || 'Chest-number regeneration failed. No numbers were changed.');
      }
    };
    const message = `Replace every existing chest number using the ${isTeamTemplate ? 'team' : 'category'} template? This cannot be undone automatically.`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) void run();
    } else {
      Alert.alert('Regenerate all chest numbers', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', style: 'destructive', onPress: () => { void run(); } },
      ]);
    }
  };

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-core-surface-white rounded-full border border-ssf-border">
          <ArrowLeft size={20} color={ui.colors.text} />
        </TouchableOpacity>
        <Text className="text-2xl font-poppins-black text-ssf-text">Chest Numbers</Text>
      </View>

      <View className="bg-core-info-soft-blue-50 border border-core-info-soft-blue-200 p-4 rounded-xl mb-4 flex-row gap-x-3">
        <AlertTriangle size={22} color={ui.colors.info} />
        <View className="flex-1">
          <Text className="font-poppins-bold text-core-info-blue-800">Numeric {isTeamTemplate ? 'team' : 'category'} ranges</Text>
          <Text className="font-poppins text-xs text-core-info-blue-700 mt-1">
            {isTeamTemplate ? 'Team' : 'Category'} 1 starts at {range}, {isTeamTemplate ? 'team' : 'category'} 2 starts at {range * 2}, and so on. Each {isTeamTemplate ? 'team' : 'category'} can contain up to {range} participants.
          </Text>
        </View>
      </View>

      <View className="mb-4 items-start">
        <Button onPress={confirmRegenerate} disabled={!festival?.id || isRegeneratingChestNumbers}>
          {isRegeneratingChestNumbers ? 'Regenerating...' : 'Regenerate All'}
        </Button>
        <Text className="mt-2 font-poppins text-xs text-ssf-text-muted">This manually reassigns all numbers. Saving a different template or range in Calendar also renumbers existing participants automatically.</Text>
        {!!notice && <Text className="mt-2 font-poppins text-sm text-ssf-text">{notice}</Text>}
      </View>

      {isLoadingList ? (
        <SsfTableSkeleton rows={6} columns={3} compact />
      ) : categoryStats.length === 0 ? (
        <SsfCard><Text className="font-poppins text-ssf-text-muted">No participants found for this festival.</Text></SsfCard>
      ) : categoryStats.map((stat) => (
        <SsfCard key={stat.category} className="mb-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="font-poppins-bold text-ssf-text">{isTeamTemplate ? 'Team' : 'Category'} {stat.category}</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">{stat.total} participants · {stat.numeric}/{stat.total} numeric chest numbers</Text>
            </View>
            {stat.numeric === stat.total ? <CheckCircle size={20} color={coreColor("#15803D", 'success')} /> : <AlertTriangle size={20} color={ui.colors.warning} />}
          </View>
        </SsfCard>
      ))}
    </ScrollView>
  );
}
