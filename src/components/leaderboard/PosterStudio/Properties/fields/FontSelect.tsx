import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
// @ts-ignore
import { createPortal } from 'react-dom';
import { ML_FONTS, EN_FONTS, loadFont, FontDefinition } from '../../Utils/fontLoader';
import { fontService, FontMetadata } from '../../../../../services/fontService';
import { storageService } from '../../../../../services/storage/storageService';
import { useAuthStore } from '../../../../../core/store/authStore';
import { useLocalSearchParams } from 'expo-router';
import FontManagerPanel from '../FontManagerPanel';
import { Search, Check, ChevronDown } from 'lucide-react';

interface FontSelectProps {
  label: string;
  value: string;
  onChange: (family: string) => void;
  script?: 'ml' | 'en' | 'both';
}

export default function FontSelect({ label, value, onChange, script = 'both' }: FontSelectProps) {
  const { tenant_id } = useAuthStore();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const festivalId = Array.isArray(id) ? id[0] : id;

  const [customFonts, setCustomFonts] = useState<any[]>([]);
  const [showManager, setShowManager] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const fetchFonts = useCallback(async () => {
    if (!tenant_id) return;
    try {
      const fonts = await fontService.getFonts(tenant_id, festivalId);
      const resolvedList = await Promise.all(
        fonts.map(async (f) => {
          const meta = f.metadata as FontMetadata;
          if (!meta) return null;
          
          let url = f.file_url;
          if (url && url.startsWith('r2://')) {
            const objectKey = url.replace('r2://', '');
            try {
              const ext = objectKey.split('.').pop()?.toLowerCase() || 'ttf';
              const contentType = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : ext === 'otf' ? 'font/otf' : 'font/ttf';
              url = await storageService.getPresignedUrl(objectKey, contentType, 'download');
            } catch (e) {
              console.error('Failed to resolve font signed URL', e);
            }
          }
          
          return {
            family: meta.family,
            url: url,
            category: 'Custom Fonts',
            isCustom: true,
          };
        })
      );
      setCustomFonts(resolvedList.filter(Boolean) as any[]);
    } catch (e) {
      console.error('Failed to fetch/resolve custom fonts:', e);
    }
  }, [tenant_id, festivalId]);

  useEffect(() => {
    fetchFonts();
  }, [fetchFonts]);

  const customFontsList = customFonts;

  const allFonts = useMemo(() => {
    return [
      ...(script !== 'en' ? ML_FONTS : []),
      ...(script !== 'ml' ? EN_FONTS : []),
      ...customFontsList,
    ];
  }, [script, customFontsList]);

  const filteredFonts = useMemo(() => {
    if (!search) return allFonts;
    const q = search.toLowerCase();
    return allFonts.filter(f => f.family.toLowerCase().includes(q) || (f.category && f.category.toLowerCase().includes(q)));
  }, [allFonts, search]);

  // Group fonts by category, preserving the order of appearance
  const groups = useMemo(() => {
    const map = new Map<string, FontDefinition[]>();
    filteredFonts.forEach(f => {
      const cat = f.category || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(f);
    });
    return Array.from(map.entries());
  }, [filteredFonts]);

  const handleSelect = (family: string) => {
    const fontEntry = allFonts.find((f) => f.family === family);
    if (fontEntry) {
      loadFont(fontEntry).then(() => onChange(family));
    } else {
      onChange(family);
    }
    setIsOpen(false);
    setSearch('');
  };

  const handleHover = (family: string) => {
    const fontEntry = allFonts.find((f) => f.family === family);
    if (fontEntry) loadFont(fontEntry);
  };

  const openPopover = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      const isUp = spaceBelow < 300 && spaceAbove > spaceBelow;
      
      setPopoverStyle({
        position: 'fixed',
        left: rect.left,
        width: Math.max(rect.width, 240),
        ...(isUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        maxHeight: Math.min(isUp ? spaceAbove - 20 : spaceBelow - 20, 400),
      });
    }
    setIsOpen(true);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen && !(e.target as Element).closest('.font-popover-container') && !(e.target as Element).closest('.font-trigger-btn')) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto-focus search input
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const popoverContent = isOpen ? (
    <div className="font-popover-container" style={{ ...styles.popover, ...popoverStyle }}>
      <div style={styles.searchContainer}>
        <Search size={14} color="#64748B" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search fonts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false);
          }}
        />
      </div>
      
      <div style={styles.scrollArea}>
        {groups.length === 0 ? (
          <div style={styles.emptyState}>No fonts found.</div>
        ) : (
          groups.map(([category, fonts]) => (
            <div key={category} style={styles.group}>
              <div style={styles.groupLabel}>{category}</div>
              {fonts.map((f) => (
                <button
                  key={f.family}
                  style={{
                    ...styles.fontItem,
                    ...(value === f.family ? styles.fontItemSelected : {}),
                  }}
                  onMouseEnter={() => handleHover(f.family)}
                  onClick={() => handleSelect(f.family)}
                >
                  <div style={styles.fontItemContent}>
                    <span style={{ fontFamily: f.family, fontSize: 14 }}>
                      {f.family}
                    </span>
                    <span style={{ 
                      fontFamily: f.family, 
                      fontSize: 12, 
                      color: value === f.family ? '#E0F2FE' : '#64748B',
                      marginTop: 2,
                      opacity: 0.8
                    }}>
                      {f.category === 'Malayalam' ? 'മലയാളം' : 'The quick brown fox'}
                    </span>
                  </div>
                  {value === f.family && <Check size={16} color="#38BDF8" />}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <div style={styles.container}>
      {label && (
        <div style={styles.header}>
          <label style={styles.label}>{label}</label>
        </div>
      )}
      
      <button 
        ref={triggerRef}
        onClick={() => isOpen ? setIsOpen(false) : openPopover()}
        style={{ ...styles.trigger, fontFamily: value }}
        className="font-trigger-btn"
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </span>
        <ChevronDown size={14} color="#94A3B8" />
      </button>
      
      {/* Render Popover into body to escape clipping */}
      {typeof document !== 'undefined' && createPortal(popoverContent, document.body)}

      {/* Hide Upload button in horizontal toolbar to save space */}
      {label && (
        <button 
          onClick={() => setShowManager(true)} 
          style={styles.manageBtn}
          title="Upload Custom Font"
        >
          + Upload Font
        </button>
      )}

      {showManager && (
        <FontManagerPanel 
          onClose={() => setShowManager(false)} 
          onUploadSuccess={fetchFonts} 
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 6, width: '100%' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 10, color: '#94A3B8', fontFamily: 'Inter, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 8px',
    height: 32,
    borderRadius: 6,
    border: '1px solid #334155',
    fontSize: 13,
    color: '#E2E8F0',
    backgroundColor: '#0F172A',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    outline: 'none',
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  popover: {
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: 8,
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  searchContainer: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid #1E293B',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    background: 'none',
    border: 'none',
    color: '#E2E8F0',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'Inter, sans-serif',
  },
  scrollArea: {
    overflowY: 'auto',
    flex: 1,
    padding: '4px 0',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 4,
  },
  groupLabel: {
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  fontItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    width: '100%',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    color: '#E2E8F0',
    cursor: 'pointer',
    transition: 'background-color 0.1s',
  },
  fontItemSelected: {
    backgroundColor: '#0284C7',
    color: '#FFFFFF',
  },
  fontItemContent: {
    display: 'flex',
    flexDirection: 'column',
  },
  emptyState: {
    padding: '16px',
    textAlign: 'center',
    color: '#64748B',
    fontSize: 13,
    fontFamily: 'Inter, sans-serif',
  },
  manageBtn: { 
    fontSize: 10, 
    color: '#38BDF8', 
    background: 'transparent', 
    border: '1px solid #1E293B', 
    borderRadius: 4, 
    padding: '4px 6px', 
    cursor: 'pointer',
    marginTop: 4,
    alignSelf: 'flex-start'
  }
};
