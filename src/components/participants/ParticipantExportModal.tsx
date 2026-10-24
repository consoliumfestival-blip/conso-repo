import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Check, ChevronDown, Download, FileSpreadsheet, FileText, X } from 'lucide-react-native';

export type ParticipantExportKind = 'slips' | 'team_items' | 'item_verification' | 'csv';
export type ExportChoice = { id: string; label: string };
export type ExportModalColors = {
  overlay: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  onPrimary: string;
  selected: string;
};

const REPORTS: { id: ParticipantExportKind; label: string; detail: string; icon: typeof FileText }[] = [
  { id: 'slips', label: 'Participant slips', detail: 'Compact cut-out slips arranged by participant.', icon: FileText },
  { id: 'team_items', label: 'Team item list', detail: 'Your selected team, grouped by competition.', icon: FileText },
  { id: 'item_verification', label: 'Item verification', detail: 'Assigned participants and system verification status.', icon: FileText },
  { id: 'csv', label: 'Participants CSV', detail: 'One participant per row with chest number and profile fields.', icon: FileSpreadsheet },
];

function InlineSelect({
  label, value, choices, placeholder, colors, onChange,
}: {
  label: string; value: string; choices: ExportChoice[]; placeholder: string;
  colors: ExportModalColors; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = choices.find((choice) => choice.id === value);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search ? choices.filter((choice) => choice.label.toLowerCase().includes(search)) : choices;
  }, [choices, query]);

  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '700' }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label || placeholder}`}
        accessibilityState={{ expanded: open }}
        onPress={() => { setOpen((current) => !current); setQuery(''); }}
        style={{ minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <Text numberOfLines={1} style={{ flex: 1, color: selected ? colors.text : colors.muted, fontSize: 12, fontWeight: selected ? '600' : '400' }}>{selected?.label || placeholder}</Text>
        <ChevronDown size={15} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface }}>
          {choices.length > 7 ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${label.toLowerCase()}`}
              placeholderTextColor={colors.muted}
              style={{ height: 38, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: colors.border, color: colors.text, fontSize: 12, outlineStyle: 'none' as any }}
            />
          ) : null}
          <ScrollView style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
            {filtered.length ? filtered.map((choice) => (
              <Pressable
                key={choice.id}
                accessibilityRole="button"
                accessibilityState={{ selected: choice.id === value }}
                onPress={() => { onChange(choice.id); setOpen(false); }}
                style={{ minHeight: 40, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: choice.id === value ? colors.selected : colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                <Text numberOfLines={2} style={{ flex: 1, color: colors.text, fontSize: 11 }}>{choice.label}</Text>
                {choice.id === value ? <Check size={14} color={colors.primary} /> : null}
              </Pressable>
            )) : <Text style={{ padding: 12, color: colors.muted, fontSize: 11 }}>No matches</Text>}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export function ParticipantExportModal({
  visible, isTeamPortal, colors, teams, items, selectedKind, selectedTeamId,
  selectedItemId, sortBy, busy, loadingOptions = false, errorMessage, onKindChange, onTeamChange,
  onItemChange, onSortChange, onClose, onDownload,
}: {
  visible: boolean; isTeamPortal: boolean; colors: ExportModalColors;
  teams: ExportChoice[]; items: ExportChoice[]; selectedKind: ParticipantExportKind;
  selectedTeamId: string; selectedItemId: string; sortBy: 'team' | 'chest'; busy: boolean;
  loadingOptions?: boolean; errorMessage?: string | null;
  onKindChange: (kind: ParticipantExportKind) => void; onTeamChange: (id: string) => void;
  onItemChange: (id: string) => void; onSortChange: (sort: 'team' | 'chest') => void;
  onClose: () => void; onDownload: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const isPhone = width < 600;
  const report = REPORTS.find((candidate) => candidate.id === selectedKind)!;
  const needsTeam = !isTeamPortal && ['slips', 'team_items'].includes(selectedKind);
  const needsItem = selectedKind === 'item_verification';
  const ready = !busy && !loadingOptions && (!errorMessage || selectedKind === 'csv') && (!needsTeam || !!selectedTeamId) && (!needsItem || !!selectedItemId);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
      <Pressable onPress={() => !busy && onClose()} style={{ flex: 1, justifyContent: isPhone ? 'flex-end' : 'center', padding: isPhone ? 0 : 18, backgroundColor: colors.overlay }}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ width: '100%', maxWidth: 520, maxHeight: isPhone ? Math.min(height * 0.92, 760) : Math.min(height * 0.88, 720), alignSelf: 'center', overflow: 'hidden', borderTopLeftRadius: isPhone ? 16 : 12, borderTopRightRadius: isPhone ? 16 : 12, borderBottomLeftRadius: isPhone ? 0 : 12, borderBottomRightRadius: isPhone ? 0 : 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 9 }, elevation: 8 }}
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 13, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>Export participants</Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Choose a report and download format.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close export options" disabled={busy} onPress={onClose} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
              <X size={18} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, gap: 8 }}>
            {REPORTS.map((option) => {
              const Icon = option.icon;
              const selected = selectedKind === option.id;
              return (
                <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => onKindChange(option.id)} style={{ minHeight: 54, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, borderRadius: 8, backgroundColor: selected ? colors.selected : colors.surface }}>
                  <View style={{ width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.surface : colors.selected }}><Icon size={16} color={colors.primary} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{option.label}</Text>
                    <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>{option.detail}</Text>
                  </View>
                  {selected ? <Check size={16} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
            {loadingOptions ? <Text style={{ color: colors.muted, fontSize: 11, paddingVertical: 5 }}>Loading export data…</Text> : null}
            {!loadingOptions && errorMessage ? <Text accessibilityRole="alert" style={{ color: colors.muted, fontSize: 11, paddingVertical: 5 }}>{errorMessage} You can still export the participant CSV.</Text> : null}
            {needsTeam && !isTeamPortal ? <InlineSelect label="TEAM" value={selectedTeamId} choices={teams} placeholder="Select a team" colors={colors} onChange={onTeamChange} /> : null}
            {needsItem ? <InlineSelect label="ITEM / COMPETITION" value={selectedItemId} choices={items} placeholder="Select an item" colors={colors} onChange={onItemChange} /> : null}
            {needsItem && !isTeamPortal ? (
              <View style={{ gap: 5 }}>
                <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '700' }}>SORT PARTICIPANTS</Text>
                <View style={{ flexDirection: 'row', gap: 7 }}>
                  {([{ id: 'team', label: 'Team' }, { id: 'chest', label: 'Chest number' }] as const).map((choice) => {
                    const selected = sortBy === choice.id;
                    return <Pressable key={choice.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => onSortChange(choice.id)} style={{ minHeight: 38, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.selected : colors.surface, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: selected ? '700' : '500' }}>{choice.label}</Text></Pressable>;
                  })}
                </View>
              </View>
            ) : null}
            <View style={{ paddingTop: 4, flexDirection: isPhone ? 'column' : 'row', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text numberOfLines={2} style={{ flex: 1, color: colors.muted, fontSize: 10 }}>{report.label} · {selectedKind === 'csv' ? 'CSV' : 'PDF'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Download ${report.label}`} accessibilityState={{ disabled: !ready, busy }} disabled={!ready} onPress={onDownload} style={{ minHeight: 42, paddingHorizontal: 15, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.primary, opacity: ready ? 1 : 0.55 }}>
                {selectedKind === 'csv' ? <FileSpreadsheet size={15} color={colors.onPrimary} /> : <Download size={15} color={colors.onPrimary} />}
                <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: '700' }}>{busy || loadingOptions ? 'Preparing…' : `Download ${selectedKind === 'csv' ? 'CSV' : 'PDF'}`}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
