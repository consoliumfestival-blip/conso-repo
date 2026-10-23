import { ui } from '@/constants/designSystem';
import React from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { TeamPageHeading } from '@/components/team/TeamPageHeading';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/core/store/authStore';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/team/TeamCard';
import { Badge } from '@/components/team/TeamBadge';
import { Button } from '@/components/team/TeamButton';
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
        <TeamPageHeading title="Profile" teamName={context?.team_name} subtitle="Your account and portal details" />

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              <Label>Name</Label>
              <Text style={{ fontSize: 14, fontWeight: '500', color: ui.colors.text }}>
                {user?.full_name || user?.display_name || user?.username || 'Team Leader'}
              </Text>
            </View>
            <Separator />
            <View style={{ gap: 4 }}>
              <Label>Email</Label>
              <Text style={{ fontSize: 14, fontWeight: '500', color: ui.colors.text }}>
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
                <Text style={{ fontSize: 14, fontWeight: '500', color: ui.colors.text }}>
                  {context.organisation_id || 'N/A'}
                </Text>
              </View>
              <Separator />
              <View style={{ gap: 4 }}>
                <Label>Festival ID</Label>
                <Text style={{ fontSize: 14, fontWeight: '500', color: ui.colors.text }}>
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
