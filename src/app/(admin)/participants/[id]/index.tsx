import { ui } from '@/constants/designSystem';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput, Platform, Switch, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
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
  Plus,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  CircleUserRound,
  ChevronDown,
  ChevronRight,
  Globe2,
  ShieldCheck,
  Trophy,
} from 'lucide-react-native';
import { useFestival } from '../../../../core/hooks/useFestival';
import { CATEGORIES } from '../../../../constants/categories';
import { useFestivalCategories } from '../../../../core/hooks/useFestivalCategories';
import { SsfSelectMenu } from '../../../../components/ui/SsfSelectMenu';
import { SsfSheet } from '../../../../components/ui/SsfSheet';
import { SsfProfileSkeleton } from '../../../../components/ui/SsfSkeleton';

function InfoTile({
  label,
  value,
  tone = 'default',
  style,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'success' | 'warning';
  style?: any;
}) {
  const valueColor =
    tone === 'success' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : 'text-ssf-text';

  return (
    <View
      className="min-h-[48px] justify-center border-b border-slate-200 py-1.5 pr-3"
      style={style}
    >
      <Text className="font-poppins text-[10px] uppercase tracking-wide text-ssf-text-muted">{label}</Text>
      <Text selectable className={`mt-0.5 font-poppins-bold text-[13px] leading-5 ${valueColor}`}>
        {value || '–'}
      </Text>
    </View>
  );
}

function DetailAccordion({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View className="border-b border-slate-200">
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="min-h-[50px] flex-row items-center py-2"
      >
        <View className="h-8 w-8 items-center justify-center">
          {expanded
            ? <ChevronDown size={16} color="#047857" />
            : <ChevronRight size={16} color={ui.colors.textMuted} />}
        </View>
        <View className="ml-2.5 flex-1">
          <Text className={`font-poppins-bold text-[12px] ${expanded ? 'text-emerald-800' : 'text-ssf-text'}`}>{title}</Text>
          <Text className="font-poppins text-[9px] text-ssf-text-muted">{subtitle}</Text>
        </View>
        <Text className={`font-poppins-bold text-[9px] uppercase ${expanded ? 'text-emerald-700' : 'text-slate-400'}`}>
          {expanded ? 'Hide' : 'View'}
        </Text>
      </TouchableOpacity>
      {expanded && (
        <View className="pb-3 pl-10">
          {children}
        </View>
      )}
    </View>
  );
}

