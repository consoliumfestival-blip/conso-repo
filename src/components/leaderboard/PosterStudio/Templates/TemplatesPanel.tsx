import React, { useState } from 'react';
import { useGetPosterTemplates, useDeletePosterTemplate } from '../../../../core/hooks/useLeaderboardSettings';
import { LayoutTemplate, Plus, Search, Check, RotateCcw, Trash2 } from 'lucide-react';
import { useTemplateStore } from '../Stores/templateStore';

interface TemplatesPanelProps {
  festivalId: string;
  currentTemplateId: string;
  onSelectTemplate: (id: string) => void;
  onCreateNew: () => void;
}

export default function TemplatesPanel({ festivalId, currentTemplateId, onSelectTemplate, onCreateNew }: TemplatesPanelProps) {
  const { data: dbTemplates = [], isLoading } = useGetPosterTemplates(festivalId);
  const deleteTemplate = useDeletePosterTemplate(festivalId);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = dbTemplates.filter((t: any) => 
    t.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <button onClick={onCreateNew} style={styles.createBtn}>
          <Plus size={16} />
          Create New Template
        </button>
      </div>

      <div style={styles.searchRow}>
        <Search size={14} color="#64748B" />
        <input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      <div style={styles.list}>
        {isLoading && <p style={styles.emptyText}>Loading templates...</p>}
        {!isLoading && filtered.length === 0 && searchQuery && <p style={styles.emptyText}>No templates found.</p>}
        
        {(!searchQuery || 'starter template'.includes(searchQuery.toLowerCase())) && (
          <div 
            style={{
              ...styles.item,
              borderColor: currentTemplateId === 'starter-template' ? '#38BDF8' : '#1E293B',
              backgroundColor: currentTemplateId === 'starter-template' ? 'rgba(56, 189, 248, 0.05)' : '#0F172A'
            }}
          >
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer' }}
              onClick={() => onSelectTemplate('starter-template')}
            >
              <div style={styles.iconBox}>
                <LayoutTemplate size={16} color={currentTemplateId === 'starter-template' ? '#38BDF8' : '#64748B'} />
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={styles.name}>Starter Template</div>
                <div style={styles.sub}>Default Layout • 1080x1080</div>
              </div>
              {currentTemplateId === 'starter-template' && <Check size={16} color="#38BDF8" />}
            </div>
          </div>
        )}

        {filtered.map((t: any) => {
          const isSelected = t.id === currentTemplateId;
          return (
            <div 
              key={t.id} 
              style={{
                ...styles.item,
                borderColor: isSelected ? '#38BDF8' : '#1E293B',
                backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.05)' : '#0F172A'
              }}
            >
              <div 
                style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer' }}
                onClick={() => onSelectTemplate(t.id)}
              >
                <div style={styles.iconBox}>
                  <LayoutTemplate size={16} color={isSelected ? '#38BDF8' : '#64748B'} />
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={styles.name}>{t.name || 'Untitled Template'}</div>
                  <div style={styles.sub}>
                    {t.aspect_ratio || '1:1'} • {t.width}x{t.height}
                  </div>
                </div>
                {isSelected && <Check size={16} color="#38BDF8" />}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Are you sure you want to delete this template?')) {
                    deleteTemplate.mutate(t.id, {
                      onSuccess: () => {
                        if (isSelected) {
                          useTemplateStore.getState().resetLayersToStarter();
                          onSelectTemplate('');
                        }
                      }
                    });
                  }
                }}
                style={styles.deleteBtn}
                title="Delete Template"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
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
  header: {
    padding: '16px',
    borderBottom: '1px solid #2a2a2a'
  },
  createBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px',
    backgroundColor: '#38bdf8',
    color: '#0f172a',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    transition: 'opacity 0.1s'
  },
  resetBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '8px',
    marginTop: 8,
    backgroundColor: 'transparent',
    color: '#94A3B8',
    border: '1px solid #334155',
    borderRadius: 6,
    fontWeight: 500,
    fontSize: 12,
    cursor: 'pointer',
    transition: 'opacity 0.1s'
  },
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid #2a2a2a',
    backgroundColor: '#171717'
  },
  searchInput: {
    flex: 1,
    background: 'none',
    border: 'none',
    color: '#E2E8F0',
    fontSize: 13,
    outline: 'none'
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px 60px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px',
    border: '1px solid',
    borderRadius: 8,
    transition: 'all 0.15s ease'
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  name: {
    fontSize: 13,
    fontWeight: 600,
    color: '#E2E8F0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  sub: {
    fontSize: 11,
    color: '#94A3B8'
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#EF4444',
    padding: '8px',
    cursor: 'pointer',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
  }
};
