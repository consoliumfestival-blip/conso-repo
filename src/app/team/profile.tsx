import React from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/core/store/authStore';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';
import { Separator } from '@/components/ui/shadcn/separator';

export default function ProfileScreen() {
  const { context } = useTeamLeaderContext();
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          logout();
          router.replace('/team/login');
        },
      },
    ]);
  };

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: 'hsl(var(--foreground))' }}>Profile</Text>
          <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
            Your account and portal details
          </Text>
        </View>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              <Label>Name</Label>
              <Text style={{ fontSize: 14, fontWeight: '500', color: 'hsl(var(--foreground))' }}>
                {user?.full_name || user?.display_name || user?.username || 'Team Leader'}
              </Text>
            </View>
            <Separator />
            <View style={{ gap: 4 }}>
              <Label>Email</Label>
              <Text style={{ fontSize: 14, fontWeight: '500', color: 'hsl(var(--foreground))' }}>
                {user?.email || 'N/A'}
              </Text>
            </View>
            <Separator />
            <View style={{ gap: 4 }}>
              <Label>Role</Label>
              <Badge variant="info" className="self-start mt-1">Team Leader</Badge>
            </View>
          </CardContent>
        </Card>

        {/* Team Info */}
        {context && (
          <Card>
            <CardHeader>
              <CardTitle>Team Assignment</CardTitle>
            </CardHeader>
            <CardContent style={{ gap: 12 }}>
              <View style={{ gap: 4 }}>
                <Label>Organisation ID</Label>
                <Text style={{ fontSize: 14, fontWeight: '500', color: 'hsl(var(--foreground))' }}>
                  {context.organisation_id || 'N/A'}
                </Text>
              </View>
              <Separator />
              <View style={{ gap: 4 }}>
                <Label>Festival ID</Label>
                <Text style={{ fontSize: 14, fontWeight: '500', color: 'hsl(var(--foreground))' }}>
                  {context.festival_id || 'N/A'}
                </Text>
              </View>
            </CardContent>
          </Card>
        )}

        {/* Sign Out */}
        <Card>
          <CardContent style={{ padding: 16 }}>
            <Button variant="destructive" onPress={handleLogout} className="w-full">
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </View>
    </TeamLeaderAppShell>
  );
}
