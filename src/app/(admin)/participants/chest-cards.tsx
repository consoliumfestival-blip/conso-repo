import { ui } from '@/constants/designSystem';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SsfSelectMenu } from '@/components/ui/SsfSelectMenu';
import {
  ActivityIndicator,
  Alert,
  GestureResponderEvent,
  Image,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useFestival } from '../../../core/hooks/useFestival';
import { useAuthStore } from '../../../core/store/authStore';
import { uploadService } from '../../../services/storage/uploadService';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ImagePlus,
  Lock,
  Printer,
  RotateCcw,
  Save,
  Search,
  Unlock,
} from 'lucide-react-native';

type OverlayField = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  borderRadius?: number;
  padding?: number;
};

type ChestTemplate = {
  id: string;
  name: string;
  backgroundUri: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  backgroundResizeMode?: 'cover' | 'contain' | 'stretch';
  backgroundX?: number;
  backgroundY?: number;
  backgroundScale?: number;
  fields: {
    chest: OverlayField;
    qr: OverlayField;
    name: OverlayField;
    unit: OverlayField;
  };
};

type ChestCardParticipant = {
  id: string;
  chest_number?: string | null;
  category_code?: string | null;
  name?: string | null;
  organisation_id?: string | null;
  organisations?: {
    name?: string | null;
  } | null;
  status?: string | null;
};

const STORAGE_KEY = 'sahi.chest-card.templates.v1';
const LOCK_STORAGE_KEY = 'sahi.chest-card.locks.v1';
const PRINT_STORAGE_KEY = 'sahi.chest-card.printed.v1';
const TEMPLATE_WIDTH = 248;
const TEMPLATE_HEIGHT = 350;

const defaultTemplate = (): ChestTemplate => ({
  id: 'default-a6',
  name: 'A6 Dynamic Template',
  backgroundUri: null,
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  fields: {
    chest: { x: 38, y: 96, width: 172, height: 56, fontSize: 38, color: '#EAB308' },
    name: { x: 38, y: 160, width: 172, height: 24, fontSize: 16, color: ui.colors.surface },
    unit: { x: 38, y: 190, width: 172, height: 18, fontSize: 12, color: ui.colors.surface },
    qr: { x: 74, y: 220, width: 100, height: 100, borderRadius: 8, padding: 6 },
  },
});

const safeJsonParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const canUseBrowserStorage = Platform.OS === 'web' && typeof window !== 'undefined';

const readTemplates = () => {
  if (!canUseBrowserStorage) return [defaultTemplate()];
  let templates = safeJsonParse<ChestTemplate[]>(window.localStorage.getItem(STORAGE_KEY), []);
  if (!templates.length) return [defaultTemplate()];
  
  // Backwards compatibility for templates without name or color
  return templates.map(t => ({
    ...t,
    fields: {
      ...t.fields,
      chest: { ...t.fields.chest, color: t.fields.chest.color || '#EAB308' },
      name: t.fields.name || { x: 38, y: 160, width: 172, height: 24, fontSize: 16, color: ui.colors.surface },
      unit: t.fields.unit || { x: 38, y: 190, width: 172, height: 18, fontSize: 12, color: ui.colors.surface },
      qr: { ...t.fields.qr, borderRadius: t.fields.qr.borderRadius ?? 8, padding: t.fields.qr.padding ?? 6 },
    }
  }));
};

const saveTemplates = (templates: ChestTemplate[]) => {
  if (canUseBrowserStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch (e) {
      console.error('Failed to save templates', e);
      alert('Failed to save template. The image might be too large for browser storage. Please try uploading a smaller image or delete older templates.');
    }
  }
};

const readIdMap = (key: string) => {
  if (!canUseBrowserStorage) return {};
  return safeJsonParse<Record<string, boolean>>(window.localStorage.getItem(key), {});
};

const saveIdMap = (key: string, value: Record<string, boolean>) => {
  if (canUseBrowserStorage) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
};

const createQrUrl = (chestNumber: string, profileSlug: string, categoryCode: string, size: number, color?: string, bgColor?: string) => {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://sahi.in';
  const qrData = encodeURIComponent(`${baseUrl}/candidate/${profileSlug}?chest=${chestNumber}&cat=${categoryCode}`);
  
  const fg = (color || '#111827').replace('#', '');
  const bg = bgColor && bgColor.trim() !== '' && bgColor !== 'transparent' ? bgColor.replace('#', '') : '0000';
  
  return `https://quickchart.io/qr?text=${qrData}&dark=${fg}&light=${bg}&margin=0&size=${size}&format=png`;
};

const formatParticipantName = (name?: string | null) => {
  if (!name) return 'participant name';
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) {
    const firstWord = parts[0];
    // Matches Muhammed, Mohammed, Muhammad, Mohamad, Muhamed, etc.
    if (/^m[ou]h[aeiou]mm?[aeiou]d$/i.test(firstWord)) {
      parts[0] = 'm';
      return parts.join(' ').toLowerCase();
    }
  }
  return name.toLowerCase();
};

