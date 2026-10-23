import { ui } from '@/constants/designSystem';
import React, { useEffect, useState } from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { TeamPageHeading } from '@/components/team/TeamPageHeading';
import { View } from 'react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderAnnouncement } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/team/TeamCard';
import { Badge } from '@/components/team/TeamBadge';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { TeamLeaderDataError } from '@/components/team/TeamLeaderDataError';

export default function AnnouncementsScreen() {
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [announcements, setAnnouncements] = useState<TeamLeaderAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!context) return;
    setLoadError(null);
    setLoading(true);
    teamLeaderPortalService.getAnnouncements().then((data) => {
      setAnnouncements(data);
      setLoading(false);
    }).catch((error: any) => { setLoadError(error?.message || 'Please retry the announcements request.'); setLoading(false); });
  }, [context, reloadKey]);

  if (contextLoading || loading) {
    return (
      <TeamLeaderAppShell>
        <View style={{ gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 100, borderRadius: 12 }} />
          ))}
        </View>
      </TeamLeaderAppShell>
    );
  }
  if (loadError) return <TeamLeaderAppShell><TeamLeaderDataError message={loadError} onRetry={() => setReloadKey((key) => key + 1)} /></TeamLeaderAppShell>;

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <TeamPageHeading title="Announcements" teamName={context?.team_name}
          subtitle={`${announcements.length} update${announcements.length === 1 ? '' : 's'} from the festival team`} />

        {announcements.length === 0 ? (
          <Card>
            <CardContent style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: ui.colors.textMuted }}>No announcements at this time</Text>
            </CardContent>
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
            {announcements.map((ann) => (
              <Card key={ann.id}>
                <CardContent style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: ui.colors.text, flex: 1 }}>
                      {ann.title || 'Notice'}
                    </Text>
                    {ann.type && ann.type !== 'general' && (
                      <Badge variant="secondary">
                        {ann.type}
                      </Badge>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, color: ui.colors.text, marginTop: 8, lineHeight: 20, opacity: 0.8 }}>
                    {ann.message || ''}
                  </Text>
                  {ann.created_at && (
                    <Text style={{ fontSize: 11, color: ui.colors.textMuted, marginTop: 8 }}>
                      {new Date(ann.created_at).toLocaleString()}
                    </Text>
                  )}
                </CardContent>
              </Card>
            ))}
          </View>
        )}
      </View>
    </TeamLeaderAppShell>
  );
}
