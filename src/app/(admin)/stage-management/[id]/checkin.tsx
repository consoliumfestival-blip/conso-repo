import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { findParticipantQrEntry } from '../../../../core/utils/checkInIdentity';
import { GroupEntryRoster } from '../../../../components/stage/GroupEntryRoster';
import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useStageManagement } from '../../../../core/hooks/useStageManagement';
import { useAuthStore } from '../../../../core/store/authStore';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Camera,
  Search,
  QrCode,
  Users,
  ShieldCheck,
  Lock,
} from 'lucide-react-native';

export default function CheckIn() {
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();

  const stage = useStageManagement({ scheduleId });
  const schedules = stage.schedules;
  const schedule = schedules.find((s: any) => s.id === scheduleId);
  const registrations = stage.registrations;
  const isLoadingSchedules = stage.contextQuery.isLoading || stage.schedulesQuery.isLoading;
  const isLoadingRegs = stage.registrationsQuery.isLoading;
  const refetch = stage.registrationsQuery.refetch;

  const { role, is_superadmin } = useAuthStore();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [verifyModal, setVerifyModal] = useState<{
    reg: any;
    visible: boolean;
  }>({ reg: null, visible: false });

  const handleUnlock = async () => {
    setIsUpdating(true);
    try {
      await stage.updateScheduleLock({ scheduleId, locked: false });
      refetch();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert('Error unlocking event: ' + e.message);
      else Alert.alert('Error', e.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // Web QR scanner state
  const videoRef = useRef<any>(null);
  const [scannerError, setScannerError] = useState('');

  // Starts web camera for QR scanning
  const startWebScanner = async () => {
    setScannerError('');
    setIsScannerOpen(true);
    if (Platform.OS === 'web') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          startWebQRDecoding(stream);
        }
      } catch (err: any) {
        const isSecurityError = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
        setScannerError(
          isSecurityError
            ? '📷 Camera permission denied.\n\nFix: Click the 🔒 lock icon in your browser address bar → Camera → Allow → Refresh the page.'
            : '📷 Camera not available. Please check if another app is using the camera.'
        );
      }
    }
  };

  const stopWebScanner = () => {
    if (Platform.OS === 'web' && videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t: MediaStreamTrack) => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsScannerOpen(false);
  };

  // Web-based QR decoding using BarcodeDetector API (Chrome) or fallback manual
  const startWebQRDecoding = (stream: MediaStream) => {
    if (Platform.OS !== 'web') return;
    const BarcodeDetector = (window as any).BarcodeDetector;
    if (!BarcodeDetector) {
      setScannerError('QR scanning not supported in this browser. Use Chrome on Android/Desktop.');
      return;
    }
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const scan = async () => {
      if (!videoRef.current || !videoRef.current.srcObject) return;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx?.drawImage(videoRef.current, 0, 0);
      try {
        const codes = await detector.detect(canvas);
        if (codes.length > 0) {
          handleQRResult(codes[0].rawValue);
          return; // Stop after first scan
        }
      } catch {}
      requestAnimationFrame(scan);
    };
    videoRef.current?.addEventListener('playing', () => requestAnimationFrame(scan));
  };

  const handleQRResult = (rawValue: string) => {
    stopWebScanner();
    try {
      let parsed: { chest?: string; pid?: string; cat?: string } = {};
      
      // Try parsing as URL first (New Format)
      try {
        const url = new URL(rawValue);
        if (url.pathname.includes('/candidate/')) {
           const pid = url.pathname.split('/').pop();
           const chest = url.searchParams.get('chest');
           const cat = url.searchParams.get('cat');
           if (pid) parsed = { pid, chest: chest || undefined, cat: cat || undefined };
        } else {
           parsed = JSON.parse(rawValue);
        }
      } catch {
        // Fallback to JSON (Old Format)
        parsed = JSON.parse(rawValue);
      }

      const chest = parsed.chest || parsed.pid;
      const reg = findParticipantQrEntry(registrations ?? [], parsed);
      if (reg) {
        handleVerify(reg.id);
      } else {
        Alert.alert('Not Found', `No participant with chest number "${chest}" registered for this event.`);
      }
    } catch {
      Alert.alert('Invalid QR', 'Could not read the chest card QR code.');
    }
  };

  const handleVerify = async (regId: string) => {
    setIsUpdating(true);
    try {
      await stage.updateRegistration({ scheduleId, registrationId: regId, action: 'verify' });
      setVerifyModal({ reg: null, visible: false });
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to verify participant');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUnverify = async (regId: string) => {
    setIsUpdating(true);
    try {
      await stage.updateRegistration({ scheduleId, registrationId: regId, action: 'unverify' });
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to unverify participant');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReject = async (regId: string) => {
    setIsUpdating(true);
    try {
      await stage.updateRegistration({ scheduleId, registrationId: regId, action: 'reject' });
      setVerifyModal({ reg: null, visible: false });
      refetch();
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert('Error: ' + error.message);
      else Alert.alert('Error', error.message || 'Failed to reject participant');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRestore = async (regId: string) => {
    setIsUpdating(true);
    try {
      await stage.updateRegistration({ scheduleId, registrationId: regId, action: 'restore' });
      refetch();
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert('Error: ' + error.message);
      else Alert.alert('Error', error.message || 'Failed to restore participant');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRejectAllUnverified = async () => {
    const unverifiedRegs = activeRegistrations.filter((r: any) => !r.is_verified);
    if (unverifiedRegs.length === 0) return;

    const msg = `Are you sure you want to reject all ${unverifiedRegs.length} unverified participants? This will exclude them from the draw.`;
    const action = async () => {
      setIsUpdating(true);
      try {
        await Promise.all(
          unverifiedRegs.map((r: any) =>
            stage.updateRegistration({ scheduleId, registrationId: r.id, action: 'reject' })
          )
        );
        refetch();
      } catch (error: any) {
        if (Platform.OS === 'web') window.alert('Error: ' + error.message);
        else Alert.alert('Error', error.message || 'Failed to reject participants');
      } finally {
        setIsUpdating(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) action();
    } else {
      Alert.alert('Confirm Bulk Reject', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject All', style: 'destructive', onPress: action }
      ]);
    }
  };

  const filteredRegs = registrations?.filter(
    (r: any) => {
      if (!searchQuery || searchQuery.trim() === '') return true;
      const nameMatch = r.participants?.name ? r.participants.name.toLowerCase().includes(searchQuery.toLowerCase()) : false;
      const chestMatch = r.participants?.chest_number ? String(r.participants.chest_number).toLowerCase().includes(searchQuery.toLowerCase()) : false;
      return nameMatch || chestMatch;
    }
  );

  const activeRegistrations = useMemo(() => {
    return registrations?.filter((r: any) => r.status !== 'rejected') || [];
  }, [registrations]);

  const verifiedCount = activeRegistrations.filter((r: any) => r.is_verified).length || 0;
  const totalCount = activeRegistrations.length || 0;
  const allVerified = totalCount > 0 && verifiedCount === totalCount;

  if (isLoadingSchedules || isLoadingRegs) {
    return <ActivityIndicator color={coreColor("#1B6B3A", 'primaryText')} style={{ marginTop: 40 }} />;
  }

  const goBackSafely = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/stage-management');
    }
  };

  const isShuffleLocked = schedule?.is_shuffle_locked;

  if (!schedule) {
    return (
      <View className="flex-1 bg-ssf-bg justify-center items-center p-6">
        <Text className="font-poppins text-ssf-text">Schedule not found.</Text>
        <SsfButton label="Go Back" onPress={goBackSafely} className="mt-4" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-ssf-bg">
      {isMobile ? (
      <ScrollView className="flex-1 px-3 py-3" keyboardShouldPersistTaps="handled">
        <View className="mb-3 flex-row items-center gap-2">
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Stage Management" onPress={goBackSafely} className="h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ui-border bg-core-surface-white">
            <ArrowLeft size={19} color={coreColor("#0F172A", 'overlay')} />
          </TouchableOpacity>
          <View className="min-w-0 flex-1">
            <Text className="font-poppins-black text-sm text-ssf-text" numberOfLines={1}>{width < 360 ? 'Check-In' : 'Green Room Check-In'}</Text>
            <Text className="font-poppins text-xs text-ssf-text-muted" numberOfLines={1}>{schedule.items?.item_name_en}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={() => Alert.alert('Debug', `Total raw registrations fetched: ${registrations?.length || 0}`)} className="h-11 items-center justify-center rounded-lg border border-ui-border bg-core-surface-white px-3">
            <Text className="font-poppins-bold text-[10px] text-ui-text-muted">Debug</Text>
          </TouchableOpacity>
        </View>

        {isShuffleLocked && (
          <View className="mb-3 rounded-xl border border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50 p-3">
            <View className="flex-row items-start gap-2">
              <Lock size={17} color={coreColor("#B45309", 'warning')} />
              <Text className="flex-1 font-poppins-bold text-xs leading-5 text-core-warning-amber-800">Event is locked. Check-in is now read-only.</Text>
            </View>
            {(role === 'admin' || is_superadmin) && (
              <TouchableOpacity accessibilityRole="button" onPress={handleUnlock} disabled={isUpdating} className={`mt-2 h-11 items-center justify-center rounded-lg bg-core-warning-action-amber-600 px-4 ${isUpdating ? 'opacity-60' : ''}`}>
                <Text className="font-poppins-bold text-xs text-core-on-primary-white">{isUpdating ? 'Unlocking…' : 'Unlock event'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <SsfCard className="mb-3 p-3">
          <View className="mb-2 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2"><Users size={17} color={coreColor("#1B6B3A", 'primaryText')} /><Text className="font-poppins-bold text-sm text-ssf-text">Verified</Text></View>
            <Text className="font-poppins-black text-lg text-ui-primary-text">{verifiedCount}<Text className="text-xs text-ssf-text-muted"> / {totalCount}</Text></Text>
          </View>
          <View className="h-2 w-full overflow-hidden rounded-full bg-core-surface-muted-gray-100">
            <View className="h-2 rounded-full bg-ssf-primary" style={{ width: totalCount > 0 ? `${(verifiedCount / totalCount) * 100}%` : '0%' }} />
          </View>
          {allVerified ? (
            <View className="mt-3 rounded-lg border border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50 p-2.5">
              <View className="flex-row items-center gap-2"><ShieldCheck size={17} color={coreColor("#16A34A", 'success')} /><Text className="flex-1 font-poppins-bold text-xs text-core-success-green-800">All participants verified</Text></View>
              <TouchableOpacity accessibilityRole="button" onPress={() => router.push(`/stage-management/${scheduleId}/code-letter` as any)} className="mt-2 h-11 flex-row items-center justify-center rounded-lg bg-ssf-primary px-3">
                <Text className="font-poppins-bold text-xs text-core-on-primary-white">Start Draw →</Text>
              </TouchableOpacity>
            </View>
          ) : totalCount > 0 ? (
            <View className="mt-3 gap-2">
              <Text className="font-poppins-bold text-xs text-core-warning-amber-700">{totalCount - verifiedCount} participants remaining unverified.</Text>
              {!isShuffleLocked ? (
                <TouchableOpacity accessibilityRole="button" onPress={handleRejectAllUnverified} disabled={isUpdating} className={`h-11 items-center justify-center rounded-lg border border-core-danger-soft-red-200 bg-core-danger-soft-red-50 px-3 ${isUpdating ? 'opacity-60' : ''}`}>
                  <Text className="font-poppins-bold text-xs text-core-danger-red-700">Reject unverified participants</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </SsfCard>

        {!isShuffleLocked ? (
          <TouchableOpacity accessibilityRole="button" onPress={startWebScanner} className="mb-3 h-11 flex-row items-center justify-center gap-2 rounded-xl border border-core-success-soft-emerald-200 bg-core-surface-white px-3">
            <QrCode size={18} color={coreColor("#0F766E", 'primaryText')} />
            <Text className="font-poppins-bold text-xs text-core-success-emerald-700">Scan chest card QR</Text>
          </TouchableOpacity>
        ) : null}

        <View className="mb-2 h-10 flex-row items-center rounded-lg border border-ssf-border bg-core-surface-white px-3">
          <Search size={16} color={coreColor("#9CA3AF", 'textMuted')} />
          <TextInput
            accessibilityLabel="Search participants by name or chest number"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search name or chest number"
            className="ml-2 h-full min-w-0 flex-1 font-poppins text-sm text-ssf-text"
            returnKeyType="search"
          />
          {searchQuery ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchQuery('')} className="h-9 w-9 items-center justify-center"><XCircle size={16} color={coreColor("#94A3B8", 'textSubtle')} /></TouchableOpacity> : null}
        </View>

        <View className="mb-2 flex-row items-center justify-between px-1">
          <Text className="font-poppins-bold text-sm text-ssf-text">Participants</Text>
          <Text className="font-poppins text-xs text-ssf-text-muted">{filteredRegs?.length || 0} shown</Text>
        </View>

        {!filteredRegs || filteredRegs.length === 0 ? (
          <SsfCard className="mb-6 items-center py-8">
            <Users size={28} color={coreColor("#94A3B8", 'textSubtle')} />
            <Text className="mt-2 text-center font-poppins text-sm text-ssf-text-muted">No participants found.</Text>
          </SsfCard>
        ) : (
          <View className="gap-y-2 pb-6">
            {filteredRegs.map((reg: any) => {
              const isRejected = reg.status === 'rejected';
              const verified = !!reg.is_verified;
              const badge = isRejected
                ? 'border-core-danger-soft-red-200 bg-core-danger-soft-red-50 text-core-danger-red-700'
                : verified ? 'border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50 text-core-success-emerald-700' : 'border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50 text-core-warning-amber-800';
              return (
                <SsfCard key={reg.id} className={`p-3 ${isRejected ? 'opacity-70' : ''}`}>
                  <View className="flex-row items-start gap-3">
                    <View className={`h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 ${isRejected ? 'border-core-danger-soft-red-300 bg-core-danger-soft-red-50' : verified ? 'border-core-success-soft-emerald-300 bg-core-success-soft-emerald-50' : 'border-core-border-slate-200 bg-core-surface-muted-slate-50'}`}>
                      <Text className={`font-poppins-black text-[10px] ${isRejected ? 'text-core-danger-red-700' : verified ? 'text-core-success-emerald-700' : 'text-core-text-slate-600'}`}>{reg.participants?.chest_number || '?'}</Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={2} className={`font-poppins-bold text-sm ${isRejected ? 'text-core-text-muted-slate-500 line-through' : 'text-ssf-text'}`}>{reg.participants?.name || 'Participant'}</Text>
                      <Text numberOfLines={1} className="mt-0.5 font-poppins text-xs text-ssf-text-muted">{reg.participants?.category_code || '—'} · Chest {reg.participants?.chest_number || '—'}</Text>
                        <GroupEntryRoster entry={reg} />
                      {reg.participants?.organisations?.name ? <Text numberOfLines={1} className="mt-1 font-poppins text-[11px] text-core-info-blue-700">{reg.participants.organisations.name}</Text> : null}
                    </View>
                    <View className={`min-h-7 shrink-0 items-center justify-center rounded-full border px-2 ${badge.split(' ').slice(0, 2).join(' ')}`}>
                      <Text className={`font-poppins-bold text-[9px] ${badge.split(' ')[2]}`}>{isRejected ? 'Rejected' : verified ? 'Verified' : 'Pending'}</Text>
                    </View>
                  </View>
                  {!isShuffleLocked ? (
                    isRejected ? (
                      <TouchableOpacity accessibilityRole="button" onPress={() => handleRestore(reg.id)} disabled={isUpdating} className={`mt-3 h-11 items-center justify-center rounded-lg border border-core-border-slate-200 bg-core-surface-muted-slate-50 ${isUpdating ? 'opacity-60' : ''}`}>
                        <Text className="font-poppins-bold text-xs text-core-text-slate-700">Restore participant</Text>
                      </TouchableOpacity>
                    ) : verified ? (
                      <TouchableOpacity accessibilityRole="button" onPress={() => handleUnverify(reg.id)} disabled={isUpdating} className={`mt-3 h-11 flex-row items-center justify-center gap-2 rounded-lg border border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50 ${isUpdating ? 'opacity-60' : ''}`}>
                        <CheckCircle2 size={16} color={coreColor("#16A34A", 'success')} /><Text className="font-poppins-bold text-xs text-core-success-emerald-800">Undo verification</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity accessibilityRole="button" onPress={() => setVerifyModal({ reg, visible: true })} disabled={isUpdating} className={`mt-3 h-11 flex-row items-center justify-center gap-2 rounded-lg bg-ssf-primary ${isUpdating ? 'opacity-60' : ''}`}>
                        <Camera size={16} color={coreColor("#FFFFFF", 'onPrimary')} /><Text className="font-poppins-bold text-xs text-core-on-primary-white">{reg.entry_kind === 'general_team' ? 'Verify group' : 'Verify participant'}</Text>
                      </TouchableOpacity>
                    )
                  ) : null}
                </SsfCard>
              );
            })}
          </View>
        )}
      </ScrollView>
      ) : (
      <ScrollView className="flex-1 py-3 px-3">
        {/* Header */}
        <View className="flex-row items-center mb-3">
          <TouchableOpacity onPress={goBackSafely} className="mr-3 h-9 w-9 items-center justify-center rounded-lg border border-ui-border bg-core-surface-white">
            <ArrowLeft size={18} color={coreColor("#0F172A", 'overlay')} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-lg font-poppins-black text-ssf-text">Green Room Check-In</Text>
            <Text className="font-poppins text-[11px] text-ssf-text-muted">{schedule.items?.item_name_en}</Text>
          </View>
          <SsfButton label="Debug" variant="outline" onPress={() => Alert.alert('Debug', `Total raw registrations fetched: ${registrations?.length || 0}`)} size="sm" />
        </View>

        {isShuffleLocked && (
          <View className="bg-core-warning-soft-amber-50 border border-core-warning-soft-amber-200 rounded-xl p-4 mb-4 flex-col gap-y-3">
            <View className="flex-row items-center gap-x-3">
              <Lock size={20} color={coreColor("#B45309", 'warning')} />
              <Text className="font-poppins-bold text-core-warning-amber-700 flex-1">
                Event is locked. Check-in is now read-only.
              </Text>
            </View>
            {(role === 'admin' || is_superadmin) && (
              <SsfButton 
                label={isUpdating ? 'Unlocking...' : 'Unlock Event'} 
                onPress={handleUnlock}
                disabled={isUpdating}
                size="sm"
                className="bg-core-warning-action-amber-600 border-core-warning-amber-600 self-start"
              />
            )}
          </View>
        )}

        {/* Progress Bar */}
        <SsfCard className="mb-3 p-3">
          <View className="flex-row justify-between items-center mb-2">
            <View className="flex-row items-center gap-x-2">
              <Users size={18} color={coreColor("#1B6B3A", 'primaryText')} />
              <Text className="font-poppins-bold text-ssf-text">Verified</Text>
            </View>
            <Text className="font-poppins-bold text-ui-primary-text text-lg">{verifiedCount}/{totalCount}</Text>
          </View>
          <View className="w-full h-2 bg-core-surface-muted-gray-100 rounded-full overflow-hidden">
            <View
              className="h-2 bg-ssf-primary rounded-full"
              style={{ width: totalCount > 0 ? `${(verifiedCount / totalCount) * 100}%` : '0%' }}
            />
          </View>
          {allVerified ? (
            <View className="mt-3 flex-row justify-between items-center">
              <View className="flex-row items-center gap-x-1">
                <ShieldCheck size={16} color={coreColor("#16A34A", 'success')} />
                <Text className="font-poppins-bold text-core-success-green-700 text-sm">All Participants Verified!</Text>
              </View>
              <SsfButton
                label="Start Draw →"
                size="sm"
                onPress={() => router.push(`/stage-management/${scheduleId}/code-letter` as any)}
              />
            </View>
          ) : (
            totalCount > 0 && verifiedCount < totalCount && !isShuffleLocked && (
              <View className="mt-3 flex-row justify-between items-center bg-core-warning-soft-amber-50 border border-core-warning-soft-amber-200 p-2.5 rounded-lg">
                <Text className="font-poppins-bold text-core-warning-amber-700 text-xs">
                  {totalCount - verifiedCount} participants remaining unverified.
                </Text>
                <SsfButton
                  label="Reject Unverified"
                  size="sm"
                  onPress={handleRejectAllUnverified}
                  className="bg-core-danger-action-red-600 border-core-danger-red-600"
                />
              </View>
            )
          )}
        </SsfCard>

        {/* Scan QR Button */}
        {!isShuffleLocked && (
          <TouchableOpacity
            onPress={startWebScanner}
            className="h-11 rounded-lg border border-core-success-soft-emerald-200 bg-core-surface-white mb-3 flex-row justify-center items-center gap-x-2"
          >
            <QrCode size={18} color={coreColor("#0F766E", 'primaryText')} />
            <Text className="font-poppins-bold text-core-success-emerald-700 text-sm">Scan Chest Card QR</Text>
          </TouchableOpacity>
        )}

        {/* Search */}
        <View className="h-10 border border-ssf-border rounded-lg bg-core-surface-white px-3 flex-row items-center mb-3">
          <Search size={16} color={coreColor("#9CA3AF", 'textMuted')} className="mr-2" />
          <input
            style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 14, color: coreColor('#333', 'text'), background: 'transparent' }}
            placeholder="Search by name or chest number..."
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
          />
        </View>

        {/* List */}
        <SsfCard className="mb-6 p-0 overflow-hidden">
          {!filteredRegs || filteredRegs.length === 0 ? (
            <Text className="font-poppins text-ssf-text-muted py-4 text-center">No participants found.</Text>
          ) : (
            <View>
              {filteredRegs.map((reg: any) => {
                const isRejected = reg.status === 'rejected';

                return (
                  <View
                    key={reg.id}
                    className={`min-h-[64px] flex-row items-center justify-between px-3 py-2 border-b border-core-border-gray-100 last:border-0 ${
                      isRejected ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Participant Info */}
                    <View className="flex-row items-center flex-1">
                      {/* Avatar circle */}
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: isRejected ? coreColor('#FEE2E2', 'dangerSoft') : reg.is_verified ? coreColor('#DCFCE7', 'successSoft') : coreColor('#F3F4F6', 'surface'),
                          borderWidth: 2,
                          borderColor: isRejected ? coreColor('#EF4444', 'border') : reg.is_verified ? coreColor('#16A34A', 'border') : coreColor('#D1D5DB', 'border'),
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                        }}
                      >
                        <Text style={{ fontWeight: '900', fontSize: 11, color: isRejected ? coreColor('#EF4444', 'danger') : reg.is_verified ? coreColor('#16A34A', 'success') : coreColor('#6B7280', 'text') }}>
                          {reg.participants?.chest_number || '?'}
                        </Text>
                      </View>
                      <View>
                        <View className="flex-row items-center gap-x-2">
                          <Text className={`font-poppins-bold ${isRejected ? 'text-core-text-muted-slate-400 line-through' : 'text-ssf-text'}`}>
                            {reg.participants?.name}
                          </Text>
                          {isRejected && (
                            <View className="bg-core-danger-soft-red-100 border border-core-danger-soft-red-200 px-1.5 py-0.5 rounded">
                              <Text className="text-[8px] font-poppins-bold text-core-danger-red-600 uppercase">Rejected</Text>
                            </View>
                          )}
                        </View>
                        <Text className="font-poppins text-xs text-ssf-text-muted">
                          {reg.participants?.category_code} · Chest {reg.participants?.chest_number}
                        </Text>
                        <GroupEntryRoster entry={reg} />
                        {reg.participants?.organisations?.name ? (
                          <View className="flex-row items-center mt-0.5">
                            <View className="bg-core-info-soft-blue-50 border border-core-info-soft-blue-100 px-1.5 py-0.5 rounded-full">
                              <Text className="font-poppins-bold text-[10px] text-core-info-blue-700">
                                🏫 {reg.participants.organisations.name}
                              </Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {/* Verify/Restore toggle */}
                    {isRejected ? (
                      <TouchableOpacity
                        disabled={isUpdating || isShuffleLocked}
                        onPress={() => handleRestore(reg.id)}
                        className={`flex-row items-center gap-x-1 px-3 py-1.5 rounded-full border bg-core-surface-muted-slate-50 border-core-border-slate-200 ${isShuffleLocked ? 'opacity-50' : ''}`}
                      >
                        <Text className="font-poppins-bold text-xs text-core-text-slate-600">Restore</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        disabled={isUpdating || isShuffleLocked}
                        onPress={() => {
                          if (reg.is_verified) {
                            handleUnverify(reg.id);
                          } else {
                            // Manual verify — show the photo popup
                            setVerifyModal({ reg, visible: true });
                          }
                        }}
                        className={`flex-row items-center gap-x-1 px-3 py-1.5 rounded-full border ${
                          reg.is_verified
                            ? 'bg-core-success-soft-green-50 border-core-success-soft-green-200'
                            : 'bg-core-surface-muted-gray-50 border-core-border-gray-200'
                        } ${isShuffleLocked ? 'opacity-50' : ''}`}
                      >
                        {reg.is_verified ? (
                          <CheckCircle2 size={16} color={coreColor("#16A34A", 'success')} />
                        ) : (
                          <Camera size={16} color={coreColor("#9CA3AF", 'textMuted')} />
                        )}
                        <Text className={`font-poppins-bold text-xs ${reg.is_verified ? 'text-core-success-green-700' : 'text-core-text-muted-gray-500'}`}>
                          {reg.is_verified ? 'Verified' : 'Verify'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </SsfCard>
      </ScrollView>
      )}

      {/* ───── QR Scanner Modal ───── */}
      {isScannerOpen && (
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: coreAlpha(coreColor('#000000', 'surface'), 0.92), justifyContent: 'center', alignItems: 'center', zIndex: 100,
          }}
        >
          <View style={{ width: '90%', maxWidth: 380, backgroundColor: coreColor('#111', 'surfaceStrong'), borderRadius: 20, overflow: 'hidden' }}>
            {/* Title bar */}
            <View style={{ backgroundColor: coreColor('#1B6B3A', 'primary'), padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: coreColor('#FFF', 'onPrimary'), fontWeight: '900', fontSize: 16 }}>📷 Scan Chest Card</Text>
              <TouchableOpacity onPress={stopWebScanner}>
                <XCircle size={24} color={coreColor("#FFF", 'onPrimary')} />
              </TouchableOpacity>
            </View>

            {/* Camera preview */}
            <View style={{ position: 'relative', height: 320, backgroundColor: coreColor('#000', 'surfaceStrong'), alignItems: 'center', justifyContent: 'center' }}>
              {Platform.OS === 'web' ? (
                // @ts-ignore
                <video
                  ref={videoRef}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  playsInline
                  muted
                />
              ) : (
                <Text style={{ color: coreColor('#FFF', 'onPrimary') }}>Camera not supported on this platform</Text>
              )}
              {/* Scan overlay corners */}
              <View style={{ position: 'absolute', top: 60, left: 60, width: 180, height: 180, pointerEvents: 'none' }}>
                {/* TL */}
                <View style={{ position: 'absolute', top: 0, left: 0, width: 30, height: 4, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                <View style={{ position: 'absolute', top: 0, left: 0, width: 4, height: 30, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                {/* TR */}
                <View style={{ position: 'absolute', top: 0, right: 0, width: 30, height: 4, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                <View style={{ position: 'absolute', top: 0, right: 0, width: 4, height: 30, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                {/* BL */}
                <View style={{ position: 'absolute', bottom: 0, left: 0, width: 30, height: 4, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                <View style={{ position: 'absolute', bottom: 0, left: 0, width: 4, height: 30, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                {/* BR */}
                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 4, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 4, height: 30, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
              </View>
            </View>

            <View style={{ padding: 16, alignItems: 'center' }}>
              {scannerError ? (
                <Text style={{ color: coreColor('#F87171', 'danger'), fontSize: 13, textAlign: 'center' }}>{scannerError}</Text>
              ) : (
                <Text style={{ color: coreColor('#9CA3AF', 'textMuted'), fontSize: 13 }}>Point camera at the chest card QR code</Text>
              )}
            </View>
          </View>
        </View>
      )}

      {/* ───── Verification Popup (Photo shown to coordinator) ───── */}
      {verifyModal.visible && verifyModal.reg && (
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: coreAlpha(coreColor('#000000', 'surface'), 0.75), justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: 20,
          }}
        >
          <ScrollView style={{ backgroundColor: coreColor('#FFF', 'surface'), borderRadius: 20, width: '100%', maxWidth: 360, overflow: 'hidden', maxHeight: '95%', flexGrow: 0 }}>
            {/* Green header */}
            <View style={{ backgroundColor: coreColor('#1B6B3A', 'primary'), padding: 16, alignItems: 'center' }}>
              <Text style={{ color: coreColor('#FFF', 'onPrimary'), fontWeight: '900', fontSize: 18 }}>Identity Verification</Text>
              <Text style={{ color: coreAlpha(coreColor('#ffffff', 'textMuted'), 0.7), fontSize: 12, marginTop: 2 }}>
                {verifyModal.reg.entry_kind === 'general_team' ? 'Confirm this group entry' : 'Confirm this is the right participant'}
              </Text>
            </View>

            <View style={{ padding: 24, alignItems: 'center' }}>
              {/* Large Photo — shown ONLY to coordinator, not printed on card */}
              <View style={{
                width: 120, height: 120, borderRadius: 60, overflow: 'hidden',
                borderWidth: 4, borderColor: coreColor('#1B6B3A', 'border'),
                backgroundColor: coreColor('#F3F4F6', 'surface'), marginBottom: 16,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {verifyModal.reg.entry_kind === 'general_team' ? <Users size={48} color={coreColor("#1B6B3A", 'primaryText')} /> : verifyModal.reg.participants?.photo_url ? (
                  <Image
                    source={{ uri: verifyModal.reg.participants.photo_url }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{ fontSize: 48 }}>👤</Text>
                )}
              </View>

              {/* Name & Details */}
              <Text style={{ fontSize: 22, fontWeight: '900', color: coreColor('#111827', 'text'), marginBottom: 4 }}>
                {verifyModal.reg.participants?.name}
              </Text>
              <View style={{
                backgroundColor: coreColor('#F0FDF4', 'successSoft'), borderWidth: 1, borderColor: coreColor('#BBF7D0', 'border'),
                borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 8,
              }}>
                <Text style={{ color: coreColor('#16A34A', 'success'), fontWeight: '700', fontSize: 16 }}>
                  Chest #{verifyModal.reg.participants?.chest_number}
                </Text>
              </View>
              <Text style={{ color: coreColor('#6B7280', 'text'), fontSize: 13 }}>
                {verifyModal.reg.participants?.category_code}
                {verifyModal.reg.participants?.organisations?.name
                  ? ` · 🏫 ${verifyModal.reg.participants.organisations.name}`
                  : ''}
              </Text>
              <GroupEntryRoster entry={verifyModal.reg} />

              {/* Instruction */}
              <View style={{ backgroundColor: coreColor('#FEF3C7', 'warningSoft'), borderRadius: 10, padding: 12, width: '100%', marginTop: 16, marginBottom: 20 }}>
                <Text style={{ color: coreColor('#92400E', 'warning'), fontSize: 12, textAlign: 'center', fontWeight: '600' }}>
                  {verifyModal.reg.entry_kind === 'general_team' ? 'Confirm the group chest number, program and team. One representative can check in this entry.' : '⚠️ Compare the photo above with the person standing in front of you before approving.'}
                </Text>
              </View>

              {/* Buttons */}
              <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                <TouchableOpacity
                  disabled={isUpdating}
                  onPress={() => handleReject(verifyModal.reg.id)}
                  style={{
                    flex: 1, borderWidth: 2, borderColor: coreColor('#EF4444', 'border'),
                    borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                  }}
                >
                  <XCircle size={18} color={coreColor("#EF4444", 'danger')} />
                  <Text style={{ color: coreColor('#EF4444', 'danger'), fontWeight: '700' }}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={isUpdating}
                  onPress={() => handleVerify(verifyModal.reg.id)}
                  style={{
                    flex: 1, backgroundColor: coreColor('#1B6B3A', 'primary'),
                    borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                  }}
                >
                  <CheckCircle2 size={18} color={coreColor("#FFF", 'onPrimary')} />
                  <Text style={{ color: coreColor('#FFF', 'onPrimary'), fontWeight: '700' }}>
                    {isUpdating ? 'Saving...' : 'Verify'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}