export default function ParticipantDetails() {
  const tenant_id = useAuthStore((state) => state.tenant_id);
  const validTenantId = tenant_id;
  const { id } = useLocalSearchParams();
  const participantId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktopProfile = width >= 1000;
  const goBack = useGoBack('/(admin)/participants');
  
  const {
    participant,
    isLoadingDetail,
    registrations: events,
    updateStatus,
    updateParticipant,
    deleteParticipant,
    terminateParticipant,
    revokeTermination,
    isTerminating,
    isRevokingTermination,
    isUpdatingParticipant,
    registerParticipant,
    isRegistering,
    deleteRegistration,
    isDeletingRegistration,
  } = useParticipants(participantId);

  const { useActiveFestival, useItems } = useFestival();
  const { data: festival } = useActiveFestival();
  const { data: allItems } = useItems(festival?.id);
  const isCollegeFest = festival?.festival_template === 'college_fest';
  const { data: collegeCategories = [], isLoading: categoriesLoading } =
    useFestivalCategories(isCollegeFest ? festival?.id : undefined, false);

  const [isEditing, setIsEditing] = useState(false);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');
  const [addEventError, setAddEventError] = useState<string>('');
  
  // Custom dropdown state
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
  const [itemSearchText, setItemSearchText] = useState('');

  // Editable fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [organisations, setOrganisations] = useState<any[]>([]);
  const [categoryCode, setCategoryCode] = useState('');
  const [gender, setGender] = useState('');
  const [classStd, setClassStd] = useState('');
  const [educationType, setEducationType] = useState('');
  const [membershipNo, setMembershipNo] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileSlug, setProfileSlug] = useState('');
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(true);
  const [showOrganisationPublic, setShowOrganisationPublic] = useState(true);
  const [expandedProfileSection, setExpandedProfileSection] = useState<'competition' | 'contact' | 'verification' | null>(
    isDesktopProfile ? 'competition' : null,
  );
  const [publicSectionExpanded, setPublicSectionExpanded] = useState(false);
  const [eventsSectionExpanded, setEventsSectionExpanded] = useState(isDesktopProfile);

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
      setEmail(participant.email || '');
      setPhone(participant.phone || '');
      setDob(participant.dob || '');
      setCategoryCode(participant.category_code || '');
      setGender(participant.gender || '');
      setClassStd(participant.class_std || '');
      setEducationType(participant.education_type || '');
      setMembershipNo(participant.membership_no || '');
      setProfileBio(participant.profile_bio || '');
      setProfileSlug(participant.profile_slug || '');
      setPublicProfileEnabled(participant.public_profile_enabled !== false);
      setShowOrganisationPublic(participant.show_organisation_public !== false);
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
      if (selectedOrgId && selectedOrgId !== participant.organisation_id) {
        // Team has changed! We need to confirm and call RPC.
        const confirm = await new Promise((resolve) => {
          Alert.alert(
            "Change Team?",
            "You are changing the team. All Solo items and their future points will be transferred to the new team. Group items will remain with the old team. Proceed?",
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
          email: email || null, 
          phone: phone || null, 
          dob: dob || null,
          category_code: categoryCode || null,
          gender: gender || null,
          class_std: isCollegeFest ? null : classStd || null,
          education_type: isCollegeFest ? null : educationType || null,
          membership_no: membershipNo || null,
          profile_bio: profileBio || null,
          profile_slug: profileSlug || null,
          public_profile_enabled: publicProfileEnabled,
          show_organisation_public: showOrganisationPublic,
        }
      });
      setIsEditing(false);
      Alert.alert('Success', 'Participant updated.');
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

  const handleAddEvent = async () => {
    if (!selectedItemCode) return Alert.alert('Error', 'Please select an item');
    if (!participant || !festival) return;

    const selectedItem = allItems?.find((i: any) => i.item_code === selectedItemCode);
    if (!selectedItem) return;

    try {
      setAddEventError('');
      const { errors, warnings } = await registerParticipant({
        participant,
        item: selectedItem,
        festivalConfig: festival
      });

      if (errors && errors.length > 0) {
        const errorMsg = errors.map(e => `• ${e.message}`).join('\n');
        setAddEventError(errorMsg);
        Alert.alert('Registration Blocked', errorMsg);
        return;
      }

      if (warnings && warnings.length > 0) {
        const warningMsg = warnings.map(w => `• ${w.message}`).join('\n');
        setAddEventError(warningMsg);
        Alert.alert('Warning', warningMsg);
      } else {
        Alert.alert('Success', 'Participant registered successfully');
      }

      setIsAddingEvent(false);
      setSelectedItemCode('');
    } catch (error: any) {
      setAddEventError(error.message);
      Alert.alert('Error', error.message);
    }
  };

  const handleRemoveEvent = async (event: any) => {
    if (!event?.id || !participantId) return;
    const itemName = event.items?.item_name_en || event.items?.item_code || 'this item';
    const message = `Remove ${itemName} from this participant? The assignment can be added again later. If marks, results, or stage records already exist, the system will safely block the removal.`;

    setActionModal({
      visible: true,
      type: 'confirm',
      title: 'Remove Assignment',
      message: message,
      action: async () => {
        try {
          const result = await deleteRegistration({
            registrationId: event.id,
            itemId: event.item_id,
            reason: 'Admin removed participant-item assignment during festival preparation.',
          });
          if (result?.status === 'blocked') {
            const blockedMessage = result.message || 'This assignment has dependent competition data and was not removed.';
            setTimeout(() => {
              setActionModal({ visible: true, type: 'alert', title: 'Assignment Not Removed', message: blockedMessage, action: null });
            }, 300);
            return;
          }
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Removed', message: 'The item assignment was safely removed.', action: null });
          }, 300);
        } catch (error: any) {
          const messageText = String(error?.message || 'Unable to remove this assignment.');
          const protectedRecord = /foreign key|violates|referenced|constraint/i.test(messageText);
          const safeMessage = protectedRecord
            ? 'This assignment already has competition records (such as marks, results, or stage data), so it was not removed. This protects the existing history.'
            : messageText;
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Assignment Not Removed', message: safeMessage, action: null });
          }, 300);
        }
      }
    });
  };

  if (isLoadingDetail) return <SsfProfileSkeleton />;

  if (!participant) {
    return (
      <View className="flex-1 bg-ssf-bg p-6 justify-center items-center">
        <Text className="font-poppins text-ssf-text">Participant not found.</Text>
        <SsfButton label="Go Back" onPress={goBack} className="mt-4" />
      </View>
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

  const getStatusColor = (status: string) => {
    switch((status || 'pending').toLowerCase()) {
      case 'approved': return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' };
      case 'rejected': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
      default: return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' };
    }
  };
  const statColor = getStatusColor(participant.status);
  const avatarInitials = (participant.name || 'Participant')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part: string) => part.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <ScrollView
      className="flex-1 bg-ssf-bg"
      contentContainerStyle={{
        width: '100%',
        maxWidth: 1360,
        alignSelf: 'center',
        paddingHorizontal: isDesktopProfile ? 8 : 10,
        paddingTop: isDesktopProfile ? 8 : 12,
        paddingBottom: isDesktopProfile ? 18 : 28,
      }}
    >
      {!isDesktopProfile && (
        <View className="mb-3 flex-row items-center">
          <TouchableOpacity
            onPress={goBack}
            className="mr-3 h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white"
          >
            <ArrowLeft size={19} color={ui.colors.text} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-lg font-poppins-black text-ssf-text">Participant profile</Text>
            <Text className="text-[10px] font-poppins text-ssf-text-muted">Identity, eligibility and registrations</Text>
          </View>
        </View>
      )}

      {participant.is_terminated && (
        <View className="bg-amber-100 border border-amber-300 rounded-xl p-4 mb-4 flex-row items-center gap-x-3">
          <AlertTriangle size={24} color="#D97706" />
          <View className="flex-1">
            <Text className="font-poppins-bold text-amber-700">Participant Terminated</Text>
            <Text className="font-poppins text-xs text-amber-600">Reason: {participant.termination_reason || 'No reason provided'}</Text>
          </View>
        </View>
      )}

      {isBanned && (
        <View className="bg-red-100 border border-red-300 rounded-xl p-4 mb-4 flex-row items-center gap-x-3">
          <AlertTriangle size={24} color="#DC2626" />
          <View className="flex-1">
            <Text className="font-poppins-bold text-red-700">Plagiarism Ban Active</Text>
            <Text className="font-poppins text-xs text-red-600">Banned until: {new Date(participant.plagiarism_ban_until).toLocaleDateString()}</Text>
          </View>
          <TouchableOpacity onPress={handleBan} className="bg-white px-3 py-1 rounded-lg border border-red-200">
            <Text className="font-poppins-bold text-xs text-red-700">Manage</Text>
          </TouchableOpacity>
        </View>
      )}

      <View className={isDesktopProfile ? 'gap-y-2' : 'gap-y-3'}>
        <View>
      <SsfCard
        className="mb-0 w-full overflow-hidden"
        style={{ padding: 0, borderRadius: 10 }}
      >
        <LinearGradient
          colors={['#D8F1EB', '#E2F4F0', '#DDF2ED']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: isDesktopProfile ? 70 : 88 }}
        />
        <View className={isDesktopProfile ? 'px-4 pb-4' : 'px-3 pb-3'}>
          <View
            className={`rounded-[10px] border border-emerald-100 bg-white shadow-sm ${isDesktopProfile ? 'p-3' : 'p-4'}`}
            style={{ marginTop: isDesktopProfile ? -24 : -38 }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center">
                <View className={`${isDesktopProfile ? 'h-14 w-14 rounded-2xl' : 'h-16 w-16 rounded-[18px]'} items-center justify-center border border-emerald-100 bg-emerald-50`}>
                  <Text className={`${isDesktopProfile ? 'text-lg' : 'text-xl'} font-poppins-black text-emerald-800`}>
                    {avatarInitials}
                  </Text>
                </View>
                <View className="ml-3 flex-1">
                  <Text numberOfLines={2} className={`${isDesktopProfile ? 'text-[16px] leading-5' : 'text-[17px] leading-6'} font-poppins-black text-ssf-text`}>
                    {participant.name}
                  </Text>
                  <Text numberOfLines={1} className="mt-0.5 font-poppins text-[10px] text-ssf-text-muted">
                    {participant.email || participant.unique_code || 'Participant profile'}
                  </Text>
                  <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
                    {participant.category_code && (
                      <View className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                        <Text className="font-poppins-bold text-[9px] uppercase text-slate-600">
                          {participant.category_code}
                        </Text>
                      </View>
                    )}
                    <View className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1">
                      <Text className="font-poppins-bold text-[9px] text-emerald-700">
                        Chest {participant.chest_number || 'N/A'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      disabled={locked}
                      onPress={promptStatusChange}
                      className={`rounded-lg border px-2 py-1 ${statColor.bg} ${statColor.border}`}
                    >
                      <Text className={`font-poppins-bold text-[9px] uppercase ${statColor.text}`}>
                        {participant.status || 'Pending'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              {isDesktopProfile && (
                <View className="ml-3 flex-row items-center gap-x-2">
                  <TouchableOpacity
                    onPress={toggleLock}
                    className={`h-9 w-9 items-center justify-center rounded-lg border ${locked ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-white'}`}
                  >
                    {locked ? <Lock size={15} color="#DC2626" /> : <Unlock size={15} color="#047857" />}
                  </TouchableOpacity>
                  {!locked && !isEditing && (
                  <TouchableOpacity
                    className="flex-row items-center rounded-lg bg-ssf-primary px-4 py-2.5"
                    onPress={() => setIsEditing(true)}
                  >
                    <Edit3 size={15} color={ui.colors.surface} />
                    <Text className="ml-1.5 font-poppins-bold text-[11px] text-white">Edit</Text>
                  </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {isEditing ? (
              <View className="mt-3 border-t border-slate-100 pt-2.5">
                <Text className="font-poppins text-ssf-text-muted mb-2 text-xs">Organisation (Team) *</Text>
                {organisations.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2">
                    {organisations.map((org: any) => (
                      <TouchableOpacity
                        key={org.id}
                        className={`px-3 py-1.5 rounded-lg border ${selectedOrgId === org.id ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                        onPress={() => setSelectedOrgId(org.id)}
                      >
                        <Text className={`font-poppins-bold text-xs ${selectedOrgId === org.id ? 'text-white' : 'text-ssf-text'}`}>
                          {org.name} <Text className="font-poppins font-normal text-[10px] opacity-80">({org.org_type})</Text>
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text className="font-poppins text-xs italic text-red-500">Loading organisations...</Text>
                )}
              </View>
            ) : participant.organisations && (
              <View className="mt-3 flex-row items-center border-t border-slate-100 pt-2.5">
                <ShieldCheck size={14} color="#047857" />
                <Text numberOfLines={1} className="ml-2 flex-1 font-poppins-bold text-[10px] uppercase text-ssf-text">
                  {participant.organisations.name}
                </Text>
                <Text className="font-poppins text-[9px] uppercase text-ssf-text-muted">
                  {participant.organisations.org_type}
                </Text>
              </View>
            )}

            {!isDesktopProfile && (
              <View className="mt-3 flex-row gap-x-2 border-t border-slate-100 pt-3">
                <TouchableOpacity
                  onPress={toggleLock}
                  className={`h-11 flex-1 flex-row items-center justify-center rounded-xl border ${
                    locked ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'
                  }`}
                >
                  {locked ? <Lock size={16} color="#DC2626" /> : <Unlock size={16} color="#047857" />}
                  <Text className={`ml-2 font-poppins-bold text-[11px] ${locked ? 'text-red-600' : 'text-emerald-700'}`}>
                    {locked ? 'Unlock profile' : 'Lock profile'}
                  </Text>
                </TouchableOpacity>
                {!locked && !isEditing && (
                  <TouchableOpacity
                    className="h-11 flex-1 flex-row items-center justify-center rounded-xl bg-ssf-primary"
                    onPress={() => setIsEditing(true)}
                  >
                    <Edit3 size={16} color={ui.colors.surface} />
                    <Text className="ml-2 font-poppins-bold text-[11px] text-white">Edit details</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

        {participant.status === 'rejected' && participant.rejection_reason && (
          <View className="bg-red-50 p-3 rounded-lg mb-4 border border-red-100">
            <Text className="font-poppins-bold text-xs text-red-700">Rejection Reason:</Text>
            <Text className="font-poppins text-sm text-red-600">{participant.rejection_reason}</Text>
          </View>
        )}

        {isEditing ? (
          <SsfSheet
            visible={isEditing}
            onClose={() => setIsEditing(false)}
            title="Edit profile"
            description="Update participant details and public profile settings. Save when you’re done."
            footer={
              <>
                <SsfButton
                  label={isUpdatingParticipant ? 'Saving...' : 'Save changes'}
                  onPress={handleSave}
                  disabled={isUpdatingParticipant || (isCollegeFest && categoriesLoading)}
                />
                <SsfButton
                  label="Close"
                  variant="outline"
                  onPress={() => setIsEditing(false)}
                  disabled={isUpdatingParticipant}
                />
              </>
            }
          >
          <View className="gap-y-4">
            <View className="items-center rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
              <Text className="mb-3 font-poppins-bold text-[10px] uppercase tracking-widest text-emerald-700">Live preview</Text>
              <View className="h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-emerald-200 shadow-sm">
                <Text className="font-poppins-black text-2xl text-emerald-900">
                  {(name || 'Participant').trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase()}
                </Text>
              </View>
              <Text className="mt-3 font-poppins-black text-xl text-ssf-text">{name || 'Participant name'}</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">
                {[categoryCode, participant.chest_number].filter(Boolean).join(' · ') || 'Candidate profile'}
              </Text>
            </View>
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Name</Text>
              <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={name} onChangeText={setName} />
            </View>
            <View className="flex-row gap-x-3" style={{ zIndex: 50 }}>
              <View className="flex-1" style={{ zIndex: 50 }}>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Category Code</Text>
                <SsfSelectMenu
                  value={categoryCode}
                  onValueChange={setCategoryCode}
                  placeholder="-- Select Category --"
                  accessibilityLabel="Select category"
                  options={categoryOptions}
                />
              </View>
              <View className="flex-1" style={{ zIndex: 40 }}>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Gender (boys/girls)</Text>
                <SsfSelectMenu
                  value={gender}
                  onValueChange={setGender}
                  placeholder="-- Select --"
                  accessibilityLabel="Select gender"
                  options={[
                    { label: '-- Select --', value: '' },
                    { label: 'Boys', value: 'boys' },
                    { label: 'Girls', value: 'girls' },
                  ]}
                />
              </View>
            </View>
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Date of Birth (YYYY-MM-DD)</Text>
              <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={dob} onChangeText={setDob} />
            </View>
            {!isCollegeFest && <View className="flex-row gap-x-3">
              <View className="flex-1">
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Class / Standard</Text>
                <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={classStd} onChangeText={setClassStd} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Education Type</Text>
                <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={educationType} onChangeText={setEducationType} />
              </View>
            </View>}
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Membership Number</Text>
              <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={membershipNo} onChangeText={setMembershipNo} />
            </View>
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Email</Text>
              <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={email} onChangeText={setEmail} keyboardType="email-address" />
            </View>
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Phone</Text>
              <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </View>
            <View className="border-t border-gray-100 pt-4 gap-y-4">
              <View className="flex-row items-center gap-x-2">
                <Eye size={18} color={ui.colors.info} />
                <Text className="font-poppins-bold text-base text-ssf-text">Public Candidate Profile</Text>
              </View>
              <View>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Public Slug</Text>
                <TextInput
                  className="border border-ssf-border rounded-xl p-3 font-poppins"
                  value={profileSlug}
                  onChangeText={setProfileSlug}
                  placeholder="candidate-name"
                  autoCapitalize="none"
                />
              </View>
              <View>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Public Bio</Text>
                <TextInput
                  className="border border-ssf-border rounded-xl p-3 font-poppins min-h-[96px]"
                  value={profileBio}
                  onChangeText={setProfileBio}
                  multiline
                  textAlignVertical="top"
                  placeholder="Short public-safe candidate bio"
                />
              </View>
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
          </View>
          </SsfSheet>
        ) : (
          <View className={`${isDesktopProfile ? 'gap-y-2 border-t border-gray-100 pt-3' : 'gap-y-2 pt-3'}`}>
            <DetailAccordion
              title="Competition details"
              subtitle="Category, age and eligibility"
              expanded={expandedProfileSection === 'competition'}
              onToggle={() => setExpandedProfileSection((current) => current === 'competition' ? null : 'competition')}
            >
              <View className="flex-row flex-wrap gap-x-2 gap-y-1">
                <InfoTile label="Category" value={participant.category_code || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Gender" value={participant.gender || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Age" value={participant.age || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Date of birth" value={participant.dob || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Class / Standard" value={participant.class_std || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Education type" value={participant.education_type || '–'} style={{ width: '48.5%' }} />
                {participant.is_campus_parallel && (
                  <InfoTile label="Campus / Parallel" value="Yes" style={{ width: '48.5%' }} />
                )}
              </View>
            </DetailAccordion>

            <DetailAccordion
              title="Contact & institution"
              subtitle="Contact and membership information"
              expanded={expandedProfileSection === 'contact'}
              onToggle={() => setExpandedProfileSection((current) => current === 'contact' ? null : 'contact')}
            >
              <View className="flex-row flex-wrap gap-x-2 gap-y-1">
                <InfoTile label="Phone" value={participant.phone || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Email" value={participant.email || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Institution" value={participant.institution_name || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Membership no." value={participant.membership_no || '–'} style={{ width: '48.5%' }} />
              </View>
            </DetailAccordion>

            <DetailAccordion
              title="Verification"
              subtitle="Festival verification and identity"
              expanded={expandedProfileSection === 'verification'}
              onToggle={() => setExpandedProfileSection((current) => current === 'verification' ? null : 'verification')}
            >
              <View className="flex-row flex-wrap gap-x-2 gap-y-1">
                <InfoTile label="Unique code" value={participant.unique_code || '–'} style={{ width: '48.5%' }} />
                <InfoTile
                  label="Verification"
                  value={participant.is_verified ? 'Verified' : 'Not verified'}
                  tone={participant.is_verified ? 'success' : 'warning'}
                  style={{ width: '48.5%' }}
                />
                <InfoTile label="ID card" value={participant.id_card_uploaded ? 'Uploaded' : 'Not uploaded'} style={{ width: '48.5%' }} />
                {participant.residence_changed && (
                  <InfoTile label="Residence changed" value="Yes" style={{ width: '48.5%' }} />
                )}
              </View>
            </DetailAccordion>

            {!isBanned && (
              <TouchableOpacity onPress={handleBan} className="mt-1 self-start rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                <Text className="font-poppins-bold text-[10px] text-red-600">Add plagiarism ban</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        </View>
      </SsfCard>
        </View>

        <View
          className={isDesktopProfile ? 'flex-row items-start gap-2' : 'gap-y-3'}
        >
          <View style={isDesktopProfile ? { flex: 1 } : undefined}>
      <SsfCard
        className="mb-0 w-full p-3"
        style={{ borderRadius: 10 }}
      >
        <View className={`flex-row justify-between items-start ${publicSectionExpanded ? 'mb-3' : ''}`}>
          <TouchableOpacity
            onPress={() => setPublicSectionExpanded((current) => !current)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ expanded: publicSectionExpanded }}
            className={`${isDesktopProfile ? 'gap-x-3' : 'gap-x-2.5'} flex-1 flex-row items-center`}
          >
            <View className={`h-10 w-10 items-center justify-center rounded-lg border ${participant.public_profile_enabled === false ? 'border-slate-200 bg-slate-100' : 'border-emerald-100 bg-emerald-50'}`}>
              {participant.public_profile_enabled === false ? (
                <EyeOff size={20} color={ui.colors.textMuted} />
              ) : (
                <Globe2 size={20} color={ui.colors.success} />
              )}
            </View>
            <View className="flex-1">
              <Text numberOfLines={isDesktopProfile ? 2 : 1} className="font-poppins-bold text-base text-ssf-text">
                {isDesktopProfile ? 'Public Candidate Profile' : 'Public Profile'}
              </Text>
              <Text numberOfLines={1} className={`${isDesktopProfile ? 'text-xs' : 'text-[10px]'} font-poppins text-ssf-text-muted`}>
                {isDesktopProfile ? 'Public-safe identity and leaderboard profile.' : 'Public identity & leaderboard'}
              </Text>
            </View>
            {publicSectionExpanded
              ? <ChevronDown size={17} color="#047857" />
              : <ChevronRight size={17} color={ui.colors.textMuted} />}
          </TouchableOpacity>
          {participant.profile_slug && participant.public_profile_enabled !== false && (
            <TouchableOpacity
              onPress={() => router.push(`/candidate/${participant.profile_slug}` as any)}
              accessibilityRole="button"
              accessibilityLabel="Open public profile"
              className={`${isDesktopProfile ? 'ml-3 px-3' : 'ml-2 w-9'} h-9 rounded-xl border border-blue-100 bg-blue-50 flex-row items-center justify-center gap-x-1.5`}
            >
              <ExternalLink size={15} color={ui.colors.info} />
              {isDesktopProfile && <Text className="font-poppins-bold text-[11px] text-blue-700">Open</Text>}
            </TouchableOpacity>
          )}
        </View>
        {publicSectionExpanded && <View className="border-t border-slate-100">
          <View className="flex-row">
            <View className="flex-1 py-3 pr-3">
              <View className="flex-row items-center">
                {participant.public_profile_enabled === false
                  ? <EyeOff size={14} color={ui.colors.textMuted} />
                  : <CheckCircle2 size={14} color="#047857" />}
                <Text className="ml-1.5 font-poppins text-[10px] uppercase tracking-wide text-ssf-text-muted">Visibility</Text>
              </View>
              <Text className={`mt-1 font-poppins-bold text-[13px] ${participant.public_profile_enabled === false ? 'text-gray-500' : 'text-emerald-700'}`}>
                {participant.public_profile_enabled === false ? 'Disabled' : 'Public'}
              </Text>
            </View>
            <View className="flex-1 border-l border-slate-100 py-3 pl-3">
              <View className="flex-row items-center">
                <ShieldCheck size={14} color={participant.show_organisation_public === false ? ui.colors.textMuted : '#2563EB'} />
                <Text className="ml-1.5 font-poppins text-[10px] uppercase tracking-wide text-ssf-text-muted">Organisation</Text>
              </View>
              <Text className={`mt-1 font-poppins-bold text-[13px] ${participant.show_organisation_public === false ? 'text-gray-500' : 'text-blue-700'}`}>
                {participant.show_organisation_public === false ? 'Hidden publicly' : 'Shown publicly'}
              </Text>
            </View>
          </View>
          <View className="border-t border-slate-100 py-3">
            <View className="mb-1 flex-row items-center">
              <CircleUserRound size={14} color={ui.colors.textMuted} />
              <Text className="ml-1.5 font-poppins text-[10px] uppercase tracking-wide text-ssf-text-muted">Profile slug</Text>
            </View>
            <Text selectable className="font-poppins-bold text-xs leading-5 text-ssf-text">
              {participant.profile_slug || 'Will be generated on save'}
            </Text>
          </View>
          <View className="border-t border-slate-100 pt-3">
            <Text className="mb-1 font-poppins text-[10px] uppercase tracking-wide text-ssf-text-muted">Public bio</Text>
            <Text className="font-poppins text-[13px] leading-5 text-ssf-text">
              {participant.profile_bio || 'No public bio added yet.'}
            </Text>
          </View>
        </View>}
      </SsfCard>
          </View>

          <View style={isDesktopProfile ? { flex: 1 } : undefined}>
      <SsfCard
        className="mb-0 w-full p-3"
        style={{ borderRadius: 10 }}
      >
        <View className={`flex-row justify-between items-center ${eventsSectionExpanded ? 'mb-3' : ''}`}>
          <TouchableOpacity
            onPress={() => setEventsSectionExpanded((current) => !current)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ expanded: eventsSectionExpanded }}
            className="flex-row items-center flex-1"
          >
            <View className="h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <Trophy size={17} color={ui.colors.warning} />
            </View>
            <View className="ml-2.5">
              <Text className="font-poppins-bold text-base">Registered Events</Text>
              <Text className="font-poppins text-[10px] text-ssf-text-muted">
                {events.length} {events.length === 1 ? 'event' : 'events'} assigned
              </Text>
            </View>
            <View className="ml-auto mr-3">
              {eventsSectionExpanded
                ? <ChevronDown size={17} color="#047857" />
                : <ChevronRight size={17} color={ui.colors.textMuted} />}
            </View>
          </TouchableOpacity>
          {!locked && !isBanned && (
            <TouchableOpacity 
              onPress={() => setIsAddingEvent(true)}
              className="bg-ssf-primary px-3 py-2 rounded-xl flex-row items-center gap-x-1"
            >
              <Plus size={14} color={ui.colors.surface} />
              <Text className="font-poppins-bold text-xs text-white">Add</Text>
            </TouchableOpacity>
          )}
        </View>
        {eventsSectionExpanded && (events.length === 0 ? (
           <View className="items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8">
             <Trophy size={26} color="#CBD5E1" />
             <Text className="mt-2 font-poppins-bold text-xs text-ssf-text-muted">No events assigned yet</Text>
           </View>
        ) : (
           <View className="gap-y-2">
             {events.map((ev: any, index: number) => (
               <View key={ev.id} className="flex-row items-center border-b border-slate-100 py-3 last:border-b-0">
                  <View className="h-8 w-8 items-center justify-center rounded-lg bg-white">
                    <Text className="font-poppins-bold text-[11px] text-emerald-700">{index + 1}</Text>
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="font-poppins-bold text-[13px]">{ev.items?.item_name_en || 'Unknown Event'}</Text>
                    <Text className="font-poppins text-[10px] uppercase text-ssf-text-muted">{ev.level || 'Festival'} level</Text>
                  </View>
                  {ev.items?.item_code && (
                    <View className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1">
                      <Text className="font-poppins-bold text-[9px] text-blue-700">{ev.items.item_code}</Text>
                    </View>
                  )}
                  {!locked && !isBanned && (
                    <TouchableOpacity
                      onPress={() => handleRemoveEvent(ev)}
                      disabled={isDeletingRegistration}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${ev.items?.item_name_en || ev.items?.item_code || 'item'} assignment`}
                      className="ml-2 h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50"
                    >
                      <Trash2 size={14} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
             ))}
           </View>
        ))}
      </SsfCard>
          </View>
        </View>

      {!locked && (
        <View className={`mt-4 ${isDesktopProfile ? 'flex-row justify-end gap-x-2' : 'flex-col gap-y-2'}`}>
          {!participant.is_terminated ? (
            <SsfButton
              label="Terminate Participant"
              variant="outline"
              size={isDesktopProfile ? 'md' : 'sm'}
              className={isDesktopProfile ? 'border-amber-200 bg-amber-50' : 'w-full border-amber-200 bg-amber-50'}
              icon={<AlertTriangle size={16} color="#D97706" />}
              onPress={handleTerminate}
              disabled={isTerminating}
            />
          ) : (
            <SsfButton
              label="Revoke Termination"
              variant="outline"
              size={isDesktopProfile ? 'md' : 'sm'}
              className={isDesktopProfile ? 'border-emerald-200 bg-emerald-50' : 'w-full border-emerald-200 bg-emerald-50'}
              icon={<Unlock size={16} color="#059669" />}
              onPress={handleRevokeTermination}
              disabled={isRevokingTermination}
            />
          )}
          <SsfButton
            label="Delete Participant"
            variant="outline"
            size={isDesktopProfile ? 'md' : 'sm'}
            className={isDesktopProfile ? '' : 'w-full border-red-100 bg-red-50'}
            icon={<Trash2 size={16} color="#DC2626" />}
            onPress={handleDelete}
          />
        </View>
      )}
      </View>

      {/* Add Event Modal */}
      {isAddingEvent && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 50, padding: 20 }}>
          <View style={{ backgroundColor: ui.colors.surface, borderRadius: 16, width: '100%', maxWidth: 400, padding: 24 }}>
            <Text className="font-poppins-bold text-lg mb-4 text-ssf-text">Register for Event</Text>
            
            {addEventError ? (
              <View className="bg-red-50 p-3 rounded-lg mb-4 border border-red-100">
                <Text className="font-poppins-bold text-xs text-red-700">Error:</Text>
                <Text className="font-poppins text-sm text-red-600">{addEventError}</Text>
              </View>
            ) : null}

            <View className="mb-4" style={{ position: 'relative', zIndex: 100 }}>
              <Text className="font-poppins text-xs text-ssf-text-muted mb-2">Select Item</Text>
              <View className="border border-ssf-border rounded-xl bg-ssf-surface overflow-hidden">
                <TextInput
                  placeholder="-- Choose an Item --"
                  value={isItemDropdownOpen ? itemSearchText : (selectedItemCode ? (() => {
                    const sel = allItems?.find((i: any) => i.item_code === selectedItemCode);
                    return sel ? `[${sel.item_code}] ${sel.item_name_en}` : '';
                  })() : '')}
                  onChangeText={(text) => {
                    setItemSearchText(text);
                    if (!isItemDropdownOpen) setIsItemDropdownOpen(true);
                  }}
                  onFocus={() => {
                    setIsItemDropdownOpen(true);
                    setItemSearchText('');
                  }}
                  className="p-3 font-poppins text-ssf-text text-sm"
                />
              </View>
              
              {isItemDropdownOpen && (
                <View className="absolute top-full left-0 right-0 mt-1 border border-ssf-border rounded-xl bg-white shadow-lg overflow-hidden" style={{ maxHeight: 250, zIndex: 999 }}>
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {allItems?.filter(i => {
                      const codes = Array.isArray(i.category_codes) ? i.category_codes : (i.category_codes ? [i.category_codes] : []);
                      const normalizedCodes = codes.map(code => String(code ?? '').trim().toUpperCase());
                      
                      const pCat = String(participant.category_code ?? '').trim().toUpperCase();
                      const pCatShort = pCat === 'SENIOR' ? 'SR' : (pCat === 'JUNIOR' ? 'JR' : (pCat === 'CAMPUS' ? 'CA' : pCat));
                      const pCatLong = pCat === 'SR' ? 'SENIOR' : (pCat === 'JR' ? 'JUNIOR' : (pCat === 'CA' ? 'CAMPUS' : pCat));

                      const matchesCategory = normalizedCodes.includes(pCat) || normalizedCodes.includes(pCatShort) || normalizedCodes.includes(pCatLong) || normalizedCodes.includes('GN') || normalizedCodes.includes('GENERAL');
                      const matchesGender = !i.gender || i.gender === 'both' || i.gender === participant.gender;
                      
                      if (!itemSearchText) return matchesCategory && matchesGender;
                      
                      const search = itemSearchText.toLowerCase();
                      const name = (i.item_name_en || '').toLowerCase();
                      const code = (i.item_code || '').toLowerCase();
                      const cats = codes.join(' ').toLowerCase();
                      const matchesSearch = name.includes(search) || code.includes(search) || cats.includes(search);
                      
                      return matchesCategory && matchesGender && matchesSearch;
                    }).map(i => (
                      <TouchableOpacity
                        key={i.item_code}
                        className="p-3 border-b border-gray-100 last:border-0"
                        onPress={() => {
                          setSelectedItemCode(i.item_code);
                          setAddEventError('');
                          setIsItemDropdownOpen(false);
                          setItemSearchText('');
                        }}
                      >
                        <Text className="font-poppins text-ssf-text">
                          [{i.item_code}] {i.item_name_en} ({Array.isArray(i.category_codes) ? i.category_codes.join(',') : i.category_codes})
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {allItems?.filter(i => {
                      const codes = Array.isArray(i.category_codes) ? i.category_codes : (i.category_codes ? [i.category_codes] : []);
                      const normalizedCodes = codes.map(code => String(code ?? '').trim().toUpperCase());
                      const pCat = String(participant.category_code ?? '').trim().toUpperCase();
                      const pCatShort = pCat === 'SENIOR' ? 'SR' : (pCat === 'JUNIOR' ? 'JR' : (pCat === 'CAMPUS' ? 'CA' : pCat));
                      const pCatLong = pCat === 'SR' ? 'SENIOR' : (pCat === 'JR' ? 'JUNIOR' : (pCat === 'CA' ? 'CAMPUS' : pCat));
                      const matchesCategory = normalizedCodes.includes(pCat) || normalizedCodes.includes(pCatShort) || normalizedCodes.includes(pCatLong) || normalizedCodes.includes('GN') || normalizedCodes.includes('GENERAL');
                      const matchesGender = !i.gender || i.gender === 'both' || i.gender === participant.gender;
                      if (!itemSearchText) return matchesCategory && matchesGender;
                      const search = itemSearchText.toLowerCase();
                      const name = (i.item_name_en || '').toLowerCase();
                      const code = (i.item_code || '').toLowerCase();
                      const cats = codes.join(' ').toLowerCase();
                      const matchesSearch = name.includes(search) || code.includes(search) || cats.includes(search);
                      return matchesCategory && matchesGender && matchesSearch;
                    }).length === 0 && (
                      <View className="p-3">
                        <Text className="font-poppins text-ssf-text-muted text-sm">No items found</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            <View className="flex-row gap-x-3">
              <SsfButton label="Cancel" variant="outline" className="flex-1" onPress={() => { setIsAddingEvent(false); setAddEventError(''); }} />
              <SsfButton label={isRegistering ? "Wait..." : "Register"} className="flex-1" onPress={handleAddEvent} disabled={isRegistering || !selectedItemCode} />
            </View>
          </View>
        </View>
      )}

      {/* Action Modal */}
      {actionModal.visible && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 20 }}>
          <View style={{ backgroundColor: ui.colors.surface, borderRadius: 16, width: '100%', maxWidth: 400, padding: 24, zIndex: 10000, elevation: 10 }}>
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
                <TouchableOpacity onPress={closeActionModal} className="px-4 py-2 rounded-xl border border-slate-200">
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
                className={`px-4 py-2 rounded-xl ${actionModal.type === 'alert' ? 'bg-ssf-primary w-full items-center' : (actionModal.title.includes('Delete') || actionModal.title.includes('Remove') || actionModal.title.includes('Ban') ? 'bg-red-600' : 'bg-ssf-primary')}`}
              >
                <Text className="font-poppins-bold text-white">
                  {actionModal.type === 'alert' ? 'OK' : (actionModal.title.includes('Delete') || actionModal.title.includes('Remove') ? 'Confirm' : 'Proceed')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}