const FieldBox = ({
  field,
  selected,
  editable,
  onSelect,
  onMove,
  onResize,
  children,
  printScale = 1,
}: {
  field: OverlayField;
  selected?: boolean;
  editable?: boolean;
  onSelect?: () => void;
  onMove?: (patch: Pick<OverlayField, 'x' | 'y'>) => void;
  onResize?: (patch: Partial<OverlayField>) => void;
  children: React.ReactNode;
  printScale?: number;
}) => {
  const dragStart = useRef<{ pageX: number; pageY: number; x: number; y: number } | null>(null);
  const resizeStart = useRef<{ pageX: number; pageY: number; w: number; h: number; fontSize?: number } | null>(null);

  const beginDrag = (event: GestureResponderEvent) => {
    if (!editable) return;
    onSelect?.();
    dragStart.current = {
      pageX: event.nativeEvent.pageX,
      pageY: event.nativeEvent.pageY,
      x: field.x,
      y: field.y,
    };
  };
  const moveDrag = (event: GestureResponderEvent) => {
    if (!editable || !dragStart.current || !onMove) return;
    const dx = (event.nativeEvent.pageX - dragStart.current.pageX) / printScale;
    const dy = (event.nativeEvent.pageY - dragStart.current.pageY) / printScale;
    onMove({
      x: Math.max(0, Math.round(dragStart.current.x + dx)),
      y: Math.max(0, Math.round(dragStart.current.y + dy)),
    });
  };

  const beginResize = (event: GestureResponderEvent) => {
    if (!editable) return;
    resizeStart.current = {
      pageX: event.nativeEvent.pageX,
      pageY: event.nativeEvent.pageY,
      w: field.width,
      h: field.height,
      fontSize: field.fontSize,
    };
  };

  const moveResize = (event: GestureResponderEvent) => {
    if (!editable || !resizeStart.current || !onResize) return;
    const dx = (event.nativeEvent.pageX - resizeStart.current.pageX) / printScale;
    const dy = (event.nativeEvent.pageY - resizeStart.current.pageY) / printScale;
    
    const newWidth = Math.max(10, Math.round(resizeStart.current.w + dx));
    const newHeight = Math.max(10, Math.round(resizeStart.current.h + dy));
    
    const patch: Partial<OverlayField> = {
      width: newWidth,
      height: newHeight,
    };
    
    if (field.fontSize !== undefined && resizeStart.current.h > 0) {
      const heightRatio = newHeight / resizeStart.current.h;
      patch.fontSize = Math.max(1, Math.round((resizeStart.current.fontSize || 12) * heightRatio));
    }
    
    onResize(patch);
  };

  return (
    <View
      onStartShouldSetResponder={() => !!editable}
      onResponderGrant={beginDrag}
      onResponderMove={moveDrag}
      onResponderRelease={() => {
        dragStart.current = null;
      }}
      style={{
        position: 'absolute',
        left: field.x * printScale,
        top: field.y * printScale,
        width: field.width * printScale,
        height: field.height * printScale,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: selected ? 1 : 0,
        borderColor: selected ? ui.colors.info : 'transparent',
        borderStyle: 'dashed',
        borderRadius: (field.borderRadius ?? 0) * printScale,
        cursor: editable ? 'move' : 'default',
      } as any}
    >
      {children}
      {selected && editable && (
        <View
          onStartShouldSetResponder={() => true}
          onStartShouldSetResponderCapture={() => true}
          onResponderGrant={beginResize}
          onResponderMove={moveResize}
          onResponderRelease={() => {
            resizeStart.current = null;
          }}
          style={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            backgroundColor: ui.colors.info,
            borderRadius: 6,
            cursor: 'nwse-resize',
          } as any}
        />
      )}
    </View>
  );
};

