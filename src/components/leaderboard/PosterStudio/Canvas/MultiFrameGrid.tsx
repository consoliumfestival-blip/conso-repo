import React, { useState, useCallback, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTemplateStore, BatchFrameItem } from '../Stores/templateStore';
import { useLayerStore } from '../Stores/layerStore';
import OffscreenRenderer from './OffscreenRenderer';
import { useAuthStore } from '../../../../core/store/authStore';
import type { PosterAssetReference, PosterDeliveryScope, PosterDesignSnapshot } from '../Database/posterDesignSnapshot';
import { savePendingPosterDelivery } from '../Database/posterDeliveryRepository';
import { createPosterOperationId, runPosterDelivery } from '../Services/posterDeliveryService';
import { createPendingPosterDelivery, createPosterDesignSnapshot, measurePosterBlob } from '../Services/posterDeliveryFactory';
import { getOfficialResultNumberLabel } from '../Results/resultGroupRules';

interface MultiFrameGridProps {
  festivalId: string;
  tenantId: string;
  customFontReferences: PosterAssetReference[];
}

type FrameRunStatus = 'idle' | 'rendering' | 'uploading' | 'published' | 'draft' | 'pending' | 'error';

const DEFAULT_DELIVERY_WORKERS = 2;

function getDeliveryWorkerLimit(): number {
  if (typeof navigator === 'undefined') return DEFAULT_DELIVERY_WORKERS;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof deviceMemory === 'number' && deviceMemory <= 4 ? 1 : DEFAULT_DELIVERY_WORKERS;
}

interface BatchRunFrame {
  frame: BatchFrameItem;
  operationId: string;
  snapshot: PosterDesignSnapshot;
  backgroundUrl: string;
}

interface PendingDelivery {
  runFrame: BatchRunFrame;
  ownerId: string;
}

