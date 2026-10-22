import React, { useState } from 'react';
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound, CheckCircle2 } from 'lucide-react-native';
import { useAuthStore } from '@/core/store/authStore';
import { supabase } from '@/core/config/supabase';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';
import { Card } from '@/components/ui/shadcn/card';
import { teamLeaderPortalService } from '@/services/teamLeaderPortalService';
import { authService } from '@/services/authService';

export default function TeamLeaderFirstLogin() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 640;

  const currentUsername = user?.user_metadata?.username || user?.user_metadata?.team_leader_code || '';
  const requiresUsernameChange = user?.app_metadata?.must_change_credentials === true
    || user?.user_metadata?.must_change_credentials === true;
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleUpdate = async () => {
    setErrorMsg('');
    if (requiresUsernameChange && !newUsername.trim() && !currentUsername) {
      setErrorMsg('Enter a username to continue.');
      return;
    }
    setLoading(true);
    try {
      let targetUserId = user?.id;
      if (!targetUserId) {
        const { data: sessionData } = await supabase.auth.getSession();
        targetUserId = sessionData?.session?.user?.id;
      }

      if (!targetUserId) {
        throw new Error('Session expired. Please sign in again to continue.');
      }

      // 1. Securely update credentials via service-role / edge
      const usernameToUse = requiresUsernameChange ? (newUsername.trim() || currentUsername) : currentUsername;
      await teamLeaderPortalService.selfUpdateCredentials(
        requiresUsernameChange ? usernameToUse : null,
        newPassword,
      );

      setSuccessMsg('Credentials updated successfully! Logging into your dashboard...');

      // 2. Establish fresh authenticated session with newly set credentials
      const loginResult = await authService.loginTeamLeader(usernameToUse, newPassword);
      setUser(loginResult.user, loginResult.tenant_id, loginResult.role, loginResult.is_superadmin);

      setTimeout(() => {
        router.replace('/team/dashboard');
      }, 800);

    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <View style={{ flex: 1, backgroundColor: 'hsl(var(--background))' }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <Card style={{ width: '100%', maxWidth: 440, padding: isDesktop ? 32 : 24 }}>
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: '#0F766E15',
              borderWidth: 1,
              borderColor: '#0F766E40',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}>
              <ShieldCheck size={28} color="#0F766E" />
            </View>
            <Text style={{
              fontSize: 20,
              fontWeight: '700',
              color: 'hsl(var(--foreground))',
              fontFamily: 'Poppins_700Bold',
              textAlign: 'center',
            }}>
              {requiresUsernameChange ? 'Set Up Your Private Credentials' : 'Change Your Password'}
            </Text>
            <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 6, textAlign: 'center' }}>
              {requiresUsernameChange
                ? 'Welcome to Alviora Team Portal! Choose the username and password you want to use.'
                : 'Your administrator reset your temporary password. Choose a new password to continue.'}
            </Text>
          </View>

          {/* Form */}
          <View style={{ gap: 16 }}>
            {/* Username */}
            {requiresUsernameChange ? <View style={{ gap: 6 }}>
              <Label>Personal Username</Label>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'hsl(var(--input))',
                borderRadius: 10,
                paddingHorizontal: 12,
                height: 44,
                backgroundColor: 'hsl(var(--background))',
              }}>
                <UserRound size={16} color="hsl(var(--muted-foreground))" style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: 'hsl(var(--foreground))', padding: 0 }}
                  placeholder="e.g. victoria or victoria_leader"
                  placeholderTextColor="hsl(var(--muted-foreground))"
                  value={newUsername}
                  onChangeText={setNewUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
              <Text style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                {currentUsername
                  ? `Leave blank to keep ${currentUsername}, or enter a new username.`
                  : 'Enter the username you want to use.'}
              </Text>
            </View> : (
              <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                Username remains {currentUsername}.
              </Text>
            )}

            {/* New Password */}
            <View style={{ gap: 6 }}>
              <Label>New Password</Label>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'hsl(var(--input))',
                borderRadius: 10,
                paddingHorizontal: 12,
                height: 44,
                backgroundColor: 'hsl(var(--background))',
              }}>
                <LockKeyhole size={16} color="hsl(var(--muted-foreground))" style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: 'hsl(var(--foreground))', padding: 0 }}
                  placeholder="Enter your new password"
                  placeholderTextColor="hsl(var(--muted-foreground))"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showPassword ? (
                    <EyeOff size={16} color="hsl(var(--muted-foreground))" />
                  ) : (
                    <Eye size={16} color="hsl(var(--muted-foreground))" />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                Choose a password you can remember.
              </Text>
            </View>

            {/* Error Message */}
            {errorMsg ? (
              <View style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: '#FEE2E2',
                borderWidth: 1,
                borderColor: '#FCA5A5',
              }}>
                <Text style={{ fontSize: 12, color: '#991B1B', textAlign: 'center' }}>{errorMsg}</Text>
                {errorMsg.toLowerCase().includes('session expired') || errorMsg.toLowerCase().includes('sign in again') ? (
                  <TouchableOpacity
                    onPress={() => router.replace('/team/login')}
                    style={{
                      marginTop: 8,
                      alignSelf: 'center',
                      paddingVertical: 5,
                      paddingHorizontal: 14,
                      borderRadius: 6,
                      backgroundColor: '#DC2626',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Back to Sign In</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {/* Success Message */}
            {successMsg ? (
              <View style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: '#DCFCE7',
                borderWidth: 1,
                borderColor: '#86EFAC',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}>
                <CheckCircle2 size={16} color="#166534" />
                <Text style={{ fontSize: 12, color: '#166534', fontWeight: '600' }}>{successMsg}</Text>
              </View>
            ) : null}

            {/* Submit Button */}
            <Button
              onPress={handleUpdate}
              disabled={loading}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 10,
                marginTop: 4,
                backgroundColor: '#0F766E',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                {loading ? 'Saving Credentials...' : requiresUsernameChange ? 'Save & Enter Dashboard' : 'Change Password & Continue'}
              </Text>
            </Button>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