const ChestCard = ({
  participant,
  template,
  editable,
  selectedField,
  onSelectField,
  onMoveField,
  onResizeField,
  scale = 1,
}: {
  participant: ChestCardParticipant;
  template: ChestTemplate;
  editable?: boolean;
  selectedField?: keyof ChestTemplate['fields'];
  onSelectField?: (field: keyof ChestTemplate['fields']) => void;
  onMoveField?: (field: keyof ChestTemplate['fields'], patch: Pick<OverlayField, 'x' | 'y'>) => void;
  onResizeField?: (field: keyof ChestTemplate['fields'], patch: Partial<OverlayField>) => void;
  scale?: number;
}) => {
  const chestNumber = participant.chest_number || '---';
  const categoryCode = participant.category_code || 'GN';
  const participantName = formatParticipantName(participant.name);
  const participantUnit = participant.organisations?.name || 'Unit Name';
  const qrSize = 300; // Fixed size to prevent re-fetching on print scale change
  const qrUrl = createQrUrl(chestNumber, participant.profile_slug || participant.id, categoryCode, qrSize, template.fields.qr.color, template.fields.qr.backgroundColor);

  return (
    <View
      className="chest-card-wrapper"
      style={{
        width: TEMPLATE_WIDTH * scale,
        height: TEMPLATE_HEIGHT * scale,
        borderRadius: 0,
        overflow: 'hidden',
        backgroundColor: ui.colors.surface,
        borderWidth: 1,
        borderColor: ui.colors.border,
        position: 'relative',
      }}
    >
      {template.backgroundUri ? (
        <Image
          source={{ uri: template.backgroundUri }}
          style={{
            position: 'absolute',
            left: (template.backgroundX || 0) * scale,
            top: (template.backgroundY || 0) * scale,
            width: (TEMPLATE_WIDTH * (template.backgroundScale ?? 1)) * scale,
            height: (TEMPLATE_HEIGHT * (template.backgroundScale ?? 1)) * scale,
          }}
          resizeMode={template.backgroundResizeMode || 'cover'}
        />
      ) : (
        <View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backgroundColor: '#F8FAFC',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
          }}
        >
          <Text style={{ fontFamily: 'Poppins_700Bold', color: ui.colors.textMuted, fontSize: 12, textAlign: 'center' }}>
            Upload an A6 PNG/JPG background template
          </Text>
        </View>
      )}

      <FieldBox
        field={template.fields.chest}
        selected={editable && selectedField === 'chest'}
        editable={editable}
        onSelect={() => onSelectField?.('chest')}
        onMove={(patch) => onMoveField?.('chest', patch)}
        onResize={(patch) => onResizeField?.('chest', patch)}
        printScale={scale}
      >
        <Text
          style={{
            fontFamily: 'Montserrat_700Bold',
            color: template.fields.chest.color || '#EAB308',
            fontSize: (template.fields.chest.fontSize ?? 38) * scale,
            lineHeight: (template.fields.chest.height - 2) * scale,
            textAlign: 'center',
          }}
          numberOfLines={1}
        >
          {chestNumber}
        </Text>
      </FieldBox>

      <FieldBox
        field={template.fields.name}
        selected={editable && selectedField === 'name'}
        editable={editable}
        onSelect={() => onSelectField?.('name')}
        onMove={(patch) => onMoveField?.('name', patch)}
        onResize={(patch) => onResizeField?.('name', patch)}
        printScale={scale}
      >
        <Text
          style={{
            fontFamily: 'Montserrat_300Light',
            color: template.fields.name.color || ui.colors.surface,
            fontSize: (template.fields.name.fontSize ?? 16) * scale,
            lineHeight: (template.fields.name.height - 2) * scale,
            textAlign: 'center',
          }}
          numberOfLines={1}
        >
          {participantName}
        </Text>
      </FieldBox>

      <FieldBox
        field={template.fields.unit}
        selected={editable && selectedField === 'unit'}
        editable={editable}
        onSelect={() => onSelectField?.('unit')}
        onMove={(patch) => onMoveField?.('unit', patch)}
        onResize={(patch) => onResizeField?.('unit', patch)}
        printScale={scale}
      >
        <Text
          style={{
            fontFamily: 'Montserrat_300Light',
            color: template.fields.unit.color || ui.colors.surface,
            fontSize: (template.fields.unit.fontSize ?? 12) * scale,
            lineHeight: (template.fields.unit.height - 2) * scale,
            textAlign: 'center',
          }}
          numberOfLines={1}
        >
          {participantUnit}
        </Text>
      </FieldBox>

      <FieldBox
        field={template.fields.qr}
        selected={editable && selectedField === 'qr'}
        editable={editable}
        onSelect={() => onSelectField?.('qr')}
        onMove={(patch) => onMoveField?.('qr', patch)}
        onResize={(patch) => {
          if (patch.width !== undefined && patch.height !== undefined) {
             const size = Math.max(patch.width, patch.height);
             onResizeField?.('qr', { ...patch, width: size, height: size });
          } else {
             onResizeField?.('qr', patch);
          }
        }}
        printScale={scale}
      >
        <View
          className="qr-wrapper"
          style={{
            width: template.fields.qr.width * scale,
            height: template.fields.qr.height * scale,
            backgroundColor: template.fields.qr.backgroundColor || ui.colors.surface,
            padding: (template.fields.qr.padding ?? 6) * scale,
            borderRadius: (template.fields.qr.borderRadius ?? 8) * scale,
            overflow: 'hidden',
          }}
        >
          <Image 
            source={{ uri: qrUrl }} 
            style={{ 
              width: '100%', 
              height: '100%',
              borderRadius: Math.max(0, (template.fields.qr.borderRadius ?? 8) - (template.fields.qr.padding ?? 6) / 2) * scale,
              overflow: 'hidden'
            }} 
            resizeMode="contain" 
          />
        </View>
      </FieldBox>
    </View>
  );
};

const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

