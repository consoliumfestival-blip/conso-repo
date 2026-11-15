import { coreColor } from '@/constants/coreTheme';
import { teamLeaderClipboardValue, TeamLeaderCredentialKind } from '@/core/utils/teamLeaderCredentials';
import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  Clipboard,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { supabase } from '@/core/config/supabase';
import { useFestival } from '@/core/hooks/useFestival';
import { useAuthStore } from '@/core/store/authStore';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import { ChevronLeft, Search, Trash2, Users, Check, AlertCircle, Copy } from 'lucide-react-native';
import { teamLeaderPortalService } from '@/services/teamLeaderPortalService';

interface Participant {
  id: string;
  name: string;
  chest_number: string | null;
  category_code: string | null;
  user_id: string | null;
  organisation_id: string | null;
  organisation_name?: string;
}

interface FestivalTeam {
  id: string;
  organisation_id: string;
  organisation_name: string;
  festival_id: string;
  portal_primary_color: string;
  portal_accent_color: string;
}

interface Assignment {
  id: string;
  user_id: string;
  festival_team_id: string;
  organisation_id?: string;
  status: string;
  assigned_at: string;
  team_name: string;
  leader_email: string;
  leader_code: string | null;
  leader_name: string;
  created_at: string;
  password_state?: 'pending_change' | 'ready_to_reset' | 'unavailable';
}

interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
}

type TeamLeaderManagementCache = {
  participants: Participant[];
  teams: FestivalTeam[];
  assignments: Assignment[];
};

const teamLeaderManagementCache = new Map<string, TeamLeaderManagementCache>();
const temporaryPasswordsByUser = new Map<string, string>();
const temporaryPasswordKey = (tenantId: string, festivalId: string, userId: string) => `${tenantId}:${festivalId}:${userId}`;

