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
import { useRouter } from 'expo-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { supabase } from '@/core/config/supabase';
import { useFestival } from '@/core/hooks/useFestival';
import { useAuthStore } from '@/core/store/authStore';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import { ChevronLeft, Search, Trash2, Users, Check, AlertCircle, Copy } from 'lucide-react-native';

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
}

interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
}

const TEAM_COLOR_PRESETS = [
  { name: 'Teal', primary: '#0F766E', accent: '#14B8A6' },
  { name: 'Blue', primary: '#1D4ED8', accent: '#60A5FA' },
  { name: 'Violet', primary: '#6D28D9', accent: '#A78BFA' },
  { name: 'Rose', primary: '#BE123C', accent: '#FB7185' },
  { name: 'Orange', primary: '#C2410C', accent: '#FB923C' },
  { name: 'Green', primary: '#166534', accent: '#4ADE80' },
  { name: 'Indigo', primary: '#3730A3', accent: '#818CF8' },
  { name: 'Slate', primary: '#334155', accent: '#94A3B8' },
];

type TeamLeaderManagementCache = {
  participants: Participant[];
  teams: FestivalTeam[];
  assignments: Assignment[];
};

const teamLeaderManagementCache = new Map<string, TeamLeaderManagementCache>();

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
  const [tempCredentials, setTempCredentials] = useState<{ username: string | null, email: string, password: string } | null>(null);
  const [resetCredentials, setResetCredentials] = useState<{ username: string | null, email: string, password: string } | null>(null);
  const [resettingAssignmentId, setResettingAssignmentId] = useState<string | null>(null);
  const [copiedCredential, setCopiedCredential] = useState<string | null>(null);

  const [openDropdown, setOpenDropdown] = useState<'participant' | 'team' | null>(null);

  const copyCredential = async (value: string | null | undefined, label: string) => {
    if (!value) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        Clipboard.setString(value);
      }
      setCopiedCredential(label);
      setTimeout(() => setCopiedCredential(null), 1800);
    } catch (error) {
      console.error(`Failed to copy ${label}:`, error);
      Alert.alert('Copy failed', 'Clipboard is unavailable on this device.');
    }
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

      const formatted = (assignmentsResult.data || []).map((a: any) => {
        return {
          id: a.id,
          user_id: a.user_id,
          festival_team_id: a.festival_team_id,
          status: a.status,
          assigned_at: a.assigned_at,
          team_name: a.team_name || 'Unknown Team',
          organisation_id: a.organisation_id,
          leader_email: a.leader_email || 'N/A',
          leader_code: a.leader_code || null,
          leader_name: a.leader_name || 'Unknown',
          created_at: a.created_at,
        };
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

  useEffect(() => {
    if (activeFestival?.id && tenantId) {
      loadData();
    }
  }, [activeFestival?.id, tenantId, loadData]);

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

      setTempCredentials({
        username: data?.username ?? null,
        email: data?.email,
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

  const handleResetPassword = async (assignment: Assignment) => {
    const linkedParticipant = participants.find((participant) => participant.user_id === assignment.user_id);
    if (!linkedParticipant) {
      Alert.alert('Participant not found', 'Refresh the page and try again.');
      return;
    }

    try {
      setResettingAssignmentId(assignment.id);
      setResetCredentials(null);
      const { data, error } = await supabase.functions.invoke('provision-team-leader', {
        body: { participant_id: linkedParticipant.id, reset_password: true },
      });
      if (error) throw new Error((error as any)?.context?.message || error.message);
      setResetCredentials({
        username: data?.username ?? assignment.leader_code,
        email: data?.email ?? assignment.leader_email,
        password: data?.password,
      });
      Alert.alert('Password generated', 'Copy the new password and use the login username shown below.');
    } catch (error: any) {
      Alert.alert('Password generation failed', error?.message || 'Please try again.');
    } finally {
      setResettingAssignmentId(null);
    }
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

  const handleTeamColorSelect = async (preset: typeof TEAM_COLOR_PRESETS[number]) => {
    if (!selectedTeam || !activeFestival?.id || !activeFestival.tenant_id) return;

    const nextTeam = {
      ...selectedTeam,
      portal_primary_color: preset.primary,
      portal_accent_color: preset.accent,
    };
    setSelectedTeam(nextTeam);
    setTeams((current) => current.map((team) => team.organisation_id === nextTeam.organisation_id ? nextTeam : team));

    const { error } = await supabase
      .from('festival_teams')
      .upsert({
        id: selectedTeam.id.startsWith('organisation:') ? undefined : selectedTeam.id,
        festival_id: activeFestival.id,
        organisation_id: selectedTeam.organisation_id,
        parent_tenant_id: activeFestival.tenant_id,
        is_active: true,
        portal_primary_color: preset.primary,
        portal_accent_color: preset.accent,
      }, { onConflict: 'festival_id,organisation_id' });

    if (error) {
      Alert.alert('Color update failed', error.message);
      return;
    }
    Alert.alert('Team color saved', `${selectedTeam.organisation_name} portal color updated.`);
  };

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
                      <Text className="text-xs text-muted-foreground mt-0.5">
                        Choose the visual identity for {selectedTeam.organisation_name}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: selectedTeam.portal_primary_color,
                        borderWidth: 3,
                        borderColor: selectedTeam.portal_accent_color,
                      }}
                    />
                  </View>
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {TEAM_COLOR_PRESETS.map((preset) => {
                      const active = selectedTeam.portal_primary_color === preset.primary;
                      return (
                        <TouchableOpacity
                          key={preset.name}
                          onPress={() => handleTeamColorSelect(preset)}
                          accessibilityLabel={`Use ${preset.name} team color`}
                          className={`flex-row items-center px-2 py-1.5 rounded-full border ${active ? 'border-foreground' : 'border-border'}`}
                        >
                          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: preset.primary, marginRight: 6 }} />
                          <Text className="text-xs text-foreground">{preset.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
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
                          <Check size={16} className="text-green-600 mr-2" />
                          <Text className="text-sm text-foreground">✓ Team Leader account linked</Text>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={16} className="text-amber-600 mr-2" />
                          <Text className="text-sm text-amber-700 dark:text-amber-400">
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
                    <View className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                      <Text className="font-medium text-green-800 dark:text-green-300 mb-1">Account Created Successfully</Text>
                      {tempCredentials.username && (
                        <View className="flex-row items-center justify-between py-1">
                          <Text className="text-sm text-green-700 dark:text-green-400 flex-1">Username: {tempCredentials.username}</Text>
                          <TouchableOpacity onPress={() => copyCredential(tempCredentials.username, 'Username')} className="flex-row items-center px-2 py-1 rounded border border-green-300">
                            <Copy size={14} color="#15803d" />
                            <Text className="text-xs text-green-700 ml-1">{copiedCredential === 'Username' ? 'Copied' : 'Copy username'}</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      <View className="flex-row items-center justify-between py-1">
                        <Text className="text-sm text-green-700 dark:text-green-400 flex-1">Email: {tempCredentials.email}</Text>
                        <TouchableOpacity onPress={() => copyCredential(tempCredentials.email, 'Email')} className="flex-row items-center px-2 py-1 rounded border border-green-300">
                          <Copy size={14} color="#15803d" />
                          <Text className="text-xs text-green-700 ml-1">{copiedCredential === 'Email' ? 'Copied' : 'Copy email'}</Text>
                        </TouchableOpacity>
                      </View>
                      <View className="flex-row items-center justify-between py-1">
                        <Text className="text-sm text-green-700 dark:text-green-400 flex-1">Password: {tempCredentials.password}</Text>
                        <TouchableOpacity onPress={() => copyCredential(tempCredentials.password, 'Password')} className="flex-row items-center px-2 py-1 rounded border border-green-300">
                          <Copy size={14} color="#15803d" />
                          <Text className="text-xs text-green-700 ml-1">{copiedCredential === 'Password' ? 'Copied' : 'Copy password'}</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        onPress={() => copyCredential(`Username: ${tempCredentials.username || tempCredentials.email}\nEmail: ${tempCredentials.email}\nPassword: ${tempCredentials.password}`, 'All credentials')}
                        className="flex-row items-center justify-center mt-2 px-3 py-2 rounded bg-green-700"
                      >
                        <Copy size={14} color="#ffffff" />
                        <Text className="text-xs text-white font-medium ml-1">{copiedCredential === 'All credentials' ? 'Copied all credentials' : 'Copy all credentials'}</Text>
                      </TouchableOpacity>
                      <Text className="text-xs text-muted-foreground mt-2 italic">Save or copy these credentials now. The password is not stored for later retrieval.</Text>
                    </View>
                  )}
                </View>
              )}

              {showCreateAccount && (
                <View className="p-4 bg-card rounded-lg border border-border mt-2">
                  <Text className="font-semibold mb-3 text-foreground">Create Team Leader Account</Text>
                  <Text className="text-sm text-muted-foreground mb-4">
                    Participant: {selectedParticipant?.name}
                  </Text>
                  <Text className="text-sm text-muted-foreground mb-4">
                    A unique Team Leader code, login email, and temporary password will be generated automatically.
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
          {resetCredentials && (
            <View className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
              <Text className="font-medium text-amber-900 mb-2">New Team Leader login credentials</Text>
              <Text className="text-sm text-amber-800">Login username: {resetCredentials.email}</Text>
              {resetCredentials.username && <Text className="text-sm text-amber-800">Team Leader code: {resetCredentials.username}</Text>}
              <View className="flex-row items-center justify-between mt-1">
                <Text className="text-sm text-amber-800 flex-1">Generated password: {resetCredentials.password}</Text>
                <TouchableOpacity onPress={() => copyCredential(resetCredentials.password, 'Password')} className="px-2 py-1 rounded border border-amber-300">
                  <Text className="text-xs text-amber-800">{copiedCredential === 'Password' ? 'Copied' : 'Copy password'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => copyCredential(`Username: ${resetCredentials.email}\nPassword: ${resetCredentials.password}`, 'Login credentials')}
                className="flex-row items-center justify-center mt-2 px-3 py-2 rounded bg-amber-700"
              >
                <Copy size={14} color="#ffffff" />
                <Text className="text-xs text-white font-medium ml-1">{copiedCredential === 'Login credentials' ? 'Copied' : 'Copy login credentials'}</Text>
              </TouchableOpacity>
              <Text className="text-xs text-amber-700 mt-2">This password replaces the previous password and is shown only once.</Text>
            </View>
          )}
          <View className="flex-row items-center border border-input rounded-lg px-3 mb-3 h-10">
            <Search size={16} className="text-muted-foreground" />
            <TextInput
              className="flex-1 ml-2 text-sm text-foreground"
              style={Platform.OS === 'web' ? { outlineStyle: 'solid', outlineWidth: 0 } : undefined}
              placeholder="Search teams or leaders..."
              placeholderTextColor="#888"
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
                      <View className="flex-row items-center mt-0.5">
                        <Text className="text-xs text-muted-foreground flex-1">
                          Code: {assignment.leader_code} · {assignment.leader_email}
                        </Text>
                        <TouchableOpacity
                          onPress={() => copyCredential(assignment.leader_code, 'Username')}
                          className="px-2 py-1 rounded border border-border"
                          accessibilityLabel={`Copy username for ${assignment.leader_name}`}
                        >
                          <Text className="text-xs text-muted-foreground">{copiedCredential === 'Username' ? 'Copied' : 'Copy username'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleResetPassword(assignment)}
                          className={`px-2 py-1 rounded border border-border ml-1 ${resettingAssignmentId === assignment.id ? 'opacity-50' : ''}`}
                          disabled={resettingAssignmentId === assignment.id}
                          accessibilityLabel={`Generate password for ${assignment.leader_name}`}
                        >
                          <Text className="text-xs text-muted-foreground">{resettingAssignmentId === assignment.id ? 'Generating...' : 'Generate password'}</Text>
                        </TouchableOpacity>
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
