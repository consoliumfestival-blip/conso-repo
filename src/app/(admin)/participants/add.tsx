import { ui } from '@/constants/designSystem';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { SsfDatePicker } from '../../../components/ui/SsfDatePicker';
import { SsfSelectMenu, type SsfSelectOption } from '../../../components/ui/SsfSelectMenu';
import { useFestival } from '../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../core/hooks/useFestivalCategories';
import { useAuthStore } from '../../../core/store/authStore';
import {
  calculateAge,
  checkClassAgeConsistency,
  DEFAULT_FESTIVAL_YEAR,
  getCategory,
  getCategoryDOBRange,
  type CategoryCode,
} from '../../../core/utils/participantValidation';
import { participantService, type OrganisationOption } from '../../../services/participantService';

const CATEGORY_LABELS: Record<CategoryCode, string> = {
  LP: 'LP – Lower Primary (Class 1–4)',
  UP: 'UP – Upper Primary (Class 5–7)',
  HS: 'HS – High School (Class 8–10)',
  HSS: 'HSS – Higher Secondary (Class 11–12)',
  JUNIOR: 'JUNIOR',
  SENIOR: 'SENIOR',
  CAMPUS: 'CAMPUS – College Level',
  GENERAL: 'GENERAL – Open Category',
};

const CLASS_CATEGORY_CODES = ['LP', 'UP', 'HS', 'HSS'];

function formatDOBInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function validateSelectedCategory(category: string, dob: string, festivalYear: number): void {
  if (!dob) return;

  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  const date = new Date(`${dob}T00:00:00`);
  if (!dateParts || Number.isNaN(date.getTime())
    || date.getFullYear() !== Number(dateParts[1])
    || date.getMonth() + 1 !== Number(dateParts[2])
    || date.getDate() !== Number(dateParts[3])) {
    throw new Error('Enter a valid date of birth.');
  }

  const age = calculateAge(dob, festivalYear);
  if (category === 'JUNIOR' || category === 'SENIOR') {
    const { minDOB, maxDOB, label } = getCategoryDOBRange(category, festivalYear);
    if (date <= minDOB || date > maxDOB) {
      throw new Error(`Date of birth is not valid for ${category}. Eligibility: ${label}.`);
    }
    return;
  }

  if (category === 'CAMPUS' && age < 15) {
    throw new Error(`Age ${age} is too young for college. CAMPUS requires a minimum age of 15.`);
  }

  // The existing database trigger derives JUNIOR/SENIOR from DOB when no
  // class/education value is supplied. Block combinations that it would reject.
  let ageCategory: string | null = null;
  try {
    ageCategory = getCategory({ dob }, festivalYear);
  } catch {
    // DOB outside the configured JUNIOR/SENIOR age windows has no age category.
  }
  if (ageCategory && ageCategory !== category) {
    throw new Error(`This date of birth maps to ${ageCategory}. Choose that category or leave DOB blank.`);
  }

  if (CLASS_CATEGORY_CODES.includes(category)) {
    const warning = checkClassAgeConsistency(category, age);
    if (warning) throw new Error(warning.replace(/^⚠️\s*/, ''));
  }
}