export default function ChestCardsPage() {
  const goBack = useGoBack('/(admin)/participants');
  const { participants, isLoadingList } = useParticipants();
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const { tenant_id: tenantId } = useAuthStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;
  const isMobile = width < 760;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const localFileInputRef = useRef<HTMLInputElement | null>(null);

  const [templates, setTemplates] = useState<ChestTemplate[]>(() => readTemplates());
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => readTemplates().find(t => t.active)?.id ?? 'default-a6');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [lockedIds, setLockedIds] = useState<Record<string, boolean>>(() => readIdMap(LOCK_STORAGE_KEY));
  const [printedIds, setPrintedIds] = useState<Record<string, boolean>>(() => readIdMap(PRINT_STORAGE_KEY));
  const [selectedField, setSelectedField] = useState<keyof ChestTemplate['fields']>('chest');
  const [printSize, setPrintSize] = useState<'auto' | 'A3'>('auto');
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);

  useEffect(() => saveTemplates(templates), [templates]);
  useEffect(() => saveIdMap(LOCK_STORAGE_KEY, lockedIds), [lockedIds]);
  useEffect(() => saveIdMap(PRINT_STORAGE_KEY, printedIds), [printedIds]);

  const activeTemplate = templates.find(t => t.id === selectedTemplateId) ?? templates[0] ?? defaultTemplate();
  const sampleParticipant = (participants as ChestCardParticipant[]).find(p => p.chest_number) ?? {
    id: 'sample',
    chest_number: 'HS-404',
    category_code: 'HS',
  };

  const teams = useMemo(() => [
    'ALL',
    ...Array.from(new Set((participants as ChestCardParticipant[])
      .map(p => p.organisations?.name)
      .filter(Boolean))) as string[],
  ], [participants]);

  const categories = useMemo(() => [
    'ALL',
    ...Array.from(new Set((participants as ChestCardParticipant[])
      .map(p => p.category_code)
      .filter(Boolean))) as string[],
  ], [participants]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (participants as ChestCardParticipant[]).filter((p) => {
      const categoryMatch = selectedCategory === 'ALL' || p.category_code === selectedCategory;
      const teamMatch = selectedTeam === 'ALL' || p.organisations?.name === selectedTeam;
      const searchMatch = !query ||
        p.chest_number?.toLowerCase().includes(query) ||
        p.name?.toLowerCase().includes(query) ||
        p.organisations?.name?.toLowerCase().includes(query);
      return categoryMatch && teamMatch && searchMatch;
    });
  }, [participants, searchQuery, selectedCategory, selectedTeam]);

  const printItems = useMemo(() => {
    const selected = filtered.filter(p => selectedIds[p.id]);
    return selected.length ? selected : filtered;
  }, [filtered, selectedIds]);

  const updateTemplate = (updater: (template: ChestTemplate) => ChestTemplate) => {
    setTemplates(current => current.map(template =>
      template.id === activeTemplate.id
        ? updater({ ...template, fields: { ...template.fields } })
        : template
    ));
  };

  const updateField = (field: keyof ChestTemplate['fields'], patch: Partial<OverlayField>) => {
    updateTemplate(template => ({
      ...template,
      updatedAt: new Date().toISOString(),
      fields: {
        ...template.fields,
        [field]: {
          ...template.fields[field],
          ...patch,
        },
      },
    }));
  };

  const uploadBackground = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Upload unavailable', 'Template upload is currently available on web.');
      return;
    }
    
    if (!activeFestival?.id || !tenantId) {
      Alert.alert('Error', 'Missing festival or tenant context.');
      return;
    }

    if (!fileInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.style.display = 'none';
      document.body.appendChild(input);
      
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        
        try {
          setIsUploadingBackground(true);
          const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          const metadata = await uploadService.uploadTemplate(
            file,
            activeFestival.id,
            tenantId,
            'background',
            ext,
            () => {} // progress
          );
          
          updateTemplate(template => ({
            ...template,
            backgroundUri: metadata.file_url,
            updatedAt: new Date().toISOString(),
          }));
        } catch (err: any) {
          console.error("Upload failed", err);
          Alert.alert("Upload Failed", err.message || "Failed to upload background image.");
        } finally {
          setIsUploadingBackground(false);
          // reset value to allow selecting the same file again
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      fileInputRef.current = input;
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const localUploadBackground = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Upload unavailable', 'Template upload is currently available on web.');
      return;
    }
    
    if (!localFileInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.style.display = 'none';
      document.body.appendChild(input);
      
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        
        setIsUploadingBackground(true);
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          updateTemplate(template => ({
            ...template,
            backgroundUri: dataUrl,
            updatedAt: new Date().toISOString(),
          }));
          setIsUploadingBackground(false);
          if (localFileInputRef.current) localFileInputRef.current.value = '';
        };
        reader.onerror = () => {
          Alert.alert("Upload Failed", "Failed to read local image.");
          setIsUploadingBackground(false);
          if (localFileInputRef.current) localFileInputRef.current.value = '';
        };
        reader.readAsDataURL(file);
      };
      localFileInputRef.current = input;
    }
    
    if (localFileInputRef.current) {
      localFileInputRef.current.click();
    }
  };

  const createTemplate = () => {
    const next = {
      ...defaultTemplate(),
      id: `template-${Date.now()}`,
      name: `Template ${templates.length + 1}`,
      active: false,
    };
    setTemplates(current => [...current, next]);
    setSelectedTemplateId(next.id);
  };

  const activateTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setTemplates(current => current.map(template => ({
      ...template,
      active: template.id === templateId,
      updatedAt: template.id === templateId ? new Date().toISOString() : template.updatedAt,
    })));
  };

  const handlePrint = () => {
    setPrintedIds(current => {
      const next = { ...current };
      printItems.forEach(p => {
        if (p.id) next[p.id] = true;
      });
      return next;
    });
    if (Platform.OS === 'web') window.print();
  };

  const toggleLock = (participantId: string) => {
    setLockedIds(current => ({
      ...current,
      [participantId]: !current[participantId],
    }));
  };

  const confirmRegenerate = () => {
    const protectedCount = printItems.filter(p => lockedIds[p.id] || printedIds[p.id]).length;
    if (protectedCount > 0) {
      Alert.alert(
        'Protected cards',
        `${protectedCount} selected card(s) are locked or already printed. Unlock them before regeneration.`,
      );
      return;
    }
    Alert.alert('Ready', 'Selected cards are clear for regeneration using the existing chest-number workflow.');
  };

  if (isLoadingList) return <ActivityIndicator color={ui.colors.success} style={{ marginTop: 40 }} />;

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      {Platform.OS === 'web' && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            .px-4 { padding-left: 0 !important; padding-right: 0 !important; }
            .py-6 { padding-top: 0 !important; padding-bottom: 0 !important; }
            * {
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
              print-color-adjust: exact !important;
              overflow: visible !important;
            }
            .chest-card-wrapper, .qr-wrapper, .qr-wrapper * {
              overflow: hidden !important;
            }
            html, body {
              height: auto !important;
              background: white !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .no-print { display: none !important; }
            .print-sheet { 
              display: flex !important; 
              flex-direction: row !important;
              flex-wrap: wrap !important; 
              justify-content: center !important; 
              align-content: flex-start !important;
              width: 100% !important; 
              margin: 0 !important;
              padding: 0 !important;
            }
            .print-card { 
              page-break-inside: avoid; 
              break-inside: avoid; 
              border: 1px dashed #94A3B8 !important;
              box-sizing: border-box !important;
            }
            .print-only { 
              display: block !important; 
              width: 100% !important; 
              height: auto !important;
            }
            .preview-only { display: none !important; }
            
            .print-page {
              width: 100% !important;
              height: 297mm !important;
              display: flex !important;
              justify-content: center !important;
              align-items: center !important;
              page-break-after: always !important;
              break-after: page !important;
              box-sizing: border-box !important;
            }
            
            .chest-card-wrapper {
              border-width: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .print-card {
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
            }
            
            ${printSize === 'A3' ? `
              @page { size: A3 landscape; margin: 0; }
              .print-card { width: 70mm !important; height: 99mm !important; }
              .print-sheet { 
                width: 420mm !important; 
                height: 297mm !important; 
                gap: 0 !important; 
                margin: 0 !important;
                justify-content: flex-start !important;
              }
            ` : `
              @page { margin: 5mm; }
              .print-card { width: 89mm !important; height: 126mm !important; }
              .print-sheet { gap: 0 !important; }
            `}
          }
          @media screen {
            .print-only { display: none !important; }
          }
        `}} />
      )}

      <View className="no-print">
        <View className="flex-row items-center justify-between mb-6">
          <View className="flex-row items-center flex-1">
            <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-white border border-ssf-border rounded-full">
              <ArrowLeft size={22} color="#07143D" />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-2xl font-poppins-black text-ssf-text">Chest Card Templates</Text>
              <Text className="font-poppins text-ssf-text-muted text-sm">
                Blind judging cards with dynamic template overlays
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16 }}>
          <View style={{ flex: isDesktop ? 0.9 : undefined, gap: 12 }}>
            <View className="bg-white border border-ssf-border rounded-xl p-4">
              <Text className="font-poppins-black text-ssf-text text-base mb-1">Template Library</Text>
              <Text className="font-poppins text-ssf-text-muted text-xs mb-3">
                Upload PNG/JPG artwork. Recommended: 1240x1748 A6 portrait, 300 DPI.
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {templates.map(template => (
                  <TouchableOpacity
                    key={template.id}
                    onPress={() => setSelectedTemplateId(template.id)}
                    className={`px-3 py-2 rounded-xl border ${selectedTemplateId === template.id ? 'bg-blue-600 border-blue-600' : 'bg-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedTemplateId === template.id ? 'text-white' : 'text-ssf-text'}`}>
                      {template.active ? 'Active · ' : ''}{template.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View className="flex-row flex-wrap gap-2">
                <TouchableOpacity onPress={uploadBackground} disabled={isUploadingBackground} className="bg-emerald-600 px-3 py-2 rounded-xl flex-row items-center gap-x-2">
                  {isUploadingBackground ? <ActivityIndicator size="small" color={ui.colors.surface} /> : <ImagePlus size={15} color={ui.colors.surface} />}
                  <Text className="font-poppins-bold text-white text-xs">{isUploadingBackground ? 'Uploading...' : 'Upload / Replace'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={localUploadBackground} disabled={isUploadingBackground} className="bg-emerald-100 border border-emerald-300 px-3 py-2 rounded-xl flex-row items-center gap-x-2">
                  <ImagePlus size={15} color={ui.colors.success} />
                  <Text className="font-poppins-bold text-emerald-700 text-xs">Local Image</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={createTemplate} className="bg-white border border-ssf-border px-3 py-2 rounded-xl flex-row items-center gap-x-2">
                  <Copy size={15} color="#07143D" />
                  <Text className="font-poppins-bold text-ssf-text text-xs">New Template</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => activateTemplate(activeTemplate.id)} className="bg-white border border-ssf-border px-3 py-2 rounded-xl flex-row items-center gap-x-2">
                  <Check size={15} color={ui.colors.success} />
                  <Text className="font-poppins-bold text-ssf-text text-xs">Set Active</Text>
                </TouchableOpacity>
              </View>
            </View>

            {!isMobile && (
              <View className="bg-white border border-ssf-border rounded-xl p-4">
                <Text className="font-poppins-black text-ssf-text text-base mb-3">Overlay Position Editor</Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {(['chest', 'name', 'unit', 'qr'] as const).map(field => (
                    <TouchableOpacity
                      key={field}
                      onPress={() => setSelectedField(field)}
                      className={`px-3 py-2 rounded-xl border ${selectedField === field ? 'bg-ssf-primary border-ssf-primary' : 'bg-white border-ssf-border'}`}
                    >
                      <Text className={`font-poppins-bold text-xs ${selectedField === field ? 'text-white' : 'text-ssf-text'}`}>
                        {field}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View className="gap-y-3">
                  {(['x', 'y', 'width', 'height', 'fontSize', 'color', 'backgroundColor', 'borderRadius', 'padding'] as const).map(key => {
                    if (key === 'fontSize' && selectedField === 'qr') return null;
                    if ((key === 'borderRadius' || key === 'padding') && selectedField !== 'qr') return null;
                    const value = activeTemplate.fields[selectedField][key as keyof OverlayField] ?? (key === 'color' ? '#000000' : (key === 'backgroundColor' ? ui.colors.surface : (key === 'borderRadius' ? 8 : (key === 'padding' ? 6 : 12))));
                    
                    if (key === 'color' || key === 'backgroundColor') {
                      const label = key === 'color' ? (selectedField === 'qr' ? 'QR Code Color (Hex)' : 'Text Color (Hex)') : 'Background Color (Hex)';
                      return (
                        <View key={key}>
                          <Text className="font-poppins-bold text-xs text-ssf-text mb-1">{label}</Text>
                          <TextInput
                            value={String(value)}
                            onChangeText={(val) => updateField(selectedField, { [key]: val })}
                            className="bg-white border border-ssf-border px-3 py-2 rounded-lg font-poppins text-xs text-ssf-text"
                            placeholder={key === 'backgroundColor' ? 'transparent or #FFFFFF' : '#000000'}
                          />
                        </View>
                      );
                    }

                    return (
                      <View key={key}>
                        <Text className="font-poppins-bold text-xs text-ssf-text mb-1">{key}</Text>
                        <View className="flex-row gap-x-2 items-center">
                          <TouchableOpacity
                            onPress={() => {
                              const num = Math.max(0, Number(value) - 1);
                              if (selectedField === 'qr' && (key === 'width' || key === 'height')) {
                                updateField(selectedField, { width: num, height: num });
                              } else {
                                updateField(selectedField, { [key]: num });
                              }
                            }}
                            className="bg-gray-100 px-3 py-2 rounded-lg"
                          >
                            <Text className="font-poppins-black">-</Text>
                          </TouchableOpacity>
                          <TextInput
                            value={value === 0 ? '' : String(value)}
                            keyboardType="numeric"
                            onChangeText={(val) => {
                              if (val.trim() === '') {
                                if (selectedField === 'qr' && (key === 'width' || key === 'height')) {
                                  updateField(selectedField, { width: 0, height: 0 });
                                } else {
                                  updateField(selectedField, { [key]: 0 });
                                }
                              } else {
                                const num = parseInt(val, 10);
                                if (!isNaN(num)) {
                                  if (selectedField === 'qr' && (key === 'width' || key === 'height')) {
                                    updateField(selectedField, { width: num, height: num });
                                  } else {
                                    updateField(selectedField, { [key]: num });
                                  }
                                }
                              }
                            }}
                            className="bg-white border border-ssf-border px-3 py-2 rounded-lg font-poppins text-xs text-center text-ssf-text w-16"
                          />
                          <TouchableOpacity
                            onPress={() => {
                              const num = Number(value) + 1;
                              if (selectedField === 'qr' && (key === 'width' || key === 'height')) {
                                updateField(selectedField, { width: num, height: num });
                              } else {
                                updateField(selectedField, { [key]: num });
                              }
                            }}
                            className="bg-gray-100 px-3 py-2 rounded-lg"
                          >
                            <Text className="font-poppins-black">+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
                <TouchableOpacity onPress={() => saveTemplates(templates)} className="mt-4 bg-blue-600 px-4 py-3 rounded-xl flex-row items-center justify-center gap-x-2">
                  <Save size={16} color={ui.colors.surface} />
                  <Text className="font-poppins-bold text-white">Save Layout Preset</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isMobile && activeTemplate.backgroundUri && (
              <View className="mt-4 bg-white border border-ssf-border rounded-xl p-4">
                <Text className="font-poppins-black text-ssf-text text-base mb-3">Background Image Settings</Text>
                
                {/* Resize Mode Selector */}
                <View className="mb-3">
                  <Text className="font-poppins-bold text-xs text-ssf-text mb-1">Resize Mode</Text>
                  <View className="flex-row gap-2">
                    {(['cover', 'contain', 'stretch'] as const).map(mode => (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => updateTemplate(t => ({ ...t, backgroundResizeMode: mode }))}
                        className={`px-3 py-2 rounded-xl border flex-1 items-center ${activeTemplate.backgroundResizeMode === mode || (!activeTemplate.backgroundResizeMode && mode === 'cover') ? 'bg-ssf-primary border-ssf-primary' : 'bg-white border-ssf-border'}`}
                      >
                        <Text className={`font-poppins-bold text-xs ${activeTemplate.backgroundResizeMode === mode || (!activeTemplate.backgroundResizeMode && mode === 'cover') ? 'text-white' : 'text-ssf-text'}`}>
                          {mode}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Background X Offset */}
                <View className="mb-3">
                  <Text className="font-poppins-bold text-xs text-ssf-text mb-1">Horizontal Offset (X)</Text>
                  <View className="flex-row gap-x-2 items-center">
                    <TouchableOpacity
                      onPress={() => updateTemplate(t => ({ ...t, backgroundX: (t.backgroundX || 0) - 5 }))}
                      className="bg-gray-100 px-3 py-2 rounded-lg"
                    >
                      <Text className="font-poppins-black">-5</Text>
                    </TouchableOpacity>
                    <TextInput
                      value={String(activeTemplate.backgroundX || 0)}
                      keyboardType="numeric"
                      onChangeText={(val) => {
                        const num = parseInt(val, 10);
                        updateTemplate(t => ({ ...t, backgroundX: isNaN(num) ? 0 : num }));
                      }}
                      className="bg-white border border-ssf-border px-3 py-2 rounded-lg font-poppins text-xs text-center text-ssf-text w-16"
                    />
                    <TouchableOpacity
                      onPress={() => updateTemplate(t => ({ ...t, backgroundX: (t.backgroundX || 0) + 5 }))}
                      className="bg-gray-100 px-3 py-2 rounded-lg"
                    >
                      <Text className="font-poppins-black">+5</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Background Y Offset */}
                <View className="mb-3">
                  <Text className="font-poppins-bold text-xs text-ssf-text mb-1">Vertical Offset (Y)</Text>
                  <View className="flex-row gap-x-2 items-center">
                    <TouchableOpacity
                      onPress={() => updateTemplate(t => ({ ...t, backgroundY: (t.backgroundY || 0) - 5 }))}
                      className="bg-gray-100 px-3 py-2 rounded-lg"
                    >
                      <Text className="font-poppins-black">-5</Text>
                    </TouchableOpacity>
                    <TextInput
                      value={String(activeTemplate.backgroundY || 0)}
                      keyboardType="numeric"
                      onChangeText={(val) => {
                        const num = parseInt(val, 10);
                        updateTemplate(t => ({ ...t, backgroundY: isNaN(num) ? 0 : num }));
                      }}
                      className="bg-white border border-ssf-border px-3 py-2 rounded-lg font-poppins text-xs text-center text-ssf-text w-16"
                    />
                    <TouchableOpacity
                      onPress={() => updateTemplate(t => ({ ...t, backgroundY: (t.backgroundY || 0) + 5 }))}
                      className="bg-gray-100 px-3 py-2 rounded-lg"
                    >
                      <Text className="font-poppins-black">+5</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Background Scale */}
                <View className="mb-3">
                  <Text className="font-poppins-bold text-xs text-ssf-text mb-1">Scale (Multiplier)</Text>
                  <View className="flex-row gap-x-2 items-center">
                    <TouchableOpacity
                      onPress={() => updateTemplate(t => ({ ...t, backgroundScale: Math.max(0.1, parseFloat(((t.backgroundScale ?? 1) - 0.05).toFixed(2))) }))}
                      className="bg-gray-100 px-3 py-2 rounded-lg"
                    >
                      <Text className="font-poppins-black">-5%</Text>
                    </TouchableOpacity>
                    <TextInput
                      value={String(Math.round((activeTemplate.backgroundScale ?? 1) * 100)) + '%'}
                      editable={false}
                      className="bg-white border border-ssf-border px-3 py-2 rounded-lg font-poppins text-xs text-center text-ssf-text w-20"
                    />
                    <TouchableOpacity
                      onPress={() => updateTemplate(t => ({ ...t, backgroundScale: parseFloat(((t.backgroundScale ?? 1) + 0.05).toFixed(2)) }))}
                      className="bg-gray-100 px-3 py-2 rounded-lg"
                    >
                      <Text className="font-poppins-black">+5%</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => updateTemplate(t => ({ ...t, backgroundX: 0, backgroundY: 0, backgroundScale: 1, backgroundResizeMode: 'cover' }))}
                  className="mt-2 bg-gray-100 px-4 py-2 rounded-xl flex-row items-center justify-center gap-x-1"
                >
                  <RotateCcw size={14} color={ui.colors.textMuted} />
                  <Text className="font-poppins-bold text-ssf-text-muted text-xs">Reset Background Adjustments</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={{ flex: 1.2 }}>
            <View className="bg-white border border-ssf-border rounded-xl p-4">
              <Text className="font-poppins-black text-ssf-text text-base mb-3">Live Template Preview</Text>
              <View style={{ alignItems: 'center' }}>
                <ChestCard
                  participant={sampleParticipant}
                  template={activeTemplate}
                  editable={!isMobile}
                  selectedField={selectedField}
                  onSelectField={setSelectedField}
                  onMoveField={updateField}
                  onResizeField={updateField}
                  scale={isDesktop ? 1.2 : 1}
                />
              </View>
            </View>
          </View>
        </View>

        <View className="bg-white border border-ssf-border rounded-xl p-4 my-5">
          <View className="flex-row items-center bg-slate-50 border border-ssf-border rounded-xl px-3 mb-4">
            <Search size={17} color={ui.colors.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search chest number, participant or organisation"
              placeholderTextColor={ui.colors.textMuted}
              style={{ flex: 1, height: 44, paddingHorizontal: 10, fontFamily: 'Poppins_400Regular', outlineStyle: 'none' as any }}
            />
          </View>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10, alignItems: isMobile ? 'stretch' : 'center' }}>
            <TouchableOpacity onPress={() => { setPrintSize('auto'); setTimeout(handlePrint, 100); }} className="bg-ssf-primary px-4 py-3 rounded-xl flex-row items-center justify-center gap-x-2 flex-1">
              <Printer size={16} color={ui.colors.surface} />
              <Text className="font-poppins-bold text-white">Print Cards</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => {
                if (Platform.OS === 'web') {
                  window.alert("To save as A4 PDF:\n\n1. Change 'Destination' to 'Save as PDF'.\n2. Set 'Paper size' to 'A4' (prints 4 cards per page).\n3. Click Save.");
                  setPrintSize('auto');
                  setTimeout(() => window.print(), 100);
                }
              }} 
              className="bg-emerald-600 px-4 py-3 rounded-xl flex-row items-center justify-center gap-x-2 flex-1"
            >
              <Download size={16} color={ui.colors.surface} />
              <Text className="font-poppins-bold text-white">A4 PDF (4)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => {
                if (Platform.OS === 'web') {
                  window.alert("To save as A3 PDF:\n\n1. Change 'Destination' to 'Save as PDF'.\n2. The system has automatically forced the size to A3 Landscape (prints 20 cards per page).\n3. Click Save.");
                  setPrintSize('A3');
                  setTimeout(() => {
                    window.print();
                    setPrintSize('auto');
                  }, 100);
                }
              }} 
              className="bg-purple-600 px-4 py-3 rounded-xl flex-row items-center justify-center gap-x-2 flex-1"
            >
              <Download size={16} color={ui.colors.surface} />
              <Text className="font-poppins-bold text-white">A3 PDF (20)</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={confirmRegenerate} className="bg-white border border-ssf-border px-4 py-3 rounded-xl flex-row items-center justify-center gap-x-2">
              <RotateCcw size={16} color="#07143D" />
              <Text className="font-poppins-bold text-ssf-text">Regenerate Check</Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-between items-center mt-3 flex-wrap gap-y-3">
            <View className="flex-row items-center flex-wrap gap-2 flex-1 mr-3 z-50">
              <SsfSelectMenu
                value={selectedCategory}
                options={categories.map(c => ({ label: c === 'ALL' ? 'Category: All' : c, value: c }))}
                onValueChange={setSelectedCategory}
                compact
                style={{ backgroundColor: '#F8FAFC', borderRadius: 8, minWidth: 140 }}
              />
              <SsfSelectMenu
                value={selectedTeam}
                options={teams.map(t => ({ label: t === 'ALL' ? 'Team: All' : t, value: t }))}
                onValueChange={setSelectedTeam}
                compact
                style={{ backgroundColor: '#F8FAFC', borderRadius: 8, minWidth: 140 }}
              />
              <View className="bg-slate-100 px-3 py-1.5 rounded-lg justify-center items-center h-9 ml-1">
                <Text className="text-slate-600 font-poppins-medium text-xs">{filtered.length} results</Text>
              </View>
            </View>

            <View className="flex-row items-center gap-x-2">
              <TouchableOpacity 
                onPress={() => {
                  const allLocked = filtered.length > 0 && filtered.every(p => lockedIds[p.id]);
                  const next = { ...lockedIds };
                  if (allLocked) {
                    filtered.forEach(p => delete next[p.id]);
                  } else {
                    filtered.forEach(p => next[p.id] = true);
                  }
                  setLockedIds(next);
                }}
                className="bg-red-50 px-4 py-2 rounded-xl border border-red-200"
              >
                <Text className="font-poppins-bold text-red-700 text-xs">
                  {filtered.length > 0 && filtered.every(p => lockedIds[p.id]) ? 'Unlock All' : 'Lock All'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => {
                  const allSelected = filtered.length > 0 && filtered.every(p => selectedIds[p.id]);
                  const next = { ...selectedIds };
                  if (allSelected) {
                    filtered.forEach(p => delete next[p.id]);
                  } else {
                    filtered.forEach(p => next[p.id] = true);
                  }
                  setSelectedIds(next);
                }}
                className="bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-200"
              >
                <Text className="font-poppins-bold text-indigo-700 text-xs">
                  {filtered.length > 0 && filtered.every(p => selectedIds[p.id]) ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {filtered.map((p: ChestCardParticipant) => {
            const selected = selectedIds[p.id] === true;
            const locked = lockedIds[p.id] === true;
            const printed = printedIds[p.id] === true;
            return (
              <View key={p.id} className="bg-white border border-ssf-border rounded-xl p-3">
                <TouchableOpacity onPress={() => setSelectedIds(current => ({ ...current, [p.id]: !selected }))}>
                  <ChestCard participant={p} template={activeTemplate} scale={0.78} />
                </TouchableOpacity>
                <View className="mt-2 flex-row items-center justify-between">
                  <Text className="font-poppins-black text-ssf-text text-xs">{p.chest_number || '---'}</Text>
                  <TouchableOpacity onPress={() => toggleLock(p.id)}>
                    {locked ? <Lock size={16} color={ui.colors.destructive} /> : <Unlock size={16} color={ui.colors.textMuted} />}
                  </TouchableOpacity>
                </View>
                <View className="flex-row gap-x-1 mt-1">
                  {selected && <Text className="font-poppins-bold text-blue-700 text-[10px]">Selected</Text>}
                  {printed && <Text className="font-poppins-bold text-green-700 text-[10px]">Printed</Text>}
                  {locked && <Text className="font-poppins-bold text-red-700 text-[10px]">Locked</Text>}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View className="print-only" style={{ display: 'block', width: '100%', height: 'auto' } as any}>
        {printSize === 'A3' ? (
          chunkArray(printItems, 18).map((pageItems, pageIdx) => (
            <View 
              key={pageIdx} 
              className="print-page" 
              style={{ 
                width: '100%', 
                height: '297mm', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                pageBreakAfter: 'always',
                breakAfter: 'page',
                margin: 0,
                padding: 0,
              } as any}
            >
              <View 
                className="print-sheet" 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'row', 
                  flexWrap: 'wrap', 
                  width: '420mm', 
                  height: '297mm', 
                  gap: 0, 
                  margin: 0,
                  justifyContent: 'flex-start',
                } as any}
              >
                {pageItems.map((p: ChestCardParticipant) => (
                  <View 
                    key={p.id} 
                    className="print-card" 
                    style={{ 
                      width: '70mm', 
                      height: '99mm', 
                      margin: 0, 
                      padding: 0, 
                      boxSizing: 'border-box', 
                      border: '1px dashed #94A3B8', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                    } as any}
                  >
                    <ChestCard participant={p} template={activeTemplate} scale={1.06} />
                  </View>
                ))}
              </View>
            </View>
          ))
        ) : (
          <View className="print-sheet">
            {printItems.map((p: ChestCardParticipant) => (
              <View key={p.id} className="print-card">
                <ChestCard participant={p} template={activeTemplate} scale={1.37} />
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
