import { coreColor } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import { ui } from '@/constants/designSystem';
import { isGeneralCategoryCode } from '@/core/utils/generalCategory';
import React, { useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, ScrollView, Alert, TextInput, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { useFestival } from '../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../core/hooks/useFestivalCategories';
import { useAuthStore } from '../../../core/store/authStore';
import { HANDBOOK_ITEMS } from '../../../constants/items';
import { useRouter } from 'expo-router';
import { Search, CheckCircle, Circle, Pencil } from 'lucide-react-native';
import { Card, CardContent } from '../../../components/ui/shadcn/card';
import { Button } from '../../../components/ui/shadcn/button';
import { Input } from '../../../components/ui/shadcn/input';
import { Label } from '../../../components/ui/shadcn/label';
import { createRequestId } from '../../../core/utils/requestId';

export default function ItemActivationSettings() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  const { useActiveFestival, useActiveItems, useSelectableItems, useApplyItemChanges, useUpdateCompetitionItem } = useFestival();
  const { tenant_id: currentTenantId } = useAuthStore();
  const { data: festival } = useActiveFestival();
  const isCollegeFest = festival?.festival_template === 'college_fest';
  const { data: collegeCategories = [], isLoading: categoriesLoading } = useFestivalCategories(
    isCollegeFest ? festival?.id : undefined,
    true,
  );
  const itemCategoryOptions = useMemo(() => {
    if (!isCollegeFest || festival?.general_category_enabled !== true) {
      return collegeCategories.filter(category => !isGeneralCategoryCode(category.code));
    }
    return collegeCategories;
  }, [collegeCategories, festival?.general_category_enabled, isCollegeFest]);
  const { data: activeCodes, isLoading, error: activeItemsError, refetch: retryActiveItems } = useActiveItems(festival?.id);
  const { data: persistedItems = [], isLoading: persistedItemsLoading, error: selectableItemsError, refetch: retrySelectableItems } = useSelectableItems(festival?.id);
  const applyItemChanges = useApplyItemChanges(festival?.id);
  const updateCompetitionItem = useUpdateCompetitionItem(festival?.id);

  const [search, setSearch] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [selectionBase, setSelectionBase] = useState<string[]>([]);
  const [draftFestivalId, setDraftFestivalId] = useState<string | null>(null);
  const [customItems, setCustomItems] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [customForm, setCustomForm] = useState({
    code: 'CUST-', name: '', cat: 'GN', type: 'individual', groupSize: '',
    itemType: null as 'stage' | 'offstage' | null,
    participantLimitMode: 'unlimited' as 'unlimited' | 'limited',
    maxParticipantsPerTeam: '',
  });
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', categoryText: '', categoryCodes: [] as string[], groupSize: '',
    itemType: null as 'stage' | 'offstage' | null,
    participantLimitMode: 'unlimited' as 'unlimited' | 'limited',
    maxParticipantsPerTeam: '',
  });
  const tenantFilterStorageKey = `items-show-tenant-only:${currentTenantId || 'unknown'}`;
  const [showTenantItemsOnly, setShowTenantItemsOnly] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.localStorage.getItem(`items-show-tenant-only:${currentTenantId || 'unknown'}`) === 'true';
    }
    return false;
  });
  const [tenantFilterLoaded, setTenantFilterLoaded] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setShowTenantItemsOnly(typeof window !== 'undefined' && window.localStorage.getItem(tenantFilterStorageKey) === 'true');
      setTenantFilterLoaded(true);
      return;
    }
    let cancelled = false;
    setTenantFilterLoaded(false);
    AsyncStorage.getItem(tenantFilterStorageKey).then(value => {
      if (!cancelled) {
        setShowTenantItemsOnly(value === 'true');
        setTenantFilterLoaded(true);
      }
    }).catch(() => {
      if (!cancelled) setTenantFilterLoaded(true);
    });
    return () => { cancelled = true; };
  }, [tenantFilterStorageKey]);

  useEffect(() => {
    if (tenantFilterLoaded) {
      AsyncStorage.setItem(tenantFilterStorageKey, String(showTenantItemsOnly)).catch(() => undefined);
    }
  }, [showTenantItemsOnly, tenantFilterLoaded, tenantFilterStorageKey]);

  useEffect(() => {
    if (isCollegeFest && itemCategoryOptions.length > 0) {
      setCustomForm(current => ({ ...current, cat: current.cat && current.cat.split(',').every(code => itemCategoryOptions.some(category => category.code === code))
        ? current.cat
        : itemCategoryOptions[0].code }));
    } else if (!isCollegeFest) {
      setCustomForm(current => ({ ...current, cat: 'GN' }));
    }
  }, [isCollegeFest, itemCategoryOptions]);

  useEffect(() => {
    if (festival?.id && activeCodes && draftFestivalId !== festival.id) {
      setSelectedCodes(activeCodes);
      setSelectionBase(activeCodes);
      setDraftFestivalId(festival.id);
      setCustomItems([]);
    }
  }, [activeCodes, festival?.id, draftFestivalId]);

  const availableItems = useMemo(() => {
    const combined = [
      ...HANDBOOK_ITEMS,
      ...(Array.isArray(persistedItems) ? persistedItems : []),
      ...customItems,
    ];
    const unique = new Map<string, any>();
    combined.forEach(item => {
      const existing = unique.get(item.item_code);
      const isCurrentTenantItem = item.tenant_id === currentTenantId || item.source === 'custom';
      if (!existing || isCurrentTenantItem) unique.set(item.item_code, item);
    });
    return Array.from(unique.values()).filter(item =>
      !showTenantItemsOnly || item.tenant_id === currentTenantId || item.source === 'custom'
    );
  }, [currentTenantId, customItems, persistedItems, showTenantItemsOnly]);

  const groupedItems = useMemo(() => {
    const combined = availableItems;
    const list = combined.filter(item =>
      String(item.item_name_ml ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(item.item_name_en ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(item.item_code ?? '').toLowerCase().includes(search.toLowerCase())
    );

    const grouped: Record<string, typeof list> = {};
    list.forEach(item => {
      const cat = item.category_codes[0] || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    return grouped;
  }, [availableItems, search]);

  const allItems = useMemo(() => {
    return availableItems.filter(item =>
      String(item.item_name_ml ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(item.item_name_en ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(item.item_code ?? '').toLowerCase().includes(search.toLowerCase())
    );
  }, [availableItems, search]);

  const toggleItem = (code: string) => {
    setSelectedCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const isDraftCustomItem = (item: any) => customItems.some(draft => draft.item_code === item.item_code);
  const canEditItem = (item: any) => isDraftCustomItem(item) || (
    !!currentTenantId && item.tenant_id === currentTenantId && item.festival_id === festival?.id
  );
  const getGroupMemberLabel = (item: any) => {
    if (item.participation_type !== 'group') return null;
    const min = Number(item.group_min_members);
    const max = Number(item.group_max_members);
    if (Number.isSafeInteger(min) && min > 0 && min === max) return `${min} members`;
    if (Number.isSafeInteger(min) && min > 0 && Number.isSafeInteger(max) && max >= min) return `${min}–${max} members`;
    if (Number.isSafeInteger(min) && min > 0) return `${min}+ members`;
    return 'Member count not set';
  };

  const beginEditItem = (item: any) => {
    const categories = Array.isArray(item.category_codes) ? item.category_codes : [];
    const groupSize = item.group_min_members != null && item.group_min_members === item.group_max_members
      ? String(item.group_min_members)
      : '';
    setEditingItem(item);
    setEditForm({
      name: String(item.item_name_ml ?? ''),
      categoryText: categories.join(', '),
      categoryCodes: categories,
      groupSize,
      itemType: item.item_type === 'stage' || item.item_type === 'offstage' ? item.item_type : null,
      participantLimitMode: Number(item.max_participants_per_team) > 0 ? 'limited' : 'unlimited',
      maxParticipantsPerTeam: item.max_participants_per_team == null ? '' : String(item.max_participants_per_team),
    });
  };

  const handleSaveItemEdit = async () => {
    if (!editingItem) return;
    const categoryCodes = isCollegeFest
      ? editForm.categoryCodes.map(code => code.trim()).filter(Boolean)
      : editForm.categoryText.split(',').map(code => code.trim()).filter(Boolean);
    const uniqueCategoryCodes = [...new Set(categoryCodes)];
    if (!editForm.name.trim() || uniqueCategoryCodes.length === 0 || uniqueCategoryCodes.length !== categoryCodes.length) {
      Alert.alert('Error', 'Enter a name and one or more unique category codes.');
      return;
    }

    let groupMemberCount: number | null = null;
    if (editingItem.participation_type === 'group') {
      const count = Number(editForm.groupSize);
      if (!/^\d+$/.test(editForm.groupSize.trim()) || !Number.isSafeInteger(count) || count < 1 || count > 2147483647) {
        Alert.alert('Error', 'Enter a positive whole-number member count.');
        return;
      }
      groupMemberCount = count;
    }
    const maxParticipantsPerTeam = editingItem.participation_type === 'individual' && editForm.participantLimitMode === 'limited'
      ? Number(editForm.maxParticipantsPerTeam) : null;
    if (editingItem.participation_type === 'individual' && editForm.participantLimitMode === 'limited'
      && (!/^\d+$/.test(editForm.maxParticipantsPerTeam.trim()) || !Number.isSafeInteger(maxParticipantsPerTeam)
        || maxParticipantsPerTeam! < 1 || maxParticipantsPerTeam! > 2147483647)) {
      Alert.alert('Error', 'Enter a positive whole-number participant limit.');
      return;
    }

    const cleanedName = editForm.name.trim();
    if (isDraftCustomItem(editingItem)) {
      setCustomItems(current => current.map(item => item.item_code !== editingItem.item_code ? item : {
        ...item,
        item_name_ml: cleanedName,
        item_name_en: !item.item_name_en || item.item_name_en === item.item_name_ml ? cleanedName : item.item_name_en,
        category_codes: uniqueCategoryCodes,
        item_type: editForm.itemType,
        max_participants_per_team: maxParticipantsPerTeam,
        ...(groupMemberCount == null ? {} : { group_min_members: groupMemberCount, group_max_members: groupMemberCount }),
      }));
      setEditingItem(null);
      return;
    }

    if (!canEditItem(editingItem)) {
      Alert.alert('Error', 'Only competitions owned by this festival can be edited.');
      return;
    }
    try {
      await updateCompetitionItem.mutateAsync({
        itemId: editingItem.id,
        itemNameMl: cleanedName,
        categoryCodes: uniqueCategoryCodes,
        groupMemberCount,
        itemType: editForm.itemType,
        maxParticipantsPerTeam,
        expectedUpdatedAt: editingItem.updated_at ?? null,
      });
      Alert.alert('Success', 'Competition details saved.');
      setEditingItem(null);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update competition details.');
    }
  };

  const handleAddCustom = () => {
    if (!customForm.name || !customForm.cat) {
      Alert.alert('Error', 'Please fill in Name and Category');
      return;
    }
    const categories = [...new Set(customForm.cat.split(',').map(value => value.trim()).filter(Boolean))];
    if (!categories.length || (isCollegeFest && categories.some(code => !itemCategoryOptions.some(category => category.code === code)))) {
      Alert.alert('Error', 'Select valid categories.'); return;
    }
    const groupSize = Number(customForm.groupSize);
    if (customForm.type === 'group' && (!/^\d+$/.test(customForm.groupSize.trim()) || !Number.isSafeInteger(groupSize) || groupSize < 1 || groupSize > 2147483647)) {
      Alert.alert('Error', 'Enter the number of members for this group competition.');
      return;
    }
    const maxParticipantsPerTeam = customForm.type === 'individual' && customForm.participantLimitMode === 'limited'
      ? Number(customForm.maxParticipantsPerTeam) : null;
    if (customForm.type === 'individual' && customForm.participantLimitMode === 'limited'
      && (!/^\d+$/.test(customForm.maxParticipantsPerTeam.trim()) || !Number.isSafeInteger(maxParticipantsPerTeam)
        || maxParticipantsPerTeam! < 1 || maxParticipantsPerTeam! > 2147483647)) {
      Alert.alert('Error', 'Enter a positive whole-number participant limit.');
      return;
    }
    const newItems = categories.map(category => {
      const id = createRequestId();
      return { id, item_code: `${category.toUpperCase()}-C${id.slice(0, 8).toUpperCase()}`,
        item_name_ml: customForm.name.trim(), category_codes: [category], participation_type: customForm.type, source: 'custom',
        item_type: customForm.itemType, max_participants_per_team: maxParticipantsPerTeam,
        ...(customForm.type === 'group' ? { group_min_members: groupSize, group_max_members: groupSize } : {}) };
    });
    setCustomItems([...customItems, ...newItems]);
    setSelectedCodes([...selectedCodes, ...newItems.map(item => item.item_code)]);
    setIsAddModalOpen(false);
    setCategoryMenuOpen(false);
    setCustomForm({ code: '', name: '', cat: isCollegeFest ? (itemCategoryOptions[0]?.code || '') : 'GN', type: 'individual', groupSize: '', itemType: null, participantLimitMode: 'unlimited', maxParticipantsPerTeam: '' });
  };

  const handleSave = async () => {
    if (activeItemsError || selectableItemsError || !activeCodes || !draftFestivalId) return;
    try {
      const selectedSet = new Set(selectedCodes);
      const originalSet = new Set(selectionBase);
      const activateCodes = selectedCodes.filter(code => !originalSet.has(code));
      const deactivateCodes = selectionBase.filter(code => !selectedSet.has(code));
      const selectedRecords = [...HANDBOOK_ITEMS, ...customItems].filter(i =>
        activateCodes.includes(i.item_code)
      );
      await applyItemChanges.mutateAsync({
        activateCodes,
        deactivateCodes,
        itemRecords: selectedRecords
      });
      Alert.alert('Success', 'Item changes saved.');
      router.replace('/(admin)/settings' as any);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to sync items');
    }
  };

  if (isLoading || persistedItemsLoading) {
    return (
      <View className="flex-1 bg-ssf-bg items-center justify-center">
        <Text className="font-poppins text-ui-text-muted">Loading...</Text>
      </View>
    );
  }

  if (activeItemsError || selectableItemsError) {
    return (
      <View className="flex-1 bg-ssf-bg items-center justify-center px-4">
        <Text className="font-poppins text-core-danger-red-700">Could not load item settings. Your selection was not changed.</Text>
        <Button variant="outline" size="sm" onPress={() => { void retryActiveItems(); void retrySelectableItems(); }}>Retry loading items</Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-ssf-bg">
      <ScrollView className="flex-1 py-6 px-4" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Page Title — matches schedule page pattern */}
        <View className="mb-6">
          <Text className="text-3xl font-poppins-black text-ui-text">Item Activation</Text>
          <Text className="text-sm font-poppins text-ui-text-muted mt-1">
            Enable items from the {HANDBOOK_ITEMS.length} official events
          </Text>
        </View>

        {/* Search + Actions Bar */}
        <View className="flex-row items-center gap-3 mb-4">
          <View className="flex-1 flex-row items-center bg-core-surface-white border border-ui-border rounded-lg px-3 h-10">
            <Search size={16} color={ui.colors.textSubtle} />
            <TextInput
              className="flex-1 ml-2 font-poppins text-sm text-ui-text"
              placeholder="Search items or codes..."
              placeholderTextColor={ui.colors.textSubtle}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <Button variant="outline" size="sm" disabled={isCollegeFest && (categoriesLoading || itemCategoryOptions.length === 0)} onPress={() => setIsAddModalOpen(true)}>
            + Custom
          </Button>
          <Button variant="ghost" size="sm" onPress={() => setSelectedCodes(availableItems.map(i => i.item_code))}>
            Select All
          </Button>
        </View>

        <TouchableOpacity
          className="mb-4 flex-row items-center gap-2 self-start rounded-lg border border-ui-border bg-core-surface-white px-3 py-2"
          onPress={() => setShowTenantItemsOnly(current => !current)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: showTenantItemsOnly }}
        >
          {showTenantItemsOnly ? <CheckCircle size={17} color={coreColor("#0F766E", 'primaryText')} /> : <Circle size={17} color={ui.colors.textSubtle} />}
          <Text className="font-poppins text-xs text-ui-text">
            Show this tenant&apos;s competitions only
          </Text>
        </TouchableOpacity>

        {/* Stats */}
        <Text className="text-sm font-poppins-bold text-ui-text-muted mb-4 px-1">
          {selectedCodes.length} items selected
        </Text>

        {/* Desktop: Table View */}
        {isDesktop ? (
          <Card className="mb-6">
            <CardContent className="p-0">
              {/* Table Header */}
              <View className="flex-row bg-ui-muted px-4 py-3 border-b border-ui-border">
                <View className="w-10" />
                <View className="flex-1">
                  <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Code</Text>
                </View>
                <View className="flex-[2]">
                  <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Name</Text>
                </View>
                <View className="w-24">
                  <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Category</Text>
                </View>
                <View className="w-24">
                  <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Type</Text>
                </View>
                <View className="w-10" />
              </View>

              {/* Table Rows */}
              {allItems.map((item, idx) => {
                const isSelected = selectedCodes.includes(item.item_code);
                return (
                  <View
                    key={item.item_code}
                    className={`flex-row items-center px-4 py-3 border-b border-ui-border ${
                      isSelected ? 'bg-core-success-soft-green-50' : idx % 2 === 0 ? 'bg-core-surface-white' : 'bg-ui-muted/30'
                    }`}
                  >
                    <TouchableOpacity
                      className="flex-1 flex-row items-center"
                      onPress={() => toggleItem(item.item_code)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                    >
                      <View className="w-10">
                        {isSelected ? (
                          <CheckCircle size={18} color={coreColor("#0F766E", 'primaryText')} />
                        ) : (
                          <Circle size={18} color={coreColor("#CBD5E1", 'text')} />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="font-poppins-bold text-xs text-ui-primary-text">{item.item_code}</Text>
                      </View>
                      <View className="flex-[2]">
                        <Text className="font-poppins text-sm text-ui-text">{item.item_name_ml}</Text>
                      </View>
                      <View className="w-24">
                        <View className="bg-ui-primary/10 px-2 py-0.5 rounded self-start">
                          <Text className="font-poppins-bold text-[10px] text-ui-primary-text">
                            {(item.category_codes || []).join(', ') || 'GN'}
                          </Text>
                        </View>
                      </View>
                      <View className="w-24">
                        <Text className="font-poppins text-xs text-ui-text-muted">
                          {item.participation_type === 'individual' ? 'Individual' : `Group · ${getGroupMemberLabel(item)}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <View className="w-10 items-end">
                      {canEditItem(item) && (
                        <TouchableOpacity
                          className="h-9 w-9 items-center justify-center rounded-md border border-ui-border bg-core-surface-white"
                          onPress={() => beginEditItem(item)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${item.item_name_ml}`}
                        >
                          <Pencil size={15} color={ui.colors.textSubtle} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}

              {allItems.length === 0 && (
                <View className="py-12 items-center">
                  <Text className="font-poppins text-ui-text-muted">No items found</Text>
                </View>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Mobile: Card View */
          <View>
            {Object.entries(groupedItems).map(([category, items]) => (
              <View key={category} className="mb-4">
                <View className="bg-ui-primary/10 py-1 px-3 rounded self-start mb-3">
                  <Text className="font-poppins-bold text-ui-primary-text text-sm">{category} Category</Text>
                </View>

                {items.map((item) => {
                  const isSelected = selectedCodes.includes(item.item_code);
                  return (
                    <Card key={item.item_code} className={`mb-2 ${isSelected ? 'border-ui-primary/30 bg-core-success-soft-green-50' : ''}`}>
                      <CardContent className="p-0 flex-row items-center">
                        <TouchableOpacity
                          className="flex-1 flex-row items-center p-4"
                          onPress={() => toggleItem(item.item_code)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSelected }}
                        >
                          <View className="flex-1">
                            <Text className="text-xs font-poppins-bold text-ui-primary-text mb-1">{item.item_code}</Text>
                            <Text className="text-base font-poppins-bold text-ui-text">{item.item_name_ml}</Text>
                            <Text className="text-xs text-ui-text-muted mt-1">
                              {item.participation_type === 'individual' ? 'Individual match' : `Group match · ${getGroupMemberLabel(item)}`}
                            </Text>
                          </View>
                          {isSelected ? (
                            <CheckCircle size={22} color={coreColor("#0F766E", 'primaryText')} />
                          ) : (
                            <Circle size={22} color={coreColor("#CBD5E1", 'text')} />
                          )}
                        </TouchableOpacity>
                        {canEditItem(item) && (
                          <TouchableOpacity
                            className="h-11 w-11 mr-2 items-center justify-center rounded-md border border-ui-border bg-core-surface-white"
                            onPress={() => beginEditItem(item)}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${item.item_name_ml}`}
                          >
                            <Pencil size={15} color={ui.colors.textSubtle} />
                          </TouchableOpacity>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Fixed Save Button */}
      <View className="absolute bottom-0 left-0 right-0 bg-ssf-bg border-t border-ui-border px-4 py-4">
        <Button onPress={handleSave} disabled={applyItemChanges.isPending || !draftFestivalId}>
          {applyItemChanges.isPending ? 'Saving...' : `Save Changes (${selectedCodes.length} Items)`}
        </Button>
      </View>

      {/* Add Custom Item Modal */}
      <Modal visible={isAddModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-core-surface-strong-black/50 justify-end">
          <View className="bg-core-surface-white p-6 rounded-t-3xl min-h-[50%] max-h-[90%]">
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            <Text className="text-xl font-poppins-bold text-ui-text mb-4">Add Custom Item</Text>

            <View className="mb-4">
              <Label>Item Name (Malayalam/English)</Label>
              <Input
                value={customForm.name}
                onChangeText={t => setCustomForm({...customForm, name: t})}
                placeholder="Enter item name"
              />
            </View>

            <View className="mb-4">
              <Label>{isCollegeFest ? 'Category' : 'Category (e.g. GN, LP, UP)'}</Label>
              {isCollegeFest ? (
                <View>
                  <TouchableOpacity
                    className="h-10 justify-center rounded-md border border-ui-border bg-core-surface-white px-3"
                    onPress={() => setCategoryMenuOpen(current => !current)}
                    accessibilityRole="button"
                    accessibilityLabel="Select item category"
                  >
                    <Text className="font-poppins text-sm text-ui-text">
                      {customForm.cat || 'Select categories'}
                    </Text>
                  </TouchableOpacity>
                  {categoryMenuOpen && (
                    <View className="mt-1 rounded-md border border-ui-border bg-core-surface-white">
                      {itemCategoryOptions.map(category => (
                        <TouchableOpacity
                          key={category.id}
                          className="border-b border-ui-border px-3 py-2.5 last:border-b-0"
                          onPress={() => {
                            setCustomForm(current => {
                              const selected = current.cat.split(',').filter(Boolean);
                              return { ...current, cat: (selected.includes(category.code) ? selected.filter(code => code !== category.code) : [...selected, category.code]).join(',') };
                            });
                          }}
                        >
                          <Text className="font-poppins text-sm text-ui-text">{customForm.cat.split(',').includes(category.code) ? '✓ ' : ''}{category.name} ({category.code})</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <Input
                  value={customForm.cat}
                  onChangeText={t => setCustomForm({...customForm, cat: t})}
                  placeholder="Category codes, separated by commas"
                />
              )}
            </View>

            <View className="mb-6">
              <Label>Participation Type</Label>
              <View className="flex-row gap-2 mt-2">
                <Button
                  variant={customForm.type === 'individual' ? 'default' : 'outline'}
                  size="sm"
                  onPress={() => setCustomForm({...customForm, type: 'individual'})}
                >
                  Individual
                </Button>
                <Button
                  variant={customForm.type === 'group' ? 'default' : 'outline'}
                  size="sm"
                  onPress={() => setCustomForm({...customForm, type: 'group'})}
                >
                  Group
                </Button>
              </View>
            </View>

            {customForm.type === 'group' && <View className="mb-6">
              <Label>Members per group *</Label>
              <Input keyboardType="numeric" value={customForm.groupSize}
                onChangeText={groupSize => setCustomForm(current => ({ ...current, groupSize }))}
                placeholder="Enter the number of members" />
            </View>}

            <View className="mb-5">
              <Label>Stage</Label>
              <View className="mt-2 flex-row gap-2">
                <Button variant={customForm.itemType === 'stage' ? 'default' : 'outline'} size="sm" onPress={() => setCustomForm(current => ({ ...current, itemType: 'stage' }))}>On Stage</Button>
                <Button variant={customForm.itemType === 'offstage' ? 'default' : 'outline'} size="sm" onPress={() => setCustomForm(current => ({ ...current, itemType: 'offstage' }))}>Off Stage</Button>
              </View>
            </View>
            {customForm.type === 'individual' && <View className="mb-5">
              <Label>Participants per team</Label>
              <View className="mt-2 flex-row gap-2">
                <Button variant={customForm.participantLimitMode === 'unlimited' ? 'default' : 'outline'} size="sm" onPress={() => setCustomForm(current => ({ ...current, participantLimitMode: 'unlimited', maxParticipantsPerTeam: '' }))}>No Limit</Button>
                <Button variant={customForm.participantLimitMode === 'limited' ? 'default' : 'outline'} size="sm" onPress={() => setCustomForm(current => ({ ...current, participantLimitMode: 'limited' }))}>Set Limit</Button>
              </View>
              {customForm.participantLimitMode === 'limited' && <Input className="mt-2" keyboardType="numeric" value={customForm.maxParticipantsPerTeam} onChangeText={maxParticipantsPerTeam => setCustomForm(current => ({ ...current, maxParticipantsPerTeam }))} placeholder="Maximum students from one team" />}
            </View>}

            <View className="gap-3">
              <Button onPress={handleAddCustom}>Add to List</Button>
              <Button variant="outline" onPress={() => setIsAddModalOpen(false)}>Cancel</Button>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!editingItem}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingItem(null)}
      >
        <View className="flex-1 bg-core-surface-strong-black/50 justify-end">
          <View className="bg-core-surface-white p-6 rounded-t-3xl max-h-[90%]">
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
              <Text className="text-xl font-poppins-bold text-ui-text mb-1">Edit Competition</Text>
              <Text className="text-xs font-poppins text-ui-text-muted mb-5">{editingItem?.item_code}</Text>

              <View className="mb-4">
                <Label>Competition Name</Label>
                <Input
                  value={editForm.name}
                  onChangeText={name => setEditForm(current => ({ ...current, name }))}
                  placeholder="Enter competition name"
                />
              </View>

              <View className="mb-4">
                <Label>Category</Label>
                {isCollegeFest ? (
                  <View className="mt-2 rounded-md border border-ui-border bg-core-surface-white">
                    {[
                      ...itemCategoryOptions,
                      ...(Array.isArray(editingItem?.category_codes) ? editingItem.category_codes : [])
                        .filter((code: string) => !itemCategoryOptions.some(category => category.code === code))
                        .map((code: string) => ({ id: `existing-${code}`, code, name: code })),
                    ].map(category => {
                      const selected = editForm.categoryCodes.includes(category.code);
                      return (
                        <TouchableOpacity
                          key={category.id}
                          className="min-h-11 flex-row items-center border-b border-ui-border px-3 py-2 last:border-b-0"
                          onPress={() => setEditForm(current => ({
                            ...current,
                            categoryCodes: current.categoryCodes.includes(category.code)
                              ? current.categoryCodes.filter(code => code !== category.code)
                              : [...current.categoryCodes, category.code],
                          }))}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                        >
                          <Text className="font-poppins text-sm text-ui-text">
                            {selected ? '✓ ' : ''}{category.name} ({category.code})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <Input
                    value={editForm.categoryText}
                    onChangeText={categoryText => setEditForm(current => ({ ...current, categoryText }))}
                    placeholder="Category codes, separated by commas"
                  />
                )}
              </View>

              {editingItem?.participation_type === 'group' && (
                <View className="mb-5">
                  <Label>Members per group</Label>
                  <Input
                    keyboardType="numeric"
                    value={editForm.groupSize}
                    onChangeText={groupSize => setEditForm(current => ({ ...current, groupSize }))}
                    placeholder="Enter the exact member count"
                  />
                  {!!editingItem && !editForm.groupSize && (
                    <Text className="mt-1 font-poppins text-xs text-ui-text-muted">
                      Current setting: {getGroupMemberLabel(editingItem)}. Enter a number to set the exact group size.
                    </Text>
                  )}
                </View>
              )}

              <View className="mb-5">
                <Label>Stage</Label>
                <View className="mt-2 flex-row gap-2">
                  <Button variant={editForm.itemType === 'stage' ? 'default' : 'outline'} size="sm" onPress={() => setEditForm(current => ({ ...current, itemType: 'stage' }))}>On Stage</Button>
                  <Button variant={editForm.itemType === 'offstage' ? 'default' : 'outline'} size="sm" onPress={() => setEditForm(current => ({ ...current, itemType: 'offstage' }))}>Off Stage</Button>
                </View>
                {editForm.itemType && <TouchableOpacity className="mt-2 min-h-9 self-start justify-center" onPress={() => setEditForm(current => ({ ...current, itemType: null }))}><Text className="font-poppins text-xs text-ui-text-muted">Clear stage setting</Text></TouchableOpacity>}
              </View>
              {editingItem?.participation_type === 'individual' && (
                <View className="mb-5">
                  <Label>Participants per team</Label>
                  <View className="mt-2 flex-row gap-2">
                    <Button variant={editForm.participantLimitMode === 'unlimited' ? 'default' : 'outline'} size="sm" onPress={() => setEditForm(current => ({ ...current, participantLimitMode: 'unlimited', maxParticipantsPerTeam: '' }))}>No Limit</Button>
                    <Button variant={editForm.participantLimitMode === 'limited' ? 'default' : 'outline'} size="sm" onPress={() => setEditForm(current => ({ ...current, participantLimitMode: 'limited' }))}>Set Limit</Button>
                  </View>
                  {editForm.participantLimitMode === 'limited' && <Input className="mt-2" keyboardType="numeric" value={editForm.maxParticipantsPerTeam} onChangeText={maxParticipantsPerTeam => setEditForm(current => ({ ...current, maxParticipantsPerTeam }))} placeholder="Maximum students from one team" />}
                </View>
              )}

              <View className="gap-3">
                <Button onPress={handleSaveItemEdit} disabled={updateCompetitionItem.isPending}>
                  {updateCompetitionItem.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outline" onPress={() => setEditingItem(null)}>Cancel</Button>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
