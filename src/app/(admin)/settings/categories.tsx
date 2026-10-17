import { ui } from '@/constants/designSystem';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Archive, Plus, RotateCcw, Trash2 } from 'lucide-react-native';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useFestival } from '../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../core/hooks/useFestivalCategories';
import { generateCategoryCode } from '../../../services/festivalCategoryService';
import type { FestivalCategory } from '../../../types/festivalCategory';

export default function CollegeFestCategoriesScreen() {
  const router = useRouter();
  const { useActiveFestival, useUpdateFestival } = useFestival();
  const { data: festival, isLoading: festivalLoading } = useActiveFestival();
  const isCollegeFest = festival?.festival_template === 'college_fest';
  const { data = [], isLoading, error, create, update, setActive, remove } = useFestivalCategories(
    isCollegeFest ? festival?.id : undefined,
  );
  const updateFestival = useUpdateFestival();
  const [editing, setEditing] = useState<FestivalCategory | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [codeTouched, setCodeTouched] = useState(false);
  const [desiredActive, setDesiredActive] = useState(true);
  const [generalCategoryEnabled, setGeneralCategoryEnabled] = useState(false);
  const [generalSetupOpen, setGeneralSetupOpen] = useState(false);

  const generalCategory = data.find((category) => category.code.toLowerCase() === 'gn');
  const customCategories = data.filter((category) => category.code.toLowerCase() !== 'gn');

  useEffect(() => {
    if (festival) setGeneralCategoryEnabled(festival.general_category_enabled === true);
  }, [festival]);

  const setGeneralCategory = (nextValue: boolean) => {
    if (nextValue) {
      setGeneralSetupOpen(true);
      return;
    }
    if (generalSetupOpen && !generalCategoryEnabled) {
      setGeneralSetupOpen(false);
      return;
    }
    const message = nextValue
      ? 'General category will be available for this festival.'
      : 'This only disables General category for new use. Existing registrations, schedules, marks, and results will remain unchanged.';
    Alert.alert(
      nextValue ? 'Enable General category?' : 'Disable General category?',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextValue ? 'Enable' : 'Disable',
          style: nextValue ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await updateFestival.mutateAsync({
                id: festival?.id,
                general_category_enabled: nextValue,
              });
              setGeneralCategoryEnabled(nextValue);
              Alert.alert('Saved', `General category ${nextValue ? 'enabled' : 'disabled'}.`);
            } catch (statusError) {
              Alert.alert('Unable to update', statusError instanceof Error ? statusError.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const saveGeneralCategory = async () => {
    if (!festival) return;
    try {
      const input = { name: 'General', code: 'gn', sort_order: 0 };
      const saved = generalCategory
        ? await update.mutateAsync({ id: generalCategory.id, input })
        : await create.mutateAsync({ tenantId: festival.tenant_id, input });
      if (!saved.is_active) await setActive.mutateAsync({ id: saved.id, isActive: true });
      await updateFestival.mutateAsync({ id: festival.id, general_category_enabled: true });
      setGeneralCategoryEnabled(true);
      setGeneralSetupOpen(false);
      Alert.alert('Saved', 'General category is now available for item creation.');
    } catch (saveError) {
      Alert.alert('Unable to save General category', saveError instanceof Error ? saveError.message : 'Please try again.');
    }
  };

  const deleteCategory = (category: FestivalCategory) => {
    Alert.alert(
      'Delete category?',
      `Delete "${category.name}"? This is allowed only when no participant or item uses it. Existing history will never be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove.mutateAsync(category.id);
              if (category.code.toLowerCase() === 'gn') {
                await updateFestival.mutateAsync({ id: festival?.id, general_category_enabled: false });
                setGeneralCategoryEnabled(false);
                setGeneralSetupOpen(false);
              }
              Alert.alert('Deleted', 'The unused category was deleted.');
            } catch (deleteError) {
              Alert.alert('Cannot delete category', deleteError instanceof Error ? deleteError.message : 'Please archive it instead.');
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (!editing && !codeTouched) setCode(generateCategoryCode(name));
  }, [name, editing, codeTouched]);

  const reset = () => {
    setEditing(null); setName(''); setCode(''); setSortOrder('0'); setCodeTouched(false); setDesiredActive(true);
  };
  const beginEdit = (category: FestivalCategory) => {
    setEditing(category); setName(category.name); setCode(category.code);
    setSortOrder(String(category.sort_order)); setCodeTouched(true); setDesiredActive(category.is_active);
  };
  const save = async () => {
    if (!festival) return;
    const parsed = Number(sortOrder);
    if (!Number.isInteger(parsed)) return Alert.alert('Validation', 'Sort order must be a whole number.');
    try {
      const input = { name, code, sort_order: parsed };
      const saved = editing
        ? await update.mutateAsync({ id: editing.id, input })
        : await create.mutateAsync({ tenantId: festival.tenant_id, input });
      if (saved.is_active !== desiredActive) {
        await setActive.mutateAsync({ id: saved.id, isActive: desiredActive });
      }
      Alert.alert('Success', editing ? 'Category updated.' : 'Category created.');
      reset();
    } catch (saveError) {
      Alert.alert('Unable to save', saveError instanceof Error ? saveError.message : 'Please try again.');
    }
  };

  if (festivalLoading) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (!festival) return <View className="flex-1 items-center justify-center p-6"><Text>No active festival.</Text></View>;

  return (
    <ScrollView className="flex-1 bg-ssf-bg" contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
      <TouchableOpacity onPress={() => router.back()} className="mb-4 flex-row items-center">
        <ArrowLeft size={18} color="#1B6B3A" /><Text className="ml-2 font-poppins-bold text-emerald-800">Back</Text>
      </TouchableOpacity>
      <Text className="font-poppins-bold text-2xl text-ssf-text">Categories</Text>
      <Text className="mb-5 mt-1 font-poppins text-sm text-ssf-text-muted">
        Control which categories are available for this festival. Existing registrations and results are not changed.
      </Text>

      <SsfCard className="mb-5 p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="font-poppins-bold text-base">General Category</Text>
            <Text className="mt-1 font-poppins text-xs text-ssf-text-muted">
              Disabled by default. Turn it on to configure General before using it for items.
            </Text>
            <Text className="mt-2 font-poppins text-xs text-ssf-text-muted">
              Current status: {generalCategoryEnabled ? 'Available' : generalSetupOpen ? 'Setup pending — save below' : 'Disabled'}
            </Text>
          </View>
          <Switch
            value={generalCategoryEnabled || generalSetupOpen}
            disabled={updateFestival.isPending}
            onValueChange={setGeneralCategory}
          />
        </View>
      </SsfCard>

      {isCollegeFest && generalSetupOpen && !generalCategoryEnabled && <SsfCard className="mb-5 border border-emerald-200 bg-emerald-50 p-4">
        <Text className="mb-1 font-poppins-bold text-base">Create General Category</Text>
        <Text className="mb-4 font-poppins text-xs text-ssf-text-muted">
          Save this setup to make General (GN) available in item creation. It accepts participants from every existing participant category.
        </Text>
        <Text className="mb-1 font-poppins text-xs text-ssf-text-muted">Category Name</Text>
        <TextInput value="General" editable={false} className="mb-3 rounded-xl border border-ssf-border bg-white p-3 font-poppins" />
        <Text className="mb-1 font-poppins text-xs text-ssf-text-muted">Category Code</Text>
        <TextInput value="gn" editable={false} className="mb-4 rounded-xl border border-ssf-border bg-white p-3 font-poppins" />
        <View className="flex-row gap-x-2">
          <SsfButton label={create.isPending || update.isPending || updateFestival.isPending ? 'Saving…' : 'Save General Category'} onPress={saveGeneralCategory} disabled={create.isPending || update.isPending || setActive.isPending || updateFestival.isPending} className="flex-1" />
          <SsfButton label="Cancel" variant="outline" onPress={() => setGeneralSetupOpen(false)} />
        </View>
      </SsfCard>}

      {isCollegeFest && <SsfCard className="mb-5 p-4">
        <Text className="mb-3 font-poppins-bold text-base">{editing ? 'Edit Category' : 'Create Category'}</Text>
        <Text className="mb-1 font-poppins text-xs text-ssf-text-muted">Category Name</Text>
        <TextInput value={name} onChangeText={setName} className="mb-3 rounded-xl border border-ssf-border p-3 font-poppins" />
        <Text className="mb-1 font-poppins text-xs text-ssf-text-muted">Category Code</Text>
        <TextInput value={code} autoCapitalize="none" onChangeText={(value) => { setCode(value); setCodeTouched(true); }} className="mb-3 rounded-xl border border-ssf-border p-3 font-poppins" />
        <Text className="mb-1 font-poppins text-xs text-ssf-text-muted">Sort Order</Text>
        <TextInput value={sortOrder} keyboardType="number-pad" onChangeText={setSortOrder} className="mb-4 rounded-xl border border-ssf-border p-3 font-poppins" />
        <View className="mb-4 flex-row items-center justify-between rounded-xl border border-ssf-border p-3">
          <View><Text className="font-poppins-bold text-sm">Active</Text><Text className="font-poppins text-xs text-ssf-text-muted">Archived categories cannot be selected for new participants.</Text></View>
          <Switch value={desiredActive} onValueChange={setDesiredActive} />
        </View>
        <View className="flex-row gap-x-2">
          <SsfButton label={create.isPending || update.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Category'} onPress={save} disabled={create.isPending || update.isPending} className="flex-1" />
          {editing && <SsfButton label="Cancel" variant="outline" onPress={reset} />}
        </View>
      </SsfCard>}

      <Text className="mb-3 font-poppins-bold text-base">Created Categories</Text>
      {generalCategory && <SsfCard className="mb-3 p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="font-poppins-bold text-base">{generalCategory.name}</Text>
            <Text className="font-poppins text-xs text-ssf-text-muted">{generalCategory.code} · Order {generalCategory.sort_order} · {generalCategory.is_active ? 'Active' : 'Archived'}{generalCategoryEnabled ? '' : ' · Feature disabled'}</Text>
          </View>
          <TouchableOpacity onPress={() => beginEdit(generalCategory)} className="px-3 py-2"><Text className="font-poppins-bold text-emerald-700">Edit</Text></TouchableOpacity>
          <TouchableOpacity disabled={setActive.isPending} onPress={async () => {
            if (!generalCategory.is_active) {
              setGeneralSetupOpen(true);
              return;
            }
            setGeneralCategory(false);
            return;
          }} className="p-2">
            {generalCategory.is_active ? <Archive size={18} color="#B45309" /> : <RotateCcw size={18} color="#047857" />}
          </TouchableOpacity>
          <TouchableOpacity disabled={remove.isPending} onPress={() => deleteCategory(generalCategory)} className="p-2">
            <Trash2 size={18} color={ui.colors.destructive} />
          </TouchableOpacity>
        </View>
      </SsfCard>}

      {isCollegeFest && (isLoading ? <ActivityIndicator /> : error ? (
        <Text className="text-red-700">Unable to load categories. Please refresh.</Text>
      ) : customCategories.length === 0 ? (
        <View className="items-center rounded-xl border border-dashed border-ssf-border p-8">
          <Plus size={28} color={ui.colors.textMuted} /><Text className="mt-2 font-poppins">No custom College Fest categories have been created yet.</Text>
        </View>
      ) : customCategories.map((category) => (
        <SsfCard key={category.id} className="mb-3 p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-poppins-bold text-base">{category.name}</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">{category.code} · Order {category.sort_order} · {category.is_active ? 'Active' : 'Archived'}</Text>
            </View>
            <TouchableOpacity onPress={() => beginEdit(category)} className="px-3 py-2"><Text className="font-poppins-bold text-emerald-700">Edit</Text></TouchableOpacity>
            <TouchableOpacity
              disabled={setActive.isPending}
              onPress={async () => {
                try { await setActive.mutateAsync({ id: category.id, isActive: !category.is_active }); }
                catch (statusError) { Alert.alert('Unable to update', statusError instanceof Error ? statusError.message : 'Please try again.'); }
              }}
              className="p-2"
            >
              {category.is_active ? <Archive size={18} color="#B45309" /> : <RotateCcw size={18} color="#047857" />}
            </TouchableOpacity>
            <TouchableOpacity disabled={remove.isPending} onPress={() => deleteCategory(category)} className="p-2">
              <Trash2 size={18} color={ui.colors.destructive} />
            </TouchableOpacity>
          </View>
        </SsfCard>
      ))) }
    </ScrollView>
  );
}
