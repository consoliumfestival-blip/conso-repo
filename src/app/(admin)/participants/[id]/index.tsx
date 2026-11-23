import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { ui } from '@/constants/designSystem';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Alert, TextInput, Platform, Switch, useWindowDimensions, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useAuthStore } from '../../../../core/store/authStore';
import { useParticipants } from '../../../../core/hooks/useParticipants';
import {
  ArrowLeft,
  Lock,
  Unlock,
  Edit3,
  Trash2,
  AlertTriangle,
  Eye,
  Upload,
} from 'lucide-react-native';
import { useFestival } from '../../../../core/hooks/useFestival';
import { CATEGORIES } from '../../../../constants/categories';
import { useFestivalCategories } from '../../../../core/hooks/useFestivalCategories';
import { SsfSelectMenu } from '../../../../components/ui/SsfSelectMenu';
import { SsfSheet } from '../../../../components/ui/SsfSheet';
import { AyaticLoadingScreen } from '@/components/loading-ui/AyaticLoadingScreen';
import { SsfDatePicker } from '../../../../components/ui/SsfDatePicker';
import { Modal } from '@/components/ui/CoreModal';

function ReadOnlyField({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Text className="font-poppins-semibold text-[11px] text-ssf-text">{label}</Text>
      <View
        accessible
        accessibilityLabel={`${label}: ${value || 'Not provided'}`}
        style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, backgroundColor: ui.colors.surface }}
      >
        <Text selectable className="font-poppins text-xs text-ssf-text">{value || '–'}</Text>
      </View>
    </View>
  );
}

function ParticipantDetailsLoadingSkeleton() {
  return <AyaticLoadingScreen />;
}

