import { ui } from '@/constants/designSystem';
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useSchedule } from '../../../../core/hooks/useSchedule';
import { useStageManagement } from '../../../../core/hooks/useStageManagement';
import { stageManagementService } from '../../../../services/stageManagementService';
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
  const [warningModal, setWarningModal] = useState<{ visible: boolean; title: string; message: string; action: (() => void) | null }>({
    visible: false,
    title: '',
    message: '',
    action: null
  });
  const [warningCountdown, setWarningCountdown] = useState(0);

  React.useEffect(() => {
    let timer: any;
    if (warningModal.visible && warningCountdown > 0) {
      timer = setTimeout(() => setWarningCountdown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [warningModal.visible, warningCountdown]);

  const executeWithWarning = (title: string, message: string, action: () => void) => {
    setWarningModal({ visible: true, title, message, action });
    setWarningCountdown(8);
  };
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();

  const { schedules, isLoadingSchedules } = useSchedule();
  const schedule = schedules.find((s: any) => s.id === scheduleId);

  const { registrations, registrationsQuery } = useStageManagement({ scheduleId });
  const {
    isLoading: isLoadingRegs,
    refetch,
  } = registrationsQuery;

  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [verifyModal, setVerifyModal] = useState<{
    reg: any;
    visible: boolean;
  }>({ reg: null, visible: false });

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
      } catch (_) {}
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
      } catch (e) {
        // Fallback to JSON (Old Format)
        parsed = JSON.parse(rawValue);
      }

      const chest = parsed.chest || parsed.pid;
      const reg = registrations?.find(
        (r: any) =>
          r.participants?.chest_number === parsed.chest ||
          r.participants?.id === parsed.pid
      );
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
      await stageManagementService.updateRegistration(scheduleId!, regId, 'verify');
      setVerifyModal({ reg: null, visible: false });
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to verify participant');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUnverify = async (regId: string) => {
    executeWithWarning('Unverify Participant', 'Are you sure you want to unverify this participant? This may affect their results.', async () => {
    setIsUpdating(true);
    try {
      await stageManagementService.updateRegistration(scheduleId!, regId, 'unverify');
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to unverify participant');
    } finally {
      setIsUpdating(false);
    }});
  };

  const handleReject = async (regId: string) => {
    executeWithWarning('Reject Participant', 'Are you sure you want to reject this participant?', async () => {
    setIsUpdating(true);
    try {
      await stageManagementService.updateRegistration(scheduleId!, regId, 'reject');
      setVerifyModal({ reg: null, visible: false });
      refetch();
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert('Error: ' + error.message);
      else Alert.alert('Error', error.message || 'Failed to reject participant');
    } finally {
      setIsUpdating(false);
    }});
  };

  const handleRestore = async (regId: string) => {
    executeWithWarning('Restore Participant', 'Are you sure you want to restore this participant?', async () => {
    setIsUpdating(true);
    try {
      await stageManagementService.updateRegistration(scheduleId!, regId, 'restore');
      refetch();
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert('Error: ' + error.message);
      else Alert.alert('Error', error.message || 'Failed to restore participant');
    } finally {
      setIsUpdating(false);
    }});
  };

  const handleRejectAllUnverified = async () => {
    const unverifiedRegs = activeRegistrations.filter((r: any) => !r.is_verified);
    if (unverifiedRegs.length === 0) return;
    executeWithWarning('Reject All Unverified', `Are you sure you want to reject all ${unverifiedRegs.length} unverified participants?`, async () => {
      setIsUpdating(true);
      try {
        await Promise.all(
          unverifiedRegs.map((r: any) =>
            stageManagementService.updateRegistration(scheduleId!, r.id, 'reject')
          )
        );
        refetch();
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to reject participants');
      } finally {
        setIsUpdating(false);
      }
    });
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
    return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 40 }} />;
  }

  const goBackSafely = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(admin)/schedule');
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
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ width: '100%', maxWidth: 960, alignSelf: 'center', padding: 12, paddingBottom: 28 }}
      >
        {/* Header */}
        <View className="flex-row items-center mb-3">
          <TouchableOpacity onPress={goBackSafely} className="mr-3 h-9 w-9 items-center justify-center rounded-lg border border-ui-border bg-white">
            <ArrowLeft size={18} color={ui.colors.text} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-lg font-poppins-black text-ssf-text">Green Room Check-In</Text>
            <Text className="font-poppins text-[11px] text-ssf-text-muted">{schedule.items?.item_name_en}</Text>
          </View>
          <SsfButton label="Debug" variant="outline" onPress={() => Alert.alert('Debug', `Total raw registrations fetched: ${registrations?.length || 0}`)} size="sm" />
        </View>

        {isShuffleLocked && (
          <View className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex-row items-center gap-x-3">
            <Lock size={20} color="#B45309" />
            <Text className="font-poppins-bold text-amber-700 flex-1">
              🔒 Event is locked by Stage Portal. Check-in is now read-only.
            </Text>
          </View>
        )}

        {/* Progress Bar */}
        <SsfCard className="mb-3 p-3">
          <View className="flex-row justify-between items-center mb-2">
            <View className="flex-row items-center gap-x-2">
              <Users size={18} color="#1B6B3A" />
              <Text className="font-poppins-bold text-ssf-text">Verified</Text>
            </View>
            <Text className="font-poppins-bold text-ssf-primary text-lg">{verifiedCount}/{totalCount}</Text>
          </View>
          <View className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <View
              className="h-2 bg-ssf-primary rounded-full"
              style={{ width: totalCount > 0 ? `${(verifiedCount / totalCount) * 100}%` : '0%' }}
            />
          </View>
          {allVerified ? (
            <View className="mt-3 flex-row justify-between items-center">
              <View className="flex-row items-center gap-x-1">
                <ShieldCheck size={16} color="#16A34A" />
                <Text className="font-poppins-bold text-green-700 text-sm">All Participants Verified!</Text>
              </View>
              <SsfButton
                label="Start Draw →"
                size="sm"
                onPress={() => router.push(`/(admin)/schedule/${scheduleId}/code-letter` as any)}
              />
            </View>
          ) : (
            totalCount > 0 && verifiedCount < totalCount && !isShuffleLocked && (
              <View className="mt-3 flex-row justify-between items-center bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                <Text className="font-poppins-bold text-amber-700 text-xs">
                  {totalCount - verifiedCount} participants remaining unverified.
                </Text>
                <SsfButton
                  label="Reject Unverified"
                  size="sm"
                  onPress={handleRejectAllUnverified}
                  className="bg-red-600 border-red-600"
                />
              </View>
            )
          )}
        </SsfCard>

        {/* Scan QR Button */}
        {!isShuffleLocked && (
          <TouchableOpacity
            onPress={startWebScanner}
            className="h-11 rounded-lg border border-emerald-200 bg-white mb-3 flex-row justify-center items-center gap-x-2"
          >
            <QrCode size={18} color="#0F766E" />
            <Text className="font-poppins-bold text-emerald-700 text-sm">Scan Chest Card QR</Text>
          </TouchableOpacity>
        )}

        {/* Search */}
        <View className="h-10 border border-ssf-border rounded-lg bg-white px-3 flex-row items-center mb-3">
          <Search size={16} color="#9CA3AF" className="mr-2" />
          <input
            style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 14, color: ui.colors.text, background: 'transparent' }}
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
                    className={`min-h-[64px] flex-row items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0 ${
                      isRejected ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Participant Info */}
                    <View className="flex-row items-center flex-1">
                      {/* Avatar circle */}
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: isRejected ? ui.colors.destructiveSoft : reg.is_verified ? ui.colors.successSoft : ui.colors.surfaceMuted,
                          borderWidth: 2,
                          borderColor: isRejected ? '#EF4444' : reg.is_verified ? '#16A34A' : ui.colors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 10,
                        }}
                      >
                        <Text style={{ fontWeight: '900', fontSize: 11, color: isRejected ? '#EF4444' : reg.is_verified ? '#16A34A' : '#6B7280' }}>
                          {reg.participants?.chest_number || '?'}
                        </Text>
                      </View>
                      <View className="min-w-0 flex-1">
                        <View className="flex-row items-center gap-x-2">
                          <Text numberOfLines={1} className={`font-poppins-bold text-[12px] ${isRejected ? 'text-slate-400 line-through' : 'text-ssf-text'}`}>
                            {reg.participants?.name}
                          </Text>
                          {isRejected && (
                            <View className="bg-red-100 border border-red-200 px-1.5 py-0.5 rounded">
                              <Text className="text-[8px] font-poppins-bold text-red-600 uppercase">Rejected</Text>
                            </View>
                          )}
                        </View>
                        <Text className="font-poppins text-xs text-ssf-text-muted">
                          {reg.participants?.category_code} · Chest {reg.participants?.chest_number}
                        </Text>
                        {reg.participants?.organisations?.name ? (
                          <View className="flex-row items-center mt-0.5">
                            <View className="bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full">
                              <Text className="font-poppins-bold text-[10px] text-blue-700">
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
                        className={`flex-row items-center gap-x-1 px-3 py-1.5 rounded-full border bg-slate-50 border-slate-200 ${isShuffleLocked ? 'opacity-50' : ''}`}
                      >
                        <Text className="font-poppins-bold text-xs text-slate-600">Restore</Text>
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
                            ? 'bg-green-50 border-green-200'
                            : 'bg-gray-50 border-gray-200'
                        } ${isShuffleLocked ? 'opacity-50' : ''}`}
                      >
                        {reg.is_verified ? (
                          <CheckCircle2 size={16} color="#16A34A" />
                        ) : (
                          <Camera size={16} color="#9CA3AF" />
                        )}
                        <Text className={`font-poppins-bold text-xs ${reg.is_verified ? 'text-green-700' : 'text-gray-500'}`}>
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

      {/* ───── QR Scanner Modal ───── */}
      {isScannerOpen && (
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', zIndex: 100,
          }}
        >
          <View style={{ width: '90%', maxWidth: 380, backgroundColor: '#111', borderRadius: 20, overflow: 'hidden' }}>
            {/* Title bar */}
            <View style={{ backgroundColor: '#1B6B3A', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: ui.colors.surface, fontWeight: '900', fontSize: 16 }}>📷 Scan Chest Card</Text>
              <TouchableOpacity onPress={stopWebScanner}>
                <XCircle size={24} color={ui.colors.surface} />
              </TouchableOpacity>
            </View>

            {/* Camera preview */}
            <View style={{ position: 'relative', height: 320, backgroundColor: ui.shadow.shadowColor, alignItems: 'center', justifyContent: 'center' }}>
              {Platform.OS === 'web' ? (
                // @ts-ignore
                <video
                  ref={videoRef}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  playsInline
                  muted
                />
              ) : (
                <Text style={{ color: ui.colors.surface }}>Camera not supported on this platform</Text>
              )}
              {/* Scan overlay corners */}
              <View style={{ position: 'absolute', top: 60, left: 60, width: 180, height: 180, pointerEvents: 'none' }}>
                {/* TL */}
                <View style={{ position: 'absolute', top: 0, left: 0, width: 30, height: 4, backgroundColor: '#1B6B3A', borderRadius: 2 }} />
                <View style={{ position: 'absolute', top: 0, left: 0, width: 4, height: 30, backgroundColor: '#1B6B3A', borderRadius: 2 }} />
                {/* TR */}
                <View style={{ position: 'absolute', top: 0, right: 0, width: 30, height: 4, backgroundColor: '#1B6B3A', borderRadius: 2 }} />
                <View style={{ position: 'absolute', top: 0, right: 0, width: 4, height: 30, backgroundColor: '#1B6B3A', borderRadius: 2 }} />
                {/* BL */}
                <View style={{ position: 'absolute', bottom: 0, left: 0, width: 30, height: 4, backgroundColor: '#1B6B3A', borderRadius: 2 }} />
                <View style={{ position: 'absolute', bottom: 0, left: 0, width: 4, height: 30, backgroundColor: '#1B6B3A', borderRadius: 2 }} />
                {/* BR */}
                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 4, backgroundColor: '#1B6B3A', borderRadius: 2 }} />
                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 4, height: 30, backgroundColor: '#1B6B3A', borderRadius: 2 }} />
              </View>
            </View>

            <View style={{ padding: 16, alignItems: 'center' }}>
              {scannerError ? (
                <Text style={{ color: '#F87171', fontSize: 13, textAlign: 'center' }}>{scannerError}</Text>
              ) : (
                <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Point camera at the chest card QR code</Text>
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
            backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: 20,
          }}
        >
          <View style={{ backgroundColor: ui.colors.surface, borderRadius: 20, width: '100%', maxWidth: 360, overflow: 'hidden' }}>
            {/* Green header */}
            <View style={{ backgroundColor: '#1B6B3A', padding: 16, alignItems: 'center' }}>
              <Text style={{ color: ui.colors.surface, fontWeight: '900', fontSize: 18 }}>Identity Verification</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
                Confirm this is the right participant
              </Text>
            </View>

            <View style={{ padding: 24, alignItems: 'center' }}>
              {/* Large Photo — shown ONLY to coordinator, not printed on card */}
              <View style={{
                width: 120, height: 120, borderRadius: 60, overflow: 'hidden',
                borderWidth: 4, borderColor: '#1B6B3A',
                backgroundColor: ui.colors.surfaceMuted, marginBottom: 16,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {verifyModal.reg.participants?.photo_url ? (
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
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 4 }}>
                {verifyModal.reg.participants?.name}
              </Text>
              <View style={{
                backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0',
                borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 8,
              }}>
                <Text style={{ color: '#16A34A', fontWeight: '700', fontSize: 16 }}>
                  Chest #{verifyModal.reg.participants?.chest_number}
                </Text>
              </View>
              <Text style={{ color: '#6B7280', fontSize: 13 }}>
                {verifyModal.reg.participants?.category_code}
                {verifyModal.reg.participants?.organisations?.name
                  ? ` · 🏫 ${verifyModal.reg.participants.organisations.name}`
                  : ''}
              </Text>

              {/* Instruction */}
              <View style={{ backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, width: '100%', marginTop: 16, marginBottom: 20 }}>
                <Text style={{ color: '#92400E', fontSize: 12, textAlign: 'center', fontWeight: '600' }}>
                  ⚠️ Compare the photo above with the person standing in front of you before approving.
                </Text>
              </View>

              {/* Buttons */}
              <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                <TouchableOpacity
                  disabled={isUpdating}
                  onPress={() => handleReject(verifyModal.reg.id)}
                  style={{
                    flex: 1, borderWidth: 2, borderColor: '#EF4444',
                    borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                  }}
                >
                  <XCircle size={18} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontWeight: '700' }}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={isUpdating}
                  onPress={() => handleVerify(verifyModal.reg.id)}
                  style={{
                    flex: 1, backgroundColor: '#1B6B3A',
                    borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                  }}
                >
                  <CheckCircle2 size={18} color={ui.colors.surface} />
                  <Text style={{ color: ui.colors.surface, fontWeight: '700' }}>
                    {isUpdating ? 'Saving...' : 'Verify'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}
    
      {/* 🔴 RED WARNING MODAL */}
      {warningModal.visible && (
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: 'rgba(220, 38, 38, 0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 999,
          }}
        >
          <View style={{ width: '90%', maxWidth: 400, backgroundColor: '#FEF2F2', borderRadius: 20, padding: 24, alignItems: 'center' }}>
            <XCircle size={48} color="#DC2626" style={{ marginBottom: 16 }} />
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#991B1B', textAlign: 'center', marginBottom: 12 }}>
              {warningModal.title}
            </Text>
            <Text style={{ fontSize: 16, color: '#7F1D1D', textAlign: 'center', marginBottom: 24, lineHeight: 24 }}>
              {warningModal.message}
            </Text>
            
            <View style={{ width: '100%', gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setWarningModal({ visible: false, title: '', message: '', action: null });
                  setWarningCountdown(0);
                }}
                style={{ backgroundColor: '#EF4444', padding: 16, borderRadius: 12, alignItems: 'center' }}
              >
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Cancel (Safe)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={warningCountdown > 5}
                onPress={() => {
                  if (warningModal.action) warningModal.action();
                  setWarningModal({ visible: false, title: '', message: '', action: null });
                  setWarningCountdown(0);
                }}
                style={{ 
                  backgroundColor: warningCountdown > 5 ? '#FECACA' : '#991B1B', 
                  padding: 16, borderRadius: 12, alignItems: 'center',
                  borderWidth: 2, borderColor: '#7F1D1D'
                }}
              >
                <Text style={{ color: warningCountdown > 5 ? '#F87171' : 'white', fontWeight: 'bold', fontSize: 16 }}>
                  {warningCountdown > 5 ? `Wait ${warningCountdown - 5}s...` : 'Skip & Proceed'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
</View>
  );
}
