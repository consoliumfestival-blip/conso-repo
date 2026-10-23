import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Download, Smartphone, X } from 'lucide-react-native';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamText } from './TeamText';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
};

export function TeamInstallPrompt() {
  const ui = useTeamUi();
  const { width } = useWindowDimensions();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(!!standalone);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setIsStandalone(true);
      setInstallEvent(null);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (Platform.OS !== 'web' || width >= 1100 || isStandalone || dismissed) return null;

  const handleInstall = async () => {
    if (!installEvent) {
      setHelpOpen((open) => !open);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === 'accepted') setDismissed(true);
    else setDismissed(true);
  };

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 }}>
      <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 11, paddingRight: 6, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 14, backgroundColor: ui.colors.surfaceGlass }}>
        <Smartphone size={16} color={ui.colors.primary} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <TeamText numberOfLines={1} style={{ color: ui.colors.text, fontSize: 11, fontWeight: '700' }}>Install Team Portal</TeamText>
          {helpOpen ? (
            <TeamText style={{ color: ui.colors.textMuted, fontSize: 10, marginTop: 1 }}>Open your browser menu, then choose Install app or Add to Home Screen.</TeamText>
          ) : null}
        </View>
        <Pressable onPress={handleInstall} accessibilityRole="button" accessibilityLabel={installEvent ? 'Install Team Portal' : 'Show installation instructions'}
          style={{ minHeight: 34, minWidth: 58, paddingHorizontal: 10, borderRadius: 10, backgroundColor: ui.colors.navActive, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}>
          {installEvent ? <Download size={13} color={ui.colors.navActiveText} /> : null}
          <TeamText style={{ color: ui.colors.navActiveText, fontSize: 10, fontWeight: '700' }}>{installEvent ? 'Install' : 'How?'}</TeamText>
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} accessibilityRole="button" accessibilityLabel="Dismiss installation prompt" hitSlop={8}
          style={{ width: 32, height: 34, alignItems: 'center', justifyContent: 'center' }}>
          <X size={15} color={ui.colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}
