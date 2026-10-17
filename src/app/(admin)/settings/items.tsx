import { ui } from '@/constants/designSystem';
import React, { useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, ScrollView, Alert, TextInput, TouchableOpacity, Modal, useWindowDimensions, Platform } from 'react-native';
import { useFestival } from '../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../core/hooks/useFestivalCategories';
import { useAuthStore } from '../../../core/store/authStore';
import { HANDBOOK_ITEMS } from '../../../constants/items';
import { useRouter } from 'expo-router';
import { Search, CheckCircle, Circle, Plus, Trash2 } from 'lucide-react-native';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/shadcn/card';
import { Button } from '../../../components/ui/shadcn/button';
import { Input } from '../../../components/ui/shadcn/input';
import { Label } from '../../../components/ui/shadcn/label';

export default function ItemActivationSettings() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  const { useActiveFestival, useActiveItems, useItems, useUpdateActiveItems } = useFestival();
  const { tenant_id: currentTenantId } = useAuthStore();
  const { data: festival } = useActiveFestival();
  const isCollegeFest = festival?.festival_template === 'college_fest';
  const { data: collegeCategories = [], isLoading: categoriesLoading } = useFestivalCategories(
    isCollegeFest ? festival?.id : undefined,
    true,
  );
  const itemCategoryOptions = useMemo(() => {
    if (!isCollegeFest || festival?.general_category_enabled !== true) {
      return collegeCategories.filter(category => category.code.toUpperCase() !== 'GN');
    }
    return collegeCategories;
  }, [collegeCategories, festival?.general_category_enabled, isCollegeFest]);
  const { data: activeCodes, isLoading } = useActiveItems(festival?.id);
  const { data: persistedItems = [], isLoading: persistedItemsLoading } = useItems(festival?.id);
  const updateActiveItems = useUpdateActiveItems(festival?.id);

  const [search, setSearch] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [customItems, setCustomItems] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ code: 'CUST-', name: '', cat: 'GN', type: 'individual' });
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
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
      setCustomForm(current => ({ ...current, cat: current.cat && itemCategoryOptions.some(category => category.code === current.cat)
        ? current.cat
        : itemCategoryOptions[0].code }));
    } else if (!isCollegeFest) {
      setCustomForm(current => ({ ...current, cat: 'GN' }));
    }
  }, [isCollegeFest, itemCategoryOptions]);

  useEffect(() => {
    if (activeCodes) {
      setSelectedCodes(activeCodes);
    }
  }, [activeCodes]);

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
      String(item.item_code ?? '').toLowerCase().includes(search.toLowerCase())
    );
  }, [availableItems, search]);

  const toggleItem = (code: string) => {
    setSelectedCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleAddCustom = () => {
    if (!customForm.name || !customForm.cat) {
      Alert.alert('Error', 'Please fill in Name and Category');
      return;
    }
    const autoCode = `${customForm.cat.toUpperCase()}-C${Math.floor(100 + Math.random() * 900)}`;
    const newItem = {
      id: `custom-${Date.now()}`,
      item_code: autoCode,
      item_name_ml: customForm.name,
      category_codes: [customForm.cat],
      participation_type: customForm.type,
      source: 'custom'
    };
    setCustomItems([...customItems, newItem]);
    setSelectedCodes([...selectedCodes, newItem.item_code]);
    setIsAddModalOpen(false);
    setCategoryMenuOpen(false);
    setCustomForm({ code: '', name: '', cat: isCollegeFest ? (itemCategoryOptions[0]?.code || '') : 'GN', type: 'individual' });
  };

  const handleSave = async () => {
    try {
      const selectedRecords = [...HANDBOOK_ITEMS, ...customItems].filter(i =>
        selectedCodes.includes(i.item_code)
      );
      await updateActiveItems.mutateAsync({
        selectedCodes,
        itemRecords: selectedRecords
      });
      Alert.alert('Success', `${selectedCodes.length} items activated!`);
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

  return (
    <View className="flex-1 bg-ssf-bg">
      <ScrollView className="flex-1 py-6 px-4" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Page Title — matches schedule page pattern */}
        <View className="mb-6">
          <Text className="text-3xl font-poppins-black text-ui-text">Item Activation</Text>
          <Text className="text-sm font-poppins text-ui-text-muted mt-1">
            Enable items from the {HANDBOOK_ITEMS.length} Sahityotsav 2026 events
          </Text>
        </View>

        {/* Search + Actions Bar */}
        <View className="flex-row items-center gap-3 mb-4">
          <View className="flex-1 flex-row items-center bg-white border border-ui-border rounded-lg px-3 h-10">
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
          className="mb-4 flex-row items-center gap-2 self-start rounded-lg border border-ui-border bg-white px-3 py-2"
          onPress={() => setShowTenantItemsOnly(current => !current)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: showTenantItemsOnly }}
        >
          {showTenantItemsOnly ? <CheckCircle size={17} color="#0F766E" /> : <Circle size={17} color={ui.colors.textSubtle} />}
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
              </View>

              {/* Table Rows */}
              {allItems.map((item, idx) => {
                const isSelected = selectedCodes.includes(item.item_code);
                return (
                  <TouchableOpacity
                    key={item.item_code}
                    onPress={() => toggleItem(item.item_code)}
                    className={`flex-row items-center px-4 py-3 border-b border-ui-border ${
                      isSelected ? 'bg-green-50' : idx % 2 === 0 ? 'bg-white' : 'bg-ui-muted/30'
                    }`}
                  >
                    <View className="w-10">
                      {isSelected ? (
                        <CheckCircle size={18} color="#0F766E" />
                      ) : (
                        <Circle size={18} color="#CBD5E1" />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="font-poppins-bold text-xs text-ui-primary">{item.item_code}</Text>
                    </View>
                    <View className="flex-[2]">
                      <Text className="font-poppins text-sm text-ui-text">{item.item_name_ml}</Text>
                    </View>
                    <View className="w-24">
                      <View className="bg-ui-primary/10 px-2 py-0.5 rounded self-start">
                        <Text className="font-poppins-bold text-[10px] text-ui-primary">
                          {item.category_codes[0] || 'GN'}
                        </Text>
                      </View>
                    </View>
                    <View className="w-24">
                      <Text className="font-poppins text-xs text-ui-text-muted">
                        {item.participation_type === 'individual' ? 'Individual' : 'Group'}
                      </Text>
                    </View>
                  </TouchableOpacity>
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
                  <Text className="font-poppins-bold text-ui-primary text-sm">{category} Category</Text>
                </View>

                {items.map((item) => {
                  const isSelected = selectedCodes.includes(item.item_code);
                  return (
                    <TouchableOpacity key={item.item_code} onPress={() => toggleItem(item.item_code)}>
                      <Card className={`mb-2 ${isSelected ? 'border-ui-primary/30 bg-green-50' : ''}`}>
                        <CardContent className="p-4 flex-row items-center">
                          <View className="flex-1">
                            <Text className="text-xs font-poppins-bold text-ui-primary mb-1">{item.item_code}</Text>
                            <Text className="text-base font-poppins-bold text-ui-text">{item.item_name_ml}</Text>
                            <Text className="text-xs text-ui-text-muted mt-1">
                              {item.participation_type === 'individual' ? 'Individual' : 'Group'} Match
                            </Text>
                          </View>
                          {isSelected ? (
                            <CheckCircle size={22} color="#0F766E" />
                          ) : (
                            <Circle size={22} color="#CBD5E1" />
                          )}
                        </CardContent>
                      </Card>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Fixed Save Button */}
      <View className="absolute bottom-0 left-0 right-0 bg-ssf-bg border-t border-ui-border px-4 py-4">
        <Button onPress={handleSave} disabled={updateActiveItems.isPending}>
          {updateActiveItems.isPending ? 'Saving...' : `Save Changes (${selectedCodes.length} Items)`}
        </Button>
      </View>

      {/* Add Custom Item Modal */}
      <Modal visible={isAddModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white p-6 rounded-t-3xl min-h-[50%]">
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
                    className="h-10 justify-center rounded-md border border-ui-border bg-white px-3"
                    onPress={() => setCategoryMenuOpen(current => !current)}
                    accessibilityRole="button"
                    accessibilityLabel="Select item category"
                  >
                    <Text className="font-poppins text-sm text-ui-text">
                      {itemCategoryOptions.find(category => category.code === customForm.cat)?.name || 'Select a category'}
                    </Text>
                  </TouchableOpacity>
                  {categoryMenuOpen && (
                    <View className="mt-1 rounded-md border border-ui-border bg-white">
                      {itemCategoryOptions.map(category => (
                        <TouchableOpacity
                          key={category.id}
                          className="border-b border-ui-border px-3 py-2.5 last:border-b-0"
                          onPress={() => {
                            setCustomForm(current => ({ ...current, cat: category.code }));
                            setCategoryMenuOpen(false);
                          }}
                        >
                          <Text className="font-poppins text-sm text-ui-text">{category.name} ({category.code})</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <Input
                  value={customForm.cat}
                  onChangeText={t => setCustomForm({...customForm, cat: t})}
                  placeholder="GN"
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

            <View className="gap-3">
              <Button onPress={handleAddCustom}>Add to List</Button>
              <Button variant="outline" onPress={() => setIsAddModalOpen(false)}>Cancel</Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