export default function ParticipantDetails() {
  const tenant_id = useAuthStore((state) => state.tenant_id);
  const validTenantId = tenant_id;
  const { id, open } = useLocalSearchParams();
  const participantId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  // The admin sidebar consumes significant width on tablets; use the stacked
  // profile layout until the remaining content area can support two columns.
  const isDesktopProfile = width >= 1200;
  const goBack = useGoBack('/(admin)/participants');
  
  const {
    participant,
    isLoadingDetail,
    updateStatus,
    updateParticipant,
    deleteParticipant,
    terminateParticipant,
    revokeTermination,
    isTerminating,
    isRevokingTermination,
    isUpdatingParticipant,
    uploadProfilePhoto,
    removeProfilePhoto,
    isUploadingProfilePhoto,
    isRemovingProfilePhoto,
  } = useParticipants(participantId, { loadList: false, loadRegistrations: false });

  const { useActiveFestival } = useFestival();
  const { data: festival } = useActiveFestival();
  const isCollegeFest = festival?.festival_template === 'college_fest';
  const { data: collegeCategories = [], isLoading: categoriesLoading } =
    useFestivalCategories(isCollegeFest ? festival?.id : undefined, false);

  const [isEditing, setIsEditing] = useState(false);
  const openedFromCard = useRef(false);
  useEffect(() => {
    if (open === 'edit' && participant && !participant.is_locked && !openedFromCard.current) {
      openedFromCard.current = true;
      setIsEditing(true);
    }
  }, [open, participant]);

  // Editable fields
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [organisations, setOrganisations] = useState<any[]>([]);
  const [categoryCode, setCategoryCode] = useState('');
  const [gender, setGender] = useState('');
  const [classStd, setClassStd] = useState('');
  const [educationType, setEducationType] = useState('');
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(true);
  const [showOrganisationPublic, setShowOrganisationPublic] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const festivalLevel = String(festival?.level || '').trim().toLowerCase();
  const currentOrganisation = organisations.find((organisation) => organisation.tenant_id === validTenantId);
  const availableOrganisations = festival?.chest_number_template === 'team' || festivalLevel === 'sector' || festivalLevel === 'division'
    ? organisations.filter((organisation) => organisation.parent_id === currentOrganisation?.id)
    : organisations;

  // Custom Action Modal State
  const [actionModal, setActionModal] = useState<{
    visible: boolean;
    type: 'alert' | 'confirm' | 'prompt_reason' | 'prompt_date' | 'status_select';
    title: string;
    message: string;
    inputValue?: string;
    action: ((value?: any) => void) | null;
  }>({
    visible: false,
    type: 'alert',
    title: '',
    message: '',
    inputValue: '',
    action: null
  });

  const closeActionModal = () => setActionModal({ ...actionModal, visible: false, action: null });


  // Update local state when participant data loads
  useEffect(() => {
    if (participant) {
      setName(participant.name || '');
      setDob(participant.dob || '');
      setCategoryCode(participant.category_code || '');
      setGender(participant.gender || '');
      setClassStd(participant.class_std || '');
      setEducationType(participant.education_type || '');
      setPublicProfileEnabled(participant.public_profile_enabled !== false);
      setShowOrganisationPublic(participant.show_organisation_public !== false);
      setPhotoPreviewUrl(participant.photo_url || null);
      setPhotoFile(null);
      setRemoveExistingPhoto(false);
      setSelectedOrgId(participant.organisation_id || '');
    }
  }, [participant]);

  useEffect(() => {
    if (validTenantId) {
      import('../../../../services/participantService').then(({ participantService }) => {
        participantService.listOrganisations(validTenantId).then((data: any[]) => {
          setOrganisations(data);
        });
      });
    }
  }, [validTenantId]);

  const toggleLock = async () => {
    if (!participant || !participantId) return;
    try {
      await updateParticipant({ id: participantId, updates: { is_locked: !participant.is_locked } });
      if (!participant.is_locked) setIsEditing(false);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const chooseProfilePhoto = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Upload unavailable', 'Photo selection is currently supported on web.');
      return;
    }
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/png,image/jpeg,image/webp';
    picker.onchange = () => {
      const file = picker.files?.[0];
      if (!file) return;
      if (photoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoFile(file);
      setPhotoPreviewUrl(URL.createObjectURL(file));
      setRemoveExistingPhoto(false);
    };
    picker.click();
  };

  const clearProfilePhoto = () => {
    if (photoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
    setPhotoFile(null);
    setRemoveExistingPhoto(Boolean(participant?.photo_url));
  };

  const handleSave = async () => {
    if (!name) return Alert.alert('Error', 'Name is required');
    if (!participantId) return;
    if (isCollegeFest) {
      const selected = collegeCategories.find(category => category.code === categoryCode);
      const unchangedArchived = selected && !selected.is_active && categoryCode === participant.category_code;
      if (!selected || (!selected.is_active && !unchangedArchived)) {
        return Alert.alert('Error', 'Select an active College Fest category.');
      }
    }

    try {
      const changingTeam = Boolean(selectedOrgId && selectedOrgId !== participant.organisation_id);
      if (changingTeam) {
        // Team has changed! We need to confirm and call RPC.
        const confirm = await new Promise((resolve) => {
          Alert.alert(
            "Change Team?",
            `You are changing the team. All Solo items and their future points will be transferred to the new team. Group items will remain with the old team.${festival?.chest_number_template === 'team' ? ' The participant will receive a new chest number from the destination team.' : ''} Proceed?`,
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Yes, Change Team", style: "destructive", onPress: () => resolve(true) }
            ]
          );
        });

        if (!confirm) return;

        // Note: Admin Auth usually sets `auth.uid()`, we can pass user.id for audit
        const { supabase } = await import('@/core/config/supabase');
        const { useAuthStore } = await import('@/core/store/authStore');
        const adminId = useAuthStore.getState().user?.id;

        const { error: rpcError } = await supabase.rpc('transfer_participant_team', {
          p_participant_id: participantId,
          p_new_org_id: selectedOrgId,
          p_admin_id: adminId || '00000000-0000-0000-0000-000000000000'
        });

        if (rpcError) {
          throw new Error(rpcError.message || 'Failed to transfer team.');
        }
      }

      await updateParticipant({ 
        id: participantId, 
        updates: {
          name, 
          dob: dob || null,
          category_code: categoryCode || null,
          class_std: isCollegeFest ? null : classStd || null,
          education_type: isCollegeFest ? null : educationType || null,
          gender: festival?.gender_mode === 'boys_only' ? 'boys' : festival?.gender_mode === 'girls_only' ? 'girls' : gender,
          public_profile_enabled: publicProfileEnabled,
          show_organisation_public: showOrganisationPublic,
        }
      });
      setIsEditing(false);
      try {
        if (photoFile) {
          const photoTenantId = changingTeam
            ? availableOrganisations.find((organisation) => organisation.id === selectedOrgId)?.tenant_id
            : participant.tenant_id;
          if (!photoTenantId) throw new Error('Destination team tenant could not be resolved.');
          await uploadProfilePhoto({ id: participantId, file: photoFile, tenantId: photoTenantId, festivalId: participant.festival_id });
        } else if (removeExistingPhoto) {
          await removeProfilePhoto(participantId);
        }
      } catch (photoError: any) {
        Alert.alert('Details saved; photo update failed', photoError?.message || 'Retry the photo change from Edit profile.');
        return;
      }
      Alert.alert('Success', 'Participant updated.');
      if (open === 'edit') router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleTerminate = async () => {
    if (!participantId) return;
    setActionModal({
      visible: true,
      type: 'prompt_reason',
      title: 'Terminate Participant',
      message: 'Enter reason for termination:',
      inputValue: '',
      action: async (reason: string) => {
        if (!reason) {
          Alert.alert('Error', 'Termination reason is required.');
          return;
        }
        try {
          await terminateParticipant({ id: participantId, reason });
        } catch (error: any) {
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Error', message: error.message, action: null });
          }, 300);
        }
      }
    });
  };

  const handleRevokeTermination = async () => {
    if (!participantId) return;
    setActionModal({
      visible: true,
      type: 'confirm',
      title: 'Revoke Termination',
      message: 'Are you sure you want to revoke this termination?',
      action: async () => {
        try {
          await revokeTermination(participantId);
        } catch (error: any) {
          setActionModal({ visible: true, type: 'alert', title: 'Error', message: error.message, action: null });
        }
      }
    });
  };

  const handleDelete = async () => {
    if (!participantId) return;
    const msg = 'Are you sure you want to delete this participant?';
    setActionModal({
      visible: true,
      type: 'confirm',
      title: 'Confirm Delete',
      message: msg,
      action: async () => {
        try {
          await deleteParticipant(participantId);
          goBack();
        } catch (error: any) {
          setActionModal({ visible: true, type: 'alert', title: 'Error', message: error.message, action: null });
        }
      }
    });
  };

  const handleStatusUpdate = async (newStatus: string, reason: string | null = null) => {
    if (!participantId) return;
    try {
      await updateStatus({ id: participantId, status: newStatus as any, reason });
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const promptStatusChange = () => {
    if (participant.is_locked) return;
    
    setActionModal({
      visible: true,
      type: 'status_select',
      title: 'Update Status',
      message: isBanned && participant.status !== 'approved' ? 'Participant is banned. Approval blocked.' : `Select new status for ${participant.name}`,
      inputValue: participant.status || 'pending',
      action: async (val: any) => {
        if (!val) return;
        if (val.status === 'approved' && isBanned && participant.status !== 'approved') {
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Error', message: 'Cannot approve a banned participant.', action: null });
          }, 300);
          return;
        }
        if (val.status === 'rejected') {
          setTimeout(() => {
            setActionModal({
              visible: true,
              type: 'prompt_reason',
              title: 'Rejection Reason',
              message: 'Enter rejection reason:',
              inputValue: isBanned ? 'Plagiarism Ban' : '',
              action: async (reason: string) => {
                await handleStatusUpdate('rejected', reason);
              }
            });
          }, 300);
        } else {
          await handleStatusUpdate(val.status, null);
        }
      }
    });
  };

  const handleBan = async () => {
    setActionModal({
      visible: true,
      type: 'prompt_date',
      title: 'Plagiarism Ban',
      message: 'Enter ban until date (YYYY-MM-DD) or leave empty to remove ban:',
      inputValue: participant.plagiarism_ban_until ? new Date(participant.plagiarism_ban_until).toISOString().split('T')[0] : '',
      action: async (banUntil: string) => {
        const newDate = banUntil ? new Date(banUntil).toISOString() : null;
        try {
          await updateParticipant({ id: participantId!, updates: { plagiarism_ban_until: newDate } });
        } catch (error: any) {
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Error', message: error.message, action: null });
          }, 300);
        }
      }
    });
  };

  if (isLoadingDetail) return (
    <Modal visible transparent animationType="fade" onRequestClose={goBack} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.52)', backdropFilter: Platform.OS === 'web' ? 'blur(7px)' : undefined, WebkitBackdropFilter: Platform.OS === 'web' ? 'blur(7px)' : undefined, justifyContent: 'center', alignItems: 'center', padding: width < 640 ? 8 : 20 } as any}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close participant details" onPress={goBack} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
        <View style={{ width: Math.max(280, Math.min(width >= 640 ? 480 : 640, width - 24)), maxHeight: Math.min(height - 24, height * 0.72), borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
            <ParticipantDetailsLoadingSkeleton />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  if (!participant) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={goBack} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close participant details" onPress={goBack} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
          <View style={{ width: Math.max(280, Math.min(640, width - 24)), minHeight: 200, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface }} className="p-5 justify-center items-center">
            <Text className="font-poppins text-ssf-text">Participant not found.</Text>
            <SsfButton label="Go Back" onPress={goBack} className="mt-4" />
          </View>
        </View>
      </Modal>
    );
  }

  const locked = participant.is_locked;
  const isBanned = participant.plagiarism_ban_until && new Date(participant.plagiarism_ban_until) > new Date();
  const categoryOptions = isCollegeFest
    ? [
        { label: '-- Select Category --', value: '' },
        ...collegeCategories.filter(category => category.code.toUpperCase() !== 'GN' && (category.is_active || category.code === participant.category_code)).map((category) => ({
          label: `${category.name}${category.is_active ? '' : ' (Archived)'}`,
          value: category.code,
        })),
        ...(!collegeCategories.some(category => category.code === categoryCode) && categoryCode
          ? [{ label: `${categoryCode} (Historical)`, value: categoryCode }]
          : []),
      ]
    : [
        { label: '-- Select Category --', value: '' },
        ...CATEGORIES.map((cat) => ({
          label: `${cat.code} - ${cat.name_en}`,
          value: cat.code,
        })),
        ...(!CATEGORIES.find((category) => category.code === categoryCode) && categoryCode
          ? [{ label: categoryCode, value: categoryCode }]
          : []),
      ];
  const categoryLabel = categoryOptions.find((option) => option.value === participant.category_code)?.label || participant.category_code || '–';
  const organisationLabel = participant.organisations
    ? `${participant.organisations.name}${participant.organisations.org_type ? ` (${participant.organisations.org_type})` : ''}`
    : '–';

  const getStatusColor = (status: string) => {
    switch((status || 'pending').toLowerCase()) {
      case 'approved': return { bg: 'bg-core-success-soft-green-100', text: 'text-core-success-green-700', border: 'border-core-success-soft-green-200' };
      case 'rejected': return { bg: 'bg-core-danger-soft-red-100', text: 'text-core-danger-red-700', border: 'border-core-danger-soft-red-200' };
      default: return { bg: 'bg-core-warning-soft-yellow-100', text: 'text-core-warning-yellow-700', border: 'border-core-warning-soft-yellow-200' };
    }
  };
  const statColor = getStatusColor(participant.status);
  const isDeleteConfirmation = /delete/i.test(actionModal.title);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={goBack} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: isEditing ? 'transparent' : 'rgba(15,23,42,0.52)', backdropFilter: !isEditing && Platform.OS === 'web' ? 'blur(7px)' : undefined, WebkitBackdropFilter: !isEditing && Platform.OS === 'web' ? 'blur(7px)' : undefined, justifyContent: 'center', alignItems: 'center', padding: width < 640 ? 8 : 20 } as any}>
      {!isEditing && <Pressable accessibilityRole="button" accessibilityLabel="Close participant details" onPress={goBack} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />}
      <View {...{ dataSet: { coreGlass: 'sheet' } } as any} style={{ display: isEditing ? 'none' : 'flex', width: Math.max(280, Math.min(isDesktopProfile ? 480 : 640, width - 24)), height: Math.min(isDesktopProfile ? 380 : 720, height - 32), maxHeight: isDesktopProfile ? '72%' : '82%', borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, overflow: 'hidden', shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 24, elevation: 18 }}>
      <View style={{ minHeight: isDesktopProfile ? 46 : 56, paddingHorizontal: isDesktopProfile ? 10 : 14, paddingVertical: isDesktopProfile ? 5 : 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: ui.colors.border, backgroundColor: ui.colors.surface }}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to participants"
          onPress={goBack}
          style={{ minWidth: isDesktopProfile ? 58 : 64, minHeight: isDesktopProfile ? 34 : 40, paddingHorizontal: isDesktopProfile ? 8 : 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 9, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface }}
        >
          <ArrowLeft size={isDesktopProfile ? 15 : 17} color={ui.colors.text} />
          <Text style={{ color: ui.colors.text, fontFamily: 'Poppins_600SemiBold', fontSize: isDesktopProfile ? 11 : 12 }}>Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: ui.colors.text, fontFamily: 'Poppins_700Bold', fontSize: isDesktopProfile ? 13 : 15 }}>Participant details</Text>
          <Text numberOfLines={1} style={{ color: ui.colors.textMuted, fontFamily: 'Poppins_400Regular', fontSize: isDesktopProfile ? 10 : 11 }}>{participant.name}</Text>
        </View>
      </View>
      <ScrollView
      style={{ flex: 1, backgroundColor: ui.colors.background }}
      scrollEnabled={width < 640 || height < 760}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: isDesktopProfile ? 8 : 8,
        paddingTop: isDesktopProfile ? 6 : 8,
        paddingBottom: isDesktopProfile ? 8 : 14,
      }}
    >
      {participant.is_terminated && (
        <View className="bg-core-warning-soft-amber-100 border border-core-warning-soft-amber-300 rounded-xl p-4 mb-4 flex-row items-center gap-x-3">
          <AlertTriangle size={24} color={coreColor("#D97706", 'warning')} />
          <View className="flex-1">
            <Text className="font-poppins-bold text-core-warning-amber-700">Participant Terminated</Text>
            <Text className="font-poppins text-xs text-core-warning-amber-600">Reason: {participant.termination_reason || 'No reason provided'}</Text>
          </View>
        </View>
      )}

      {isBanned && (
        <View className="bg-core-danger-soft-red-100 border border-core-danger-soft-red-300 rounded-xl p-4 mb-4 flex-row items-center gap-x-3">
          <AlertTriangle size={24} color={coreColor("#DC2626", 'danger')} />
          <View className="flex-1">
            <Text className="font-poppins-bold text-core-danger-red-700">Plagiarism Ban Active</Text>
            <Text className="font-poppins text-xs text-core-danger-red-600">Banned until: {new Date(participant.plagiarism_ban_until).toLocaleDateString()}</Text>
          </View>
          <TouchableOpacity onPress={handleBan} className="bg-core-surface-white px-3 py-1 rounded-lg border border-core-danger-soft-red-200">
            <Text className="font-poppins-bold text-xs text-core-danger-red-700">Manage</Text>
          </TouchableOpacity>
        </View>
      )}

      <View className={isDesktopProfile ? 'gap-y-1.5' : 'gap-y-3'}>
      <SsfCard className={`mb-0 w-full ${isDesktopProfile ? 'p-2' : 'p-3'}`} style={{ borderRadius: 10 }}>
        <View className={`flex-row flex-wrap items-center justify-between gap-2 border-b border-core-border-gray-100 ${isDesktopProfile ? 'pb-2' : 'pb-3'}`}>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Change participant status, current status ${participant.status || 'Pending'}`}
              disabled={locked}
              onPress={promptStatusChange}
              className={`rounded-lg border px-2 py-1.5 ${statColor.bg} ${statColor.border}`}
            >
              <Text className={`font-poppins-bold text-[10px] uppercase ${statColor.text}`}>{participant.status || 'Pending'}</Text>
            </TouchableOpacity>
          </View>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={locked ? 'Unlock participant profile' : 'Lock participant profile'}
              onPress={toggleLock}
              className={`${isDesktopProfile ? 'h-8 px-2' : 'h-10 px-2.5'} flex-row items-center justify-center gap-1.5 rounded-lg border ${locked ? 'border-core-danger-soft-red-200 bg-core-danger-soft-red-50' : 'border-core-success-soft-emerald-200 bg-core-surface-white'}`}
            >
              {locked ? <Lock size={isDesktopProfile ? 13 : 15} color={coreColor('#DC2626', 'danger')} /> : <Unlock size={isDesktopProfile ? 13 : 15} color={coreColor('#047857', 'success')} />}
              <Text className={`font-poppins-bold ${isDesktopProfile ? 'text-[9px]' : 'text-[10px]'} ${locked ? 'text-core-danger-red-600' : 'text-core-success-emerald-700'}`}>{locked ? 'Unlock' : 'Lock'}</Text>
            </TouchableOpacity>
            {!locked && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setIsEditing(true)}
                className={`${isDesktopProfile ? 'h-8 px-2.5' : 'h-10 px-3'} flex-row items-center justify-center gap-1.5 rounded-lg bg-button-primary`}
              >
                <Edit3 size={isDesktopProfile ? 12 : 14} color={ui.colors.buttonForeground} />
                <Text className={`font-poppins-bold ${isDesktopProfile ? 'text-[9px]' : 'text-[10px]'} text-action-foreground`}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {participant.status === 'rejected' && participant.rejection_reason && (
          <View className={`${isDesktopProfile ? 'p-2 mb-2' : 'p-3 mb-4'} rounded-lg border border-core-danger-soft-red-100 bg-core-danger-soft-red-50`}>
            <Text className="font-poppins-bold text-xs text-core-danger-red-700">Rejection Reason:</Text>
            <Text className="font-poppins text-sm text-core-danger-red-600">{participant.rejection_reason}</Text>
          </View>
        )}

        {isEditing ? (
          <SsfSheet
            visible={isEditing}
            onClose={() => { setIsEditing(false); if (open === 'edit') router.back(); }}
            presentation="dialog"
            compactDialog
            title="Edit profile"
            description="Update participant details and public profile settings."
            footer={
              <>
                <SsfButton
                  label="Cancel"
                  size="sm"
                  variant="outline"
                  onPress={() => { setIsEditing(false); if (open === 'edit') router.back(); }}
                  disabled={isUpdatingParticipant}
                />
                <SsfButton
                  label={isUpdatingParticipant ? 'Saving...' : 'Save changes'}
                  size="sm"
                  onPress={handleSave}
                  disabled={isUpdatingParticipant || (isCollegeFest && categoriesLoading)}
                />
              </>
            }
          >
            <View className={isDesktopProfile ? 'gap-y-2' : 'gap-y-3'}>
            <View style={{ flexDirection: width >= 768 ? 'row' : 'column', gap: isDesktopProfile ? 8 : 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className={`mb-1 font-poppins-bold ${isDesktopProfile ? 'text-[10px]' : 'text-[11px]'} text-ssf-text`}>Name</Text>
                <TextInput accessibilityLabel="Participant name" style={{ minHeight: isDesktopProfile ? 34 : 40, paddingHorizontal: isDesktopProfile ? 9 : 12, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, color: ui.colors.text, fontSize: isDesktopProfile ? 12 : 13 }} value={name} onChangeText={setName} />
              </View>
              <View style={{ flex: 1, minWidth: 0, zIndex: 50 }}>
                <Text className={`mb-1 font-poppins-bold ${isDesktopProfile ? 'text-[10px]' : 'text-[11px]'} text-ssf-text`}>Category Code</Text>
                <SsfSelectMenu
                  value={categoryCode}
                  onValueChange={setCategoryCode}
                  placeholder="-- Select Category --"
                  accessibilityLabel="Select category"
                  options={categoryOptions}
                  compact
                  keepInViewport
                />
              </View>
            </View>
            <View style={{ flexDirection: width >= 768 ? 'row' : 'column', gap: isDesktopProfile ? 8 : 12 }}>
              {(!festival?.gender_mode || festival.gender_mode === 'both') && <View style={{ flex: 1, minWidth: 0 }}>
                <Text className={`mb-1 font-poppins-bold ${isDesktopProfile ? 'text-[10px]' : 'text-[11px]'} text-ssf-text`}>Gender</Text>
                <View className="flex-row gap-2">
                  {(['boys', 'girls'] as const).map(option => <TouchableOpacity key={option} onPress={() => setGender(option)} className={`${isDesktopProfile ? 'min-h-8 px-2 py-1' : 'min-h-10 px-3 py-2'} flex-1 items-center justify-center rounded-lg border ${gender === option ? 'border-button-border bg-button-primary' : 'border-core-border-slate-300 bg-core-surface-white'}`}><Text className={`font-poppins-bold ${isDesktopProfile ? 'text-[11px]' : 'text-xs'} capitalize ${gender === option ? 'text-button-foreground' : 'text-ssf-text'}`}>{option}</Text></TouchableOpacity>)}
                </View>
              </View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className={`mb-1 font-poppins-bold ${isDesktopProfile ? 'text-[10px]' : 'text-[11px]'} text-ssf-text`}>Date of Birth</Text>
                <SsfDatePicker value={dob} onValueChange={setDob} placeholder="Pick a date" style={isDesktopProfile ? { height: 34 } : undefined} />
              </View>
            </View>
            {!isCollegeFest && <View style={{ flexDirection: width >= 768 ? 'row' : 'column', gap: isDesktopProfile ? 8 : 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className={`mb-1 font-poppins-bold ${isDesktopProfile ? 'text-[10px]' : 'text-[11px]'} text-ssf-text`}>Class / Standard</Text>
                <TextInput accessibilityLabel="Class or standard" style={{ minHeight: isDesktopProfile ? 34 : 40, paddingHorizontal: isDesktopProfile ? 9 : 12, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, color: ui.colors.text, fontSize: isDesktopProfile ? 12 : 13 }} value={classStd} onChangeText={setClassStd} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className={`mb-1 font-poppins-bold ${isDesktopProfile ? 'text-[10px]' : 'text-[11px]'} text-ssf-text`}>Education Type</Text>
                <TextInput accessibilityLabel="Education type" style={{ minHeight: isDesktopProfile ? 34 : 40, paddingHorizontal: isDesktopProfile ? 9 : 12, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, color: ui.colors.text, fontSize: isDesktopProfile ? 12 : 13 }} value={educationType} onChangeText={setEducationType} />
              </View>
            </View>}
            <View className={`border-t border-core-border-gray-100 ${isDesktopProfile ? 'pt-2 gap-y-2' : 'pt-3 gap-y-3'}`}>
              <View className="flex-row items-center gap-x-2">
                <Eye size={isDesktopProfile ? 14 : 16} color={ui.colors.info} />
                <Text className={`font-poppins-bold ${isDesktopProfile ? 'text-xs' : 'text-sm'} text-ssf-text`}>Public Candidate Profile</Text>
              </View>
              <View>
                <Text className={`mb-1 font-poppins-bold ${isDesktopProfile ? 'text-[10px]' : 'text-[11px]'} text-ssf-text`}>Profile Photo</Text>
                <View className="flex-row flex-wrap items-center gap-2">
                  {photoPreviewUrl ? <Image source={{ uri: photoPreviewUrl }} style={{ width: isDesktopProfile ? 32 : 40, height: isDesktopProfile ? 32 : 40, borderRadius: 20 }} /> : <View className={`${isDesktopProfile ? 'h-8 w-8' : 'h-10 w-10'} items-center justify-center rounded-full border border-ssf-border bg-core-surface-muted-slate-50`}><Text className="font-poppins text-base text-ssf-text-muted">?</Text></View>}
                  <TouchableOpacity onPress={chooseProfilePhoto} className={`${isDesktopProfile ? 'min-h-8 px-2' : 'min-h-10 px-3'} flex-row items-center gap-2 rounded-lg border border-core-info-soft-blue-100 bg-core-info-soft-blue-50`}><Upload size={14} color={coreColor("#2563EB", 'info')}/><Text className={`font-poppins-bold ${isDesktopProfile ? 'text-[11px]' : 'text-xs'} text-core-info-blue-700`}>Select Photo</Text></TouchableOpacity>
                  {!!photoPreviewUrl && <TouchableOpacity onPress={clearProfilePhoto} className={`${isDesktopProfile ? 'min-h-8 px-2' : 'min-h-10 px-3'} justify-center rounded-lg border border-core-danger-soft-red-100 bg-core-danger-soft-red-50`}><Text className="font-poppins-bold text-[11px] text-core-danger-red-700">Remove</Text></TouchableOpacity>}
                  {(isUploadingProfilePhoto || isRemovingProfilePhoto) && <ActivityIndicator size="small" color={ui.colors.primaryText} />}
                </View>
              </View>
              <View className={`flex-row justify-between items-center bg-core-info-soft-blue-50 border border-core-info-soft-blue-100 rounded-lg ${isDesktopProfile ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                <View className="flex-1 pr-3">
                  <Text className={`font-poppins-bold ${isDesktopProfile ? 'text-xs' : 'text-sm'} text-ssf-text`}>Public profile enabled</Text>
                  <Text className={`font-poppins ${isDesktopProfile ? 'text-[10px]' : 'text-xs'} text-ssf-text-muted`}>Allow this candidate profile to be opened publicly.</Text>
                </View>
                <Switch
                  value={publicProfileEnabled}
                  onValueChange={setPublicProfileEnabled}
                  trackColor={{ false: coreColor('#CBD5E1', 'primarySoft'), true: coreColor('#B9EBD1', 'primarySoft') }}
                  thumbColor={publicProfileEnabled ? ui.colors.success : coreColor('#F8FAFC', 'primary')}
                />
              </View>
              <View className={`flex-row justify-between items-center bg-core-success-soft-green-50 border border-core-success-soft-green-100 rounded-lg ${isDesktopProfile ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                <View className="flex-1 pr-3">
                  <Text className={`font-poppins-bold ${isDesktopProfile ? 'text-xs' : 'text-sm'} text-ssf-text`}>Show organisation publicly</Text>
                  <Text className={`font-poppins ${isDesktopProfile ? 'text-[10px]' : 'text-xs'} text-ssf-text-muted`}>Display organisation name on the public profile.</Text>
                </View>
                <Switch
                  value={showOrganisationPublic}
                  onValueChange={setShowOrganisationPublic}
                  trackColor={{ false: coreColor('#CBD5E1', 'primarySoft'), true: coreColor('#B9EBD1', 'primarySoft') }}
                  thumbColor={showOrganisationPublic ? ui.colors.success : coreColor('#F8FAFC', 'primary')}
                />
              </View>
            </View>
          </View>
          </SsfSheet>
        ) : (
          <View className={isDesktopProfile ? 'gap-y-2 border-t border-core-border-gray-100 pt-2' : 'gap-y-2 pt-3'}>
            <View style={{ flexDirection: width >= 640 ? 'row' : 'column', gap: isDesktopProfile ? 8 : 10 }}>
              <ReadOnlyField label="Full Name" value={participant.name} />
              <ReadOnlyField label="Date of Birth" value={participant.dob || 'Not provided'} />
            </View>
            <View style={{ flexDirection: width >= 640 ? 'row' : 'column', gap: isDesktopProfile ? 8 : 10 }}>
              <ReadOnlyField label="Category" value={categoryLabel} />
              <ReadOnlyField label="Organisation" value={organisationLabel} />
            </View>
            <ReadOnlyField label="Gender" value={participant.gender || '–'} />
            {!isBanned && (
              <TouchableOpacity onPress={handleBan} className="self-start rounded-lg border border-core-danger-soft-red-100 bg-core-danger-soft-red-50 px-2.5 py-1.5">
                <Text className="font-poppins-bold text-[10px] text-core-danger-red-600">Add plagiarism ban</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </SsfCard>

              {!locked && (
        <View className={`mt-4 ${isDesktopProfile ? 'flex-row justify-end gap-x-2' : 'flex-col gap-y-2'}`}>
          {!participant.is_terminated ? (
            <SsfButton tone="warning"
              label="Terminate Participant"
              variant="outline"
              size={isDesktopProfile ? 'md' : 'sm'}
              className={isDesktopProfile ? 'border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50' : 'w-full border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50'}
              icon={<AlertTriangle size={16} color={coreColor("#D97706", 'warning')} />}
              onPress={handleTerminate}
              disabled={isTerminating}
            />
          ) : (
            <SsfButton tone="success"
              label="Revoke Termination"
              variant="outline"
              size={isDesktopProfile ? 'md' : 'sm'}
              className={isDesktopProfile ? 'border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50' : 'w-full border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50'}
              icon={<Unlock size={16} color={coreColor("#059669", 'success')} />}
              onPress={handleRevokeTermination}
              disabled={isRevokingTermination}
            />
          )}
          <SsfButton tone="danger"
            label="Delete Participant"
            variant="outline"
            size={isDesktopProfile ? 'md' : 'sm'}
            className={isDesktopProfile ? '' : 'w-full border-core-danger-soft-red-100 bg-core-danger-soft-red-50'}
            icon={<Trash2 size={16} color={coreColor("#DC2626", 'danger')} />}
            onPress={handleDelete}
          />
        </View>
      )}
      </View>

      {/* Action Modal */}
      {actionModal.visible && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: coreAlpha(coreColor('#000000', 'overlay'), 0.6), justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 20 }}>
          {isDeleteConfirmation && <Pressable accessibilityRole="button" accessibilityLabel="Close delete confirmation" onPress={closeActionModal} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />}
          <View style={{ backgroundColor: ui.colors.surface, borderColor: ui.colors.border, borderWidth: 1, borderRadius: isDeleteConfirmation ? 14 : 16, width: '100%', maxWidth: isDeleteConfirmation ? 380 : 400, padding: isDeleteConfirmation ? 18 : 24, zIndex: 10000, elevation: 10 }}>
            {isDeleteConfirmation && <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}><Trash2 size={19} color="#DC2626" /></View>}
            <Text className="font-poppins-bold text-lg mb-2 text-ssf-text">{actionModal.title}</Text>
            {!!actionModal.message && <Text className="font-poppins text-sm text-ssf-text-muted mb-4">{actionModal.message}</Text>}
            
            {actionModal.type === 'status_select' && (
              <View className="mb-4">
                <SsfSelectMenu
                  value={actionModal.inputValue || 'pending'}
                  onValueChange={(val) => setActionModal({ ...actionModal, inputValue: val })}
                  options={[
                    { label: 'Pending', value: 'pending' },
                    { label: 'Approved', value: 'approved' },
                    { label: 'Rejected', value: 'rejected' },
                  ]}
                  placeholder="Select Status"
                />
              </View>
            )}

            {(actionModal.type === 'prompt_reason' || actionModal.type === 'prompt_date') && (
              <View className="mb-4">
                <TextInput
                  className="border border-ssf-border rounded-xl p-3 font-poppins text-ssf-text"
                  value={actionModal.inputValue}
                  onChangeText={(val) => setActionModal({ ...actionModal, inputValue: val })}
                  placeholder={actionModal.type === 'prompt_date' ? 'YYYY-MM-DD' : 'Enter reason here...'}
                  autoFocus
                />
              </View>
            )}

            <View className="flex-row justify-end gap-x-3 mt-2">
              {actionModal.type !== 'alert' && (
                <TouchableOpacity onPress={closeActionModal} className="px-4 py-2 rounded-xl border border-core-border-slate-200">
                  <Text className="font-poppins-bold text-ssf-text">Cancel</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  const action = actionModal.action;
                  const type = actionModal.type;
                  const val = type === 'status_select' ? { status: actionModal.inputValue } : actionModal.inputValue;
                  closeActionModal();
                  if (action) {
                    if (type === 'alert' || type === 'confirm') action();
                    else action(val);
                  }
                }}
                className={`px-4 py-2 rounded-xl ${actionModal.type === 'alert' ? 'bg-ssf-primary w-full items-center' : (actionModal.title.includes('Delete') || actionModal.title.includes('Remove') || actionModal.title.includes('Ban') ? 'bg-core-danger-action-red-600' : 'bg-ssf-primary')}`}
              >
                <Text className="font-poppins-bold text-core-on-primary-white">
                  {actionModal.type === 'alert' ? 'OK' : (actionModal.title.includes('Delete') || actionModal.title.includes('Remove') ? 'Confirm' : 'Proceed')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      </ScrollView>
      </View>
      </View>
    </Modal>
  );
}


