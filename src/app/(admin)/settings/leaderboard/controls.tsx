import { ui } from "@/constants/designSystem";
import * as DocumentPicker from 'expo-document-picker';
import { storageService } from '@/services/storage/storageService';
import { useActiveFestival } from '@/core/hooks/useFestival';
import React, { useState } from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  ChevronDown,
  Copy,
  RefreshCw,
  Rocket,
  ShieldCheck,
} from 'lucide-react-native';
import { useAdminLeaderboard } from '../../../../core/hooks/useAdminLeaderboard';
import { useLeaderboardPreview } from '../../../../core/hooks/useLeaderboard';
import { useFestival } from '../../../../core/hooks/useFestival';
import {
  useGetLeaderboardSettings,
  useUpdateLeaderboardSettings,
} from '../../../../core/hooks/useLeaderboardSettings';
import { useAuthStore } from '../../../../core/store/authStore';
import { LeaderboardSettings } from '../../../../services/leaderboardSettingsService';

const colors = {
  navy: ui.colors.primaryHover,
  blue: ui.colors.primary,
  cyan: ui.colors.info,
  teal: ui.colors.primary,
  green: ui.colors.success,
  bg: ui.colors.background,
  card: ui.colors.surface,
  border: ui.colors.border,
  text: ui.colors.text,
  muted: ui.colors.textMuted,
  soft: ui.colors.infoSoft,
};