export default function TeamLeaderPortalAdmin() {
  const router = useRouter();
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const tenantId = useAuthStore((state) => state.tenant_id);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<FestivalTeam[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<FestivalTeam | null>(null);

  const [participantProfile, setParticipantProfile] = useState<Profile | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [existingAssignment, setExistingAssignment] = useState<Assignment | null>(null);

  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [tempCredentials, setTempCredentials] = useState<{ user_id: string, username: string | null, email?: string, password: string } | null>(null);
  const [resetCredentials, setResetCredentials] = useState<{ assignmentId: string, username: string | null, email?: string, password: string } | null>(null);
  const [resettingAssignmentId, setResettingAssignmentId] = useState<string | null>(null);
  const [copiedCredential, setCopiedCredential] = useState<string | null>(null);

  const [openDropdown, setOpenDropdown] = useState<'participant' | 'team' | null>(null);

  const copyCredential = async (rawValue: string | null | undefined, label: string, kind: TeamLeaderCredentialKind) => {
    if (!rawValue) return;
    try {
      const value = teamLeaderClipboardValue(rawValue, kind);
      if (Platform.OS === 'web') {
        let copied = false;
        // Keep the legacy copy attempt synchronous with the click. Some browsers
        // deny Clipboard API writes in embedded contexts after an async boundary.
        if (typeof document !== 'undefined' && document.body) {
          const field = document.createElement('textarea');
          field.value = value;
          field.setAttribute('readonly', '');
          field.style.position = 'fixed';
          field.style.left = '-9999px';
          field.style.top = '0';
          field.style.opacity = '0';
          document.body.appendChild(field);
          try {
            field.focus();
            field.select();
            field.setSelectionRange(0, field.value.length);
            copied = document.execCommand('copy');
          } catch {
            // Continue to the Clipboard API if the legacy browser command throws.
          } finally {
            document.body.removeChild(field);
          }
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          if (!copied) {
            try {
              await navigator.clipboard.writeText(value);
              copied = true;
            } catch {
              // Surface a clear error below when both clipboard methods fail.
            }
          }
        }
        if (!copied) throw new Error('Browser clipboard is unavailable.');
      } else {
        Clipboard.setString(value);
      }
      setCopiedCredential(label);
      setTimeout(() => setCopiedCredential(null), 1800);
    } catch (error) {
      console.error(`Failed to copy ${label}:`, error);
      const message = error instanceof Error && /not available|Reissue/.test(error.message)
        ? error.message
        : 'Clipboard access was blocked. Allow clipboard access for this site, then try again.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Copy failed\n\n${message}`);
      } else {
        Alert.alert('Copy failed', message);
      }
    }
  };

  const getAvailablePassword = (assignment: Assignment) => {
    const inMemoryPassword = tenantId && activeFestival?.id
      ? temporaryPasswordsByUser.get(temporaryPasswordKey(tenantId, activeFestival.id, assignment.user_id))
      : undefined;
    return inMemoryPassword
      || (resetCredentials?.assignmentId === assignment.id
        ? resetCredentials.password
        : tempCredentials?.user_id === assignment.user_id
          ? tempCredentials.password
          : null);
  };

  const loadData = useCallback(async (forceRefresh = false) => {
    if (!activeFestival?.id || !tenantId) {
      setLoading(false);
      setLoadingDropdowns(false);
      return [];
    }

    const cacheKey = `${tenantId}:${activeFestival.id}`;
    const cached = teamLeaderManagementCache.get(cacheKey);
    if (cached && !forceRefresh) {
      setParticipants(cached.participants);
      setTeams(cached.teams);
      setAssignments(cached.assignments);
      setLoading(false);
      setLoadingDropdowns(false);
      return cached.participants;
    }

    try {
      // Keep cached rows visible during refresh. Only the first load shows
      // skeletons; mutations refresh in the background.
      if (!cached) {
        setLoading(true);
        setLoadingDropdowns(true);
      }

      const { data: visibleOrganisations, error: visibilityError } = await supabase.rpc('get_visible_organisations', {
        p_tenant_id: tenantId,
      });
      if (visibilityError) throw visibilityError;
      const visibleOrganisationIds = (visibleOrganisations || [])
        .map((organisation: any) => organisation.id)
        .filter(Boolean);
      if (visibleOrganisationIds.length === 0) {
        setParticipants([]);
        setTeams([]);
        setAssignments([]);
        teamLeaderManagementCache.set(cacheKey, { participants: [], teams: [], assignments: [] });
        return [];
      }

      const [participantsResult, teamsResult] = await Promise.all([
        supabase
          .from('participants')
          .select('id, name, chest_number, category_code, organisation_id, user_id')
          .eq('festival_id', activeFestival.id)
          .in('organisation_id', visibleOrganisationIds)
          .order('name'),
        supabase
          .from('festival_teams')
          .select(`
            id,
            festival_id,
            organisation_id,
            portal_primary_color,
            portal_accent_color,
            organisations!inner(name, org_type)
          `)
          .eq('festival_id', activeFestival.id)
          .in('organisation_id', visibleOrganisationIds)
          .eq('is_active', true)
          .order('organisation_id'),
      ]);

      const assignmentsResult = await supabase.rpc('get_team_leader_assignments_for_admin', {
        p_festival_id: activeFestival.id,
      });

      if (participantsResult.error) throw participantsResult.error;
      if (teamsResult.error) throw teamsResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      const participantList: Participant[] = (participantsResult.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        chest_number: p.chest_number,
        category_code: p.category_code,
        organisation_id: p.organisation_id,
        user_id: p.user_id || null,
      }));
      setParticipants(participantList);

      const existingTeamsByOrganisation = new Map(
        (teamsResult.data || []).map((team: any) => [team.organisation_id, team]),
      );
      const teamList: FestivalTeam[] = (visibleOrganisations || [])
        .filter((organisation: any) => String(organisation.org_type || '').toLowerCase() === 'unit')
        .map((organisation: any) => {
          const existingTeam = existingTeamsByOrganisation.get(organisation.id);
          return {
            id: existingTeam?.id || `organisation:${organisation.id}`,
            organisation_id: organisation.id,
            organisation_name: organisation.name || 'Unknown Team',
            festival_id: existingTeam?.festival_id || activeFestival.id,
            portal_primary_color: existingTeam?.portal_primary_color || '#0F766E',
            portal_accent_color: existingTeam?.portal_accent_color || '#14B8A6',
          };
        });
      setTeams(teamList);

      const formatted: Assignment[] = (assignmentsResult.data || []).map((a: any): Assignment => {
        const teamName = a.team_name || 'Unknown Team';

        return {
          id: a.id,
          user_id: a.user_id,
          festival_team_id: a.festival_team_id,
          status: a.status,
          assigned_at: a.assigned_at,
          team_name: teamName,
          organisation_id: a.organisation_id,
          leader_email: a.leader_email || 'N/A',
          leader_code: a.leader_code || null,
          leader_name: a.leader_name || 'Unknown',
          created_at: a.created_at,
          password_state: a.password_state,
        };
      });
      formatted.forEach((assignment) => {
        if (assignment.password_state === 'ready_to_reset' || assignment.password_state === 'unavailable') {
          temporaryPasswordsByUser.delete(temporaryPasswordKey(tenantId, activeFestival.id, assignment.user_id));
        }
      });

      setAssignments(formatted);
      teamLeaderManagementCache.set(cacheKey, {
        participants: participantList,
        teams: teamList,
        assignments: formatted,
      });
      return participantList;
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load team leader data.');
    } finally {
      setLoading(false);
      setLoadingDropdowns(false);
    }
  }, [activeFestival?.id, tenantId]);

  useFocusEffect(useCallback(() => {
    if (activeFestival?.id && tenantId) {
      void loadData(true);
    }
  }, [activeFestival?.id, tenantId, loadData]));

  useEffect(() => {
    if (tempCredentials && assignments.some((row) => row.user_id === tempCredentials.user_id && row.password_state !== 'pending_change')) {
      setTempCredentials(null);
    }
    if (resetCredentials) {
      const resetAssignment = assignments.find((row) => row.id === resetCredentials.assignmentId);
      if (resetAssignment && resetAssignment.password_state !== 'pending_change') {
        setResetCredentials(null);
      }
    }
  }, [assignments, resetCredentials, tempCredentials]);

  const checkParticipantProfile = useCallback(async (participant: Participant) => {
    setCheckingProfile(true);
    setParticipantProfile(null);
    setExistingAssignment(null);
    setShowCreateAccount(false);
    setTempCredentials(null);

    try {
      const { data: accountRows, error: accountError } = await supabase.rpc('get_team_leader_participant_account', {
        p_participant_id: participant.id,
      });
      if (accountError) throw accountError;

      const profile = accountRows?.[0];
      if (profile) {
        setParticipantProfile({
          id: profile.user_id,
          display_name: profile.full_name,
          email: profile.team_leader_email,
          role: profile.role,
        });

        const assigned = assignments.find(a => a.user_id === profile.user_id);
        if (assigned) setExistingAssignment(assigned);
      }
    } catch (error) {
      console.error('Error checking profile:', error);
    } finally {
      setCheckingProfile(false);
    }
  }, [assignments]);

  const handleCreateAccount = async () => {
    if (!selectedParticipant) {
      Alert.alert('Validation Error', 'Select a participant first.');
      return;
    }

    try {
      setCreatingAccount(true);
      const { data, error } = await supabase.functions.invoke('provision-team-leader', {
        body: {
          participant_id: selectedParticipant.id,
        },
      });

      if (error) {
        const errorMsg = (error as any)?.context?.message || error.message;
        throw new Error(errorMsg || 'Failed to create Team Leader account.');
      }
      if (typeof data?.user_id !== 'string' || typeof data?.password !== 'string' || !/^[0-9]{6}$/.test(data.password)
        || typeof data?.username !== 'string' || !data.username.trim()) {
        throw new Error('The account was created, but its one-time password could not be returned.');
      }
      if (tenantId && activeFestival?.id) {
        temporaryPasswordsByUser.set(temporaryPasswordKey(tenantId, activeFestival.id, data.user_id), data.password);
      }

      setTempCredentials({
        user_id: data.user_id,
        username: data.username.trim(),
        password: data?.password,
      });
      setShowCreateAccount(false);

      // Update local participant state to reflect link
      const updatedParticipant = { ...selectedParticipant, user_id: data.user_id };
      setSelectedParticipant(updatedParticipant);

      // Refresh assignments / participants from server
      await loadData(true);

      // Re-run the profile check immediately so UI shows "Account Linked"
      await checkParticipantProfile(updatedParticipant);

      Alert.alert('Success', 'Team Leader account created successfully.');

    } catch (err: any) {
      const errorMessage = err?.message || '';
      if (errorMessage.includes('PARTICIPANT_ALREADY_LINKED') || errorMessage.includes('already has a linked account')) {
        const participantId = selectedParticipant.id;
        const refreshedParticipants = (await loadData(true)) || [];
        const refreshedParticipant = refreshedParticipants.find((participant) => participant.id === participantId);
        if (refreshedParticipant) {
          setSelectedParticipant(refreshedParticipant);
          await checkParticipantProfile(refreshedParticipant);
        }
        Alert.alert('Account Already Linked', 'This participant already has an account. The participant status has been refreshed; use the linked Team Leader account instead of creating another one.');
      } else {
        Alert.alert('Account Creation Failed', err.message);
      }
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleResetPassword = async (assignment: Assignment, reissue = false) => {
    const title = reissue ? 'Reissue Team Leader Password' : 'Reset Team Leader Password';
    const message = `Generate a new six-digit temporary password for ${assignment.team_name}? The username will stay the same. The current password will stop working, and the leader must change the new password after signing in.`;
    const notify = (notificationTitle: string, notificationMessage: string) => {
      if (Platform.OS === 'web') {
        window.alert(`${notificationTitle}\n\n${notificationMessage}`);
      } else {
        Alert.alert(notificationTitle, notificationMessage);
      }
    };
    const reset = async () => {
      try {
        setResettingAssignmentId(assignment.id);
        setResetCredentials(null);
        if (!activeFestival?.id) throw new Error('No active festival is selected.');
        const credentials = await teamLeaderPortalService.resetPassword(assignment.user_id, activeFestival.id);
        if (tenantId) {
          temporaryPasswordsByUser.set(temporaryPasswordKey(tenantId, activeFestival.id, assignment.user_id), credentials.password);
        }

        setResetCredentials({
          assignmentId: assignment.id,
          username: credentials.username || assignment.leader_code,
          password: credentials.password,
        });

        setAssignments((current) => current.map((row) => row.id === assignment.id
          ? { ...row, password_state: 'pending_change' }
          : row));

        notify(
          reissue ? 'Temporary Password Reissued' : 'Password Reset Complete',
          `A new temporary password was generated for ${assignment.team_name}. It is shown on that team's assignment card, where you can copy it. The leader must change it after signing in.`
        );
      } catch (error: any) {
        notify(reissue ? 'Password reissue failed' : 'Password reset failed', error?.message || 'Please try again.');
      } finally {
        setResettingAssignmentId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) await reset();
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: reissue ? 'Reissue password' : 'Reset Password', style: 'destructive', onPress: reset },
    ]);
  };

  const handleParticipantSelect = useCallback((participant: Participant) => {
    setSelectedParticipant(participant);
    setSelectedTeam(null);
    checkParticipantProfile(participant);

    if (participant.organisation_id) {
      const matchedTeam = teams.find((t) => t.organisation_id === participant.organisation_id);
      if (matchedTeam) {
        setSelectedTeam(matchedTeam);
      }
    }
  }, [checkParticipantProfile, teams]);

  const handleTeamSelect = useCallback((team: any) => {
    setSelectedTeam(team as FestivalTeam);
  }, []);

  const handleAssign = async () => {
    if (!activeFestival?.id) {
      Alert.alert('Validation', 'No active festival is selected.');
      return;
    }
    if (!selectedParticipant || !selectedTeam) {
      Alert.alert('Validation', 'Please select both a participant and a team.');
      return;
    }

    if (existingAssignment) {
      Alert.alert(
        'Already Assigned',
        `${selectedParticipant.name} is already assigned as Team Leader to ${existingAssignment.team_name}.`
      );
      return;
    }

    if (!participantProfile) {
      Alert.alert(
        'Account Required',
        `${selectedParticipant.name} does not have a Team Leader account. Please create an account first before assigning.`
      );
      return;
    }

    if (participantProfile.role !== 'team_leader') {
      Alert.alert(
        'Role Conflict',
        `${selectedParticipant.name} is linked to an existing ${participantProfile.role || 'non-Team Leader'} account. The existing role will not be overwritten.`,
      );
      return;
    }

    const teamHasLeader = assignments.some(
      (a) => a.organisation_id === selectedTeam.organisation_id && a.status === 'active' && a.user_id !== participantProfile.id
    );

    if (teamHasLeader) {
      Alert.alert(
        'Team Has Leader',
        `${selectedTeam.organisation_name} already has an active Team Leader.`
      );
      return;
    }

    try {
      setAssigning(true);

      // 1. Ensure festival_team exists for this organisation
      const { data: teamData, error: teamError } = await supabase
        .from('festival_teams')
        .upsert(
          {
            festival_id: activeFestival.id,
            organisation_id: selectedTeam.organisation_id,
            parent_tenant_id: activeFestival.tenant_id,
            is_active: true,
          },
          { onConflict: 'festival_id,organisation_id' }
        )
        .select('id')
        .single();

      if (teamError) throw teamError;

      // 2. Assign to the festival_team
      const { error } = await supabase.from('team_leader_assignments').insert({
        user_id: participantProfile.id,
        festival_team_id: teamData.id,
        status: 'active',
        assigned_by: (await supabase.auth.getUser()).data.user?.id,
      });

      if (error) throw error;

      Alert.alert('Success', `${selectedParticipant.name} assigned as Team Leader to ${selectedTeam.organisation_name}.`);
      setSelectedParticipant(null);
      setSelectedTeam(null);
      setParticipantProfile(null);
      setExistingAssignment(null);
      loadData(true);
    } catch (error: any) {
      console.error('Error assigning:', error);
      Alert.alert('Error', error.message || 'Failed to assign team leader.');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = (assignment: Assignment) => {
    Alert.alert(
      'Remove Assignment',
      `Remove ${assignment.leader_name} from ${assignment.team_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('team_leader_assignments')
                .update({ status: 'revoked', revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('id', assignment.id)
                .eq('status', 'active');
              if (error) throw error;
              loadData(true);
            } catch {
              Alert.alert('Error', 'Failed to remove assignment.');
            }
          },
        },
      ]
    );
  };

  const filteredAssignments = assignments.filter(
    (a) =>
      a.team_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.leader_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.leader_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ScrollView className="flex-1 p-4" horizontal={false} showsHorizontalScrollIndicator={false}>
      <View className="mb-4">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center mb-2">
          <ChevronLeft size={20} className="text-foreground" />
          <Text className="text-sm text-muted-foreground ml-1">Back to Settings</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold text-foreground">Team Leader Portal</Text>
        <Text className="text-sm text-muted-foreground mt-0.5">
          Assign and manage team leaders
        </Text>
      </View>

      <Card
        style={{
          marginBottom: openDropdown ? 276 : 16,
          zIndex: openDropdown ? 20 : 1,
        }}
      >
        <CardHeader>
          <CardTitle>Assign Team Leader</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingDropdowns ? (
            <Skeleton style={{ height: 200, borderRadius: 8 }} />
          ) : (
            <View style={{ gap: 16 }}>
              <SearchableCombobox
                label="Team Leader"
                placeholder="Search participant..."
                items={participants}
                selectedItem={selectedParticipant}
                onSelect={handleParticipantSelect as any}
                loading={loadingDropdowns}
                emptyText="No participants found"
                isOpen={openDropdown === 'participant'}
                onOpenChange={(open) => setOpenDropdown(open ? 'participant' : null)}
                formatSubtitle={(item) => {
                  const parts: string[] = [];
                  if (item.chest_number) parts.push(`Chest ${item.chest_number}`);
                  if (item.category_code) parts.push(item.category_code);
                  return parts.length > 0 ? parts.join(' · ') : null;
                }}
              />


              <SearchableCombobox
                label="Team (Organisation)"
                placeholder="Search team..."
                items={teams.map((t) => ({ ...t, name: t.organisation_name }))}
                selectedItem={selectedTeam ? { ...selectedTeam, name: selectedTeam.organisation_name } : null}
                onSelect={handleTeamSelect}
                loading={loadingDropdowns}
                emptyText="No teams available"
                isOpen={openDropdown === 'team'}
                onOpenChange={(open) => setOpenDropdown(open ? 'team' : null)}
              />

              {selectedTeam && (
                <View className="p-4 rounded-lg border border-border bg-muted/30">
                  <View className="flex-row items-center justify-between mb-3">
                    <View>
                      <Text className="font-semibold text-foreground">Team portal color</Text>
                      <Text className="text-xs text-muted-foreground mt-0.5">Fixed for the Team Leader Portal. Selection is disabled.</Text>
                    </View>
                    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: coreColor('#EC5E27', 'dangerSoft'), borderWidth: 3, borderColor: coreColor('#FDFDF1', 'border') }} />
                  </View>
                  <TouchableOpacity disabled accessibilityState={{ disabled: true }} className="flex-row items-center px-3 py-2 rounded-full border border-border self-start opacity-50">
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: coreColor('#EC5E27', 'dangerSoft'), marginRight: 6 }} />
                    <Text className="text-xs text-foreground">Orange and Milk - Disabled</Text>
                  </TouchableOpacity>
                </View>
              )}

              {selectedParticipant && (
                <View className="p-4 bg-muted/50 rounded-lg border border-border">
                  <Text className="font-semibold text-foreground mb-2">Account Status</Text>
                  {checkingProfile ? (
                    <Text className="text-muted-foreground text-sm">Checking...</Text>
                  ) : participantProfile ? (
                    <View className="flex-row items-center">
                      {participantProfile.role === 'team_leader' ? (
                        <>
                          <Check size={16} className="text-core-success-green-600 mr-2" />
                          <Text className="text-sm text-foreground">✓ Team Leader account linked</Text>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={16} className="text-core-warning-amber-600 mr-2" />
                          <Text className="text-sm text-core-warning-amber-700 dark:text-core-warning-amber-400">
                            Linked to existing {participantProfile.role} account.
                          </Text>
                        </>
                      )}
                    </View>
                  ) : (
                    <View>
                      <Text className="text-sm text-muted-foreground mb-3">No Team Leader account linked.</Text>
                      {!showCreateAccount && (
                        <TouchableOpacity
                          onPress={() => setShowCreateAccount(true)}
                          className="bg-primary px-4 py-2 rounded-md self-start"
                        >
                          <Text className="text-primary-foreground font-medium text-sm">Create Team Leader Account</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  {tempCredentials && (
                    <View className="mt-4 p-3 bg-core-success-soft-green-50 dark:bg-core-success-action-green-900/20 border border-core-success-soft-green-200 dark:border-core-success-green-800 rounded-md">
                      <Text className="font-medium text-core-success-green-800 dark:text-core-success-green-300 mb-1">Account Created Successfully</Text>
                      {tempCredentials.username && (
                        <View className="flex-row items-center justify-between py-1">
                          <Text className="text-sm text-core-success-green-700 dark:text-core-success-green-400 flex-1">Username: {tempCredentials.username}</Text>
                          <TouchableOpacity onPress={() => copyCredential(tempCredentials.username, 'Username', 'username')} className="flex-row items-center px-2 py-1 rounded border border-core-success-soft-green-300">
                            <Copy size={14} color={coreColor("#15803d", 'success')} />
                            <Text className="text-xs text-core-success-green-700 ml-1">{copiedCredential === 'Username' ? 'Copied' : 'Copy username'}</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      <View className="flex-row items-center justify-between py-1">
                        <Text className="text-sm text-core-success-green-700 dark:text-core-success-green-400 flex-1">Temporary Password: {tempCredentials.password}</Text>
                        <TouchableOpacity onPress={() => copyCredential(tempCredentials.password, 'Password', 'password')} className="flex-row items-center px-2 py-1 rounded border border-core-success-soft-green-300">
                          <Copy size={14} color={coreColor("#15803d", 'success')} />
                          <Text className="text-xs text-core-success-green-700 ml-1">{copiedCredential === 'Password' ? 'Copied' : 'Copy password'}</Text>
                        </TouchableOpacity>
                      </View>
                      <Text className="text-xs text-muted-foreground mt-2">Copy username and password separately. On first login, choose your own six-digit numeric password.</Text>
                    </View>
                  )}
                </View>
              )}

              {showCreateAccount && (
                <View className="p-4 bg-card rounded-lg border border-border mt-2">
                  <Text className="font-semibold mb-3 text-foreground">Create Team Leader Account</Text>
                  <Text className="text-sm text-muted-foreground mb-2">
                    Participant: {selectedParticipant?.name}
                  </Text>
                  <Text className="text-sm text-muted-foreground mb-4">
                    A short username and six-digit temporary password will be generated automatically. On first login, the leader can choose a personal username and must set a six-digit numeric password.
                  </Text>
                  <View className="flex-row justify-end space-x-2">
                    <TouchableOpacity
                      onPress={() => setShowCreateAccount(false)}
                      className="px-4 py-2 border border-border rounded-md mr-2"
                      disabled={creatingAccount}
                    >
                      <Text className="text-foreground">Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleCreateAccount}
                      className={`px-4 py-2 bg-primary rounded-md ${creatingAccount ? 'opacity-50' : ''}`}
                      disabled={creatingAccount}
                    >
                      <Text className="text-primary-foreground font-medium">
                        {creatingAccount ? 'Creating...' : 'Create Account'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <Button
                onPress={handleAssign}
                disabled={assigning || !selectedParticipant || !selectedTeam || !participantProfile || !!existingAssignment}
                loading={assigning}
              >
                Assign
              </Button>
            </View>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <CardTitle>Current Assignments</CardTitle>
            <Badge variant="secondary">{assignments.length}</Badge>
          </View>
        </CardHeader>
        <CardContent>
          <View className="flex-row items-center border border-input rounded-lg px-3 mb-3 h-10">
            <Search size={16} className="text-muted-foreground" />
            <TextInput
              className="flex-1 ml-2 text-sm text-foreground"
              style={Platform.OS === 'web' ? { outlineStyle: 'solid', outlineWidth: 0 } : undefined}
              placeholder="Search teams or leaders..."
              placeholderTextColor={coreColor("#888", 'textSubtle')}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {loading ? (
            <View style={{ gap: 8 }}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} style={{ height: 60, borderRadius: 8 }} />
              ))}
            </View>
          ) : filteredAssignments.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 24 }}>
              <Users size={32} color="hsl(var(--muted-foreground))" />
              <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 8 }}>
                {searchQuery ? 'No matching assignments found' : 'No team leaders assigned yet'}
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {filteredAssignments.map((assignment) => (
                <View
                  key={assignment.id}
                  className="flex-row items-center p-3 border border-border rounded-lg bg-muted"
                >
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-foreground">
                      {assignment.team_name}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-0.5">
                      {assignment.leader_name}
                    </Text>
                    {assignment.leader_code && (
                      <View className="flex-row items-center mt-1">
                        <Text className="text-xs font-medium text-foreground flex-1">
                          Username: <Text className="font-mono text-primary">{assignment.leader_code}</Text>
                        </Text>
                        <TouchableOpacity
                          onPress={() => copyCredential(assignment.leader_code, `Username_${assignment.id}`, 'username')}
                          className="px-2 py-1 rounded border border-border"
                          accessibilityLabel={`Copy username for ${assignment.leader_name}`}
                        >
                          <Text className="text-xs text-muted-foreground">{copiedCredential === `Username_${assignment.id}` ? 'Copied' : 'Copy username'}</Text>
                        </TouchableOpacity>
                        {assignment.password_state === 'ready_to_reset' ? (
                          <TouchableOpacity
                            onPress={() => handleResetPassword(assignment)}
                            className={`px-2 py-1 rounded border border-border ml-1 ${resettingAssignmentId === assignment.id ? 'opacity-50' : ''}`}
                            disabled={resettingAssignmentId === assignment.id}
                            accessibilityLabel={`Reset password for ${assignment.leader_name}`}
                          >
                            <Text className="text-xs text-core-warning-amber-700 dark:text-core-warning-amber-400 font-medium">
                              {resettingAssignmentId === assignment.id ? 'Resetting...' : 'Reset password'}
                            </Text>
                          </TouchableOpacity>
                        ) : assignment.password_state === 'pending_change' && getAvailablePassword(assignment) ? (
                          <TouchableOpacity
                            onPress={() => void copyCredential(getAvailablePassword(assignment), `Password_${assignment.id}`, 'password')}
                            className="px-2 py-1 rounded border border-border ml-1"
                            accessibilityLabel={`Copy password for ${assignment.leader_name}`}
                          >
                            <Text className="text-xs text-muted-foreground">
                              {copiedCredential === `Password_${assignment.id}` ? 'Copied' : 'Copy password'}
                            </Text>
                          </TouchableOpacity>
                        ) : assignment.password_state === 'pending_change' ? (
                          <TouchableOpacity
                            onPress={() => handleResetPassword(assignment, true)}
                            className={`px-2 py-1 rounded border border-border ml-1 ${resettingAssignmentId === assignment.id ? 'opacity-50' : ''}`}
                            disabled={resettingAssignmentId === assignment.id}
                            accessibilityLabel={`Reissue temporary password for ${assignment.leader_name}`}
                          >
                            <Text className="text-xs text-core-warning-amber-700 dark:text-core-warning-amber-400 font-medium">
                              {resettingAssignmentId === assignment.id ? 'Issuing...' : 'Reissue password'}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}
                    {resetCredentials?.assignmentId === assignment.id && (
                      <View className="mt-2 p-3 bg-core-warning-soft-amber-50 border border-core-warning-soft-amber-200 rounded-md">
                        <Text className="font-medium text-core-warning-amber-900 mb-1">New temporary login credentials</Text>
                        <View className="flex-row items-center justify-between py-1">
                          <Text className="text-xs text-core-warning-amber-800 flex-1">Username: {resetCredentials.username}</Text>
                          <TouchableOpacity onPress={() => copyCredential(resetCredentials.username, `Reset_Username_${assignment.id}`, 'username')} className="px-2 py-1 rounded border border-core-warning-soft-amber-300">
                            <Text className="text-xs text-core-warning-amber-800">{copiedCredential === `Reset_Username_${assignment.id}` ? 'Copied' : 'Copy username'}</Text>
                          </TouchableOpacity>
                        </View>
                        <View className="flex-row items-center justify-between py-1">
                          <Text className="text-xs text-core-warning-amber-800 flex-1">Temporary password: {resetCredentials.password}</Text>
                          <TouchableOpacity
                            onPress={() => copyCredential(resetCredentials.password, `Reset_Password_${assignment.id}`, 'password')}
                            className="px-2 py-1 rounded border border-core-warning-soft-amber-300"
                            accessibilityLabel={`Copy temporary password for ${assignment.leader_name}`}
                          >
                            <Text className="text-xs text-core-warning-amber-800">{copiedCredential === `Reset_Password_${assignment.id}` ? 'Copied' : 'Copy password'}</Text>
                          </TouchableOpacity>
                        </View>
                        <Text className="text-xs text-core-warning-amber-700 mt-2">Your password is now six digits only. Copy username and password separately. The old password no longer works; choose a new six-digit password after signing in.</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemove(assignment)}
                    className="p-2"
                  >
                    <Trash2 size={16} className="text-destructive" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    </ScrollView>
  );
}
