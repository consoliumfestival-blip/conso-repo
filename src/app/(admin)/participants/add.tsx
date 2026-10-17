import { ui } from '@/constants/designSystem';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, Alert, TouchableOpacity, Platform, Switch, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { participantService } from '../../../services/participantService';
import { useAuthStore } from '../../../core/store/authStore';
import { getCategory, validateParticipant, calculateAge, getCutoffDate, DEFAULT_FESTIVAL_YEAR, checkClassAgeConsistency, getCategoryDOBRange, type CategoryCode } from '../../../core/utils/participantValidation';
import { Eye } from 'lucide-react-native';
import { SsfDatePicker } from '../../../components/ui/SsfDatePicker';
import { useFestival } from '../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../core/hooks/useFestivalCategories';

// ─── Constants ────────────────────────────────────────────────────────────────

const CAMPUS_TYPES = ['Degree', 'PG', 'ITI', 'Polytechnic', 'D.Ed', 'B.Ed'];

const CLASS_OPTIONS = [
  '1', '2', '3', '4',       // LP
  '5', '6', '7',            // UP
  '8', '9', '10',           // HS
  '11', '12',               // HSS
];

const JUNIOR_SENIOR_OPTIONS: { label: string; value: 'JUNIOR' | 'SENIOR'; age: string; color: string }[] = [
  { label: 'JUNIOR', value: 'JUNIOR', age: 'Born 01 June 2006 – 31 May 2011', color: '#1B6B3A' },
  { label: 'SENIOR', value: 'SENIOR', age: 'Born 01 June 2000 – 31 May 2006', color: '#1B6B3A' },
];

const CATEGORY_LABELS: Record<CategoryCode, string> = {
  LP:     'LP – Lower Primary (Class 1–4)',
  UP:     'UP – Upper Primary (Class 5–7)',
  HS:     'HS – High School (Class 8–10)',
  HSS:    'HSS – Higher Secondary (Class 11–12)',
  JUNIOR: 'JUNIOR – Born between 01 June 2006 and 31 May 2011',
  SENIOR: 'SENIOR – Born between 01 June 2000 and 31 May 2006',
  CAMPUS: 'CAMPUS – College Level',
  GENERAL: 'GENERAL – Open Category',
};

