import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTemplateStore, BatchFrameItem } from '../Stores/templateStore';
import { useLayerStore } from '../Stores/layerStore';
import { useResolvedImageUrl } from '../../../../core/hooks/useResolvedImageUrl';
import { computeAutoShrinkFontSize, loadFont, ML_FONTS, EN_FONTS } from '../Utils/fontLoader';
import { resolveLayerText } from '../Utils/resolver';
import { dataUrlToBlob, saveGeneratedPosterAsset } from '../Utils/generatedAssetSaver';
import OffscreenRenderer from './OffscreenRenderer';

interface MultiFrameGridProps {
  festivalId: string;
  tenantId: string;
}

type FrameRunStatus = 'idle' | 'rendering' | 'published' | 'draft' | 'error';

export default function MultiFrameGrid({ festivalId, tenantId }: MultiFrameGridProps) {
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
    loadResultOverride,
    bumpAssetsRefreshTick,
  } = useTemplateStore();
  const { layers: baseLayers } = useLayerStore();

  const resolvedBgUrl = useResolvedImageUrl(activeTemplate?.background_url);

  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [activeExportIndex, setActiveExportIndex] = useState<number | null>(null);
  const [frameStatuses, setFrameStatuses] = useState<Record<string, FrameRunStatus>>({});
  const [frameErrors, setFrameErrors] = useState<Record<string, string>>({});
  const [expandedEditIds, setExpandedEditIds] = useState<Record<string, boolean>>({});
  const [batchSummary, setBatchSummary] = useState<string | null>(null);

  const processingIndexRef = useRef<number | null>(null);
  const batchCountsRef = useRef({ published: 0, draft: 0, failed: 0 });

  const canvasW = activeTemplate?.width || 1080;
  const canvasH = activeTemplate?.height || 1080;
  const previewW = 280;
  const previewScale = previewW / canvasW;
  const previewH = Math.round(canvasH * previewScale);

  // Preload all template fonts when entering Multi-Frame view
  useEffect(() => {
    const knownFonts = [...ML_FONTS, ...EN_FONTS];
    const families = Array.from(
      new Set(baseLayers.filter((l) => l.type === 'text' && l.fontFamily).map((l) => l.fontFamily!))
    );
    families.forEach((fam) => {
      const def = knownFonts.find((f) => f.family === fam);
      if (def) loadFont(def);
    });
  }, [baseLayers]);

  const publicCount = batchItems.filter((b) => b.publicVisible).length;
  const draftCount = batchItems.length - publicCount;

  const handleEditSingle = (frame: BatchFrameItem) => {
    setVariables(frame.variables);
    setCurrentResultId(frame.resultId);
    setCurrentItemId(frame.itemId);
    setCurrentResultPublicVisible(frame.publicVisible);
    setIsMultiFrameMode(false);
    loadResultOverride(frame.resultId);
  };

  const startBatchGenerate = () => {
    if (!activeTemplate || batchItems.length === 0 || isBatchRunning) return;
    setBatchSummary(null);
    batchCountsRef.current = { published: 0, draft: 0, failed: 0 };
    const initStatuses: Record<string, FrameRunStatus> = {};
    batchItems.forEach((b, i) => {
      initStatuses[b.itemId] = i === 0 ? 'rendering' : 'idle';
    });
    setFrameStatuses(initStatuses);
    setFrameErrors({});
    processingIndexRef.current = null;
    setIsBatchRunning(true);
    setActiveExportIndex(0);
  };

  const handleBatchCapture = useCallback(
    async (captureFunc: (ratio?: number) => string) => {
      if (activeExportIndex === null || !activeTemplate) return;
      if (processingIndexRef.current === activeExportIndex) return;
      processingIndexRef.current = activeExportIndex;

      const frame = batchItems[activeExportIndex];
      if (!frame) {
        setIsBatchRunning(false);
        setActiveExportIndex(null);
        return;
      }

      try {
        const dataUrl = captureFunc();
        const blob = dataUrlToBlob(dataUrl);
        const res = await saveGeneratedPosterAsset({
          blob,
          tenantId,
          festivalId,
          templateId: activeTemplate.id,
          eventId: frame.itemId,
          resultId: frame.resultId,
          eventName: frame.variables.event_name || frame.itemName,
          publicVisible: frame.publicVisible,
        });

        if (res.visibilityStatus === 'published') {
          batchCountsRef.current.published++;
        } else {
          batchCountsRef.current.draft++;
        }

        setFrameStatuses((prev) => ({
          ...prev,
          [frame.itemId]: res.visibilityStatus,
        }));
      } catch (err: any) {
        batchCountsRef.current.failed++;
        setFrameStatuses((prev) => ({ ...prev, [frame.itemId]: 'error' }));
        setFrameErrors((prev) => ({
          ...prev,
          [frame.itemId]: err?.message || 'Generation failed',
        }));
      }

      const nextIndex = activeExportIndex + 1;
      if (nextIndex < batchItems.length) {
        const nextFrame = batchItems[nextIndex];
        setFrameStatuses((prev) => ({ ...prev, [nextFrame.itemId]: 'rendering' }));
        setActiveExportIndex(nextIndex);
      } else {
        setIsBatchRunning(false);
        setActiveExportIndex(null);
        processingIndexRef.current = null;
        queryClient.invalidateQueries({ queryKey: ['generated-assets', festivalId] });
        bumpAssetsRefreshTick();
        const { published, draft, failed } = batchCountsRef.current;
        setBatchSummary(
          `Completed: ${published} Auto-Published to Public, ${draft} Saved as Draft in Media Center${
            failed > 0 ? `, ${failed} Failed` : ''
          }.`
        );
      }
    },
    [activeExportIndex, activeTemplate, batchItems, festivalId, tenantId, queryClient, bumpAssetsRefreshTick]
  );

  const activeFrame =
    isBatchRunning && activeExportIndex !== null ? batchItems[activeExportIndex] : null;

  const sortedLayers = [...baseLayers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

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
            const frameLayers = frame.customLayers || sortedLayers;
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
                      <span style={styles.frameNo}>#{frame.variables.result_no || frame.resultNo}</span>
                      <span
                        style={{
                          ...styles.modePill,
                          backgroundColor: frame.publicVisible ? '#064e3b' : '#334155',
                          color: frame.publicVisible ? '#34d399' : '#cbd5e1',
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
                                ? '#7f1d1d'
                                : status === 'rendering'
                                ? '#1e3a8a'
                                : '#14532d',
                            color: '#ffffff',
                          }}
                        >
                          {status === 'rendering'
                            ? '⏳ Rendering…'
                            : status === 'published'
                            ? '✓ Published'
                            : status === 'draft'
                            ? '✓ Draft Saved'
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

                {errMsg && <div style={styles.errorText}>⚠ {errMsg}</div>}

                {/* Proportional Live Preview */}
                <div style={styles.previewWrap}>
                  <div
                    style={{
                      width: previewW,
                      height: previewH,
                      position: 'relative',
                      overflow: 'hidden',
                      backgroundColor: '#FFFFFF',
                      borderRadius: 6,
                      boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                    }}
                  >
                    <div
                      style={{
                        width: canvasW,
                        height: canvasH,
                        position: 'relative',
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                        backgroundColor: '#FFFFFF',
                        overflow: 'hidden',
                      }}
                    >
                      {resolvedBgUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolvedBgUrl}
                          alt="Background"
                          style={{
                            position: 'absolute',
                            left: bgTransform.x ?? 0,
                            top: bgTransform.y ?? 0,
                            width: canvasW,
                            height: canvasH,
                            transform: `scale(${bgTransform.scale ?? 1})`,
                            transformOrigin: 'top left',
                            objectFit: 'fill',
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                      {frameLayers.map((layer) => {
                        if (layer.isVisible === false || layer.type !== 'text') return null;
                        const resolvedText = resolveLayerText(layer, frame.variables);
                        const fontFamilyStack = `"${layer.fontFamily || 'Poppins'}", "Noto Sans Malayalam", "Inter", sans-serif`;
                        const baseFontSize = layer.fontSize || 24;
                        const effectiveOverflow =
                          layer.overflowMode ||
                          (layer.dynamicBinding || layer.text?.includes('{') ? 'auto-shrink' : undefined);
                        const displayFontSize =
                          effectiveOverflow === 'auto-shrink' && layer.width
                            ? computeAutoShrinkFontSize({
                                text: resolvedText,
                                fontFamily: fontFamilyStack,
                                baseFontSize,
                                fontWeight: layer.fontWeight || 600,
                                maxWidth: layer.width,
                                maxHeight: layer.height,
                                maxLines: layer.maxLines,
                                lineHeight: layer.lineHeight || 1.2,
                              })
                            : baseFontSize;

                        return (
                          <div
                            key={layer.id}
                            style={{
                              position: 'absolute',
                              left: layer.x,
                              top: layer.y,
                              width: layer.width || 'auto',
                              height: layer.height || 'auto',
                              fontSize: displayFontSize,
                              fontFamily: fontFamilyStack,
                              fontWeight: layer.fontWeight || 600,
                              fontStyle: layer.fontStyle || 'normal',
                              color: layer.fill || '#000000',
                              textAlign: (layer.align as any) || 'left',
                              lineHeight: layer.lineHeight || 1.2,
                              letterSpacing: layer.letterSpacing || 0,
                              opacity: layer.opacity ?? 1,
                              transform: `rotate(${layer.rotation || 0}deg)`,
                              transformOrigin: 'top left',
                              whiteSpace: effectiveOverflow === 'clip' ? 'nowrap' : 'pre-wrap',
                              overflow: 'hidden',
                              textOverflow: effectiveOverflow === 'ellipsis' ? 'ellipsis' : 'clip',
                              wordBreak: 'break-word',
                              pointerEvents: 'none',
                            }}
                          >
                            {resolvedText}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Compact Inline Editor */}
                {isEditing && (
                  <div style={styles.inlineForm}>
                    <div style={styles.formRow2}>
                      <div style={{ width: 64 }}>
                        <label style={styles.fieldLabel}>No.</label>
                        <input
                          style={styles.input}
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
      {isBatchRunning && activeTemplate && activeFrame && (
        <OffscreenRenderer
          key={`${activeFrame.itemId}_${activeExportIndex}`}
          layers={activeFrame.customLayers || baseLayers}
          variables={activeFrame.variables}
          width={canvasW}
          height={canvasH}
          backgroundUrl={activeTemplate.background_url}
          backgroundTransform={activeTemplate.background_transform}
          onReady={handleBatchCapture}
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
    backgroundColor: '#121316',
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
    backgroundColor: '#1b1d22',
    borderRadius: 10,
    border: '1px solid #2a2d35',
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
    color: '#F1F5F9',
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  statBadgePub: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 999,
    backgroundColor: '#064e3b',
    color: '#34d399',
  },
  statBadgeDraft: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 999,
    backgroundColor: '#334155',
    color: '#cbd5e1',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    padding: '8px 14px',
    borderRadius: 6,
    border: '1px solid #475569',
    backgroundColor: 'transparent',
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  generateAllBtn: {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#0F766E',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  summaryBanner: {
    padding: '10px 14px',
    borderRadius: 8,
    backgroundColor: '#064e3b',
    border: '1px solid #059669',
    color: '#ECFDF5',
    fontSize: 13,
    fontWeight: 600,
  },
  emptyBox: {
    padding: 40,
    textAlign: 'center',
    backgroundColor: '#1b1d22',
    borderRadius: 10,
    border: '1px dashed #334155',
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
    gap: 14,
  },
  card: {
    backgroundColor: '#1b1d22',
    border: '1px solid #2a2d35',
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
    color: '#38bdf8',
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
    color: '#E2E8F0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  smallBtn: {
    padding: '4px 8px',
    borderRadius: 4,
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
  },
  removeBtn: {
    padding: '2px 8px',
    borderRadius: 4,
    border: '1px solid #451a1a',
    backgroundColor: '#2a1215',
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  errorText: {
    fontSize: 11,
    color: '#FCA5A5',
    backgroundColor: '#451a1a',
    padding: '6px 8px',
    borderRadius: 6,
  },
  previewWrap: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#0f1014',
    borderRadius: 8,
  },
  inlineForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingTop: 6,
    borderTop: '1px solid #2a2d35',
  },
  formRow2: {
    display: 'flex',
    gap: 6,
  },
  fieldLabel: {
    display: 'block',
    fontSize: 9,
    fontWeight: 700,
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  input: {
    width: '100%',
    padding: '5px 7px',
    borderRadius: 4,
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: '#F1F5F9',
    fontSize: 11,
    boxSizing: 'border-box',
  },
};
