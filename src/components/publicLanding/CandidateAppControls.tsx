import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Bell, BellOff, ChevronRight, Download, Search, Share2, Smartphone, X } from 'lucide-react-native';
import { usePublicCandidateSearch } from '../../core/hooks/useParticipants';
import {
  CandidatePushStatus,
  detectCandidateAppInstalled,
  disableCandidatePushNotifications,
  enableCandidatePushNotifications,
  getCandidatePushStatus,
  markCandidateAppInstalled,
} from '../../core/utils/candidateWebPush';
import {
  FestivalAccentBar,
  PUBLIC_GLASS_THEME,
  PublicGlassBackdrop,
  webGlassSurface,
  webPrimaryGradient,
} from './PublicGlassBackdrop';

interface CandidateAppBannerProps {
  slug: string;
  candidateName: string;
  tenantId: string;
  festivalId?: string | null;
  isStandalone: boolean;
}

const INSTALL_POPUP_SEEN_KEY = 'conso_candidate_install_prompt_seen_v1';

export function CandidateAppBanner({
  slug,
  candidateName,
  tenantId,
  festivalId,
  isStandalone,
}: CandidateAppBannerProps) {
  const [installEvent, setInstallEvent] = useState<any>(() =>
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? (window as any).__candidatePortalInstallEvent || null
      : null,
  );
  const [isAppInstalled, setIsAppInstalled] = useState(isStandalone);
  const [showInstallPopup, setShowInstallPopup] = useState(false);
  const [pushStatus, setPushStatus] = useState<CandidatePushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    let active = true;
    detectCandidateAppInstalled().then((installed) => {
      if (active && installed) {
        setIsAppInstalled(true);
        setShowInstallPopup(false);
      }
    });
    const onInstallReady = () => {
      setInstallEvent((window as any).__candidatePortalInstallEvent || null);
    };
    const onAppInstalled = () => {
      markCandidateAppInstalled();
      setIsAppInstalled(true);
      setInstallEvent(null);
      setShowInstallPopup(false);
    };
    window.addEventListener('candidateportalinstallavailable', onInstallReady);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      active = false;
      window.removeEventListener('candidateportalinstallavailable', onInstallReady);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || isStandalone || isAppInstalled) {
      return undefined;
    }
    try {
      if (window.sessionStorage.getItem(INSTALL_POPUP_SEEN_KEY) === '1') return undefined;
    } catch {}
    const timer = setTimeout(() => {
      try {
        window.sessionStorage.setItem(INSTALL_POPUP_SEEN_KEY, '1');
      } catch {}
      setShowInstallPopup(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [isStandalone, isAppInstalled, slug]);

  useEffect(() => {
    let active = true;
    if (Platform.OS !== 'web') return undefined;
    getCandidatePushStatus(slug).then((status) => {
      if (active) setPushStatus(status);
    });
    return () => {
      active = false;
    };
  }, [slug]);

  if (Platform.OS !== 'web') return null;

  const isIos =
    typeof navigator !== 'undefined'
    && (/iphone|ipad|ipod/i.test(navigator.userAgent || '')
      || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1));

  const triggerNativeInstall = async () => {
    if (installEvent && typeof installEvent.prompt === 'function') {
      try {
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          markCandidateAppInstalled();
          (window as any).__candidatePortalInstallEvent = null;
          setInstallEvent(null);
          setIsAppInstalled(true);
          setShowInstallPopup(false);
          setStatusMessage('Candidate app installation started.');
        }
      } catch {
        setShowInstallPopup(true);
      }
      return true;
    }
    return false;
  };

  const handleInstallButtonPress = async () => {
    const triggered = await triggerNativeInstall();
    if (!triggered) {
      setShowInstallPopup(true);
    }
  };

  const handlePopupInstallAction = async () => {
    const triggered = await triggerNativeInstall();
    if (!triggered) {
      setShowInstallPopup(false);
    }
  };

  const handlePushToggle = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setStatusMessage(null);
    try {
      if (pushStatus?.subscribed) {
        await disableCandidatePushNotifications();
        const refreshed = await getCandidatePushStatus(slug);
        setPushStatus(refreshed);
        setStatusMessage('Result alerts turned off.');
      } else {
        const res = await enableCandidatePushNotifications({
          slug,
          name: candidateName,
          tenantId,
          festivalId,
        });
        const refreshed = await getCandidatePushStatus(slug);
        setPushStatus(refreshed);
        if (res.ok) {
          setStatusMessage('Result alerts enabled for this candidate.');
        } else if (res.error) {
          setStatusMessage(res.error);
        }
      }
    } finally {
      setPushBusy(false);
    }
  };

  const canDirectInstall = Boolean(installEvent && typeof installEvent.prompt === 'function' && !isIos);

  return (
    <View style={styles.actionsWrap}>
      <View style={styles.bannerRow}>
        {!isStandalone && !isAppInstalled ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void handleInstallButtonPress()}
            style={[styles.installButton, webPrimaryGradient]}
          >
            <Download size={15} color="#FFFFFF" />
            <Text style={styles.installButtonText}>Install App</Text>
          </TouchableOpacity>
        ) : null}

        {pushStatus?.supported !== false ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={pushBusy}
            onPress={() => void handlePushToggle()}
            style={[
              styles.notifyButton,
              webGlassSurface(12),
              pushStatus?.subscribed && styles.notifyButtonActive,
            ]}
          >
            {pushBusy ? (
              <ActivityIndicator size="small" color={PUBLIC_GLASS_THEME.blueText} />
            ) : pushStatus?.subscribed ? (
              <Bell size={15} color={PUBLIC_GLASS_THEME.greenText} />
            ) : (
              <BellOff size={15} color={PUBLIC_GLASS_THEME.blueText} />
            )}
            <Text
              style={[
                styles.notifyButtonText,
                pushStatus?.subscribed && styles.notifyButtonTextActive,
              ]}
            >
              {pushStatus?.subscribed ? 'Alerts Active' : 'Enable Alerts'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}

      <Modal
        visible={showInstallPopup && !isStandalone && !isAppInstalled}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInstallPopup(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowInstallPopup(false)}>
          <Pressable style={[styles.modalCard, webGlassSurface(20)]} onPress={(e) => e.stopPropagation?.()}>
            <FestivalAccentBar height={5} />
            <TouchableOpacity
              accessibilityLabel="Close install popup"
              accessibilityRole="button"
              onPress={() => setShowInstallPopup(false)}
              style={styles.modalCloseBtn}
            >
              <X size={16} color={PUBLIC_GLASS_THEME.inkMuted} />
            </TouchableOpacity>

            <View style={styles.modalBody}>
              <View style={styles.modalBadge}>
                {isIos ? (
                  <Share2 size={14} color={PUBLIC_GLASS_THEME.blueText} />
                ) : (
                  <Smartphone size={14} color={PUBLIC_GLASS_THEME.blueText} />
                )}
                <Text style={styles.modalBadgeText}>Candidate Web App</Text>
              </View>

              <Text style={styles.modalTitle}>Install {candidateName}</Text>
              <Text style={styles.modalSubtitle}>
                {canDirectInstall
                  ? 'Install this candidate profile directly as an app for instant access and live result alerts.'
                  : isIos
                    ? 'Add this candidate profile to your iPhone or iPad Home Screen in 2 quick steps:'
                    : 'Install this candidate profile as an app from your browser to get quick access and alerts:'}
              </Text>

              {!canDirectInstall ? (
                <View style={styles.stepsBox}>
                  {isIos ? (
                    <>
                      <Text style={styles.stepLine}>1. Tap the Share button at the bottom of Safari.</Text>
                      <Text style={styles.stepLine}>2. Scroll down and tap "Add to Home Screen".</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.stepLine}>1. Open the browser menu (⋮) in the top corner.</Text>
                      <Text style={styles.stepLine}>2. Tap "Install App" or "Add to Home Screen".</Text>
                    </>
                  )}
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setShowInstallPopup(false)}
                  style={styles.modalSecondaryBtn}
                >
                  <Text style={styles.modalSecondaryText}>Not now</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => void handlePopupInstallAction()}
                  style={[styles.modalPrimaryBtn, webPrimaryGradient]}
                >
                  <Download size={15} color="#FFFFFF" />
                  <Text style={styles.modalPrimaryText}>
                    {canDirectInstall ? 'Install App' : 'Got it'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

interface CandidateStandaloneLoginProps {
  tenantId: string;
  festivalId?: string | null;
  onSelectCandidate: (slug: string, name: string) => void;
}

export function CandidateStandaloneLogin({
  tenantId,
  festivalId,
  onSelectCandidate,
}: CandidateStandaloneLoginProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 280);
    return () => clearTimeout(timer);
  }, [query]);

  const search = usePublicCandidateSearch(tenantId, festivalId, debounced.toLowerCase(), true);
  const candidates = search.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <PublicGlassBackdrop>
      <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.loginContainer}>
          <View style={[styles.brandPill, webGlassSurface(16)]}>
            <Image
              source={require('@/assets/images/consolium-crest.png')}
              resizeMode="contain"
              accessibilityLabel="Consolium logo"
              style={styles.brandLogo}
            />
            <Text style={styles.brandLabel}>CONSOULIUM 2K26</Text>
          </View>

          <View style={[styles.loginCard, webGlassSurface(18)]}>
            <FestivalAccentBar height={4} />
            <View style={styles.loginCardBody}>
              <Text style={styles.loginTitle}>Sign in with Chest Number</Text>
              <Text style={styles.loginSubtitle}>
                Enter your chest number or name to open and lock your candidate profile in this app.
              </Text>

              <View style={[styles.searchBox, focused && styles.searchBoxFocused]}>
                <View style={styles.searchIconChip}>
                  <Search size={17} color={PUBLIC_GLASS_THEME.blueText} />
                </View>
                <TextInput
                  accessibilityLabel="Enter chest number or candidate name"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onBlur={() => setFocused(false)}
                  onChangeText={setQuery}
                  onFocus={() => setFocused(true)}
                  placeholder="Chest number or name"
                  placeholderTextColor="#64748B"
                  style={styles.searchInput}
                  value={query}
                />
                {query.length > 0 ? (
                  <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
                    <X size={15} color={PUBLIC_GLASS_THEME.ink} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {debounced.length === 0 ? (
                <Text style={styles.hintText}>Type a chest number (e.g. 105) or candidate name.</Text>
              ) : search.isPending ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={PUBLIC_GLASS_THEME.blue} />
                  <Text style={styles.hintText}>Finding candidate…</Text>
                </View>
              ) : candidates.length === 0 ? (
                <Text style={styles.hintText}>No matching candidate found.</Text>
              ) : (
                <View style={styles.resultList}>
                  {candidates.slice(0, 12).map((item) => (
                    <TouchableOpacity
                      key={item.slug}
                      onPress={() => onSelectCandidate(item.slug, item.name)}
                      style={styles.resultItem}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.resultMeta}>
                          {[
                            item.chest_number ? `Chest ${item.chest_number}` : null,
                            item.category_code || null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={PUBLIC_GLASS_THEME.ink} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </PublicGlassBackdrop>
  );
}

const styles = StyleSheet.create({
  actionsWrap: {
    marginTop: 12,
    gap: 6,
  },
  bannerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  installButton: {
    height: 38,
    borderRadius: 999,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: PUBLIC_GLASS_THEME.ink,
  },
  installButtonText: {
    fontFamily: 'Outfit_700Bold',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  notifyButton: {
    height: 38,
    borderRadius: 999,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: PUBLIC_GLASS_THEME.blueSoft,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.blueBorder,
  },
  notifyButtonActive: {
    backgroundColor: PUBLIC_GLASS_THEME.greenSoft,
    borderColor: PUBLIC_GLASS_THEME.greenBorder,
  },
  notifyButtonText: {
    fontFamily: 'Outfit_700Bold',
    color: PUBLIC_GLASS_THEME.blueText,
    fontSize: 13,
    fontWeight: '700',
  },
  notifyButtonTextActive: {
    color: PUBLIC_GLASS_THEME.greenText,
  },
  statusText: {
    fontFamily: 'Outfit_400Regular',
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 12, 28, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    ...(Platform.OS === 'web'
      ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any
      : {}),
  },
  modalCard: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorderStrong,
    overflow: 'hidden',
    position: 'relative',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: PUBLIC_GLASS_THEME.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  modalBody: {
    padding: 22,
    paddingTop: 22,
    alignItems: 'center',
    gap: 10,
  },
  modalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: PUBLIC_GLASS_THEME.blueSoft,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.blueBorder,
  },
  modalBadgeText: {
    fontFamily: 'Outfit_700Bold',
    color: PUBLIC_GLASS_THEME.blueText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontFamily: 'Outfit_700Bold',
    color: PUBLIC_GLASS_THEME.ink,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  modalSubtitle: {
    fontFamily: 'Outfit_400Regular',
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  stepsBox: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: PUBLIC_GLASS_THEME.surfaceSubtle,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorder,
    padding: 12,
    gap: 6,
    marginTop: 2,
  },
  stepLine: {
    fontFamily: 'Outfit_500Medium',
    color: PUBLIC_GLASS_THEME.ink,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
  },
  modalSecondaryBtn: {
    height: 42,
    borderRadius: 999,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PUBLIC_GLASS_THEME.surfaceSubtle,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorder,
  },
  modalSecondaryText: {
    fontFamily: 'Outfit_600SemiBold',
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 13.5,
    fontWeight: '600',
  },
  modalPrimaryBtn: {
    height: 42,
    borderRadius: 999,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: PUBLIC_GLASS_THEME.ink,
  },
  modalPrimaryText: {
    fontFamily: 'Outfit_700Bold',
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  loginScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 18,
  },
  loginContainer: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    gap: 16,
  },
  brandPill: {
    alignSelf: 'center',
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorderStrong,
    backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: { width: 22, height: 22 },
  brandLabel: { fontFamily: 'Outfit_700Bold', color: PUBLIC_GLASS_THEME.ink, fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  loginCard: {
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.blueBorder,
    backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong,
  },
  loginCardBody: {
    padding: 20,
    gap: 12,
  },
  loginTitle: {
    fontFamily: 'Outfit_700Bold',
    color: PUBLIC_GLASS_THEME.ink,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  loginSubtitle: {
    fontFamily: 'Outfit_400Regular',
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 13.5,
    lineHeight: 20,
  },
  searchBox: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: PUBLIC_GLASS_THEME.blueBorder,
    backgroundColor: PUBLIC_GLASS_THEME.blueSoft,
  },
  searchBoxFocused: {
    borderColor: PUBLIC_GLASS_THEME.blue,
  },
  searchIconChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    fontFamily: 'Outfit_400Regular',
    flex: 1,
    minHeight: 44,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as any,
    color: PUBLIC_GLASS_THEME.ink,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    fontFamily: 'Outfit_400Regular',
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  resultList: {
    gap: 8,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorder,
    backgroundColor: PUBLIC_GLASS_THEME.surfaceSubtle,
  },
  resultName: {
    fontFamily: 'Outfit_700Bold',
    color: PUBLIC_GLASS_THEME.ink,
    fontSize: 14.5,
    fontWeight: '700',
  },
  resultMeta: {
    fontFamily: 'Outfit_400Regular',
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