function getCategoryLabel(code: CategoryCode): string {
  return CATEGORY_LABELS[code] || code;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Auto-formats typed digits into YYYY-MM-DD as user types on mobile.
 * Example: '20081' → '2008-1', '200812' → '2008-12', '20081215' → '2008-12-15'
 */
function formatDOBInput(text: string): string {
  // Strip everything except digits
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddParticipant() {
  const router = useRouter();
  const { tenant_id } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: activeFestival, isLoading: isFestivalLoading } = useActiveFestival();
  const validTenantId = tenant_id;
  const festivalId = activeFestival?.id;
  const festivalYear = activeFestival?.festival_year ?? DEFAULT_FESTIVAL_YEAR;
  const isCollegeFest = activeFestival?.festival_template === 'college_fest';
  const { data: collegeCategories = [], isLoading: categoriesLoading, error: categoriesError } =
    useFestivalCategories(isCollegeFest ? festivalId : undefined, true);
  const participantCollegeCategories = collegeCategories.filter(category => category.code.toUpperCase() !== 'GN');


  // Form state
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');           // YYYY-MM-DD
  const [classStd, setClassStd] = useState(''); // '1'–'12'
  const [educationType, setEducationType] = useState(''); // campus type
  const [manualCategory, setManualCategory] = useState<'JUNIOR' | 'SENIOR' | ''>(''); // explicit J/S pick
  const [collegeCategory, setCollegeCategory] = useState('');
  const [phone, setPhone] = useState('');
  const [manualChestNumber, setManualChestNumber] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [organisations, setOrganisations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgType, setOrgType] = useState<string>('unit');

  // Unified Candidate Profile settings state
  const [gender, setGender] = useState<'boys' | 'girls' | ''>('');
  const [profileBio, setProfileBio] = useState('');
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(true);
  const [showOrganisationPublic, setShowOrganisationPublic] = useState(true);
  const [photoFile, setPhotoFile] = useState<any>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  // Derived / display state
  const [resolvedCategory, setResolvedCategory] = useState<CategoryCode | null>(null);
  const [categoryError, setCategoryError] = useState('');
  const [ageClassWarning, setAgeClassWarning] = useState('');
  const dobInputRef = useRef<any>(null);
  const categoryFestivalRef = useRef<string | undefined>(festivalId);

  useEffect(() => {
    if (categoryFestivalRef.current !== festivalId) {
      setCollegeCategory('');
      categoryFestivalRef.current = festivalId;
    }
  }, [festivalId]);

  // Local photo handlers
  const handlePhotoSelect = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Upload unavailable', 'Photo selection is currently supported on web.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setPhotoFile(file);
      const url = URL.createObjectURL(file);
      setPhotoPreviewUrl(url);
    };
    input.click();
  };

  const handlePhotoRemove = () => {
    setPhotoFile(null);
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(null);
    }
  };

  // Fetch org type for org label and available hierarchies
  useEffect(() => {
    if (validTenantId) {
      participantService.getTenantOrgType(validTenantId).then((type) => {
        setOrgType(type || 'unit');
      });

      participantService.listOrganisations(validTenantId).then((data) => {
        setOrganisations(data);
      });
    }
  }, [validTenantId]);

  // Auto-resolve category whenever inputs change
  useEffect(() => {
    setCategoryError('');
    setResolvedCategory(null);
    setAgeClassWarning('');

    if (isCollegeFest) {
      setResolvedCategory(null);
      return;
    }

    // If user manually picked JUNIOR/SENIOR, use that directly
    if (manualCategory && !classStd && !educationType) {
      setResolvedCategory(manualCategory);
      // Warn if DOB doesn't match the manual choice
      if (dob) {
        try {
          const dobDate = new Date(dob);
          if (!isNaN(dobDate.getTime())) {
            const { minDOB, maxDOB, label } = getCategoryDOBRange(manualCategory, festivalYear);
            if (dobDate <= minDOB || dobDate > maxDOB) {
              setAgeClassWarning(`⚠️ DOB doesn't match ${manualCategory} category. Eligibility: ${label}.`);
            }
          }
        } catch { /* invalid dob */ }
      }
      return;
    }

    try {
      const cat = getCategory({
        dob: dob || null,
        class_std: classStd ? parseInt(classStd, 10) : null,
        education_type: educationType || null,
      }, festivalYear);
      setResolvedCategory(cat);

      // Sync manual category if auto-resolved to JUNIOR/SENIOR
      if (cat === 'JUNIOR' || cat === 'SENIOR') {
        setManualCategory(cat);
      }

      // Real-time age-class consistency check
      if (dob && classStd && ['LP','UP','HS','HSS'].includes(cat)) {
        const age = calculateAge(dob, festivalYear);
        const warn = checkClassAgeConsistency(cat, age);
        if (warn) setAgeClassWarning(warn);
      }

      // Real-time CAMPUS minimum age check
      if (cat === 'CAMPUS' && dob) {
        try {
          const age = calculateAge(dob, festivalYear);
          if (age < 15) {
            setAgeClassWarning(`⚠️ Age ${age} is too young for college/CAMPUS. Minimum age is 15.`);
          }
        } catch {
          // invalid dob — ignore
        }
      }
    } catch {
      // Not enough info yet — that's fine
    }
  }, [dob, classStd, educationType, manualCategory, festivalYear, isCollegeFest, collegeCategory]);

  // ─── Save Handler ───────────────────────────────────────────────────────────

  const handleSave = async () => {
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

    if (!selectedOrgId) {
      Alert.alert('Error', 'Please select an organisation.');
      return;
    }

    if (!gender) {
      Alert.alert('Error', 'Gender is required.');
      return;
    }

    // Validate and get category
    let category: string;
    try {
      if (isCollegeFest) {
        const selected = collegeCategory;
        if (!selected || !participantCollegeCategories.some(item => item.code === selected)) {
          Alert.alert('Validation Error', 'Please select an active College Fest category.');
          return;
        }
        category = selected;
      } else if (manualCategory && !classStd && !educationType) {
        // Manual JUNIOR/SENIOR selection — DOB is required for chest number logic
        if (!dob) {
          Alert.alert('Validation Error', `Date of Birth is required for ${manualCategory} category.`);
          return;
        }
        category = validateParticipant({
          dob: dob || null,
          class_std: null,
          education_type: null,
        }, festivalYear);
      } else {
        category = validateParticipant({
          dob: dob || null,
          class_std: classStd ? parseInt(classStd, 10) : null,
          education_type: educationType || null,
        }, festivalYear);
      }
    } catch (err: any) {
      Alert.alert('Validation Error', err.message);
      return;
    }

    setLoading(true);

    // Generate or use manual chest number
    let chest_number = manualChestNumber.trim();
    if (!chest_number) {
      chest_number = await participantService.generateChestNumber(category, festivalId);
    }

    // Calculate age for storage
    const ageNum = dob ? calculateAge(dob, festivalYear) : null;

    const targetOrg = organisations.find(o => o.id === selectedOrgId);
    const targetTenantId = targetOrg?.tenant_id || validTenantId;

    let saveError: Error | null = null;
    let photoUploadError: Error | null = null;
    try {
      // The unique index is the final authority. Two admins can generate the
      // same number concurrently, so retry an automatically generated number
      // when the insert loses that race.
      let newParticipant: any;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          newParticipant = await participantService.createParticipant<any>({
            tenant_id: targetTenantId,
            festival_id: festivalId,
            organisation_id: selectedOrgId,
            name: name.trim(),
            category_code: category,
            phone: phone || null,
            chest_number,
            status: 'approved',
            age: ageNum,
            class_std: isCollegeFest ? null : classStd || null,
            dob: dob || null,
            gender,
            profile_bio: profileBio || null,
            public_profile_enabled: publicProfileEnabled,
            show_organisation_public: showOrganisationPublic,
          });
          break;
        } catch (error: any) {
          const isDuplicateChest = error?.code === '23505'
            && String(error?.message || '').includes('unique_active_chest_number');
          if (!isDuplicateChest || manualChestNumber.trim() || attempt === 2) throw error;
          // Do not call the generator again here: if RLS hides the existing
          // row, it can return the same candidate repeatedly. Advance the
          // candidate that the database just rejected instead.
          const match = chest_number.match(/^(.*-)(\d+)$/);
          chest_number = match
            ? `${match[1]}${(Number(match[2]) + 1).toString().padStart(match[2].length, '0')}`
            : await participantService.generateChestNumber(category, festivalId);
        }
      }

      if (photoFile && newParticipant?.id) {
        try {
          await participantService.uploadProfilePhoto(
            newParticipant.id,
            photoFile,
            { tenantId: targetTenantId, festivalId: festivalId }
          );
        } catch (error: any) {
          photoUploadError = error;
        }
      }
    } catch (error: any) {
      saveError = error;
    }

    setLoading(false);

    if (saveError) {
      const msg = saveError.message || 'Save failed. Check console.';
      console.error('Insert Error:', saveError);
      if (Platform.OS === 'web') window.alert('Error: ' + msg);
      else Alert.alert('Error', msg);
    } else {
      const savedCategoryLabel = isCollegeFest
        ? participantCollegeCategories.find(item => item.code === category)?.name ?? category
        : getCategoryLabel(category as CategoryCode);
      const successMsg = `${name} saved under ${savedCategoryLabel}.\nChest No: ${chest_number}`;
      const photoMsg = photoUploadError
        ? `\n\nPhoto upload failed, but the participant record was saved.\n${photoUploadError.message || 'Please retry from the participant profile.'}`
        : '';
      if (Platform.OS === 'web') {
        window.alert('✅ Participant Saved!\n' + successMsg + photoMsg);
        router.replace('/(admin)/participants');
      } else {
        Alert.alert('✅ Saved!', successMsg + photoMsg, [
          { text: 'OK', onPress: () => router.replace('/(admin)/participants') },
        ]);
      }
    }
  };

  // ─── UI ─────────────────────────────────────────────────────────────────────

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <Text className="text-2xl font-poppins-black text-ssf-text mb-6">Add Participant</Text>

      <SsfCard className="gap-y-5">

        {/* Name */}
        <View>
          <Text className="font-poppins text-ssf-text-muted mb-1">Full Name *</Text>
          <TextInput
            className="border border-ssf-border rounded-xl p-3 font-poppins text-ssf-text"
            placeholder="E.g. Mohammed Ali"
            value={name}
            onChangeText={setName}
            placeholderTextColor={ui.colors.textSubtle}
          />
        </View>

        {/* Manual Chest Number */}
        <View>
          <Text className="font-poppins text-ssf-text-muted mb-1">Chest Number (Optional)</Text>
          <TextInput
            className="border border-ssf-border rounded-xl p-3 font-poppins text-ssf-text"
            placeholder="Leave empty to auto-generate"
            value={manualChestNumber}
            onChangeText={setManualChestNumber}
            placeholderTextColor={ui.colors.textSubtle}
          />
        </View>

        {/* Date of Birth */}
        <View>
          <Text className="font-poppins text-ssf-text-muted mb-1">Date of Birth {isCollegeFest ? '(Optional)' : '*'}</Text>
          {Platform.OS === 'web' ? (
            <SsfDatePicker
              value={dob || ''}
              onValueChange={(val: string) => setDob(val)}
              style={{ width: '100%', height: 48 }}
            />
          ) : (
            <TextInput
              className="border border-ssf-border rounded-xl p-3 font-poppins text-ssf-text"
              placeholder="YYYY-MM-DD"
              value={dob}
              onChangeText={(text) => setDob(formatDOBInput(text))}
              keyboardType="number-pad"
              placeholderTextColor={ui.colors.textSubtle}
              maxLength={10}
            />
          )}
          {dob && dob.length > 0 && (
            <Text className="font-poppins text-xs text-ssf-text-muted mt-1">
              Age as of 31 May {festivalYear}: <Text className="font-poppins-bold text-ssf-primary">
                {(() => { try { return calculateAge(dob, festivalYear); } catch { return '?'; } })()}
              </Text>
            </Text>
          )}
        </View>

        {/* Gender Selector */}
        <View>
          <Text className="font-poppins text-ssf-text-muted mb-2">Gender *</Text>
          <View className="flex-row gap-x-3">
            {(['boys', 'girls'] as const).map(g => (
              <TouchableOpacity
                key={g}
                className={`flex-1 py-3 rounded-xl border-2 items-center justify-center ${gender === g ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                onPress={() => setGender(g)}
              >
                <Text className={`font-poppins-bold text-base capitalize ${gender === g ? 'text-white' : 'text-ssf-text'}`}>
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {isCollegeFest && (
          <View>
            <Text className="font-poppins text-ssf-text-muted mb-2">Category *</Text>
            {categoriesLoading ? <ActivityIndicator color="#1B6B3A" /> : categoriesError ? (
              <Text className="font-poppins text-sm text-red-600">Unable to load College Fest categories.</Text>
            ) : participantCollegeCategories.length === 0 ? (
              <View className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <Text className="font-poppins text-sm text-amber-800">No College Fest categories have been created yet.</Text>
                <TouchableOpacity onPress={() => router.push('/(admin)/settings/categories' as any)} className="mt-3">
                  <Text className="font-poppins-bold text-emerald-700">Create Categories</Text>
                </TouchableOpacity>
              </View>
            ) : <View className="flex-row flex-wrap gap-2">
              {participantCollegeCategories.map(category => (
                <TouchableOpacity
                  key={category.id}
                  className={`min-w-[120px] px-3 py-3 rounded-xl border items-center ${collegeCategory === category.code ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                  onPress={() => setCollegeCategory(category.code)}
                >
                  <Text className={`font-poppins-bold text-xs ${collegeCategory === category.code ? 'text-white' : 'text-ssf-text'}`}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>}
          </View>
        )}

        {/* Class (for school students) */}
        {!isCollegeFest && (
        <View>
          <Text className="font-poppins text-ssf-text-muted mb-2">Class (School Students)</Text>
          <View className="flex-row flex-wrap gap-2">
            {CLASS_OPTIONS.map(cls => (
              <TouchableOpacity
                key={cls}
                className={`px-3 py-2 rounded-xl border ${classStd === cls ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                onPress={() => { setClassStd(cls === classStd ? '' : cls); setEducationType(''); setManualCategory(''); }}
              >
                <Text className={`font-poppins-bold text-sm ${classStd === cls ? 'text-white' : 'text-ssf-text'}`}>
                  {cls}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        )}

        {/* Education Type (College/Campus) */}
        {!isCollegeFest && <View>
          <Text className="font-poppins text-ssf-text-muted mb-2">Education Type (Campus Students)</Text>
          <View className="flex-row flex-wrap gap-2">
            {CAMPUS_TYPES.map(type => (
              <TouchableOpacity
                key={type}
                className={`px-3 py-2 rounded-xl border ${educationType === type ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                onPress={() => { setEducationType(type === educationType ? '' : type); setClassStd(''); setManualCategory(''); }}
              >
                <Text className={`font-poppins-bold text-sm ${educationType === type ? 'text-white' : 'text-ssf-text'}`}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>}

        {/* Junior / Senior (Youth / General) */}
        {!isCollegeFest && <View>
          <Text className="font-poppins text-ssf-text-muted mb-1">Junior / Senior (Youth Category)</Text>
          <Text className="font-poppins text-xs text-ssf-text-muted mb-2 italic">
            Select if participant is NOT a school student and NOT a college student.
            DOB is required to confirm age eligibility.
          </Text>
          <View className="flex-row gap-3">
            {JUNIOR_SENIOR_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: manualCategory === opt.value ? '#1B6B3A' : ui.colors.border,
                  backgroundColor: manualCategory === opt.value ? '#1B6B3A' : '#FAFAFA',
                  alignItems: 'center',
                }}
                onPress={() => {
                  const next = manualCategory === opt.value ? '' : opt.value;
                  setManualCategory(next);
                  setClassStd('');
                  setEducationType('');
                }}
              >
                <Text style={{
                  fontWeight: '800',
                  fontSize: 16,
                  color: manualCategory === opt.value ? ui.colors.surface : '#1B6B3A',
                  letterSpacing: 1,
                }}>
                  {opt.label}
                </Text>
                <Text style={{
                  fontSize: 11,
                  color: manualCategory === opt.value ? 'rgba(255,255,255,0.85)' : '#6B7280',
                  marginTop: 2,
                }}>
                  {opt.age}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>}

        {/* Sahithyolsav auto-resolved category */}
        {!isCollegeFest && <View className={`rounded-xl p-4 border ${
          ageClassWarning
            ? 'bg-red-50 border-red-400'
            : resolvedCategory ? 'bg-green-50 border-green-400' : 'bg-ssf-surface border-ssf-border'
        }`}>
          <Text className="font-poppins text-ssf-text-muted mb-1">Auto-Assigned Category</Text>
          {resolvedCategory && !ageClassWarning ? (
            <Text className="font-poppins-bold text-green-700 text-base">
              ✅ {getCategoryLabel(resolvedCategory)}
            </Text>
          ) : ageClassWarning ? (
            <>
              <Text className="font-poppins-bold text-red-600 text-base">
                ❌ {getCategoryLabel(resolvedCategory!)}
              </Text>
              <Text className="font-poppins text-xs text-red-600 mt-2">{ageClassWarning}</Text>
            </>
          ) : (
            <Text className="font-poppins text-xs text-ssf-text-muted italic">
              Enter DOB + Class or Education Type to auto-assign category
            </Text>
          )}
          {categoryError ? (
            <Text className="font-poppins text-xs text-red-500 mt-1">{categoryError}</Text>
          ) : null}
        </View>}

        {/* Phone */}
        <View>
          <Text className="font-poppins text-ssf-text-muted mb-1">Phone Number (Optional)</Text>
          <TextInput
            className="border border-ssf-border rounded-xl p-3 font-poppins text-ssf-text"
            placeholder="E.g. 9876543210"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholderTextColor={ui.colors.textSubtle}
          />
        </View>

        {/* Organisation Selector */}
        <View>
          <Text className="font-poppins text-ssf-text-muted mb-2">Organisation (Unit/Sector/Division) *</Text>
          {organisations.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {organisations.map((org: any) => (
                <TouchableOpacity
                  key={org.id}
                  className={`px-3 py-2 rounded-xl border ${selectedOrgId === org.id ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                  onPress={() => setSelectedOrgId(org.id)}
                >
                  <Text className={`font-poppins-bold text-sm ${selectedOrgId === org.id ? 'text-white' : 'text-ssf-text'}`}>
                    {org.name} <Text className="font-poppins font-normal text-xs opacity-80">({org.org_type})</Text>
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text className="font-poppins text-xs italic text-red-500">
              No organisations found. Please set up the hierarchy first.
            </Text>
          )}
        </View>

        {/* Candidate Profile Section */}
        <View className="border-t border-gray-100 pt-4 gap-y-4">
          <View className="flex-row items-center gap-x-2">
            <Eye size={18} color={ui.colors.info} />
            <Text className="font-poppins-bold text-base text-ssf-text">Public Candidate Profile</Text>
          </View>
          
          {/* Photo upload */}
          <View>
            <Text className="text-sm font-poppins text-ssf-text-muted mb-2">Profile Photo</Text>
            {photoPreviewUrl ? (
              <View className="flex-row items-center gap-x-4 mb-3">
                <Image
                  source={{ uri: photoPreviewUrl }}
                  style={{ width: 80, height: 80, borderRadius: 40, borderColor: '#E2E8F0', borderWidth: 1 }}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={handlePhotoRemove}
                  className="px-3 py-2 rounded-xl border border-red-100 bg-red-50"
                >
                  <Text className="font-poppins-bold text-xs text-red-700">Remove Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="flex-row items-center gap-x-4 mb-3">
                <View className="w-20 h-20 rounded-full bg-slate-50 border border-ssf-border items-center justify-center">
                  <Text className="font-poppins text-2xl text-ssf-text-muted">?</Text>
                </View>
                <TouchableOpacity
                  onPress={handlePhotoSelect}
                  className="px-3 py-2 rounded-xl border border-blue-100 bg-blue-50"
                >
                  <Text className="font-poppins-bold text-xs text-blue-700">Select Photo</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Bio */}
          <View>
            <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Public Bio</Text>
            <TextInput
              className="border border-ssf-border rounded-xl p-3 font-poppins text-ssf-text min-h-[96px]"
              value={profileBio}
              onChangeText={setProfileBio}
              multiline
              textAlignVertical="top"
              placeholder="Short public-safe candidate bio..."
              placeholderTextColor={ui.colors.textSubtle}
            />
          </View>

          {/* Visibility Toggle */}
          <View className="flex-row justify-between items-center bg-blue-50 border border-blue-100 rounded-xl p-3">
            <View className="flex-1 pr-3">
              <Text className="font-poppins-bold text-sm text-ssf-text">Public profile enabled</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">Allow this candidate profile to be opened publicly.</Text>
            </View>
            <Switch
              value={publicProfileEnabled}
              onValueChange={setPublicProfileEnabled}
              trackColor={{ false: '#CBD5E1', true: '#B9EBD1' }}
              thumbColor={publicProfileEnabled ? ui.colors.success : '#F8FAFC'}
            />
          </View>

          {/* Organisation Visibility Toggle */}
          <View className="flex-row justify-between items-center bg-green-50 border border-green-100 rounded-xl p-3">
            <View className="flex-1 pr-3">
              <Text className="font-poppins-bold text-sm text-ssf-text">Show organisation publicly</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">Display organisation name on the public profile.</Text>
            </View>
            <Switch
              value={showOrganisationPublic}
              onValueChange={setShowOrganisationPublic}
              trackColor={{ false: '#CBD5E1', true: '#B9EBD1' }}
              thumbColor={showOrganisationPublic ? ui.colors.success : '#F8FAFC'}
            />
          </View>
        </View>

        <SsfButton
          label={loading ? 'Saving...' : 'Save Participant'}
          onPress={handleSave}
          disabled={loading || !!ageClassWarning || (isCollegeFest && (categoriesLoading || !!categoriesError || collegeCategories.length === 0))}
          className="mt-2"
        />
      </SsfCard>
    </ScrollView>
  );
}
