import { TeamPortalIdentity } from '@/components/team/TeamPortalIdentity';
import React, { useState } from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { ScrollView, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, LockKeyhole, Moon, Sun, UserRound } from 'lucide-react-native';
import { useAuthStore } from '@/core/store/authStore';
import { authService } from '@/services/authService';
import { Button } from '@/components/team/TeamButton';
import { Label } from '@/components/team/TeamLabel';
import { Card } from '@/components/team/TeamCard';
import { useTeamTheme, useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { ConsoliumLogo } from '@/components/ui/ConsoliumLogo';
import { applyPortalPwaMetadata } from '@/core/utils/portalPwaMetadata';
import { isSixDigitPassword, readNumericPasswordInput } from '@/core/utils/teamLeaderCredentials';

export default function TeamLeaderLogin() {
  React.useEffect(() => applyPortalPwaMetadata('team'), []);
  const ui = useTeamUi();
  const { mode, toggleMode } = useTeamTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [useLegacyPassword, setUseLegacyPassword] = useState(false);
  const [invalidPasswordInput, setInvalidPasswordInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const setUser = useAuthStore((state) => state.setUser);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const ThemeIcon = mode === 'dark' ? Sun : Moon;

  const handleLogin = async () => {
    if (invalidPasswordInput) return;
    setErrorMsg('');
    if (!username.trim() || !password) {
      setErrorMsg('Please enter both username and password.');
      return;
    }
    if (!useLegacyPassword && !isSixDigitPassword(password)) {
      setErrorMsg('Enter your six-digit password.');
      return;
    }
    setLoading(true);
    try {
      const result = await authService.loginTeamLeader(username.trim(), password);
      if (result.role !== 'team_leader') {
        await authService.logout().catch(() => undefined);
        setErrorMsg('This account does not have Team Leader access.');
        return;
      }
      setUser(result.user, result.tenant_id, result.role, result.is_superadmin);
      if (
        result.user?.app_metadata?.must_change_credentials
        || result.user?.app_metadata?.must_change_password
        || result.user?.user_metadata?.must_change_credentials
        || result.user?.user_metadata?.must_change_password
      ) {
        router.replace('/team/first-login');
      } else {
        router.replace('/team/dashboard');
      }
    } catch (error: any) {
      const message = error?.message || 'Could not sign in. Please try again.';
      setErrorMsg(/invalid (username|login credentials|credentials)/i.test(message)
        ? 'Incorrect username or password. Please check and try again.'
        : authService.friendlyError(message));
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
        <View style={{ width: '100%', maxWidth: 400, alignItems: 'flex-end', marginBottom: 8 }}>
          <TouchableOpacity onPress={toggleMode} accessibilityRole="button" accessibilityLabel={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ minWidth: 44, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surfaceGlass, alignItems: 'center', justifyContent: 'center' }}>
            <ThemeIcon size={18} color={ui.colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Card style={{ width: '100%', maxWidth: 400, borderRadius: isDesktop ? 16 : 28, padding: isDesktop ? 32 : 22 }}>
          <TeamPortalIdentity />
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: ui.colors.primarySoft,
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
            }}>
              Team Leader Portal
            </Text>
            <Text style={{ fontSize: 13, color: ui.colors.textMuted, marginTop: 4 }}>
              Sign in to access your team dashboard
            </Text>
          </View>

          {/* Form */}
          <View style={{ gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Label>Username</Label>
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
                  placeholder="Enter your username"
                  placeholderTextColor={ui.colors.textMuted}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Label>Password</Label>
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
                  placeholder="Enter your password"
                  placeholderTextColor={ui.colors.textMuted}
                  value={password}
                  onChangeText={(value) => {
                    const next = useLegacyPassword ? value : readNumericPasswordInput(value);
                    if (next === null) {
                      setInvalidPasswordInput(true);
                      setErrorMsg('Enter only six digits (0–9); copy the password separately from the username.');
                      return;
                    }
                    setInvalidPasswordInput(false);
                    setErrorMsg('');
                    setPassword(next);
                  }}
                  keyboardType={useLegacyPassword ? 'default' : 'number-pad'}
                  autoCorrect={false}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? (
                    <EyeOff size={16} color={ui.colors.textMuted} />
                  ) : (
                    <Eye size={16} color={ui.colors.textMuted} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              disabled={loading}
              onPress={() => { setUseLegacyPassword((value) => !value); setPassword(''); setErrorMsg(''); setInvalidPasswordInput(false); }}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>
                {useLegacyPassword ? 'Use six-digit password' : 'Use an older password with letters'}
              </Text>
            </TouchableOpacity>

            {errorMsg ? (
              <View style={{
                backgroundColor: ui.colors.dangerSoft,
                borderWidth: 1,
                borderColor: ui.colors.danger,
                borderRadius: 8,
                padding: 10,
              }}>
                <Text style={{ color: ui.colors.danger, fontSize: 13 }}>
                  {errorMsg}
                </Text>
              </View>
            ) : null}

            <Button
              onPress={handleLogin}
              disabled={loading || invalidPasswordInput}
              loading={loading}
              className="mt-1"
            >
              Sign In
            </Button>
          </View>

          {/* Footer */}
          <View style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>
              Contact your Festival Administrator if you need access.
            </Text>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
