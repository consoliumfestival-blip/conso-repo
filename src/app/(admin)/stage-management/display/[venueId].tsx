import { SsfButton } from '@/components/ui/SsfButton';
import { SsfCard } from '@/components/ui/SsfCard';
import { useGoBack } from '@/core/hooks/useGoBack';
import { getCurrentOriginAppUrl } from '@/core/utils/appUrls';
import { scheduleTopicDrawService, type StageTopicDisplayState } from '@/services/scheduleTopicDrawService';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import QRCode from 'react-native-qrcode-svg';
import React from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Share, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

export default function StageTopicDisplayAdmin() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const id = Array.isArray(venueId) ? venueId[0] : venueId;
  const goBack = useGoBack('/stage-management');
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState('');
  const queryKey = ['admin-stage-topic-display', id];
  const query = useQuery<StageTopicDisplayState>({
    queryKey,
    queryFn: () => scheduleTopicDrawService.getStageDisplayState(id!),
    enabled: !!id,
  });
  const state = query.data;
  const displayUrl = state?.display_token
    ? getCurrentOriginAppUrl(`/stage-topic-display/${state.display_token}`)
    : null;

  const updatePause = async () => {
    if (!id || !state || busy) return;
    setBusy(true);
    setActionError('');
    try {
      const next = await scheduleTopicDrawService.setStageDisplayPaused(id, !state.paused, state.version);
      queryClient.setQueryData(queryKey, next);
    } catch (error: any) {
      setActionError(error?.message || 'Could not update the display.');
      await query.refetch();
    } finally {
      setBusy(false);
    }
  };
  const copyLink = async () => {
    if (!displayUrl) return;
    try {
      if (Platform.OS === 'web' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(displayUrl);
      } else {
        await Share.share({ message: displayUrl, url: displayUrl });
      }
    } catch (error: any) {
      Alert.alert('Unable to share', error?.message || 'Please copy the display link.');
    }
  };
  const openLink = () => {
    if (!displayUrl) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(displayUrl, '_blank', 'noopener,noreferrer');
    } else {
      void Linking.openURL(displayUrl);
    }
  };

  return (
    <ScrollView className="flex-1 bg-ssf-bg" contentContainerStyle={{ alignItems: 'center', padding: 16, paddingBottom: 32 }}>
      <View style={{ width: '100%', maxWidth: 650, gap: 12 }}>
        <TouchableOpacity accessibilityRole="button" onPress={goBack} className="self-start rounded-lg border border-ui-border bg-core-surface-white px-3 py-2">
          <Text className="font-poppins-bold text-xs text-ui-text">Back to Stage Management</Text>
        </TouchableOpacity>
        <View>
          <Text className="font-poppins-bold text-xl text-ui-text">Stage topic display</Text>
          <Text className="font-poppins text-xs text-ui-text-muted">One link and QR for this stage. Show Next is controlled from Stage Management.</Text>
        </View>
        {query.isPending ? <ActivityIndicator /> : query.isError ? (
          <SsfCard className="gap-2 p-4">
            <Text className="font-poppins-bold text-sm text-ui-text">Unable to load the display link</Text>
            <Text className="font-poppins text-xs text-ui-text-muted">{(query.error as Error)?.message}</Text>
            <SsfButton label="Retry" onPress={() => { void query.refetch(); }} />
          </SsfCard>
        ) : state && displayUrl ? (
          <SsfCard className="gap-3 p-4">
            <Text className="font-poppins-bold text-base text-ui-text">{state.venue_name}</Text>
            <Text className="font-poppins text-xs text-ui-text-muted">
              {state.paused ? 'Display paused: the audience screen is blank.' : state.on_screen
                ? `On screen: ${state.on_screen.item_name} · ${state.on_screen.code_letter}`
                : 'Waiting for Show Next.'}
            </Text>
            <View className="items-center rounded-lg bg-white p-3">
              <QRCode value={displayUrl} size={Math.min(210, Math.max(130, width - 80))} />
            </View>
            <Text selectable className="font-poppins text-xs text-ui-text-muted">{displayUrl}</Text>
            <View className="flex-row flex-wrap gap-2">
              <SsfButton label="Copy link" onPress={() => { void copyLink(); }} />
              <SsfButton label="Open display" onPress={openLink} />
              <SsfButton label={state.paused ? 'Resume display' : 'Pause display'} onPress={() => { void updatePause(); }} isLoading={busy} />
            </View>
            {actionError ? <Text className="font-poppins text-xs text-core-danger-red-700">{actionError}</Text> : null}
            <Text className="font-poppins text-xs text-ui-text-muted">Ready next: {state.ready.length}. The stage link stays the same when events change.</Text>
          </SsfCard>
        ) : <Text className="font-poppins text-sm text-ui-text-muted">
          {state ? 'A public web origin is required to create a scannable stage link.' : 'Stage display unavailable.'}
        </Text>}
      </View>
    </ScrollView>
  );
}