export default function MultiFrameGrid({ festivalId, tenantId, customFontReferences }: MultiFrameGridProps) {
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const {
    activeTemplate,
    batchItems,
    removeBatchItem,
    updateBatchItemVariables,
    setIsMultiFrameMode,
    setVariables,
    setCurrentResultId,
    setCurrentItemId,
    setCurrentResultPublicVisible,
    setSourceResultFingerprint,
    loadResultOverride,
    bumpAssetsRefreshTick,
  } = useTemplateStore();
  const { layers: baseLayers } = useLayerStore();

  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [activeExportIndex, setActiveExportIndex] = useState<number | null>(null);
  const [frameStatuses, setFrameStatuses] = useState<Record<string, FrameRunStatus>>({});
  const [frameErrors, setFrameErrors] = useState<Record<string, string>>({});
  const [expandedEditIds, setExpandedEditIds] = useState<Record<string, boolean>>({});
  const [batchSummary, setBatchSummary] = useState<string | null>(null);
  const [batchRun, setBatchRun] = useState<{ frames: BatchRunFrame[]; ownerId: string } | null>(null);
  const [downloadRecoveries, setDownloadRecoveries] = useState<Record<string, { blob: Blob; filename: string }>>({});

  const processingIndexRef = useRef<number | null>(null);
  const batchCountsRef = useRef({ published: 0, draft: 0, pending: 0, failed: 0 });
  const uploadQueueRef = useRef<PendingDelivery[]>([]);
  const activeUploadCountRef = useRef(0);
  const renderQueueCompleteRef = useRef(false);
  const batchFinalizedRef = useRef(false);

  const finalizeBatchWhenIdle = useCallback(() => {
    if (batchFinalizedRef.current || !renderQueueCompleteRef.current || uploadQueueRef.current.length > 0 || activeUploadCountRef.current > 0) return;
    batchFinalizedRef.current = true;
    setIsBatchRunning(false);
    setActiveExportIndex(null);
    setBatchRun(null);
    processingIndexRef.current = null;
    const auth = useAuthStore.getState();
    if (auth.tenant_id === tenantId || auth.is_superadmin === true) {
      queryClient.invalidateQueries({ queryKey: ['generated-assets', festivalId] });
      bumpAssetsRefreshTick();
    }
    const { published, draft, pending, failed } = batchCountsRef.current;
    setBatchSummary(
      `Completed: ${published} published, ${draft} draft, ${pending} saved locally for upload retry${failed > 0 ? `, ${failed} not saved` : ''}.`
    );
  }, [bumpAssetsRefreshTick, festivalId, queryClient, tenantId]);

  const pumpUploadQueue = useCallback(() => {
    while (activeUploadCountRef.current < getDeliveryWorkerLimit() && uploadQueueRef.current.length > 0) {
      const job = uploadQueueRef.current.shift()!;
      activeUploadCountRef.current += 1;
      const { runFrame } = job;
      const scopeIsActive = () => {
        const auth = useAuthStore.getState();
        return auth.user?.id === runFrame.snapshot.userId
          && (auth.tenant_id === runFrame.snapshot.tenantId || auth.is_superadmin === true)
          && festivalId === runFrame.snapshot.festivalId
          && tenantId === runFrame.snapshot.tenantId;
      };
      const markPending = (message: string) => {
        batchCountsRef.current.pending += 1;
        setFrameStatuses((previous) => ({ ...previous, [runFrame.frame.itemId]: 'pending' }));
        setFrameErrors((previous) => ({ ...previous, [runFrame.frame.itemId]: message }));
      };
      if (!scopeIsActive()) {
        markPending('Saved on this device; delivery paused after the active account or festival changed.');
        activeUploadCountRef.current -= 1;
        continue;
      }
      setFrameStatuses((previous) => ({ ...previous, [runFrame.frame.itemId]: 'uploading' }));
      let outcomeHandled = false;
      void runPosterDelivery(job.runFrame.operationId, job.runFrame.snapshot, job.ownerId, {
        isScopeActive: (scope) => {
          const auth = useAuthStore.getState();
          return auth.user?.id === scope.userId
            && (auth.tenant_id === scope.tenantId || auth.is_superadmin === true)
            && festivalId === scope.festivalId
            && tenantId === scope.tenantId;
        },
      }).then((outcome) => {
        if (!scopeIsActive()) {
          markPending('Saved on this device; delivery paused after the active account or festival changed.');
          outcomeHandled = true;
          return;
        }
        if (outcome.status === 'synced') {
          const visibility = outcome.result.visibilityStatus === 'published' ? 'published' : 'draft';
          if (visibility === 'published') batchCountsRef.current.published += 1;
          else batchCountsRef.current.draft += 1;
          setFrameStatuses((previous) => ({ ...previous, [runFrame.frame.itemId]: visibility }));
          outcomeHandled = true;
        } else {
          markPending(outcome.status === 'failed'
            ? `Saved on this device; upload pending. ${outcome.error}`
            : 'Saved on this device; upload pending.');
          outcomeHandled = true;
        }
      }).catch((error) => {
        markPending(scopeIsActive()
          ? `Saved on this device; upload pending. ${error instanceof Error ? error.message : 'Delivery failed.'}`
          : 'Saved on this device; delivery paused after the active account or festival changed.');
        outcomeHandled = true;
      }).finally(() => {
        if (!outcomeHandled) markPending('Saved on this device; upload pending.');
        activeUploadCountRef.current -= 1;
        pumpUploadQueue();
        finalizeBatchWhenIdle();
      });
    }
  }, [festivalId, finalizeBatchWhenIdle, tenantId]);

  const enqueueDelivery = useCallback((runFrame: BatchRunFrame, ownerId: string) => {
    uploadQueueRef.current.push({ runFrame, ownerId });
    pumpUploadQueue();
  }, [pumpUploadQueue]);

  const canvasW = activeTemplate?.width || 1080;
  const canvasH = activeTemplate?.height || 1080;
  const previewW = Math.min(280, Math.max(180, width - 76));
  const previewScale = previewW / canvasW;

  const publicCount = batchItems.filter((b) => b.publicVisible).length;
  const draftCount = batchItems.length - publicCount;

  const handleEditSingle = (frame: BatchFrameItem) => {
    setVariables(frame.variables);
    setCurrentResultId(frame.resultId);
    setCurrentItemId(frame.itemId);
    setCurrentResultPublicVisible(frame.publicVisible);
    setSourceResultFingerprint(frame.sourceResultFingerprint || '');
    setIsMultiFrameMode(false);
    loadResultOverride(frame.resultId);
  };

  const startBatchGenerate = () => {
    if (!activeTemplate || batchItems.length === 0 || isBatchRunning) return;
    try {
      const current = useTemplateStore.getState();
      const template = current.activeTemplate;
      const auth = useAuthStore.getState();
      const userId = auth.user?.id;
      if (!template || !userId || (auth.tenant_id !== tenantId && auth.is_superadmin !== true)) {
        throw new Error('Sign in to the selected tenant before generating posters.');
      }
      if (!template.id || template.isLocal || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(template.id)) {
        throw new Error('Save this template to the database before generating posters.');
      }
      const scope: PosterDeliveryScope = { userId, tenantId, festivalId };
      const frozenLayers = useLayerStore.getState().layers;
      const frames = current.batchItems.map((frame) => {
        const operationId = createPosterOperationId();
        const snapshot = createPosterDesignSnapshot({
          scope,
          template,
          itemId: frame.itemId,
          resultId: frame.resultId,
          layers: frame.customLayers ?? frozenLayers,
          variables: frame.variables,
          typographyMode: current.typographyMode,
          sourceResultFingerprint: frame.sourceResultFingerprint || '',
          customFontReferences,
        });
        return { frame: structuredClone(frame), operationId, snapshot, backgroundUrl: template.background_url };
      });
      const run = { frames, ownerId: createPosterOperationId() };
      setBatchRun(run);
      setBatchSummary(null);
      batchCountsRef.current = { published: 0, draft: 0, pending: 0, failed: 0 };
      const initStatuses: Record<string, FrameRunStatus> = {};
      frames.forEach(({ frame }, index) => {
        initStatuses[frame.itemId] = index === 0 ? 'rendering' : 'idle';
      });
      setFrameStatuses(initStatuses);
      setFrameErrors({});
      setDownloadRecoveries({});
      processingIndexRef.current = null;
      uploadQueueRef.current = [];
      activeUploadCountRef.current = 0;
      renderQueueCompleteRef.current = false;
      batchFinalizedRef.current = false;
      setIsBatchRunning(true);
      setActiveExportIndex(0);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Batch generation could not start.');
    }
  };

  const handleBatchCapture = useCallback(
    async (captureFunc: (ratio?: number) => Promise<Blob>) => {
      if (activeExportIndex === null || !activeTemplate || !batchRun) return;
      if (processingIndexRef.current === activeExportIndex) return;
      processingIndexRef.current = activeExportIndex;

      const runFrame = batchRun.frames[activeExportIndex];
      if (!runFrame) {
        setIsBatchRunning(false);
        setActiveExportIndex(null);
        setBatchRun(null);
        return;
      }
      const { frame } = runFrame;
      const isRunScopeActive = () => {
        const auth = useAuthStore.getState();
        return auth.user?.id === runFrame.snapshot.userId
          && (auth.tenant_id === runFrame.snapshot.tenantId || auth.is_superadmin === true)
          && festivalId === runFrame.snapshot.festivalId
          && tenantId === runFrame.snapshot.tenantId;
      };

      let blob: Blob | null = null;
      let savedLocally = false;
      try {
        blob = await captureFunc();
        const dimensions = await measurePosterBlob(blob);
        const record = createPendingPosterDelivery({
          operationId: runFrame.operationId,
          scope: runFrame.snapshot,
          snapshot: runFrame.snapshot,
          blob,
          ...dimensions,
        });
        await savePendingPosterDelivery(record);
        savedLocally = true;
        if (!isRunScopeActive()) {
          batchCountsRef.current.pending++;
          setFrameStatuses((previous) => ({ ...previous, [frame.itemId]: 'pending' }));
          setFrameErrors((previous) => ({ ...previous, [frame.itemId]: 'Saved on this device; delivery paused after the active account or festival changed.' }));
          renderQueueCompleteRef.current = true;
          setActiveExportIndex(null);
          finalizeBatchWhenIdle();
          return;
        }
        enqueueDelivery(runFrame, batchRun.ownerId);
      } catch (error) {
        if (!isRunScopeActive()) {
          renderQueueCompleteRef.current = true;
          setActiveExportIndex(null);
          finalizeBatchWhenIdle();
          return;
        }
        if (savedLocally) batchCountsRef.current.pending++;
        else batchCountsRef.current.failed++;
        setFrameStatuses((prev) => ({ ...prev, [frame.itemId]: savedLocally ? 'pending' : 'error' }));
        setFrameErrors((prev) => ({
          ...prev,
          [frame.itemId]: savedLocally
            ? `Saved on this device; upload pending. ${error instanceof Error ? error.message : 'Delivery failed.'}`
            : error instanceof Error ? error.message : 'Generation failed',
        }));
        if (!savedLocally && blob) {
          const recoveryBlob = blob;
          setDownloadRecoveries((previous) => ({
            ...previous,
            [frame.itemId]: { blob: recoveryBlob, filename: `poster-${frame.itemId}.jpg` },
          }));
        }
      }

      const nextIndex = activeExportIndex + 1;
      if (nextIndex < batchRun.frames.length) {
        const nextFrame = batchRun.frames[nextIndex].frame;
        setFrameStatuses((prev) => ({ ...prev, [nextFrame.itemId]: 'rendering' }));
        setActiveExportIndex(nextIndex);
      } else {
        renderQueueCompleteRef.current = true;
        setActiveExportIndex(null);
        processingIndexRef.current = null;
        finalizeBatchWhenIdle();
      }
    },
    [activeExportIndex, activeTemplate, batchRun, enqueueDelivery, finalizeBatchWhenIdle, festivalId, tenantId]
  );

  const activeRunFrame = isBatchRunning && activeExportIndex !== null
    ? batchRun?.frames[activeExportIndex] ?? null
    : null;

  const handleBatchRenderError = useCallback((error: Error) => {
    if (activeExportIndex === null || !batchRun || !activeRunFrame || processingIndexRef.current === activeExportIndex) return;
    processingIndexRef.current = activeExportIndex;
    const auth = useAuthStore.getState();
    const scopeIsActive = auth.user?.id === activeRunFrame.snapshot.userId
      && (auth.tenant_id === activeRunFrame.snapshot.tenantId || auth.is_superadmin === true)
      && festivalId === activeRunFrame.snapshot.festivalId
      && tenantId === activeRunFrame.snapshot.tenantId;
    if (!scopeIsActive) {
      renderQueueCompleteRef.current = true;
      setActiveExportIndex(null);
      processingIndexRef.current = null;
      finalizeBatchWhenIdle();
      return;
    }
    batchCountsRef.current.failed++;
    setFrameStatuses((previous) => ({ ...previous, [activeRunFrame.frame.itemId]: 'error' }));
    setFrameErrors((previous) => ({
      ...previous,
      [activeRunFrame.frame.itemId]: `Render failed; no image was uploaded. ${error.message}`,
    }));

    const nextIndex = activeExportIndex + 1;
    if (nextIndex < batchRun.frames.length) {
      const nextFrame = batchRun.frames[nextIndex].frame;
      setFrameStatuses((previous) => ({ ...previous, [nextFrame.itemId]: 'rendering' }));
      setActiveExportIndex(nextIndex);
      return;
    }

    renderQueueCompleteRef.current = true;
    setActiveExportIndex(null);
    processingIndexRef.current = null;
    finalizeBatchWhenIdle();
  }, [activeExportIndex, activeRunFrame, batchRun, finalizeBatchWhenIdle, festivalId, tenantId]);

  return (
    <div style={styles.container}>
      {/* Top Batch Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.titleRow}>
            <span style={styles.title}>Multi-Frame Batch Workspace ({batchItems.length}/6)</span>
            <span style={styles.statBadgePub}>🌐 {publicCount} Auto-Publish</span>
            <span style={styles.statBadgeDraft}>📝 {draftCount} Media Center Draft</span>
          </div>
          <div style={styles.subtitle}>
            Public competition results auto-publish immediately; unpublished results save as drafts in Media Center.
          </div>
        </div>

        <div style={styles.headerActions}>
          <button
            onClick={() => setIsMultiFrameMode(false)}
            disabled={isBatchRunning}
            style={styles.backBtn}
          >
            Single Canvas
          </button>
          <button
            onClick={startBatchGenerate}
            disabled={isBatchRunning || batchItems.length === 0}
            style={{
              ...styles.generateAllBtn,
              opacity: isBatchRunning || batchItems.length === 0 ? 0.6 : 1,
            }}
          >
            {isBatchRunning
              ? `Generating ${(activeExportIndex ?? 0) + 1} / ${batchItems.length}…`
              : `🚀 Generate All ${batchItems.length} Frames`}
          </button>
        </div>
      </div>

      {batchSummary && <div style={styles.summaryBanner}>✅ {batchSummary}</div>}

      {batchItems.length === 0 ? (
        <div style={styles.emptyBox}>
          <p style={styles.emptyText}>
            No frames loaded yet. Open the Results panel and click <strong>Load 6 Pending Frames</strong> or add individual items with <strong>+ Frame</strong>.
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {batchItems.map((frame) => {
            const frameLayers = frame.customLayers || baseLayers;
            const status = frameStatuses[frame.itemId] || 'idle';
            const errMsg = frameErrors[frame.itemId];
            const isEditing = !!expandedEditIds[frame.itemId];
            const bgTransform = activeTemplate?.background_transform || { scale: 1, x: 0, y: 0 };

            return (
              <div key={frame.itemId} style={styles.card}>
                {/* Card Header */}
                <div style={styles.cardHeader}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      {frame.resultNoConflict ? (
                        <span style={styles.frameNoConflict} role="alert">Conflicting official numbers</span>
                      ) : (
                        <span style={!frame.publicVisible || !frame.resultNo ? styles.frameNoWarning : styles.frameNo} role={!frame.publicVisible || !frame.resultNo ? 'status' : undefined}>
                          {getOfficialResultNumberLabel(
                            { value: frame.resultNo, conflict: false },
                            frame.publicVisible,
                          )}
                        </span>
                      )}
                      <span
                        style={{
                          ...styles.modePill,
                          backgroundColor: frame.publicVisible ? 'var(--ps-success-soft)' : 'var(--ps-surface-muted)',
                          color: frame.publicVisible ? 'var(--ps-success)' : 'var(--ps-muted)',
                        }}
                      >
                        {frame.publicVisible ? '🌐 Auto-Publish' : '📝 Draft'}
                      </span>
                      {status !== 'idle' && (
                        <span
                          style={{
                            ...styles.runStatusPill,
                            backgroundColor:
                              status === 'error'
                                ? 'var(--ps-danger-soft)'
                                : status === 'rendering'
                                ? 'var(--ps-accent-soft)'
                                : status === 'pending'
                                ? 'var(--ps-warning-soft)'
                                : status === 'uploading'
                                ? 'var(--ps-accent-soft)'
                                : 'var(--ps-success-soft)',
                            color:
                              status === 'error'
                                ? 'var(--ps-danger)'
                                : status === 'rendering'
                                ? 'var(--ps-accent)'
                                : status === 'pending'
                                ? 'var(--ps-warning)'
                                : status === 'uploading'
                                ? 'var(--ps-accent)'
                                : 'var(--ps-success)',
                          }}
                        >
                          {status === 'rendering'
                            ? '⏳ Rendering…'
                            : status === 'published'
                            ? '✓ Published'
                            : status === 'draft'
                            ? '✓ Draft Saved'
                            : status === 'uploading'
                            ? 'Uploading…'
                            : status === 'pending'
                            ? 'Saved locally · upload pending'
                            : '✕ Error'}
                        </span>
                      )}
                    </div>
                    <div style={styles.cardTitle} title={frame.variables.event_name || frame.itemName}>
                      {frame.variables.event_name || frame.itemName}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      disabled={isBatchRunning}
                      onClick={() =>
                        setExpandedEditIds((prev) => ({
                          ...prev,
                          [frame.itemId]: !prev[frame.itemId],
                        }))
                      }
                      style={styles.smallBtn}
                      title="Quick edit text"
                    >
                      {isEditing ? 'Hide Edit' : 'Edit Text'}
                    </button>
                    <button
                      disabled={isBatchRunning}
                      onClick={() => handleEditSingle(frame)}
                      style={styles.smallBtn}
                      title="Open this frame on full Canvas"
                    >
                      Canvas
                    </button>
                    <button
                      onClick={() => removeBatchItem(frame.itemId)}
                      disabled={isBatchRunning}
                      style={styles.removeBtn}
                      title="Remove frame"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {errMsg && (
                  <div style={styles.errorText}>
                    ⚠ {errMsg}
                    {downloadRecoveries[frame.itemId] && (
                      <button
                        style={styles.smallBtn}
                        onClick={() => {
                          const recovery = downloadRecoveries[frame.itemId];
                          if (!recovery) return;
                          const objectUrl = URL.createObjectURL(recovery.blob);
                          const anchor = document.createElement('a');
                          anchor.href = objectUrl;
                          anchor.download = recovery.filename;
                          anchor.click();
                          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
                          setDownloadRecoveries((previous) => {
                            const { [frame.itemId]: _removed, ...remaining } = previous;
                            return remaining;
                          });
                        }}
                      >
                        Download image
                      </button>
                    )}
                  </div>
                )}

                {/* Proportional Live Preview */}
                <div style={styles.previewWrap}>
                  <OffscreenRenderer
                    key={`preview-${frame.itemId}`}
                    renderKey={`preview-${frame.itemId}`}
                    layers={frameLayers}
                    variables={frame.variables}
                    width={canvasW}
                    height={canvasH}
                    backgroundUrl={activeTemplate?.background_url}
                    backgroundTransform={bgTransform}
                    customFontReferences={customFontReferences}
                    previewScale={previewScale}
                  />
                </div>

                {/* Compact Inline Editor */}
                {isEditing && (
                  <div style={styles.inlineForm}>
                    <div style={styles.formRow2}>
                      <div style={{ width: 64 }}>
                        <label style={styles.fieldLabel}>No.</label>
                        <input
                          style={styles.input}
                          disabled={isBatchRunning}
                          value={frame.variables.result_no || ''}
                          onChange={(e) =>
                            updateBatchItemVariables(frame.itemId, { result_no: e.target.value })
                          }
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={styles.fieldLabel}>Event Name</label>
                        <input
                          style={styles.input}
                          disabled={isBatchRunning}
                          value={frame.variables.event_name || ''}
                          onChange={(e) =>
                            updateBatchItemVariables(frame.itemId, { event_name: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    {[1, 2, 3].map((rank) => (
                      <div key={rank} style={styles.formRow2}>
                        <div style={{ flex: 1 }}>
                          <label style={styles.fieldLabel}>{rank}st/nd/rd Name</label>
                          <input
                            style={styles.input}
                            disabled={isBatchRunning}
                            value={frame.variables[`name_${rank}`] || ''}
                            onChange={(e) =>
                              updateBatchItemVariables(frame.itemId, {
                                [`name_${rank}`]: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={styles.fieldLabel}>Unit</label>
                          <input
                            style={styles.input}
                            disabled={isBatchRunning}
                            value={frame.variables[`unit_${rank}`] || ''}
                            onChange={(e) =>
                              updateBatchItemVariables(frame.itemId, {
                                [`unit_${rank}`]: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sequential Offscreen Renderer for Batch Generation */}
      {isBatchRunning && batchRun && activeRunFrame && (
        <OffscreenRenderer
          key={activeRunFrame.operationId}
          renderKey={activeRunFrame.operationId}
          layers={activeRunFrame.snapshot.layers}
          variables={activeRunFrame.snapshot.variables}
          width={activeRunFrame.snapshot.width}
          height={activeRunFrame.snapshot.height}
          backgroundUrl={activeRunFrame.backgroundUrl}
          backgroundTransform={activeRunFrame.snapshot.backgroundTransform}
          customFontReferences={activeRunFrame.snapshot.customFontReferences}
          onReady={handleBatchCapture}
          onError={handleBatchRenderError}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--ps-app-bg)',
    overflowY: 'auto',
    padding: 16,
    gap: 14,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    padding: '12px 16px',
    backgroundColor: 'var(--ps-surface)',
    borderRadius: 10,
    border: '1px solid var(--ps-border)',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: 800,
    color: 'var(--ps-text)',
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--ps-muted)',
    marginTop: 4,
  },
  statBadgePub: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 999,
    backgroundColor: 'var(--ps-success-soft)',
    color: 'var(--ps-success)',
  },
  statBadgeDraft: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 999,
    backgroundColor: 'var(--ps-surface-muted)',
    color: 'var(--ps-muted)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    padding: '8px 14px',
    borderRadius: 6,
    border: '1px solid var(--ps-border-strong)',
    backgroundColor: 'var(--ps-surface)',
    color: 'var(--ps-text)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  generateAllBtn: {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: 'var(--ps-accent)',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  summaryBanner: {
    padding: '10px 14px',
    borderRadius: 8,
    backgroundColor: 'var(--ps-accent-soft)',
    border: '1px solid var(--ps-border)',
    color: 'var(--ps-accent)',
    fontSize: 13,
    fontWeight: 600,
  },
  emptyBox: {
    padding: 40,
    textAlign: 'center',
    backgroundColor: 'var(--ps-surface)',
    borderRadius: 10,
    border: '1px dashed var(--ps-border-strong)',
  },
  emptyText: {
    fontSize: 13,
    color: 'var(--ps-muted)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
    minWidth: 0,
    gap: 14,
  },
  card: {
    minWidth: 0,
    backgroundColor: 'var(--ps-surface)',
    border: '1px solid var(--ps-border)',
    borderRadius: 10,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  frameNo: {
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--ps-accent)',
  },
  frameNoConflict: {
    color: 'var(--ps-danger)',
    backgroundColor: 'var(--ps-danger-soft)',
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 6px',
    borderRadius: 4,
  },
  frameNoWarning: {
    color: 'var(--ps-warning)',
    backgroundColor: 'var(--ps-warning-soft)',
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 6px',
    borderRadius: 4,
  },
  modePill: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 999,
  },
  runStatusPill: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 999,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--ps-text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  smallBtn: {
    padding: '4px 8px',
    borderRadius: 4,
    border: '1px solid var(--ps-border)',
    backgroundColor: 'var(--ps-surface-muted)',
    color: 'var(--ps-text)',
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
  },
  removeBtn: {
    padding: '2px 8px',
    borderRadius: 4,
    border: '1px solid var(--ps-danger-soft)',
    backgroundColor: 'var(--ps-danger-soft)',
    color: 'var(--ps-danger)',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  errorText: {
    fontSize: 11,
    color: 'var(--ps-danger)',
    backgroundColor: 'var(--ps-danger-soft)',
    padding: '6px 8px',
    borderRadius: 6,
  },
  previewWrap: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    backgroundColor: 'var(--ps-canvas-surround)',
    borderRadius: 8,
  },
  inlineForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingTop: 6,
    borderTop: '1px solid var(--ps-border)',
  },
  formRow2: {
    display: 'flex',
    gap: 6,
  },
  fieldLabel: {
    display: 'block',
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--ps-muted)',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  input: {
    width: '100%',
    minHeight: 38,
    padding: '5px 7px',
    borderRadius: 4,
    border: '1px solid var(--ps-border)',
    backgroundColor: 'var(--ps-surface)',
    color: 'var(--ps-text)',
    fontSize: 11,
    boxSizing: 'border-box',
  },
};