export default function AddParticipant() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { tenant_id: tenantId } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: activeFestival, isLoading: isFestivalLoading } = useActiveFestival();
  const festivalId = activeFestival?.id;
  const validTenantId = tenantId;
  const festivalYear = activeFestival?.festival_year ?? DEFAULT_FESTIVAL_YEAR;
  const isCollegeFest = activeFestival?.festival_template === 'college_fest';
  const festivalGenderMode = activeFestival?.gender_mode ?? 'both';
  const isGenderFixedByFestival = festivalGenderMode !== 'both';
  const [selectedGender, setSelectedGender] = useState<'boys' | 'girls'>('boys');
  const gender = festivalGenderMode === 'boys_only'
    ? 'boys'
    : festivalGenderMode === 'girls_only'
      ? 'girls'
      : selectedGender;

  const { data: collegeCategories = [], isLoading: categoriesLoading, error: categoriesError } =
    useFestivalCategories(isCollegeFest ? festivalId : undefined, true);
  const availableCollegeCategories = collegeCategories.filter(category => category.code.toUpperCase() !== 'GN');

  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [organisations, setOrganisations] = useState<OrganisationOption[]>([]);
  const [isOrganisationsLoading, setIsOrganisationsLoading] = useState(false);
  const [organisationsLoadError, setOrganisationsLoadError] = useState('');
  const [loading, setLoading] = useState(false);

  const festivalLevel = String(activeFestival?.level || '').trim().toLowerCase();
  const currentOrganisation = organisations.find(organisation => organisation.tenant_id === validTenantId);
  const availableOrganisations = (activeFestival?.chest_number_template === 'team' || festivalLevel === 'sector' || festivalLevel === 'division')
    ? organisations.filter(organisation => organisation.parent_id === currentOrganisation?.id)
    : organisations;

  const categoryOptions = useMemo<SsfSelectOption[]>(() => isCollegeFest
    ? availableCollegeCategories.map(category => ({ label: category.name, value: category.code }))
    : Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ label, value })), [isCollegeFest, availableCollegeCategories]);

  const organisationOptions = useMemo<SsfSelectOption[]>(() => availableOrganisations.map(organisation => ({
    label: `${organisation.name} (${organisation.org_type})`,
    value: organisation.id,
  })), [availableOrganisations]);

  useEffect(() => {
    if (selectedOrgId && !availableOrganisations.some(organisation => organisation.id === selectedOrgId)) {
      setSelectedOrgId('');
    }
  }, [selectedOrgId, availableOrganisations]);

  useEffect(() => {
    if (!validTenantId) {
      setOrganisations([]);
      setIsOrganisationsLoading(false);
      setOrganisationsLoadError('');
      return;
    }

    let cancelled = false;
    setOrganisations([]);
    setIsOrganisationsLoading(true);
    setOrganisationsLoadError('');
    participantService.listOrganisations(validTenantId)
      .then(data => { if (!cancelled) setOrganisations(data); })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOrganisations([]);
        setOrganisationsLoadError(error instanceof Error ? error.message : 'Could not load organisations.');
      })
      .finally(() => { if (!cancelled) setIsOrganisationsLoading(false); });

    return () => { cancelled = true; };
  }, [validTenantId]);

  useEffect(() => {
    setSelectedCategory('');
  }, [festivalId, isCollegeFest]);

  const close = () => router.back();

  const handleSave = async () => {
    if (loading) return;
    if (isFestivalLoading) {
      Alert.alert('Please wait', 'Festival information is still loading.');
      return;
    }
    if (!festivalId) {
      Alert.alert('Festival Required', 'Create or activate a festival before adding participants.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Error', 'Full Name is required.');
      return;
    }
    if (!selectedCategory || !categoryOptions.some(option => option.value === selectedCategory)) {
      Alert.alert('Validation Error', isCollegeFest ? 'Please select an active College Fest category.' : 'Please select a category.');
      return;
    }
    if (!selectedOrgId || !availableOrganisations.some(organisation => organisation.id === selectedOrgId)) {
      Alert.alert('Error', 'Please select an organisation.');
      return;
    }

    try {
      validateSelectedCategory(selectedCategory, dob, festivalYear);
    } catch (error) {
      Alert.alert('Validation Error', error instanceof Error ? error.message : 'Please check the participant details.');
      return;
    }

    const age = dob ? calculateAge(dob, festivalYear) : null;
    const targetOrg = organisations.find(organisation => organisation.id === selectedOrgId);
    const targetTenantId = targetOrg?.tenant_id || validTenantId;
    if (!targetTenantId) {
      Alert.alert('Error', 'Unable to determine the participant tenant. Please reselect the organisation.');
      return;
    }

    setLoading(true);
    try {
      const participant = await participantService.createParticipantWithChestNumber<any>({
        tenant_id: targetTenantId,
        festival_id: festivalId,
        organisation_id: selectedOrgId,
        name: name.trim(),
        category_code: selectedCategory,
        status: 'approved',
        age,
        class_std: null,
        dob: dob || null,
        gender,
        // Keep the existing create RPC contract and defaults for public-profile fields.
        public_profile_enabled: true,
        show_organisation_public: true,
      });
      const categoryName = isCollegeFest
        ? availableCollegeCategories.find(category => category.code === selectedCategory)?.name ?? selectedCategory
        : CATEGORY_LABELS[selectedCategory as CategoryCode] ?? selectedCategory;
      const message = `${name.trim()} saved under ${categoryName}.\nChest No: ${participant.chest_number || ''}`;
      if (Platform.OS === 'web') {
        window.alert(`✅ Participant Saved!\n${message}`);
        router.replace('/(admin)/participants');
      } else {
        Alert.alert('✅ Saved!', message, [{ text: 'OK', onPress: () => router.replace('/(admin)/participants') }]);
      }
    } catch (error: any) {
      const message = error?.message || 'Save failed. Please try again.';
      if (Platform.OS === 'web') window.alert(`Error: ${message}`);
      else Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const dialogWidth = width < 640 ? Math.max(280, width - 24) : Math.min(680, width - 48);
  const compactViewport = width < 640 || height < 620;
  const isFormLoading = isFestivalLoading || isOrganisationsLoading;
  const categoryUnavailable = isCollegeFest && (categoriesLoading || !!categoriesError || availableCollegeCategories.length === 0);
  const organisationUnavailable = !isFormLoading && !organisationsLoadError && availableOrganisations.length === 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close add participant dialog" style={styles.backdrop} onPress={close} />
        <KeyboardAvoidingView
          style={styles.centerer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
        >
          <View style={[styles.dialog, { width: dialogWidth, maxHeight: compactViewport ? height - 16 : '90%' }]}>
            <View style={[styles.header, compactViewport && styles.headerCompact]}>
              <View style={styles.headerText}>
                <Text className={`font-poppins-bold ${compactViewport ? 'text-base' : 'text-lg'} text-ssf-text`}>Add Participant</Text>
                <Text className="mt-0.5 font-poppins text-[11px] text-ssf-text-muted">Enter the participant details.</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.closeButton}>
                <X size={18} color={ui.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={[styles.formContent, compactViewport && styles.formContentCompact]}
              scrollEnabled={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.formRow, width >= 640 && styles.formRowWide, compactViewport && styles.formRowCompact]}>
                <Field label="Full Name" required dense={compactViewport}>
                  <TextInput
                    accessibilityLabel="Full Name"
                    className={`${compactViewport && width >= 640 ? 'h-9 text-xs px-2.5' : 'h-10 text-sm px-3'} rounded-lg border border-ssf-border bg-white font-poppins text-ssf-text`}
                    placeholder="Enter full name"
                    placeholderTextColor={ui.colors.textSubtle}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </Field>

                <Field label="Date of Birth" optional dense={compactViewport}>
                  {Platform.OS === 'web' ? (
                    <SsfDatePicker value={dob} onValueChange={setDob} style={{ width: '100%', height: compactViewport && width >= 640 ? 36 : 40 }} />
                  ) : (
                    <TextInput
                      accessibilityLabel="Date of Birth (optional)"
                      className={`${compactViewport && width >= 640 ? 'h-9 text-xs px-2.5' : 'h-10 text-sm px-3'} rounded-lg border border-ssf-border bg-white font-poppins text-ssf-text`}
                      placeholder="YYYY-MM-DD (optional)"
                      placeholderTextColor={ui.colors.textSubtle}
                      value={dob}
                      onChangeText={text => setDob(formatDOBInput(text))}
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                  )}
                </Field>
              </View>

              <View style={[styles.formRow, width >= 640 && styles.formRowWide, compactViewport && styles.formRowCompact]}>
                <Field label="Category" required dense={compactViewport}>
                  {categoriesLoading && isCollegeFest ? (
                    <View style={styles.loadingRow}><ActivityIndicator size="small" color={ui.colors.primary} /><Text className="font-poppins text-xs text-ssf-text-muted">Loading categories…</Text></View>
                  ) : categoriesError && isCollegeFest ? (
                    <Text className="font-poppins text-xs text-red-600">Unable to load active categories.</Text>
                  ) : (
                    <SsfSelectMenu
                      value={selectedCategory}
                      options={categoryOptions}
                      onValueChange={setSelectedCategory}
                      placeholder="Select category"
                      accessibilityLabel="Category (required)"
                      searchable={categoryOptions.length > 7}
                      searchPlaceholder="Search categories..."
                      compact={compactViewport}
                    />
                  )}
                </Field>

                <Field label="Organisation" required dense={compactViewport}>
                  {isFormLoading ? (
                    <View style={styles.loadingRow}><ActivityIndicator size="small" color={ui.colors.primary} /><Text className="font-poppins text-xs text-ssf-text-muted">Loading organisations…</Text></View>
                  ) : organisationsLoadError ? (
                    <Text className="font-poppins text-xs text-red-600">Could not load organisations: {organisationsLoadError}</Text>
                  ) : !activeFestival ? (
                    <Text className="font-poppins text-xs text-ssf-text-muted">Activate a festival before adding participants.</Text>
                  ) : organisationUnavailable ? (
                    <Text className="font-poppins text-xs text-red-600">
                      {organisations.length > 0 && (festivalLevel === 'sector' || festivalLevel === 'division')
                        ? `No subordinate organisations found for this ${festivalLevel}.`
                        : 'No organisations found. Please set up the hierarchy first.'}
                    </Text>
                  ) : (
                    <SsfSelectMenu
                      value={selectedOrgId}
                      options={organisationOptions}
                      onValueChange={setSelectedOrgId}
                      placeholder="Select organisation"
                      accessibilityLabel="Organisation (required)"
                      searchable={organisationOptions.length > 7}
                      searchPlaceholder="Search organisations..."
                      compact={compactViewport}
                    />
                  )}
                </Field>
              </View>

              {!isGenderFixedByFestival && (
                <Field label="Gender" required dense={compactViewport}>
                  <View style={styles.genderRow}>
                    {(['boys', 'girls'] as const).map(option => {
                      const selected = gender === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          onPress={() => setSelectedGender(option)}
                          style={[styles.genderOption, selected && styles.genderOptionSelected]}
                        >
                          <Text style={[styles.genderText, selected && styles.genderTextSelected]}>{option === 'boys' ? 'Boys' : 'Girls'}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </Field>
              )}
            </ScrollView>

            <View style={[styles.footer, compactViewport && styles.footerCompact]}>
              <TouchableOpacity accessibilityRole="button" onPress={close} disabled={loading} style={styles.cancelButton}>
                <Text className="font-poppins-bold text-sm text-ssf-text">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Save Participant"
                accessibilityState={{ disabled: loading || categoryUnavailable || isFormLoading || !activeFestival }}
                onPress={handleSave}
                disabled={loading || categoryUnavailable || isFormLoading || !activeFestival}
                style={[styles.saveButton, (loading || categoryUnavailable || isFormLoading || !activeFestival) && styles.saveButtonDisabled]}
              >
                {loading ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.saveText}>{loading ? 'Saving…' : 'Save Participant'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Field({
  label,
  required,
  optional,
  children,
  dense = false,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <View style={dense ? styles.fieldDense : styles.field}>
      <Text className={`font-poppins-semibold ${dense ? 'text-[11px]' : 'text-xs'} text-ssf-text`}>
        {label}{' '}
        {required ? <Text className="text-red-600">*</Text> : null}
        {optional ? <Text className="font-poppins text-ssf-text-muted">(Optional)</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.42)' },
  centerer: { width: '100%', maxHeight: '100%', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  dialog: {
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCompact: { minHeight: 50, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  headerText: { flex: 1 },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: ui.colors.surfaceMuted,
  },
  formScroll: { flexShrink: 1 },
  formContent: { gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  formContentCompact: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  formRow: { gap: 12 },
  formRowWide: { flexDirection: 'row' },
  formRowCompact: { gap: 8 },
  field: { flex: 1, minWidth: 0, gap: 6 },
  fieldDense: { flex: 1, minWidth: 0, gap: 4 },
  loadingRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderOption: {
    minHeight: 40,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ui.colors.border,
    borderRadius: 8,
    backgroundColor: ui.colors.surface,
  },
  genderOptionSelected: { borderColor: ui.colors.primary, backgroundColor: ui.colors.primary },
  genderText: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: ui.colors.text },
  genderTextSelected: { color: '#fff' },
  footer: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  footerCompact: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  cancelButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ui.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: ui.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: { opacity: 0.55 },
  saveText: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: '#fff' },
});
