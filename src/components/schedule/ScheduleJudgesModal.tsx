import { ui } from '@/constants/designSystem';
import { useJudges } from '@/core/hooks/useJudges';
import { useAuthStore } from '@/core/store/authStore';
import { codeLetterAt } from '@/core/utils/codeLetters';
import { getCurrentOriginAppUrl } from '@/core/utils/appUrls';
import { normalizeScheduleLifecycleStatus } from '@/core/utils/scheduleLifecycle';
import { buildJudgeEvaluationSheetPrintDocument } from '@/core/utils/judgeEvaluationSheetPrint';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Alert, Clipboard, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Check, Copy, FileText, Printer, Search, X } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import React from 'react';
import { ConsoliumLogo } from '@/components/ui/ConsoliumLogo';
import { judgeTokenService } from '@/services/judgeTokenService';
import { supabase } from '@/core/config/supabase';
import { getRequiredJudgeCount, toggleAssignedJudge } from '@/core/utils/scheduleJudgePanelRules';

type ScheduleJudgesModalProps = {
  schedule: any;
  visible: boolean;
  onClose: () => void;
  onUpdateRequiredCount: (scheduleId: string, count: number) => Promise<void>;
};

type JudgeToken = {
  id: string;
  token: string;
  judge_id: string;
  schedule_id: string;
  status?: string | null;
  is_used?: boolean;
  is_revoked?: boolean;
  expires_at?: string | null;
  created_at?: string | null;
};

const requiredJudgeOptions = [1, 2, 3, 4, 5];

function isEligibleForJudgeCode(schedule: any) {
  const status = normalizeScheduleLifecycleStatus(schedule?.status ?? 'scheduled');
  return status === 'completed'
    || ((status === 'scheduled' || status === 'ongoing') && schedule?.is_postponed !== true);
}

function isActiveToken(token: JudgeToken, now = Date.now()) {
  return !token.is_used
    && !token.is_revoked
    && token.status !== 'rejected'
    && (!token.expires_at || new Date(token.expires_at).getTime() > now);
}