const formatDateTime = (value: string | null) => {
  if (!value) return 'Awaiting first publish';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

export default function LeaderboardControlsPage() {
  const { tenant_id } = useAuthStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1180;

  // Load active festival ID
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalId = activeFestival?.id;

  // Load database settings
  const { data: settings } = useGetLeaderboardSettings(festivalId);
  const updateSettingsMutation = useUpdateLeaderboardSettings(tenant_id ?? '', festivalId ?? '');

  // Local settings states (Applied on clicking "Apply Settings")
  const [isPublicVisible, setIsPublicVisible] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(300);
  const [showRankMovement, setShowRankMovement] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [showGradeSummary, setShowGradeSummary] = useState(true);
  const [isFrozen, setIsFrozen] = useState(false);
  const [previewVisibility, setPreviewVisibility] = useState('draft');
  const [posterEnabled, setPosterEnabled] = useState(true);
  const [certificateEnabled, setCertificateEnabled] = useState(false);
  const [posterTopCount, setPosterTopCount] = useState(3);
  const [showIndividualRankings, setShowIndividualRankings] = useState(true);
  const [teamPointStatus, setTeamPointStatus] = useState<string>('');
  const [publicFestivalName, setPublicFestivalName] = useState<string>('');
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [rankingMode, setRankingMode] = useState<string>('ALL');
  const [itemLimit, setItemLimit] = useState<string>('');

  const { data: publicPreview, isFetching: isPreviewFetching } = useLeaderboardPreview(
    tenant_id, 
    festivalId, 
    rankingMode, 
    itemLimit && !isNaN(parseInt(itemLimit, 10)) ? parseInt(itemLimit, 10) : null
  );

  const publicLeaderboardUrl = tenant_id && typeof window !== 'undefined'
    ? window.location.origin + '/leaderboard?tenant_id=' + tenant_id
    : '';

  const handleCopyPublicLink = async () => {
    if (!publicLeaderboardUrl || typeof navigator === 'undefined' || !navigator.clipboard) {
      alert('Tenant-specific public link is not available yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(publicLeaderboardUrl);
      setPublicLinkCopied(true);
      setTimeout(() => setPublicLinkCopied(false), 1800);
    } catch {
      alert('Could not copy the public link.');
    }
  };

  // Sync state with db loaded settings
  React.useEffect(() => {
    if (settings) {
      setIsPublicVisible(settings.is_public_visible);
      setAutoRefreshEnabled(settings.auto_refresh_enabled);
      setAutoRefreshInterval(settings.auto_refresh_interval);
      setShowRankMovement(settings.show_rank_movement);
      setShowTimestamps(settings.show_timestamps);
      setShowGradeSummary(settings.show_grade_summary);
      setIsFrozen(settings.is_frozen);
      setPreviewVisibility(settings.preview_visibility || 'draft');
      setPosterEnabled(settings.poster_enabled);
      setCertificateEnabled(settings.certificate_enabled);
      setPosterTopCount(settings.poster_top_count || 3);
      setShowIndividualRankings(settings.show_individual_rankings ?? true);
      setTeamPointStatus(settings.team_point_status || '');
      setPublicFestivalName(settings.public_festival_name ?? activeFestival?.custom_name ?? '');
      setRankingMode(settings.ranking_mode || 'ALL');
      setItemLimit(settings.item_limit ? settings.item_limit.toString() : '');
    }
  }, [settings, activeFestival?.custom_name]);

  const buildSettingsPayload = (
    overrides: Partial<LeaderboardSettings> = {},
  ): Partial<LeaderboardSettings> => ({
    is_public_visible: isPublicVisible,
    auto_refresh_enabled: autoRefreshEnabled,
    auto_refresh_interval: autoRefreshInterval,
    show_rank_movement: showRankMovement,
    show_timestamps: showTimestamps,
    show_grade_summary: showGradeSummary,
    is_frozen: isFrozen,
    preview_visibility: previewVisibility,
    poster_enabled: posterEnabled,
    certificate_enabled: certificateEnabled,
    poster_top_count: posterTopCount,
    show_individual_rankings: showIndividualRankings,
    team_point_status: teamPointStatus || null,
    public_festival_name: publicFestivalName.trim() || null,
    ranking_mode: rankingMode,
    item_limit: itemLimit && !isNaN(parseInt(itemLimit, 10)) ? parseInt(itemLimit, 10) : null,
    ...overrides,
  });

  const handleApplySettings = async () => {
    if (!tenant_id || !festivalId) {
      alert('Active festival or tenant not found.');
      return;
    }
    try {
      await updateSettingsMutation.mutateAsync(buildSettingsPayload());
      alert('Settings applied successfully!');
    } catch (err: any) {
      alert('Error updating settings: ' + err.message);
    }
  };

  const persistSetting = async (payload: Partial<LeaderboardSettings>) => {
    if (!tenant_id || !festivalId) {
      alert('Active festival or tenant not found.');
      return false;
    }
    try {
      await updateSettingsMutation.mutateAsync(buildSettingsPayload(payload));
      return true;
    } catch (err: any) {
      alert('Error updating settings: ' + err.message);
      return false;
    }
  };

  const { data = [], isRefetching, refetch } = useAdminLeaderboard(tenant_id, festivalId);

  const latestUpdate = data.reduce<string | null>((latest, row) => {
    if (!row.latest_published_at) return latest;
    if (!latest || new Date(row.latest_published_at) > new Date(latest)) return row.latest_published_at;
    return latest;
  }, null);

  return (
    <>
      <View style={styles.workbench}>
        <View style={styles.controlPanel}>
          <Text style={styles.controlTitle}>Leaderboard Control</Text>
          <Text style={styles.controlSub}>Manage live ranking publication behavior.</Text>

          <View style={styles.controlList}>
            <View style={styles.controlRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.controlLabel}>Public Visibility</Text>
                <Text style={styles.controlHint}>Show leaderboard to the public</Text>
              </View>
              <Switch
                value={isPublicVisible}
                onValueChange={async (value) => {
                  const previous = isPublicVisible;
                  setIsPublicVisible(value);
                  const saved = await persistSetting({ is_public_visible: value });
                  if (!saved) setIsPublicVisible(previous);
                }}
                disabled={updateSettingsMutation.isPending}
                trackColor={{ false: '#CBD5E1', true: '#99F6E4' }}
                thumbColor={isPublicVisible ? colors.teal : ui.colors.surface}
              />
            </View>

            <View style={styles.controlRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.controlLabel}>Individual Rankings</Text>
                <Text style={styles.controlHint}>Show individual rankings on the public leaderboard</Text>
              </View>
              <Switch
                value={showIndividualRankings}
                onValueChange={async (value) => {
                  const previous = showIndividualRankings;
                  setShowIndividualRankings(value);
                  const saved = await persistSetting({ show_individual_rankings: value });
                  if (!saved) setShowIndividualRankings(previous);
                }}
                disabled={updateSettingsMutation.isPending}
                trackColor={{ false: '#CBD5E1', true: '#BAE6FD' }}
                thumbColor={showIndividualRankings ? colors.cyan : ui.colors.surface}
              />
            </View>

            <View style={[styles.controlRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
              <Text style={styles.controlLabel}>Tenant Public Leaderboard Link</Text>
              <Text style={styles.controlHint}>Use this link so the public board always opens this tenant&apos;s festival and never another tenant&apos;s data.</Text>
              <View style={styles.publicLinkRow}>
                <Text numberOfLines={1} style={styles.publicLinkText}>
                  {publicLeaderboardUrl || 'Create or select a tenant first'}
                </Text>
                <TouchableOpacity
                  onPress={handleCopyPublicLink}
                  disabled={!publicLeaderboardUrl}
                  style={[styles.copyLinkAction, !publicLeaderboardUrl && { opacity: 0.5 }]}
                  accessibilityLabel="Copy tenant public leaderboard link"
                >
                  <Copy size={16} color={colors.teal} />
                  <Text style={styles.copyLinkText}>{publicLinkCopied ? 'Copied' : 'Copy'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.controlRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.controlLabel}>Public Festival Name</Text>
                <Text style={styles.controlHint}>Name shown on the public leaderboard (leave empty to use the active festival name)</Text>
              </View>
              <TextInput
                value={publicFestivalName}
                onChangeText={setPublicFestivalName}
                onBlur={async () => {
                  const fallbackName = activeFestival?.custom_name ?? '';
                  if ((settings?.public_festival_name ?? fallbackName) !== publicFestivalName.trim()) {
                    await persistSetting({ public_festival_name: publicFestivalName.trim() || null });
                  }
                }}
                placeholder={activeFestival?.custom_name || 'e.g. Alviora Festival 2026'}
                style={styles.textInput}
                placeholderTextColor={colors.muted}
                editable={!updateSettingsMutation.isPending}
                maxLength={120}
              />
            </View>

            <View style={[styles.controlRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.controlLabel}>Unit Ranking Publish Logic</Text>
                <Text style={styles.controlHint}>Limit how many published items are included in the unit ranking</Text>
              </View>
              
              <TouchableOpacity 
                onPress={async () => {
                  const prevMode = rankingMode;
                  const prevLimit = itemLimit;
                  setRankingMode('ALL');
                  setItemLimit('');
                  const saved = await persistSetting({ ranking_mode: 'ALL', item_limit: null });
                  if (!saved) {
                    setRankingMode(prevMode);
                    setItemLimit(prevLimit);
                  }
                }}
                style={[styles.dropdown, rankingMode === 'ALL' && { borderColor: colors.teal, backgroundColor: ui.colors.infoSoft }]}
              >
                <Text style={styles.dropdownValue}>All Completed Items</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={async () => {
                  const prevMode = rankingMode;
                  const prevLimit = itemLimit;
                  setRankingMode('LIMITED');
                  setItemLimit('5');
                  const saved = await persistSetting({ ranking_mode: 'LIMITED', item_limit: 5 });
                  if (!saved) {
                    setRankingMode(prevMode);
                    setItemLimit(prevLimit);
                  }
                }}
                style={[styles.dropdown, rankingMode === 'LIMITED' && itemLimit === '5' && { borderColor: colors.teal, backgroundColor: ui.colors.infoSoft }]}
              >
                <Text style={styles.dropdownValue}>First 5 Completed Items</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={async () => {
                  const prevMode = rankingMode;
                  const prevLimit = itemLimit;
                  setRankingMode('LIMITED');
                  setItemLimit('10');
                  const saved = await persistSetting({ ranking_mode: 'LIMITED', item_limit: 10 });
                  if (!saved) {
                    setRankingMode(prevMode);
                    setItemLimit(prevLimit);
                  }
                }}
                style={[styles.dropdown, rankingMode === 'LIMITED' && itemLimit === '10' && { borderColor: colors.teal, backgroundColor: ui.colors.infoSoft }]}
              >
                <Text style={styles.dropdownValue}>First 10 Completed Items</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={async () => {
                  const prevMode = rankingMode;
                  const prevLimit = itemLimit;
                  setRankingMode('LIMITED');
                  setItemLimit('15');
                  const saved = await persistSetting({ ranking_mode: 'LIMITED', item_limit: 15 });
                  if (!saved) {
                    setRankingMode(prevMode);
                    setItemLimit(prevLimit);
                  }
                }}
                style={[styles.dropdown, rankingMode === 'LIMITED' && itemLimit === '15' && { borderColor: colors.teal, backgroundColor: ui.colors.infoSoft }]}
              >
                <Text style={styles.dropdownValue}>First 15 Completed Items</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={async () => {
                  const prevMode = rankingMode;
                  const prevLimit = itemLimit;
                  setRankingMode('LIMITED');
                  setItemLimit('20');
                  const saved = await persistSetting({ ranking_mode: 'LIMITED', item_limit: 20 });
                  if (!saved) {
                    setRankingMode(prevMode);
                    setItemLimit(prevLimit);
                  }
                }}
                style={[styles.dropdown, rankingMode === 'LIMITED' && itemLimit === '20' && { borderColor: colors.teal, backgroundColor: ui.colors.infoSoft }]}
              >
                <Text style={styles.dropdownValue}>First 20 Completed Items</Text>
              </TouchableOpacity>

              <View style={[styles.dropdown, rankingMode === 'LIMITED' && !['5','10','15','20'].includes(itemLimit) && { borderColor: colors.teal, backgroundColor: ui.colors.infoSoft }]}>
                <Text style={[styles.dropdownValue, { flex: 1 }]}>Custom Number</Text>
                <TextInput
                  style={[styles.textInput, { height: 32, paddingVertical: 0, width: 80, textAlign: 'center' }]}
                  placeholder="e.g. 12"
                  keyboardType="numeric"
                  value={rankingMode === 'LIMITED' && !['5','10','15','20'].includes(itemLimit) ? itemLimit : ''}
                  onFocus={() => {
                    setRankingMode('LIMITED');
                    if (['5','10','15','20'].includes(itemLimit)) setItemLimit('');
                  }}
                  onChangeText={setItemLimit}
                  onBlur={async () => {
                    if (rankingMode === 'LIMITED' && itemLimit && !isNaN(parseInt(itemLimit, 10))) {
                      await persistSetting({ ranking_mode: 'LIMITED', item_limit: parseInt(itemLimit, 10) });
                    }
                  }}
                />
              </View>
            </View>

            <View style={[styles.controlRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.controlLabel}>Official Team Point Status</Text>
                <Text style={styles.controlHint}>Banner text to show above public leaderboard (leave empty to hide)</Text>
              </View>
              <TextInput
                value={teamPointStatus}
                onChangeText={setTeamPointStatus}
                onBlur={async () => {
                  if (settings?.team_point_status !== teamPointStatus) {
                    await persistSetting({ team_point_status: teamPointStatus || null });
                  }
                }}
                placeholder="e.g. After 10 Results, Final Status"
                style={styles.textInput}
                placeholderTextColor={colors.muted}
                editable={!updateSettingsMutation.isPending}
              />
            </View>

            <View style={styles.controlRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.controlLabel}>Auto Refresh</Text>
                <Text style={styles.controlHint}>Refresh rankings automatically</Text>
              </View>
              <Switch
                value={autoRefreshEnabled}
                onValueChange={async (value) => {
                  const previous = autoRefreshEnabled;
                  setAutoRefreshEnabled(value);
                  const saved = await persistSetting({ auto_refresh_enabled: value });
                  if (!saved) setAutoRefreshEnabled(previous);
                }}
                disabled={updateSettingsMutation.isPending}
                trackColor={{ false: '#CBD5E1', true: '#BAE6FD' }}
                thumbColor={autoRefreshEnabled ? colors.cyan : ui.colors.surface}
              />
            </View>

            {autoRefreshEnabled && (
              <TouchableOpacity 
                onPress={() => {
                  const nextInterval = autoRefreshInterval === 60 ? 300 : autoRefreshInterval === 300 ? 900 : 60;
                  setAutoRefreshInterval(nextInterval);
                }}
                style={styles.dropdown}
              >
                <View>
                  <Text style={styles.controlHint}>Refresh interval</Text>
                  <Text style={styles.dropdownValue}>
                    {autoRefreshInterval >= 60 ? `Every ${autoRefreshInterval / 60} minutes` : `Every ${autoRefreshInterval} seconds`}
                  </Text>
                </View>
                <ChevronDown size={18} color={colors.muted} />
              </TouchableOpacity>
            )}

            <View style={styles.controlRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.controlLabel}>Freeze Leaderboard</Text>
                <Text style={styles.controlHint}>Freeze rankings to pause movement</Text>
              </View>
              <Switch
                value={isFrozen}
                onValueChange={async (value) => {
                  const previous = isFrozen;
                  setIsFrozen(value);
                  const saved = await persistSetting({ is_frozen: value });
                  if (!saved) setIsFrozen(previous);
                }}
                disabled={updateSettingsMutation.isPending}
                trackColor={{ false: '#CBD5E1', true: '#FCA5A5' }}
                thumbColor={isFrozen ? '#EF4444' : ui.colors.surface}
              />
            </View>

            <TouchableOpacity 
              onPress={() => {
                setPreviewVisibility(previewVisibility === 'draft' ? 'public' : 'draft');
              }}
              style={styles.dropdown}
            >
              <View>
                <Text style={styles.controlHint}>Preview Mode</Text>
                <Text style={styles.dropdownValue}>{previewVisibility === 'draft' ? 'Draft Only' : 'Public Access'}</Text>
              </View>
              <ChevronDown size={18} color={colors.muted} />
            </TouchableOpacity>

            <View style={styles.controlRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.controlLabel}>Show Timestamps</Text>
                <Text style={styles.controlHint}>Display latest update time</Text>
              </View>
              <Switch
                value={showTimestamps}
                onValueChange={async (value) => {
                  const previous = showTimestamps;
                  setShowTimestamps(value);
                  const saved = await persistSetting({ show_timestamps: value });
                  if (!saved) setShowTimestamps(previous);
                }}
                disabled={updateSettingsMutation.isPending}
                trackColor={{ false: '#CBD5E1', true: '#99F6E4' }}
                thumbColor={showTimestamps ? colors.teal : ui.colors.surface}
              />
            </View>

            <View style={styles.controlRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.controlLabel}>Grade Summary</Text>
                <Text style={styles.controlHint}>Display overall grades count</Text>
              </View>
              <Switch
                value={showGradeSummary}
                onValueChange={async (value) => {
                  const previous = showGradeSummary;
                  setShowGradeSummary(value);
                  const saved = await persistSetting({ show_grade_summary: value });
                  if (!saved) setShowGradeSummary(previous);
                }}
                disabled={updateSettingsMutation.isPending}
                trackColor={{ false: '#CBD5E1', true: '#99F6E4' }}
                thumbColor={showGradeSummary ? colors.teal : ui.colors.surface}
              />
            </View>

            <View style={styles.controlRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.controlLabel}>Poster Generation</Text>
                <Text style={styles.controlHint}>Allow poster downloads for units</Text>
              </View>
              <Switch
                value={posterEnabled}
                onValueChange={async (value) => {
                  const previous = posterEnabled;
                  setPosterEnabled(value);
                  const saved = await persistSetting({ poster_enabled: value });
                  if (!saved) setPosterEnabled(previous);
                }}
                disabled={updateSettingsMutation.isPending}
                trackColor={{ false: '#CBD5E1', true: '#99F6E4' }}
                thumbColor={posterEnabled ? colors.teal : ui.colors.surface}
              />
            </View>

            {posterEnabled && (
              <TouchableOpacity 
                onPress={() => {
                  const nextCount = posterTopCount === 3 ? 5 : posterTopCount === 5 ? 10 : 3;
                  setPosterTopCount(nextCount);
                }}
                style={styles.dropdown}
              >
                <View>
                  <Text style={styles.controlHint}>Poster Top Rank Limit</Text>
                  <Text style={styles.dropdownValue}>Top {posterTopCount} Units</Text>
                </View>
                <ChevronDown size={18} color={colors.muted} />
              </TouchableOpacity>
            )}

            <View style={styles.controlRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.controlLabel}>Certificate Generation</Text>
                <Text style={styles.controlHint}>Allow winners certificates</Text>
              </View>
              <Switch
                value={certificateEnabled}
                onValueChange={async (value) => {
                  const previous = certificateEnabled;
                  setCertificateEnabled(value);
                  const saved = await persistSetting({ certificate_enabled: value });
                  if (!saved) setCertificateEnabled(previous);
                }}
                disabled={updateSettingsMutation.isPending}
                trackColor={{ false: '#CBD5E1', true: '#99F6E4' }}
                thumbColor={certificateEnabled ? colors.teal : ui.colors.surface}
              />
            </View>
          </View>

          <View style={styles.actionBlock}>
            <Text style={styles.blockTitle}>Settings Actions</Text>
            <TouchableOpacity 
              onPress={handleApplySettings} 
              style={[styles.primaryAction, updateSettingsMutation.isPending && { opacity: 0.7 }]}
              disabled={updateSettingsMutation.isPending}
            >
              <Rocket size={17} color={ui.colors.surface} />
              <Text style={styles.primaryActionText}>
                {updateSettingsMutation.isPending ? 'Applying...' : 'Apply Settings'}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.blockTitle, { marginTop: 12 }]}>Manual Actions</Text>
            <TouchableOpacity onPress={() => refetch()} style={styles.outlineAction}>
              <RefreshCw size={17} color={colors.teal} />
              <Text style={styles.outlineActionText}>
                {isRefetching ? 'Recalculating...' : 'Recalculate Rankings'}
              </Text>
            </TouchableOpacity>
          </View>

            <View style={styles.summaryBlock}>
              <Text style={styles.blockTitle}>Data Summary</Text>
              <View style={styles.summaryLine}>
                <Text style={styles.summaryLabel}>Source</Text>
                <Text style={styles.summaryValue}>Published results</Text>
              </View>
              <View style={styles.summaryLine}>
                <Text style={styles.summaryLabel}>Visibility</Text>
                <Text style={styles.summaryValue}>{isPublicVisible ? 'Live' : 'Paused'}</Text>
              </View>
              <View style={styles.summaryLine}>
                <Text style={styles.summaryLabel}>Last update</Text>
                <Text style={styles.summaryValue}>{formatDateTime(latestUpdate)}</Text>
              </View>
            </View>
          </View>

        <View style={[styles.controlPanel, { flex: 1, minWidth: 300 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.controlTitle}>Live Points Preview</Text>
            {isPreviewFetching && <RefreshCw size={16} color={colors.teal} />}
          </View>
          <Text style={styles.controlSub}>
            Current {rankingMode === 'LIMITED' ? `(Limited to ${itemLimit || '0'} items)` : '(All Items)'} standings.
          </Text>

          <View style={styles.previewContainer}>
            {publicPreview?.map((row: any, i: number) => (
              <View key={row.organisation_id} style={styles.previewRow}>
                <View style={styles.previewRank}>
                  <Text style={styles.previewRankText}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewOrgName}>{row.organisation_name}</Text>
                </View>
                <Text style={styles.previewPoints}>{row.total_points} pts</Text>
              </View>
            ))}
            {(!publicPreview || publicPreview.length === 0) && (
              <Text style={{ textAlign: 'center', marginTop: 20, color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 13 }}>
                No public items match this logic.
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.infoStrip}>
        <View style={styles.infoIcon}>
          <ShieldCheck size={18} color={colors.teal} />
        </View>
        <Text style={styles.infoText}>
          Leaderboard management displays unit/team rankings only. Individual participant
          points are not exposed in this control panel.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  workbench: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'flex-start',
    width: '100%',
  },
  controlPanel: {
    width: '100%',
    maxWidth: 600,
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    shadowColor: ui.shadow.shadowColor,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  controlTitle: {
    color: colors.text,
    fontFamily: 'Poppins_900Black',
    fontSize: 18,
  },
  controlSub: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 16,
  },
  controlList: {
    marginBottom: 12,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ui.colors.border,
  },
  controlLabel: {
    color: colors.text,
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
  },
  controlHint: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    marginTop: 1,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
    backgroundColor: ui.colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 6,
    marginBottom: 6,
  },
  dropdownValue: {
    color: colors.text,
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
    marginTop: 2,
  },
  textInput: {
    backgroundColor: ui.colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
  },
  publicLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  publicLinkText: {
    flex: 1,
    minWidth: 0,
    color: colors.muted,
    backgroundColor: ui.colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
  copyLinkAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  copyLinkText: {
    color: colors.teal,
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  actionBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  blockTitle: {
    color: colors.muted,
    fontFamily: 'Poppins_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  primaryAction: {
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.teal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.teal,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryActionText: {
    color: ui.colors.surface,
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
  },
  outlineAction: {
    height: 44,
    borderRadius: 13,
    backgroundColor: ui.colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  outlineActionText: {
    color: colors.teal,
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
  },
  summaryBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  summaryValue: {
    color: colors.text,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
  },
  infoStrip: {
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 118, 110, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 110, 0.12)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: ui.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 110, 0.15)',
  },
  infoText: {
    flex: 1,
    color: colors.teal,
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    lineHeight: 18,
  },
});
