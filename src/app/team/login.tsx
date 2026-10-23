import { ui } from '@/constants/designSystem';
import React, { useState } from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { ScrollView, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react-native';
import { useAuthStore } from '@/core/store/authStore';
import { authService } from '@/services/authService';
import { Button } from '@/components/team/TeamButton';
import { Label } from '@/components/ui/shadcn/label';
import { Card } from '@/components/team/TeamCard';

export default function TeamLeaderLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const setUser = useAuthStore((state) => state.setUser);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 640;

  const handleLogin = async () => {
    setErrorMsg('');
    if (!username || !password) {
      setErrorMsg('Please enter both username and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await authService.loginTeamLeader(username, password);
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
      setErrorMsg(authService.friendlyError(error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: ui.colors.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <Card style={{ width: '100%', maxWidth: 400, padding: isDesktop ? 32 : 24 }}>
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
              <UserRound size={28} color={ui.colors.primary} style={{ opacity: 1 }} />
            </View>
            <Text style={{
              fontSize: 20,
              fontWeight: '700',
              color: ui.colors.text,
              fontFamily: 'Poppins_700Bold',
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
                  style={{ flex: 1, fontSize: 14, color: ui.colors.text, padding: 0 }}
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
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: ui.colors.text, padding: 0 }}
                  placeholder="Enter your password"
                  placeholderTextColor={ui.colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                  {showPassword ? (
                    <EyeOff size={16} color={ui.colors.textMuted} />
                  ) : (
                    <Eye size={16} color={ui.colors.textMuted} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

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
              disabled={loading}
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