export function ScheduleJudgesModal({ schedule, visible, onClose, onUpdateRequiredCount }: ScheduleJudgesModalProps) {
  const { width } = useWindowDimensions();
  const { tenant_id, user } = useAuthStore();
  const {
    judges,
    isLoadingJudges,
    isErrorJudges,
    refetchJudges,
    assignJudges,
    useScheduleJudges,
  } = useJudges();
  const scheduleId = String(schedule?.id ?? '');
  const assignedQuery = useScheduleJudges(visible ? scheduleId : undefined);
  const [selectedJudgeIds, setSelectedJudgeIds] = React.useState<string[]>([]);
  const [judgeSearch, setJudgeSearch] = React.useState('');
  const [requiredCount, setRequiredCount] = React.useState(3);
  const [savedRequiredCount, setSavedRequiredCount] = React.useState(3);
  const [isSavingRequiredCount, setIsSavingRequiredCount] = React.useState(false);
  const [isSavingPanel, setIsSavingPanel] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [shownCodes, setShownCodes] = React.useState<string[]>([]);
  const [generatingJudgeId, setGeneratingJudgeId] = React.useState<string | null>(null);
  const [printError, setPrintError] = React.useState<string | null>(null);
  const [printRequest, setPrintRequest] = React.useState<{ judge: any; token: string } | null>(null);
  const pendingPrintWindow = React.useRef<Window | null>(null);

  const tokensQuery = useQuery<JudgeToken[]>({
    queryKey: ['judgeTokens', tenant_id, scheduleId],
    enabled: visible && !!tenant_id && !!scheduleId,
    queryFn: () => judgeTokenService.listTokens(scheduleId),
  });

  const activeTokens = (tokensQuery.data ?? []).filter((token: JudgeToken) => isActiveToken(token));
  const tokenByJudgeId = new Map<string, JudgeToken>();
  activeTokens.forEach((token: JudgeToken) => {
    const existing = tokenByJudgeId.get(token.judge_id);
    if (!existing || String(token.created_at ?? '') > String(existing.created_at ?? '')) {
      tokenByJudgeId.set(token.judge_id, token);
    }
  });
  const assignedJudges = assignedQuery.data ?? [];
  const persistedJudgeIds = new Set(assignedJudges.map((judge: any) => String(judge.id)));
  const filteredJudges = (judges ?? []).filter((judge: any) =>
    String(judge.name ?? '').toLocaleLowerCase().includes(judgeSearch.trim().toLocaleLowerCase())
    || String(judge.phone ?? '').includes(judgeSearch.trim()),
  );
  const panelIsOverCapacity = selectedJudgeIds.length > requiredCount;
  const hasRequiredCountChanges = requiredCount !== savedRequiredCount;
  const isLoading = assignedQuery.isLoading || tokensQuery.isLoading || isLoadingJudges;

  React.useEffect(() => {
    if (!visible) return;
    setErrorMessage(null);
    setPrintError(null);
    setShownCodes([]);
  }, [visible, scheduleId]);

  React.useEffect(() => {
    const count = getRequiredJudgeCount(schedule?.expected_judge_count);
    setRequiredCount(count);
    setSavedRequiredCount(count);
  }, [scheduleId, schedule?.expected_judge_count]);

  React.useEffect(() => {
    if (!assignedQuery.data) return;
    setSelectedJudgeIds(assignedQuery.data.map((judge: any) => String(judge.id)));
  }, [assignedQuery.data]);

  const updateJudgeSelection = (judgeId: string) => {
    setErrorMessage(null);
    const result = toggleAssignedJudge(selectedJudgeIds, judgeId, requiredCount);
    if (!result.changed) {
      setErrorMessage(`This competition requires ${requiredCount} judge(s). Increase the required number before assigning more.`);
      return;
    }
    setSelectedJudgeIds(result.judgeIds);
  };

  const saveRequiredCount = async () => {
    if (!requiredJudgeOptions.includes(requiredCount)) return;
    setIsSavingRequiredCount(true);
    setErrorMessage(null);
    try {
      await onUpdateRequiredCount(scheduleId, requiredCount);
      setSavedRequiredCount(requiredCount);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Could not update the required judge count.');
    } finally {
      setIsSavingRequiredCount(false);
    }
  };

  const savePanel = async () => {
    if (panelIsOverCapacity) {
      setErrorMessage(`Remove ${selectedJudgeIds.length - requiredCount} judge(s) before saving this panel.`);
      return;
    }
    setIsSavingPanel(true);
    setErrorMessage(null);
    try {
      await assignJudges.mutateAsync({ scheduleId, judgeIds: selectedJudgeIds });
      await assignedQuery.refetch();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Could not update the judge panel.');
    } finally {
      setIsSavingPanel(false);
    }
  };

  const generateCode = async (judge: any, forceRefresh = false) => {
    if (!tenant_id) {
      setErrorMessage('Session error: tenant is missing.');
      return;
    }
    setGeneratingJudgeId(judge.id);
    setErrorMessage(null);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const result: any = await Promise.race([
        judgeTokenService.generateToken({
          judgeId: judge.id,
          scheduleId,
          tenantId: tenant_id,
          createdBy: user?.id ?? '',
          forceRefresh,
        }),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('The server took too long to generate the code. Please try again.')), 15000);
        }),
      ]);
      if (!result?.token && typeof result !== 'string') throw new Error('The server did not return an access code.');
      await tokensQuery.refetch();
      setShownCodes((current) => current.includes(judge.id) ? current : [...current, judge.id]);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Could not generate the judge access code.');
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setGeneratingJudgeId(null);
    }
  };

  const confirmRegenerateCode = (judge: any) => {
    const message = `Regenerate ${judge.name}'s code for this competition? The current active code will be revoked.`;
    const regenerate = () => void generateCode(judge, true);
    if (Platform.OS === 'web') {
      if (window.confirm(message)) regenerate();
    } else {
      Alert.alert('Regenerate access code?', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', style: 'destructive', onPress: regenerate },
      ]);
    }
  };

  const printEvaluationSheet = async (judge: any, token: string) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Print evaluation sheet', 'Open this page in a browser to print or save the evaluation sheet as PDF.');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setPrintError('Allow pop-ups for this site, then try again.');
      return;
    }
    pendingPrintWindow.current = printWindow;
    setPrintError(null);
    setPrintRequest({ judge, token });
  };

  React.useEffect(() => {
    if (!printRequest || Platform.OS !== 'web' || !pendingPrintWindow.current) return;
    let cancelled = false;
    const prepareAndPrint = async () => {
      const printWindow = pendingPrintWindow.current;
      try {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        if (!printWindow || printWindow.closed) return;
        const qrElement = document.getElementById('schedule-judge-print-qr')?.querySelector('svg') as SVGSVGElement | null;
        const logoElement = document.getElementById('schedule-judge-print-logo')?.querySelector('img') as HTMLImageElement | null;
        if (!qrElement || !logoElement?.src) throw new Error('The logo or QR code is not ready. Please try again.');

        const { count, error } = await supabase.rpc('get_schedule_registrations', {
          p_schedule_id: scheduleId,
        }, { head: true, count: 'exact' }).or('status.is.null,status.not.in.(rejected,cancelled,canceled)');
        if (error || count === null) throw new Error('Could not load the participant count. Please try again.');
        if (count === 0) throw new Error('No active entries were found for this competition.');

        const qrCopy = qrElement.cloneNode(true) as SVGSVGElement;
        qrCopy.querySelectorAll('script, foreignObject').forEach((element) => element.remove());
        Array.from(qrCopy.querySelectorAll('*')).forEach((element) => {
          Array.from(element.attributes).forEach((attribute) => {
            if (/^on/i.test(attribute.name) || /javascript:/i.test(attribute.value)) {
              element.removeAttribute(attribute.name);
            }
          });
        });
        const category = Array.isArray(schedule.items?.category_codes)
          ? schedule.items.category_codes.join(', ')
          : String(schedule.items?.category ?? schedule.items?.category_codes ?? '-');
        const printDocument = buildJudgeEvaluationSheetPrintDocument({
          eventName: schedule.items?.item_name_ml || schedule.items?.item_name_en || 'Competition',
          category,
          accessCode: printRequest.token,
          logoUrl: logoElement.currentSrc || logoElement.src,
          qrSvg: qrCopy.outerHTML,
          rows: Array.from({ length: count }, (_, index) => ({
            serialNumber: index + 1,
            codeLetter: codeLetterAt(index),
          })),
        });
        if (cancelled) return;
        printWindow.document.open();
        printWindow.document.write(printDocument);
        printWindow.document.close();
        await Promise.all([
          printWindow.document.fonts?.ready ?? Promise.resolve(),
          ...Array.from(printWindow.document.images).map((image) => image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener('load', () => resolve(), { once: true });
                image.addEventListener('error', () => resolve(), { once: true });
              })),
        ]);
        const logoReady = printWindow.document.querySelector('img') as HTMLImageElement | null;
        if (!logoReady || logoReady.naturalWidth === 0) throw new Error('The logo could not be loaded into the evaluation sheet.');
        printWindow.focus();
        printWindow.print();
      } catch (error: any) {
        if (printWindow && !printWindow.closed) printWindow.close();
        if (!cancelled) setPrintError(error?.message || 'Could not prepare the evaluation sheet.');
      } finally {
        pendingPrintWindow.current = null;
        if (!cancelled) setPrintRequest(null);
      }
    };
    void prepareAndPrint();
    return () => { cancelled = true; };
  }, [printRequest, schedule, scheduleId]);

  const copyCode = (token: string) => {
    if (Platform.OS === 'web' && navigator.clipboard) void navigator.clipboard.writeText(token);
    else Clipboard.setString(token);
  };

  const activeScheduleName = schedule?.items?.item_name_en || schedule?.items?.item_name_ml || 'Competition';
  const modalWidth = Math.min(640, width - 32);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-black/45 items-center justify-center px-4 py-5">
        <Pressable onPress={(event) => event.stopPropagation()} className="w-full overflow-hidden rounded-xl border border-ui-border bg-core-surface-white" style={{ maxWidth: modalWidth, maxHeight: '92%' }}>
          <View className="flex-row items-start justify-between border-b border-ui-border px-4 py-3">
            <View className="mr-3 flex-1">
              <Text className="font-poppins-bold text-base text-ui-text">Judges</Text>
              <Text className="mt-0.5 font-poppins text-xs text-ui-text-muted" numberOfLines={1}>{activeScheduleName}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close judge panel" onPress={onClose} className="h-8 w-8 items-center justify-center rounded-lg border border-ui-border">
              <X size={15} color={ui.colors.textMuted} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View className="min-h-36 items-center justify-center gap-2">
              <ActivityIndicator color={ui.colors.primary} />
              <Text className="font-poppins text-xs text-ui-text-muted">Loading judge panel…</Text>
            </View>
          ) : isErrorJudges || assignedQuery.isError || tokensQuery.isError ? (
            <View className="p-4">
              <Text className="font-poppins text-xs text-core-danger-red-700">Judge details could not be loaded.</Text>
              <TouchableOpacity onPress={() => { void Promise.all([refetchJudges(), assignedQuery.refetch(), tokensQuery.refetch()]); }} className="mt-3 self-start rounded-lg border border-ui-border px-3 py-2">
                <Text className="font-poppins-bold text-xs text-ui-text">Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView className="px-4" contentContainerStyle={{ paddingVertical: 12 }} keyboardShouldPersistTaps="handled">
              <View className="mb-3 rounded-lg border border-ui-border p-3">
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="font-poppins-bold text-xs text-ui-text">Required judges</Text>
                  <Text className="font-poppins text-[10px] text-ui-text-muted">{assignedJudges.length} assigned</Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <View className="flex-1 flex-row gap-1.5">
                    {requiredJudgeOptions.map((count) => (
                      <TouchableOpacity key={count} accessibilityRole="radio" accessibilityState={{ selected: requiredCount === count }} onPress={() => setRequiredCount(count)} className={`h-9 flex-1 items-center justify-center rounded-md border ${requiredCount === count ? 'border-ui-primary bg-core-primary-soft-teal-50' : 'border-ui-border bg-core-surface-white'}`}>
                        <Text className={`font-poppins-bold text-xs ${requiredCount === count ? 'text-ui-primary-text' : 'text-ui-text'}`}>{count}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {hasRequiredCountChanges && (
                    <TouchableOpacity accessibilityRole="button" onPress={() => void saveRequiredCount()} disabled={isSavingRequiredCount} className="h-9 rounded-md bg-ui-primary px-3 items-center justify-center">
                      {isSavingRequiredCount ? <ActivityIndicator size="small" color={ui.colors.onPrimary} /> : <Text className="font-poppins-bold text-[10px] text-core-on-primary-white">Save</Text>}
                    </TouchableOpacity>
                  )}
                </View>
                {selectedJudgeIds.length > requiredCount && <Text className="mt-2 font-poppins text-[10px] text-core-danger-red-700">{selectedJudgeIds.length} judges are selected, above the new limit of {requiredCount}. Remove extras before saving assignments.</Text>}
              </View>

              <View className="mb-2 flex-row items-center justify-between">
                <Text className="font-poppins-bold text-xs text-ui-text">Assign existing judges</Text>
                <Text className="font-poppins-bold text-[10px] text-ui-text-muted">{selectedJudgeIds.length} / {requiredCount}</Text>
              </View>
              <View className="mb-2 h-9 flex-row items-center rounded-md border border-ui-border bg-core-surface-white px-2.5">
                <Search size={14} color={ui.colors.textMuted} />
                <TextInput value={judgeSearch} onChangeText={setJudgeSearch} placeholder="Search existing judges" accessibilityLabel="Search existing judges" className="ml-2 h-full flex-1 font-poppins text-xs text-ui-text outline-none" />
              </View>
              {filteredJudges.length === 0 ? (
                <Text className="py-4 text-center font-poppins text-xs text-ui-text-muted">No existing judges found.</Text>
              ) : filteredJudges.map((judge: any) => {
                const selected = selectedJudgeIds.includes(String(judge.id));
                const isPersistedAssigned = persistedJudgeIds.has(String(judge.id));
                const token = tokenByJudgeId.get(String(judge.id));
                return (
                  <View key={judge.id} className="mb-1.5 rounded-md border border-ui-border px-2.5 py-2">
                    <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={`${selected ? 'Unassign' : 'Assign'} ${judge.name}`} accessibilityState={{ checked: selected }} onPress={() => updateJudgeSelection(String(judge.id))} className="min-h-8 flex-row items-center">
                      <View className={`mr-2.5 h-5 w-5 items-center justify-center rounded border ${selected ? 'border-ui-primary bg-ui-primary' : 'border-ui-border bg-core-surface-white'}`}>{selected ? <Check size={13} color={ui.colors.onPrimary} /> : null}</View>
                      <View className="flex-1">
                        <Text className="font-poppins-bold text-xs text-ui-text">{judge.name}</Text>
                        {!!judge.specialization?.length && <Text className="font-poppins text-[10px] text-ui-text-muted" numberOfLines={1}>{Array.isArray(judge.specialization) ? judge.specialization.join(', ') : judge.specialization}</Text>}
                      </View>
                    </TouchableOpacity>
                    {isPersistedAssigned ? (
                      <View className="mt-2 flex-row flex-wrap items-center gap-1.5 border-t border-ui-border pt-2">
                        {token ? (
                          <>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${shownCodes.includes(String(judge.id)) ? 'Hide' : 'View'} access code for ${judge.name}`} onPress={() => setShownCodes((current) => current.includes(String(judge.id)) ? current.filter((id) => id !== String(judge.id)) : [...current, String(judge.id)])} className="h-8 flex-row items-center gap-1 rounded-md border border-ui-border px-2">
                              <Text className="font-poppins-bold text-[10px] text-ui-text">{shownCodes.includes(String(judge.id)) ? token.token : 'View code'}</Text>
                            </TouchableOpacity>
                            {shownCodes.includes(String(judge.id)) && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Copy access code for ${judge.name}`} onPress={() => copyCode(token.token)} className="h-8 w-8 items-center justify-center rounded-md border border-ui-border"><Copy size={13} color={ui.colors.textMuted} /></TouchableOpacity>}
                            {Platform.OS === 'web' && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Print evaluation sheet for ${judge.name}`} onPress={() => void printEvaluationSheet(judge, token.token)} className="h-8 flex-row items-center gap-1 rounded-md border border-ui-border px-2"><Printer size={13} color={ui.colors.primaryText} /><Text className="font-poppins-bold text-[10px] text-ui-text">PDF</Text></TouchableOpacity>}
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Regenerate access code for ${judge.name}`} disabled={generatingJudgeId === String(judge.id)} onPress={() => confirmRegenerateCode(judge)} className="h-8 rounded-md border border-ui-border px-2 items-center justify-center"><Text className="font-poppins-bold text-[10px] text-ui-text">Regenerate</Text></TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Generate access code for ${judge.name}`} disabled={generatingJudgeId === String(judge.id) || !isEligibleForJudgeCode(schedule)} onPress={() => void generateCode(judge)} className={`h-8 flex-row items-center gap-1 rounded-md border border-ui-border px-2 ${!isEligibleForJudgeCode(schedule) ? 'opacity-50' : ''}`}>
                            {generatingJudgeId === String(judge.id) ? <ActivityIndicator size="small" color={ui.colors.primary} /> : <FileText size={13} color={ui.colors.primaryText} />}
                            <Text className="font-poppins-bold text-[10px] text-ui-text">Generate code</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : selected ? <Text className="mt-1.5 font-poppins text-[10px] text-ui-text-muted">Save assignments to enable code and PDF actions.</Text> : null}
                  </View>
                );
              })}

              {errorMessage && <Text accessibilityRole="alert" className="mt-2 font-poppins text-xs text-core-danger-red-700">{errorMessage}</Text>}
              {printError && <Text accessibilityRole="alert" className="mt-2 font-poppins text-xs text-core-danger-red-700">{printError}</Text>}
              <View className="mt-3 flex-row justify-end gap-2">
                <TouchableOpacity accessibilityRole="button" onPress={onClose} className="h-9 items-center justify-center rounded-md border border-ui-border px-3"><Text className="font-poppins-bold text-xs text-ui-text">Close</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" disabled={isSavingPanel || panelIsOverCapacity || selectedJudgeIds.length === assignedJudges.length && selectedJudgeIds.every((id) => assignedJudges.some((judge: any) => String(judge.id) === id))} onPress={() => void savePanel()} className="h-9 flex-row items-center justify-center gap-1.5 rounded-md bg-ui-primary px-3 disabled:opacity-50">
                  {isSavingPanel && <ActivityIndicator size="small" color={ui.colors.onPrimary} />}
                  <Text className="font-poppins-bold text-xs text-core-on-primary-white">Save assignments</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {Platform.OS === 'web' && printRequest && (
            <View pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0, width: 160, height: 160, opacity: 0 }}>
              <View id="schedule-judge-print-logo"><ConsoliumLogo size={48} /></View>
              <View id="schedule-judge-print-qr"><QRCode value={getCurrentOriginAppUrl(`/judge?code=${encodeURIComponent(printRequest.token)}`) || ''} size={140} color="#000000" backgroundColor={ui.colors.surface} /></View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
