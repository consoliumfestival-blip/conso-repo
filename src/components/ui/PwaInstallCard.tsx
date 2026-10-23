import React, { useEffect, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { Download, Share } from 'lucide-react-native';
import { ConsoliumLogo } from './ConsoliumLogo';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type Device = 'ios' | 'android' | null;

export function PwaInstallCard({ appName }: { appName: string }) {
  const [device, setDevice] = useState<Device>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const userAgent = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(userAgent)
      || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    setDevice(isIos ? 'ios' : /Android/i.test(userAgent) ? 'android' : null);
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };

  if (!device || installed) return null;

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: '#D8E4E8',
      borderRadius: 14,
      backgroundColor: '#FFFFFF',
    }}>
      <ConsoliumLogo size={42} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: '#12313B', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
          Add {appName} to Home Screen
        </Text>
        {device === 'ios' ? (
          <Text style={{ color: '#52666D', fontSize: 12, lineHeight: 17, marginTop: 3 }}>
            In Safari, tap Share, then “Add to Home Screen”.
          </Text>
        ) : (
          <Text style={{ color: '#52666D', fontSize: 12, lineHeight: 17, marginTop: 3 }}>
            {installPrompt ? 'Install for quick access from your Home Screen.' : 'Open the browser menu and choose “Install app”.'}
          </Text>
        )}
      </View>
      {device === 'ios' ? (
        <Share size={19} color="#0F766E" />
      ) : installPrompt ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => { void install(); }}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, backgroundColor: '#0F766E', paddingHorizontal: 12 }}
        >
          <Download size={15} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Install</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
