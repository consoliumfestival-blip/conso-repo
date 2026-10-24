import { TeamPortalIdentity } from '@/components/team/TeamPortalIdentity';
import React, { useState } from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { ScrollView, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, LockKeyhole, Moon, ShieldCheck, Sun, UserRound, CheckCircle2 } from 'lucide-react-native';
import { useAuthStore } from '@/core/store/authStore';
import { supabase } from '@/core/config/supabase';
import { Button } from '@/components/team/TeamButton';
import { Label } from '@/components/team/TeamLabel';
import { Card } from '@/components/team/TeamCard';
import { teamLeaderPortalService } from '@/services/teamLeaderPortalService';
import { authService } from '@/services/authService';
import { useTeamTheme, useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { ConsoliumLogo } from '@/components/ui/ConsoliumLogo';
import { applyPortalPwaMetadata } from '@/core/utils/portalPwaMetadata';
import { isSixDigitPassword, readNumericPasswordInput } from '@/core/utils/teamLeaderCredentials';

export default function TeamLeaderFirstLogin() {
  React.useEffect(() => applyPortalPwaMetadata('team'), []);
  const ui = useTeamUi();
  const { mode, toggleMode } = useTeamTheme();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const ThemeIcon = mode === 'dark' ? Sun : Moon;

  const currentUsername = user?.user_metadata?.username || user?.user_metadata?.team_leader_code || '';
  const requiresUsernameChange = user?.app_metadata?.must_change_credentials === true
    || user?.user_metadata?.must_change_credentials === true;
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [invalidPasswordInput, setInvalidPasswordInput] = useState(false);

  const handleUpdate = async () => {
    if (invalidPasswordInput) return;
    setErrorMsg('');
    setSuccessMsg('');
    if (requiresUsernameChange && !newUsername.trim() && !currentUsername) {
      setErrorMsg('Enter a username to continue.');
      return;
    }
    if (!isSixDigitPassword(newPassword)) {
      setErrorMsg('Choose exactly six digits (0–9) for your password.');
      return;
    }
    setLoading(true);
    let credentialsSaved = savedUsername !== null;
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
      let usernameToUse = savedUsername ?? (requiresUsernameChange ? (newUsername.trim() || currentUsername) : currentUsername);
      if (!credentialsSaved) {
        const updated = await teamLeaderPortalService.selfUpdateCredentials(
          requiresUsernameChange ? usernameToUse : null,
          newPassword,
        );
        usernameToUse = updated.username;
        setSavedUsername(usernameToUse);
        credentialsSaved = true;
      }

      // 2. Establish fresh authenticated session with newly set credentials
      const loginResult = await authService.loginTeamLeader(usernameToUse, newPassword);
      setUser(loginResult.user, loginResult.tenant_id, loginResult.role, loginResult.is_superadmin);

      router.replace('/team/dashboard');

    } catch (err: any) {
      setErrorMsg(err?.message || 'Please try again.');
      if (credentialsSaved) {
        setSuccessMsg('Your password has changed. Retry sign in, or return to Sign In and use your new six-digit password.');
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <View nativeID="team-leader-portal" style={{ flex: 1, backgroundColor: ui.colors.background }}>
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
          <View style={{ alignItems: 'flex-end', marginBottom: 6 }}>
            <TouchableOpacity onPress={toggleMode} accessibilityRole="button" accessibilityLabel={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ minWidth: 44, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surfaceGlass, alignItems: 'center', justifyContent: 'center' }}>
              <ThemeIcon size={18} color={ui.colors.textMuted} />
            </TouchableOpacity>
          </View>
          <TeamPortalIdentity />
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: ui.colors.primarySoft,
              borderWidth: 1,
              borderColor: ui.colors.borderStrong,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}>
              <ConsoliumLogo size={56} borderRadius={28} />
            </View>
            <Text style={{
              fontSize: 20,
              fontWeight: '700',
              color: ui.colors.text,
              textAlign: 'center',
            }}>
              {requiresUsernameChange ? 'Set Up Your Private Credentials' : 'Change Your Password'}
            </Text>
            <Text style={{ fontSize: 13, color: ui.colors.textMuted, marginTop: 6, textAlign: 'center' }}>
              {requiresUsernameChange
                ? 'Welcome to the Team Portal. Choose the username and password you want to use.'
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
                borderColor: ui.colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                height: 44,
                backgroundColor: ui.colors.background,
              }}>
                <UserRound size={16} color={ui.colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  accessibilityLabel="Username"
                  style={{ flex: 1, fontFamily: ui.fontFamily, fontSize: 14, color: ui.colors.text, padding: 0, backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, ...({ outlineStyle: 'none', boxShadow: 'none' } as any) }}
                  placeholder="e.g. victoria or victoria_leader"
                  placeholderTextColor={ui.colors.textMuted}
                  value={newUsername}
                  onChangeText={setNewUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading && savedUsername === null}
                />
              </View>
              <Text style={{ fontSize: 11, color: ui.colors.textMuted }}>
                {currentUsername
                  ? `Leave blank to keep ${currentUsername}, or enter a new username.`
                  : 'Enter the username you want to use.'}
              </Text>
            </View> : (
              <Text style={{ fontSize: 13, color: ui.colors.textMuted }}>
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
                borderColor: ui.colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                height: 44,
                backgroundColor: ui.colors.background,
              }}>
                <LockKeyhole size={16} color={ui.colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput accessibilityLabel="Password"
                  style={{ flex: 1, fontFamily: ui.fontFamily, fontSize: 14, color: ui.colors.text, padding: 0, backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, ...({ outlineStyle: 'none', boxShadow: 'none' } as any) }}
                  placeholder="Enter your new password"
                  placeholderTextColor={ui.colors.textMuted}
                  value={newPassword}
                  onChangeText={(value) => {
                    const next = readNumericPasswordInput(value);
                    if (next === null) { setInvalidPasswordInput(true); setErrorMsg('Use exactly six digits (0–9).'); return; }
                    setInvalidPasswordInput(false);
                    setErrorMsg('');
                    setNewPassword(next);
                  }}
                  keyboardType="number-pad"
                  autoCorrect={false}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  secureTextEntry={!showPassword}
                  editable={!loading && savedUsername === null}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showPassword ? (
                    <EyeOff size={16} color={ui.colors.textMuted} />
                  ) : (
                    <Eye size={16} color={ui.colors.textMuted} />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, color: ui.colors.textMuted }}>
                Choose exactly six digits (0–9). Keep any leading zeroes.
              </Text>
            </View>

            {/* Error Message */}
            {errorMsg ? (
              <View style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: ui.colors.dangerSoft,
                borderWidth: 1,
                borderColor: ui.colors.borderStrong,
              }}>
                <Text style={{ fontSize: 12, color: ui.colors.danger, textAlign: 'center' }}>{errorMsg}</Text>
                {(
                  <TouchableOpacity
                    onPress={() => router.replace('/team/login')}
                    style={{
                      marginTop: 8,
                      alignSelf: 'center',
                      paddingVertical: 5,
                      paddingHorizontal: 14,
                      borderRadius: 6,
                      backgroundColor: ui.colors.danger,
                    }}
                  >
                    <Text style={{ color: ui.colors.text, fontSize: 12, fontWeight: '600' }}>Back to Sign In</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            {/* Success Message */}
            {successMsg ? (
              <View style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: ui.colors.successSoft,
                borderWidth: 1,
                borderColor: ui.colors.borderStrong,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}>
                <CheckCircle2 size={16} color={ui.colors.success} />
                <Text style={{ flex: 1, fontSize: 12, color: ui.colors.success, fontWeight: '600' }}>{successMsg}</Text>
              </View>
            ) : null}

            {/* Submit Button */}
            <Button
              onPress={handleUpdate}
              disabled={loading || invalidPasswordInput}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 10,
                marginTop: 4,
                backgroundColor: ui.colors.primaryStrong,
              }}
            >
              <Text style={{ color: ui.colors.onPrimary, fontWeight: '700', fontSize: 14 }}>
                {loading ? 'Please wait...' : savedUsername !== null ? 'Retry Sign In' : requiresUsernameChange ? 'Save & Enter Dashboard' : 'Change Password & Continue'}
              </Text>
            </Button>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
