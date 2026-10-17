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
import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react-native';
import { useAuthStore } from '@/core/store/authStore';
import { authService } from '@/services/authService';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';
import { Card } from '@/components/ui/shadcn/card';

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
      const result = await authService.login(username, password);
      if (result.role !== 'team_leader') {
        await authService.logout().catch(() => undefined);
        setErrorMsg('This account does not have Team Leader access.');
        return;
      }
      setUser(result.user, result.tenant_id, result.role, result.is_superadmin);
      router.replace('/team/dashboard');
    } catch (error: any) {
      setErrorMsg(authService.friendlyError(error.message));
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
        <Card style={{ width: '100%', maxWidth: 400, padding: isDesktop ? 32 : 24 }}>
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: 'hsl(var(--primary))',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
              opacity: 0.1,
            }}>
              <UserRound size={28} color="hsl(var(--primary))" style={{ opacity: 1 }} />
            </View>
            <Text style={{
              fontSize: 20,
              fontWeight: '700',
              color: 'hsl(var(--foreground))',
              fontFamily: 'Poppins_700Bold',
            }}>
              Team Leader Portal
            </Text>
            <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
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
                borderColor: 'hsl(var(--input))',
                borderRadius: 10,
                paddingHorizontal: 12,
                height: 44,
                backgroundColor: 'hsl(var(--background))',
              }}>
                <UserRound size={16} color="hsl(var(--muted-foreground))" style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: 'hsl(var(--foreground))', padding: 0 }}
                  placeholder="Enter your username"
                  placeholderTextColor="hsl(var(--muted-foreground))"
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
                borderColor: 'hsl(var(--input))',
                borderRadius: 10,
                paddingHorizontal: 12,
                height: 44,
                backgroundColor: 'hsl(var(--background))',
              }}>
                <LockKeyhole size={16} color="hsl(var(--muted-foreground))" style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: 'hsl(var(--foreground))', padding: 0 }}
                  placeholder="Enter your password"
                  placeholderTextColor="hsl(var(--muted-foreground))"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                  {showPassword ? (
                    <EyeOff size={16} color="hsl(var(--muted-foreground))" />
                  ) : (
                    <Eye size={16} color="hsl(var(--muted-foreground))" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {errorMsg ? (
              <View style={{
                backgroundColor: 'hsl(var(--destructive))',
                borderWidth: 1,
                borderColor: 'hsl(var(--destructive))',
                borderRadius: 8,
                padding: 10,
                opacity: 0.1,
              }}>
                <Text style={{ color: 'hsl(var(--destructive))', fontSize: 13 }}>
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
            <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
              Contact your Festival Administrator if you need access.
            </Text>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
