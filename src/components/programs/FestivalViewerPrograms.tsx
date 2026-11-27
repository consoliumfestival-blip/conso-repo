import React from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { GitCompare, Search, RefreshCw, UsersRound } from 'lucide-react-native';
import { coreColor } from '@/constants/coreTheme';
import { getPortalCardAccent, getPortalCardColumns, getPortalCardWidth, PORTAL_CARD_GAP } from '../admin/portalCardLayout';
import { SsfCard } from '../ui/SsfCard';
import { SsfSelectMenu } from '../ui/SsfSelectMenu';
import { ProgramParticipantComparisonModal } from './ProgramParticipantComparisonModal';
import { programReadService, type ProgramPage } from '../../services/programReadService';

type Props = { linkId: string; pin: string; onOpenProgram: (item: { id: string; name: string; item_code: string; category_code: string }) => void };
type Section = 'all' | 'individual' | 'group';

export function FestivalViewerPrograms({ linkId, pin, onOpenProgram }: Props) {
  const { width } = useWindowDimensions();
  const [section, setSection] = React.useState<Section>('all');
  const [search, setSearch] = React.useState('');
  const [submitted, setSubmitted] = React.useState('');
  const [stage, setStage] = React.useState('All stages');
  const [status, setStatus] = React.useState('All statuses');
  const [type, setType] = React.useState('All types');
  const [category, setCategory] = React.useState('All categories');
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<ProgramPage | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [refresh, setRefresh] = React.useState(0);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [cardsWidth, setCardsWidth] = React.useState(0);

  React.useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setSubmitted(search.trim()); }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    programReadService.viewerProgramsPage({ linkId, pin, section, search: submitted, type, stage, status, category, page })
      .then(result => { if (!cancelled) setData(result); })
      .catch(cause => { if (!cancelled) { setData(null); setError(cause instanceof Error ? cause.message : 'Could not load programs.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [linkId, pin, section, submitted, type, stage, status, category, page, refresh]);

  const filters = [
    { label: 'stage', value: stage, options: ['All stages', ...(data?.options.stage ?? [])], set: setStage },
    { label: 'status', value: status, options: ['All statuses', 'Open', 'Complete'], set: setStatus },
    { label: 'type', value: type, options: ['All types', ...(data?.options.type ?? [])], set: setType },
    { label: 'category', value: category, options: ['All categories', ...(data?.options.category ?? [])], set: setCategory },
  ];
  const availableWidth = cardsWidth || width - 32;
  const cardWidth = getPortalCardWidth(availableWidth, getPortalCardColumns(availableWidth), Platform.OS === 'web');
  return <View className="flex-1 bg-ssf-bg px-4 pt-4">
    <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
      <View className="mb-4 flex-row flex-wrap items-end justify-between gap-3">
        <View><Text className="font-poppins-black text-2xl text-ui-text">Programs</Text><Text className="mt-1 font-poppins text-xs text-ui-text-muted">{data?.section_total ?? 0} programs · Read-only</Text></View>
        <View className="flex-row flex-wrap items-center gap-1.5">
          {(['all', 'individual', 'group'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: section === value }} onPress={() => { setSection(value); setPage(1); }} className={`h-9 items-center justify-center rounded-md border border-button-border px-2 ${section === value ? 'bg-button-primary' : 'bg-core-surface-white'}`}><Text className={`font-poppins-bold text-[11px] ${section === value ? 'text-button-foreground' : 'text-button-text'}`}>{value === 'all' ? 'All' : value === 'individual' ? 'Individual' : 'Group items'}</Text></TouchableOpacity>)}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Compare participants across programs" onPress={() => setCompareOpen(true)} className="h-9 flex-row items-center gap-1 rounded-md border border-button-border bg-core-surface-white px-2"><GitCompare size={14} color={coreColor('#1B6B3A', 'buttonText')} /><Text className="font-poppins-bold text-[11px] text-button-text">Compare participants</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh programs" onPress={() => setRefresh(value => value + 1)} className="h-9 flex-row items-center gap-1 rounded-md border border-button-border bg-core-surface-white px-2"><RefreshCw size={14} color={coreColor('#1B6B3A', 'buttonText')} /><Text className="font-poppins-bold text-[11px] text-button-text">Refresh</Text></TouchableOpacity>
        </View>
      </View>
      <View className="mb-3 flex-row flex-wrap items-center gap-2 rounded-xl border border-ui-border bg-core-surface-white p-2">
        <View className="h-10 min-w-[210px] flex-1 flex-row items-center rounded-lg border border-ui-border px-3"><Search size={16} color={coreColor('#64748B', 'textMuted')} /><TextInput accessibilityLabel="Search programs" value={search} onChangeText={setSearch} placeholder="Search by program name or code..." className="ml-2 flex-1 font-poppins text-sm text-ui-text" /></View>
        {filters.map(filter => <SsfSelectMenu key={filter.label} value={filter.value} onValueChange={value => { filter.set(value); setPage(1); }} options={filter.options.map(value => ({ label: value, value }))} placeholder={filter.options[0]} accessibilityLabel={`Filter by ${filter.label}`} compact active={filter.value !== filter.options[0]} minMenuWidth={190} style={{ minWidth: 112, height: 40 }} />)}
      </View>
      {loading ? <View className="items-center py-6"><ActivityIndicator /><Text className="mt-2 font-poppins text-xs text-ui-text-muted">Loading programs…</Text></View> : error ? <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setRefresh(value => value + 1)} className="mt-2 h-10 justify-center"><Text className="font-poppins-bold text-xs text-button-text">Retry</Text></TouchableOpacity></SsfCard> : !data?.cards.length ? <SsfCard><Text className="font-poppins text-sm text-ui-text-muted">No matching programs found.</Text></SsfCard> : <View onLayout={event => setCardsWidth(event.nativeEvent.layout.width)} style={{ gap: PORTAL_CARD_GAP, alignItems: 'flex-start' }} className="flex-row flex-wrap">{data.cards.map((card, index) => { const accent = getPortalCardAccent(index); return <SsfCard key={`${card.item.id}:${card.category}`} className="p-2.5" style={{ width: cardWidth, backgroundColor: accent.backgroundColor, borderColor: accent.borderColor }}><View className="flex-row items-start justify-between gap-2"><View className="min-w-0 flex-1"><Text numberOfLines={2} className="font-poppins-bold text-sm text-ui-text">{card.item.item_name_en || card.item.item_code}</Text><Text className="font-poppins text-[10px] text-ui-text-muted">{card.category}</Text></View><Text className="rounded-full bg-core-surface-white px-2 py-1 font-poppins-bold text-[9px] text-ui-text">{card.is_complete ? 'Complete' : 'Open'}</Text></View><View className="mt-3 flex-row gap-1"><Text className="rounded bg-core-surface-white px-1.5 py-1 font-poppins-bold text-[10px] text-ui-text">{card.kind === 'general_team' ? 'Group' : 'Individual'}</Text><Text className="rounded bg-core-surface-white px-1.5 py-1 font-poppins-bold text-[10px] text-ui-text">{card.item.item_type === 'stage' ? 'On Stage' : 'Off Stage'}</Text></View><Text className="mt-3 font-poppins text-[10px] text-ui-text-muted">{card.item.item_code} · {card.assigned_count} assigned</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={`View participants for ${card.item.item_name_en || card.item.item_code}`} onPress={() => onOpenProgram({ id: card.item.id, name: card.item.item_name_en || card.item.item_code, item_code: card.item.item_code, category_code: card.category })} className="mt-2 h-9 items-center justify-center rounded-md border border-ui-border bg-core-surface-white"><View className="flex-row items-center gap-1"><UsersRound size={13} color={coreColor('#334155', 'text')} /><Text className="font-poppins-bold text-[10px] text-ui-text">View participants</Text></View></TouchableOpacity></SsfCard>; })}</View>}
      {!loading && !error && data && <View className="mt-4 flex-row items-center justify-between"><TouchableOpacity accessibilityRole="button" disabled={page <= 1} onPress={() => setPage(value => value - 1)} className="h-10 justify-center px-2"><Text className="font-poppins-bold text-xs text-button-text">Previous</Text></TouchableOpacity><Text className="font-poppins text-xs text-ui-text-muted">Page {page} / {Math.max(1, Math.ceil(data.total / 20))}</Text><TouchableOpacity accessibilityRole="button" disabled={page * 20 >= data.total} onPress={() => setPage(value => value + 1)} className="h-10 justify-center px-2"><Text className="font-poppins-bold text-xs text-button-text">Next</Text></TouchableOpacity></View>}
    </ScrollView>
    <ProgramParticipantComparisonModal visible={compareOpen} tenantId={null} festivalId={null} viewerAccess={{ linkId, pin }} onClose={() => setCompareOpen(false)} />
  </View>;
}
