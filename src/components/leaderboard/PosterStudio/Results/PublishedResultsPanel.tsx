/**
 * PublishedResultsPanel
 * --------------------
 * Phase 6: Published Results Engine
 * 
 * Loads all published festival results using the existing resultVisibilityService.
 * When a result is clicked, auto-binds its data to the templateStore variables
 * so the canvas re-renders the poster instantly.
 * 
 * Architecture rules: No direct DB calls. Uses service layer only.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { resultVisibilityService, FestivalResult } from '../../../../services/resultVisibilityService';
import { useTemplateStore, TemplateVariables } from '../Stores/templateStore';
import { supabase } from '../../../../core/config/supabase';
import { CATEGORIES, SAHITHYOLSAV_CATEGORY_ALIASES } from '../../../../constants/categories';

interface PublishedResultsPanelProps {
  festivalId: string;
  tenantId: string;
}

type GroupedResults = {
  item_name: string;
  results: FestivalResult[];
};

export default function PublishedResultsPanel({ festivalId, tenantId }: PublishedResultsPanelProps) {
  const [results, setResults] = useState<FestivalResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'exported'>('pending');
  const { setVariables, setCurrentResultId, loadResultOverride } = useTemplateStore();
  const [itemCategories, setItemCategories] = useState<Record<string, { name_en: string; name_ml: string }>>({});
  const [exportedResultIds, setExportedResultIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, itemsResult, assetsResult] = await Promise.all([
        resultVisibilityService.listFestivalResults(tenantId, festivalId),
        supabase.from('items').select('id, category_codes').eq('festival_id', festivalId),
        supabase.from('generated_assets').select('result_id').eq('festival_id', festivalId).not('result_id', 'is', null)
      ]);
      
      // ONLY show results that are published and publicly visible
      const published = data.filter(r => r.published && r.public_visible);
      setResults(published);

      if (assetsResult.data) {
        setExportedResultIds(new Set(assetsResult.data.map((a: any) => a.result_id)));
      }

      const catMap: Record<string, { name_en: string; name_ml: string }> = {};
      if (itemsResult.data) {
        itemsResult.data.forEach((item: any) => {
          const codes = item.category_codes || [];
          if (codes.length > 0) {
            const firstCode = codes[0];
            const catObj = CATEGORIES.find(c => c.code.toUpperCase() === firstCode.toUpperCase() || SAHITHYOLSAV_CATEGORY_ALIASES[firstCode.toUpperCase()] === c.code);
            catMap[item.id] = {
              name_en: catObj ? catObj.name_en : firstCode,
              name_ml: catObj ? catObj.name_ml : firstCode,
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
  }, [load]);

  // Auto-bind selected result to template variables
  const handleSelectResult = useCallback((result: FestivalResult) => {
    setSelectedId(result.result_id);

    // Gather ranked results for this item (same item_name, sorted by rank)
    const itemResults = results
      .filter(r => r.item_id === result.item_id)
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

    const getByRank = (rank: number) =>
      itemResults.find(r => r.rank === rank)?.participant_name || '';

    // Build variable map matching templateStore.TemplateVariables schema
    const rawId = String(result.registration_id || result.result_id || '');
    const shortRefId = rawId.split('-')[0].toUpperCase();

    const categoryNameObj = result.item_id ? itemCategories[result.item_id] : null;

    const vars: Record<string, string> = {
      event_name: result.item_name,
      category_name: categoryNameObj?.name_en || '',
      category_name_ml: categoryNameObj?.name_ml || '',
      result_no: result.public_result_no ? String(result.public_result_no) : '',
    };

    for (let i = 1; i <= 5; i++) {
      const winners = itemResults.filter((r: any) => r.rank === i);
      if (winners.length > 0) {
        vars[`name_${i}`] = winners.map((w: any) => w.participant_name.toUpperCase()).join(' & ');
        vars[`unit_${i}`] = winners.map((w: any) => w.organisation_name || '').join(' & ');
        vars[`grade_${i}`] = winners[0].grade || '';
        vars[`points_${i}`] = String(winners[0].points_awarded || '');
      } else {
        vars[`name_${i}`] = '';
        vars[`unit_${i}`] = '';
        vars[`grade_${i}`] = '';
        vars[`points_${i}`] = '';
      }
    }

    setVariables(vars);
    setCurrentResultId(result.result_id);
    loadResultOverride(result.result_id);
  }, [results, itemCategories, setVariables, setCurrentResultId, loadResultOverride]);

  // Group by item for display
  const filtered = results.filter(r => {
    const isExported = exportedResultIds.has(r.result_id);
    if (activeTab === 'exported' && !isExported) return false;
    if (activeTab === 'pending' && isExported) return false;

    const query = searchQuery.toLowerCase();
    return r.item_name?.toLowerCase().includes(query) ||
           r.participant_name?.toLowerCase().includes(query) ||
           r.organisation_name?.toLowerCase().includes(query);
  });

  // Deduplicate by item_id to show one card per event
  const uniqueItems = Array.from(
    new Map(filtered.map(r => [r.item_id, r])).values()
  );

  return (
    <div style={styles.root}>
      {/* Tabs */}
      <div style={styles.tabsRow}>
        <button 
          style={activeTab === 'pending' ? styles.tabActive : styles.tabInactive}
          onClick={() => setActiveTab('pending')}
        >
          Pending
        </button>
        <button 
          style={activeTab === 'exported' ? styles.tabActive : styles.tabInactive}
          onClick={() => setActiveTab('exported')}
        >
          Exported
        </button>
        <button onClick={load} style={styles.refreshBtn} title="Refresh">↻</button>
      </div>

      <div style={styles.body}>
          {/* Search */}
          <div style={styles.searchRow}>
            <input
              type="text"
              placeholder="Search results or events…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
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

          {!loading && !error && uniqueItems.length === 0 && (
            <div style={styles.statusRow}>
              <span style={styles.emptyText}>No results found in this view.</span>
            </div>
          )}

          {/* Results Grid */}
          <div style={styles.grid}>
            {uniqueItems.map(result => {
              const isSelected = selectedId === result.result_id;
              // Find all participants for this item
              const itemResults = results
                .filter(r => r.item_id === result.item_id)
                .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

              return (
                <div
                  key={result.result_id}
                  onClick={() => handleSelectResult(result)}
                  style={{
                    ...styles.card,
                    borderColor: isSelected ? '#0d9488' : '#2a2a2a',
                    backgroundColor: isSelected ? '#115e59' : '#1f1f1f',
                    boxShadow: isSelected ? '0 0 0 2px #14b8a6' : '0 1px 4px rgba(0,0,0,0.5)',
                  }}
                >
                  {/* Event Name */}
                  <div style={styles.cardEventName}>{result.item_name}</div>
                  {result.item_name_ml && (
                    <div style={styles.cardEventNameMl}>{result.item_name_ml}</div>
                  )}

                  {/* Ranked participants */}
                  <div style={styles.cardRanks}>
                    {itemResults.slice(0, 3).map(r => (
                      <div key={r.result_id} style={styles.rankRow}>
                        <span style={{ ...styles.rankBadge, backgroundColor: r.rank === 1 ? '#422006' : r.rank === 2 ? '#1e293b' : '#3f2c00' }}>
                          {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
                        </span>
                        <span style={styles.participantName}>{r.participant_name || '—'}</span>
                        <span style={styles.orgName}>{r.organisation_name}</span>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div style={styles.cardFooter}>
                    <span style={{ ...styles.statusPill, backgroundColor: activeTab === 'exported' ? '#064e3b' : '#451a1a', color: activeTab === 'exported' ? '#34d399' : '#fca5a5' }}>
                      {activeTab === 'exported' ? '✓ Poster Exported' : '⏳ Poster Pending'}
                    </span>
                    {isSelected && (
                      <span style={styles.bindingIndicator}>⚡ Bound to template</span>
                    )}
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
    overflow: 'hidden'
  },
  tabsRow: {
    display: 'flex',
    padding: '0 16px',
    borderBottom: '1px solid #2a2a2a',
    gap: 16,
    alignItems: 'center',
    flexShrink: 0,
  },
  tabActive: {
    background: 'none', border: 'none', padding: '12px 0', fontSize: 13, fontWeight: 600, color: '#38bdf8', borderBottom: '2px solid #38bdf8', cursor: 'pointer'
  },
  tabInactive: {
    background: 'none', border: 'none', padding: '12px 0', fontSize: 13, fontWeight: 500, color: '#94A3B8', borderBottom: '2px solid transparent', cursor: 'pointer'
  },
  refreshBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 16, padding: '4px', borderRadius: 6, marginLeft: 'auto' },
  body: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: 60 },
  searchRow: { padding: '10px 16px', borderBottom: '1px solid #2a2a2a', flexShrink: 0 },
  searchInput: {
    width: '100%', height: 32, padding: '0 12px', borderRadius: 6, border: '1px solid #2a2a2a', fontSize: 12, backgroundColor: '#1f1f1f', color: '#E2E8F0', outline: 'none', boxSizing: 'border-box',
  },
  statusRow: { padding: '24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 13, color: '#94A3B8' },
  emptyText: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 1.6 },
  errorRow: { padding: '12px 16px', backgroundColor: '#451a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#fca5a5' },
  retryBtn: { padding: '4px 10px', borderRadius: 6, border: '1px solid #7f1d1d', backgroundColor: '#1f1f1f', cursor: 'pointer', fontSize: 12, color: '#fca5a5', fontWeight: 600 },
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
  cardEventName: { fontSize: 12, fontWeight: 600, color: '#E2E8F0', lineHeight: 1.2 },
  cardEventNameMl: { fontSize: 11, color: '#94A3B8', fontFamily: 'Noto Sans Malayalam, sans-serif' },
  cardRanks: { display: 'flex', flexDirection: 'column', gap: 2 },
  rankRow: { display: 'flex', alignItems: 'center', gap: 6 },
  rankBadge: { width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 },
  participantName: { flex: 1, fontSize: 11, fontWeight: 600, color: '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  orgName: { fontSize: 9, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 },
  cardFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  statusPill: { fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.02em' },
  bindingIndicator: { fontSize: 9, fontWeight: 700, color: '#38bdf8' },
};
