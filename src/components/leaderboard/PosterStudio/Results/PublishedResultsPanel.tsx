import { coreColor } from '@/constants/coreTheme';
/**
 * PublishedResultsPanel
 * --------------------
 * Loads published festival results (both publicly visible and internal/not-yet-public)
 * grouped cleanly per competition item (1 card = 1 competition), uses the
 * Public Item Results order, and supports both single-frame binding and
 * multi-frame batch selection (up to 6 frames simultaneously).
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { resultVisibilityService, FestivalResult } from '../../../../services/resultVisibilityService';
import { festivalCategoryService } from '../../../../services/festivalCategoryService';
import { useTemplateStore, BatchFrameItem, TemplateVariables } from '../Stores/templateStore';
import { supabase } from '../../../../core/config/supabase';
import { CATEGORIES, SAHITHYOLSAV_CATEGORY_ALIASES } from '../../../../constants/categories';
import { buildRankVariables, compareOfficialResultNumbers, fingerprintOfficialResults, getOfficialResultNumberLabel, isPosterEligibleWinner, resolvePublicOrder } from './resultGroupRules';

interface PublishedResultsPanelProps {
  festivalId: string;
  tenantId: string;
}

interface CompetitionItemGroup {
  itemId: string;
  primaryResultId: string;
  itemName: string;
  itemNameMl: string;
  categoryNameEn: string;
  categoryNameMl: string;
  publicVisible: boolean;
  earliestPublishedAt: string;
  resultNo: string;
  resultNoConflict: boolean;
  sourceResultFingerprint: string;
  results: FestivalResult[];
  isExported: boolean;
  exportedVisibility: 'published' | 'draft' | null;
  variables: TemplateVariables;
}

export default function PublishedResultsPanel({ festivalId, tenantId }: PublishedResultsPanelProps) {
  const [rawResults, setRawResults] = useState<FestivalResult[]>([]);
  const [publicOrderByGroupKey, setPublicOrderByGroupKey] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'exported'>('pending');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'not_public'>('all');

  const {
    setVariables,
    setCurrentResultId,
    setCurrentItemId,
    setCurrentResultPublicVisible,
    setSourceResultFingerprint,
    loadResultOverride,
    batchItems,
    setBatchItems,
    toggleBatchItem,
    setIsMultiFrameMode,
    assetsRefreshTick,
  } = useTemplateStore();

  const [itemCategories, setItemCategories] = useState<Record<string, { name_en: string; name_ml: string }>>({});
  const [exportedItemMap, setExportedItemMap] = useState<Map<string, 'published' | 'draft'>>(new Map());
  const [exportedResultMap, setExportedResultMap] = useState<Map<string, 'published' | 'draft'>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchAssets = async () => {
        const res = await supabase
          .from('generated_assets')
          .select('id, result_id, event_id, visibility_status, is_current')
          .eq('festival_id', festivalId);
        if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
          return await supabase
            .from('generated_assets')
            .select('id, result_id, event_id')
            .eq('festival_id', festivalId);
        }
        return res;
      };

      const [publicResults, itemsResult, customCategories, assetsResult] = await Promise.all([
        resultVisibilityService.listPosterStudioPublicResults(tenantId, festivalId),
        supabase.from('items').select('id, category_codes').eq('festival_id', festivalId),
        festivalCategoryService.list(festivalId, true).catch(() => []),
        fetchAssets(),
      ]);

      // Include all internally published results (public_visible true OR false)
      const published = publicResults.rows.filter((r) => r.published === true);
      setRawResults(published);
      setPublicOrderByGroupKey(publicResults.publicOrderByGroupKey);

      const itemExpMap = new Map<string, 'published' | 'draft'>();
      const resExpMap = new Map<string, 'published' | 'draft'>();
      if (assetsResult.data) {
        (assetsResult.data as any[]).forEach((a) => {
          if (a.is_current === false) return;
          const status: 'published' | 'draft' = a.visibility_status === 'draft' ? 'draft' : 'published';
          if (a.event_id) itemExpMap.set(a.event_id, status);
          if (a.result_id) resExpMap.set(a.result_id, status);
        });
      }
      setExportedItemMap(itemExpMap);
      setExportedResultMap(resExpMap);

      const customCatLookup = new Map<string, string>();
      (customCategories || []).forEach((c: any) => {
        if (c.code) customCatLookup.set(String(c.code).toLowerCase(), c.name || c.code);
      });

      const catMap: Record<string, { name_en: string; name_ml: string }> = {};
      if (itemsResult.data) {
        itemsResult.data.forEach((item: any) => {
          const codes = item.category_codes || [];
          if (codes.length > 0) {
            const firstCode = String(codes[0]);
            const lowerCode = firstCode.toLowerCase();
            const customName = customCatLookup.get(lowerCode);
            const catObj = CATEGORIES.find(
              (c) =>
                c.code.toUpperCase() === firstCode.toUpperCase() ||
                SAHITHYOLSAV_CATEGORY_ALIASES[firstCode.toUpperCase()] === c.code
            );
            catMap[item.id] = {
              name_en: customName || (catObj ? catObj.name_en : firstCode.toUpperCase()),
              name_ml: catObj ? catObj.name_ml : customName || firstCode,
            };
          } else {
            catMap[item.id] = { name_en: '', name_ml: '' };
          }
        });
      }
      setItemCategories(catMap);
    } catch (e: any) {
      setError(e.message || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [tenantId, festivalId]);

  useEffect(() => {
    load();
  }, [load, assetsRefreshTick]);

  // Group into one CompetitionItemGroup per item_id and use the Public Item Results order.
  const itemGroups = useMemo<CompetitionItemGroup[]>(() => {
    const groupedMap = new Map<string, FestivalResult[]>();
    rawResults.forEach((r) => {
      const key = r.item_id || r.result_id;
      const list = groupedMap.get(key) || [];
      list.push(r);
      groupedMap.set(key, list);
    });

    type TempGroup = Omit<CompetitionItemGroup, 'variables'>;
    const tempGroups: TempGroup[] = [];

    groupedMap.forEach((rows, itemId) => {
      const sortedRows = [...rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
      const firstRow = sortedRows[0];
      const publicVisible = sortedRows.some((r) => r.public_visible === true);
      const publicGroupKey = firstRow.item_id || `result:${firstRow.result_id}`;
      const publicNumber = resolvePublicOrder(publicOrderByGroupKey.get(publicGroupKey));

      let earliestPublishedAt = '';
      sortedRows.forEach((r) => {
        if (r.published_at && (!earliestPublishedAt || r.published_at < earliestPublishedAt)) {
          earliestPublishedAt = r.published_at;
        }
      });

      let exportedVisibility: 'published' | 'draft' | null = exportedItemMap.get(itemId) ?? null;
      if (!exportedVisibility) {
        for (const r of sortedRows) {
          const v = exportedResultMap.get(r.result_id);
          if (v) {
            exportedVisibility = v;
            break;
          }
        }
      }

      const categoryObj = itemCategories[itemId] || { name_en: '', name_ml: '' };

      tempGroups.push({
        itemId,
        primaryResultId: firstRow.result_id,
        itemName: firstRow.item_name || firstRow.item_name_ml || 'Event',
        itemNameMl: firstRow.item_name_ml || '',
        categoryNameEn: categoryObj.name_en,
        categoryNameMl: categoryObj.name_ml,
        publicVisible,
        resultNo: publicNumber.value,
        resultNoConflict: publicNumber.conflict,
        sourceResultFingerprint: fingerprintOfficialResults(sortedRows, Number(publicNumber.value) || undefined),
        earliestPublishedAt,
        results: sortedRows,
        isExported: exportedVisibility !== null,
        exportedVisibility,
      });
    });

    // Sort cards for browsing; this display order must never become an official result number.
    const publicSorted = tempGroups
      .filter((g) => g.publicVisible)
      .sort((a, b) => {
        const officialOrder = compareOfficialResultNumbers(
          resolvePublicOrder(Number(a.resultNo) || undefined),
          resolvePublicOrder(Number(b.resultNo) || undefined),
        );
        if (officialOrder !== 0) return officialOrder;
        const cmp = (a.earliestPublishedAt || '9999').localeCompare(b.earliestPublishedAt || '9999');
        return cmp !== 0 ? cmp : a.itemName.localeCompare(b.itemName);
      });

    const draftSorted = tempGroups
      .filter((g) => !g.publicVisible)
      .sort((a, b) => {
        const cmp = (a.earliestPublishedAt || '9999').localeCompare(b.earliestPublishedAt || '9999');
        return cmp !== 0 ? cmp : a.itemName.localeCompare(b.itemName);
      });

    return [...publicSorted, ...draftSorted].map((g) => {
      const resultNo = g.resultNo;
      const vars: TemplateVariables = {
        event_name: g.itemName,
        category_name: g.categoryNameEn,
        category_name_ml: g.categoryNameMl,
        result_no: resultNo,
      };
      Object.assign(vars, buildRankVariables(g.results));

      return {
        ...g,
        resultNo,
        resultNoConflict: g.resultNoConflict,
        sourceResultFingerprint: g.sourceResultFingerprint,
        variables: vars,
      };
    });
  }, [rawResults, itemCategories, exportedItemMap, exportedResultMap, publicOrderByGroupKey]);

  const toBatchFrameItem = (group: CompetitionItemGroup): BatchFrameItem => ({
    itemId: group.itemId,
    resultId: group.primaryResultId,
    itemName: group.itemName,
    itemNameMl: group.itemNameMl,
    categoryName: group.categoryNameEn,
    resultNo: group.resultNo,
    resultNoConflict: group.resultNoConflict,
    sourceResultFingerprint: group.sourceResultFingerprint,
    publicVisible: group.publicVisible,
    variables: group.variables,
  });

  const handleSelectItem = useCallback(
    (group: CompetitionItemGroup) => {
      setSelectedItemId(group.itemId);
      setVariables(group.variables);
      setCurrentResultId(group.primaryResultId);
      setCurrentItemId(group.itemId);
      setCurrentResultPublicVisible(group.publicVisible);
      setSourceResultFingerprint(group.sourceResultFingerprint);
      setIsMultiFrameMode(false);
      loadResultOverride(group.primaryResultId);
    },
    [
      setVariables,
      setCurrentResultId,
      setCurrentItemId,
      setCurrentResultPublicVisible,
      setSourceResultFingerprint,
      setIsMultiFrameMode,
      loadResultOverride,
    ]
  );

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return itemGroups.filter((g) => {
      if (activeTab === 'exported' && !g.isExported) return false;
      if (activeTab === 'pending' && g.isExported) return false;
      if (visibilityFilter === 'public' && !g.publicVisible) return false;
      if (visibilityFilter === 'not_public' && g.publicVisible) return false;
      if (!query) return true;
      return (
        g.itemName.toLowerCase().includes(query) ||
        g.itemNameMl.toLowerCase().includes(query) ||
        g.resultNo.includes(query) ||
        g.results.some(
          (r) =>
            r.participant_name?.toLowerCase().includes(query) ||
            r.organisation_name?.toLowerCase().includes(query)
        )
      );
    });
  }, [itemGroups, activeTab, visibilityFilter, searchQuery]);

  const pendingGroups = useMemo(
    () => itemGroups.filter((g) => !g.isExported),
    [itemGroups]
  );

  const handleLoadSixFrames = () => {
    const sourceList = filteredGroups.length > 0 && activeTab === 'pending' ? filteredGroups : pendingGroups;
    const picks = sourceList.slice(0, 6).map(toBatchFrameItem);
    if (picks.length === 0) {
      alert('No pending items available to load into Multi-Frame Grid.');
      return;
    }
    setBatchItems(picks);
    setIsMultiFrameMode(true);
  };

  const batchItemIdSet = useMemo(() => new Set(batchItems.map((b) => b.itemId)), [batchItems]);

  return (
    <div style={styles.root}>
      {/* Tabs */}
      <div style={styles.tabsRow}>
        <button
          style={activeTab === 'pending' ? styles.tabActive : styles.tabInactive}
          onClick={() => setActiveTab('pending')}
        >
          Pending ({itemGroups.filter((g) => !g.isExported).length})
        </button>
        <button
          style={activeTab === 'exported' ? styles.tabActive : styles.tabInactive}
          onClick={() => setActiveTab('exported')}
        >
          Exported ({itemGroups.filter((g) => g.isExported).length})
        </button>
        <button onClick={load} style={styles.refreshBtn} title="Refresh">↻</button>
      </div>

      {/* Multi-Frame Quick Actions */}
      <div style={styles.batchActionsBar}>
        <button onClick={handleLoadSixFrames} style={styles.loadBatchBtn}>
          ⚡ Load {Math.min(6, Math.max(1, pendingGroups.length))} Pending Frames
        </button>
        {batchItems.length > 0 && (
          <button
            onClick={() => setIsMultiFrameMode(true)}
            style={styles.openGridBtn}
            title="Open Multi-Frame Grid"
          >
            ⧉ Grid ({batchItems.length}/6)
          </button>
        )}
      </div>

      {/* Visibility Sub-Filter */}
      <div style={styles.filterRow}>
        {(['all', 'public', 'not_public'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVisibilityFilter(v)}
            style={visibilityFilter === v ? styles.filterChipActive : styles.filterChip}
          >
            {v === 'all' ? 'All' : v === 'public' ? '🌐 Public' : '📝 Not Public'}
          </button>
        ))}
      </div>

      <div style={styles.body}>
        {/* Search */}
        <div style={styles.searchRow}>
          <input
            type="text"
            placeholder="Search event, #no, winner or unit…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {loading && (
          <div style={styles.statusRow}>
            <span style={styles.loadingText}>Loading results…</span>
          </div>
        )}

        {error && (
          <div style={styles.errorRow}>
            <span>⚠ {error}</span>
            <button onClick={load} style={styles.retryBtn}>Retry</button>
          </div>
        )}

        {!loading && !error && filteredGroups.length === 0 && (
          <div style={styles.statusRow}>
            <span style={styles.emptyText}>No results found in this view.</span>
          </div>
        )}

        {/* Item Cards */}
        <div style={styles.grid}>
          {filteredGroups.map((group) => {
            const isSelected = selectedItemId === group.itemId;
            const isInBatch = batchItemIdSet.has(group.itemId);

            return (
              <div
                key={group.itemId}
                onClick={() => handleSelectItem(group)}
                style={{
                  ...styles.card,
                  borderColor: isSelected ? coreColor('#0d9488', 'border') : isInBatch ? coreColor('#38bdf8', 'info') : coreColor('#2a2a2a', 'border'),
                  backgroundColor: isSelected ? coreColor('#115e59', 'primary') : coreColor('#1f1f1f', 'surfaceStrong'),
                  boxShadow: isSelected ? '0 0 0 2px #14b8a6' : '0 1px 4px rgba(0,0,0,0.5)',
                }}
              >
                {/* Header: Result # + Event Name + Multi-frame checkbox */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span
                        style={{
                          ...styles.resultNoBadge,
                          ...(group.resultNoConflict || !group.publicVisible || !group.resultNo
                            ? styles.resultNoWarningBadge
                            : {}),
                        }}
                        title={getOfficialResultNumberLabel(
                          { value: group.resultNo, conflict: group.resultNoConflict },
                          group.publicVisible,
                        )}
                        role={group.resultNoConflict || (group.publicVisible && !group.resultNo) ? 'alert' : undefined}
                      >
                        {getOfficialResultNumberLabel(
                          { value: group.resultNo, conflict: group.resultNoConflict },
                          group.publicVisible,
                        )}
                      </span>
                      <span
                        style={{
                          ...styles.visBadge,
                          backgroundColor: group.publicVisible ? coreColor('#064e3b', 'successAction') : '#334155',
                          color: group.publicVisible ? coreColor('#34d399', 'success') : '#cbd5e1',
                        }}
                      >
                        {group.publicVisible ? '🌐 Public' : '📝 Draft Only'}
                      </span>
                    </div>
                    <div style={styles.cardEventName}>{group.itemName}</div>
                    {group.itemNameMl && group.itemNameMl !== group.itemName && (
                      <div style={styles.cardEventNameMl}>{group.itemNameMl}</div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isInBatch && batchItems.length >= 6) {
                        alert('Maximum 6 frames can be loaded simultaneously in Multi-Frame Grid.');
                        return;
                      }
                      toggleBatchItem(toBatchFrameItem(group));
                    }}
                    style={{
                      ...styles.frameToggleBtn,
                      backgroundColor: isInBatch ? 'var(--ps-accent)' : 'var(--ps-surface-muted)',
                      borderColor: isInBatch ? 'var(--ps-accent)' : 'var(--ps-border)',
                      color: isInBatch ? '#ffffff' : 'var(--ps-muted)',
                    }}
                    title={isInBatch ? 'Remove from 6-Frame Grid' : 'Add to 6-Frame Grid'}
                  >
                    {isInBatch ? '✓ Grid' : '+ Frame'}
                  </button>
                </div>

                {/* Ranked participants */}
                <div style={styles.cardRanks}>
                  {group.results.filter(isPosterEligibleWinner).map((r) => (
                    <div key={r.result_id} style={styles.rankRow}>
                      <span
                        style={{
                          ...styles.rankBadge,
                          backgroundColor:
                            r.rank === 1 ? '#422006' : r.rank === 2 ? '#1e293b' : '#3f2c00',
                        }}
                      >
                        {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
                      </span>
                      <span style={styles.participantName}>{r.participant_name || '—'}</span>
                      <span style={styles.orgName}>{r.organisation_name}</span>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div style={styles.cardFooter}>
                  <span
                    style={{
                      ...styles.statusPill,
                      backgroundColor: group.isExported
                        ? group.exportedVisibility === 'draft'
                          ? 'var(--ps-surface-muted)'
                          : 'var(--ps-accent-soft)'
                        : 'var(--ps-danger-soft)',
                      color: group.isExported
                        ? group.exportedVisibility === 'draft'
                          ? 'var(--ps-muted)'
                          : 'var(--ps-accent)'
                        : 'var(--ps-danger)',
                    }}
                  >
                    {group.isExported
                      ? group.exportedVisibility === 'draft'
                        ? '✓ Saved as Draft'
                        : '✓ Published Poster'
                      : '⏳ Poster Pending'}
                  </span>
                  {isSelected && <span style={styles.bindingIndicator}>⚡ Bound</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  tabsRow: {
    display: 'flex',
    padding: '0 16px',
    borderBottom: `1px solid ${coreColor('#2a2a2a', 'border')}`,
    gap: 14,
    alignItems: 'center',
    flexShrink: 0,
  },
  tabActive: {
    background: 'none',
    border: 'none',
    padding: '12px 0',
    fontSize: 12,
    fontWeight: 700,
    color: coreColor('#38bdf8', 'info'),
    borderBottom: `2px solid ${coreColor('#38bdf8', 'border')}`,
    cursor: 'pointer',
  },
  tabInactive: {
    background: 'none',
    border: 'none',
    padding: '12px 0',
    fontSize: 12,
    fontWeight: 500,
    color: coreColor('#94A3B8', 'textSubtle'),
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
  },
  refreshBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: coreColor('#94A3B8', 'textSubtle'),
    fontSize: 16,
    padding: '4px',
    borderRadius: 6,
    marginLeft: 'auto',
  },
  batchActionsBar: {
    display: 'flex',
    gap: 6,
    padding: '10px 16px 6px 16px',
    flexShrink: 0,
  },
  loadBatchBtn: {
    flex: 1,
    padding: '8px 10px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: 'var(--ps-accent)',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  },
  openGridBtn: {
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--ps-border-strong)',
    backgroundColor: 'var(--ps-accent-soft)',
    color: 'var(--ps-accent)',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  },
  filterRow: {
    display: 'flex',
    gap: 6,
    padding: '4px 16px 8px 16px',
    borderBottom: `1px solid ${coreColor('#2a2a2a', 'border')}`,
    flexShrink: 0,
  },
  filterChip: {
    padding: '4px 8px',
    borderRadius: 999,
    border: '1px solid #334155',
    backgroundColor: 'transparent',
    color: coreColor('#94A3B8', 'textSubtle'),
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterChipActive: {
    padding: '4px 8px',
    borderRadius: 999,
    border: '1px solid var(--ps-accent)',
    backgroundColor: 'var(--ps-accent-soft)',
    color: 'var(--ps-accent)',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 60,
  },
  searchRow: {
    padding: '10px 16px',
    borderBottom: `1px solid ${coreColor('#2a2a2a', 'border')}`,
    flexShrink: 0,
  },
  searchInput: {
    width: '100%',
    height: 32,
    padding: '0 12px',
    borderRadius: 6,
    border: `1px solid ${coreColor('#2a2a2a', 'border')}`,
    fontSize: 12,
    backgroundColor: coreColor('#1f1f1f', 'surfaceStrong'),
    color: coreColor('#E2E8F0', 'text'),
    outline: 'none',
    boxSizing: 'border-box',
  },
  statusRow: {
    padding: '24px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { fontSize: 13, color: coreColor('#94A3B8', 'textSubtle') },
  emptyText: { fontSize: 13, color: coreColor('#64748B', 'textMuted'), textAlign: 'center', lineHeight: 1.6 },
  errorRow: {
    padding: '12px 16px',
    backgroundColor: coreColor('#451a1a', 'surfaceStrong'),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    fontSize: 13,
    color: coreColor('#fca5a5', 'danger'),
  },
  retryBtn: {
    padding: '4px 10px',
    borderRadius: 6,
    border: `1px solid ${coreColor('#7f1d1d', 'border')}`,
    backgroundColor: coreColor('#1f1f1f', 'surfaceStrong'),
    cursor: 'pointer',
    fontSize: 12,
    color: coreColor('#fca5a5', 'danger'),
    fontWeight: 600,
  },
  grid: { display: 'flex', flexDirection: 'column', gap: 8, padding: 16 },
  card: {
    borderRadius: 8,
    border: '1px solid',
    padding: 10,
    cursor: 'pointer',
    transition: 'all 0.1s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  resultNoBadge: {
    fontSize: 10,
    fontWeight: 800,
    color: coreColor('#38bdf8', 'info'),
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    padding: '2px 6px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
  },
  resultNoWarningBadge: {
    color: coreColor('#fbbf24', 'warning'),
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  visBadge: {
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 999,
  },
  frameToggleBtn: {
    minHeight: 36,
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
  },
  cardEventName: { fontSize: 12, fontWeight: 600, color: coreColor('#E2E8F0', 'text'), lineHeight: 1.2 },
  cardEventNameMl: {
    fontSize: 11,
    color: coreColor('#94A3B8', 'textSubtle'),
    fontFamily: 'Noto Sans Malayalam, sans-serif',
  },
  cardRanks: { display: 'flex', flexDirection: 'column', gap: 2 },
  rankRow: { display: 'flex', alignItems: 'center', gap: 6 },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    flexShrink: 0,
  },
  participantName: {
    flex: 1,
    fontSize: 11,
    fontWeight: 600,
    color: coreColor('#CBD5E1', 'text'),
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  orgName: {
    fontSize: 9,
    color: coreColor('#64748B', 'textMuted'),
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 80,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  statusPill: {
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 999,
    letterSpacing: '0.02em',
  },
  bindingIndicator: { fontSize: 9, fontWeight: 700, color: coreColor('#38bdf8', 'info') },
};
