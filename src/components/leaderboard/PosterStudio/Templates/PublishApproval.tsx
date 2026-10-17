import React from 'react';
import { useTemplateStore } from '../Stores/templateStore';
import { useLayerStore } from '../Stores/layerStore';
import { supabase } from '../../../../core/config/supabase';
import { useAuthStore } from '../../../../core/store/authStore';
import { useOfflineStore } from '../Stores/offlineStore';

const isUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

export default function PublishApproval() {
  const { publishStatus, setPublishStatus } = useTemplateStore();
  const activeTemplate = useTemplateStore((s) => s.activeTemplate);
  const { user, role, is_superadmin } = useAuthStore();
  const enqueue = useOfflineStore((s) => s.enqueue);

  // A template is only publishable if it has isPublishable:true AND a valid UUID
  const isPublishable =
    !!activeTemplate?.isPublishable &&
    !!activeTemplate?.id &&
    isUUID(activeTemplate.id);

  const isLocalTemplate = activeTemplate?.isLocal === true || !isPublishable;

  const handlePublishRequest = async () => {
    if (!activeTemplate?.id || !user?.id || !isPublishable) return;

    const currentLayers = useLayerStore.getState().layers;
    const updatePayload = {
      name: activeTemplate.name,
      background_url: activeTemplate.background_url,
      background_transform: activeTemplate.background_transform || null,
      width: activeTemplate.width,
      height: activeTemplate.height,
      aspect_ratio: activeTemplate.aspect_ratio,
      layers: currentLayers,
      schema_version: activeTemplate.schema_version || '1.0',
      status: 'pending_approval' as const,
    };

    const mutation = {
      template_id: activeTemplate.id,
      requested_by: user.id,
      status: 'pending',
      updated_at: new Date().toISOString(),
    };

    const { error: reqError } = await supabase.from('poster_approval_requests').insert(mutation);
    if (reqError) enqueue({ type: 'publish', payload: mutation });

    const { error: tplError } = await supabase
      .from('poster_templates')
      .update(updatePayload)
      .eq('id', activeTemplate.id);

    if (tplError) {
      console.error('[PublishApproval] Failed to update template:', tplError);
      return;
    }

    setPublishStatus('pending_approval');
    alert('Approval request sent to superior admin.');
  };

  const handleDirectPublish = async () => {
    if (!activeTemplate?.id || !isPublishable) return;

    const canPublishDirectly = is_superadmin || role === 'admin';
    if (!canPublishDirectly) {
      await handlePublishRequest();
      return;
    }

    const currentLayers = useLayerStore.getState().layers;
    const updatePayload = {
      name: activeTemplate.name,
      background_url: activeTemplate.background_url,
      background_transform: activeTemplate.background_transform || null,
      width: activeTemplate.width,
      height: activeTemplate.height,
      aspect_ratio: activeTemplate.aspect_ratio,
      layers: currentLayers,
      schema_version: activeTemplate.schema_version || '1.0',
      status: 'published' as const,
    };

    const { error } = await supabase
      .from('poster_templates')
      .update(updatePayload)
      .eq('id', activeTemplate.id);

    if (error) {
      console.error('[PublishApproval] Failed to publish template:', error);
      enqueue({ type: 'publish', payload: { template_id: activeTemplate.id, status: 'published' } });
    }

    setPublishStatus('published');
    alert('✅ Template published successfully.\n\nTo generate posters for your events, please go to the "Batch Auto-Fill" tab on the right sidebar and click "Queue All Exports".');
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Publishing</h3>

      {/* Local template warning banner */}
      {isLocalTemplate && (
        <div style={styles.localWarning}>
          <span style={styles.localWarningIcon}>🔒</span>
          <div style={styles.localWarningText}>
            <strong>Local Demo Template</strong>
            <span>This template exists only in your browser. Create or select a database template to publish posters.</span>
          </div>
        </div>
      )}

      {/* Publishable badge */}
      {!isLocalTemplate && (
        <div style={styles.publishReadyBanner}>
          <span>✅ PUBLISH READY</span>
        </div>
      )}

      <div style={styles.statusBox}>
        <span style={styles.statusLabel}>Current Status:</span>
        <span style={{
          ...styles.statusBadge,
          backgroundColor: publishStatus === 'published' ? '#DCFCE7' : publishStatus === 'pending_approval' ? '#FEF9C3' : '#F1F5F9',
          color: publishStatus === 'published' ? '#166534' : publishStatus === 'pending_approval' ? '#854D0E' : '#475569'
        }}>
          {publishStatus.replace('_', ' ').toUpperCase()}
        </span>
      </div>

      <div style={styles.actions}>
        <button
          style={{
            ...styles.btnSecondary,
            opacity: isLocalTemplate || publishStatus !== 'draft' ? 0.45 : 1,
            cursor: isLocalTemplate || publishStatus !== 'draft' ? 'not-allowed' : 'pointer',
          }}
          onClick={handlePublishRequest}
          disabled={isLocalTemplate || publishStatus !== 'draft'}
          title={isLocalTemplate ? 'Select a database template to enable publishing' : 'Request Approval'}
        >
          Request Approval
        </button>
        <button
          style={{
            ...styles.btnPrimary,
            opacity: isLocalTemplate ? 0.45 : 1,
            cursor: isLocalTemplate ? 'not-allowed' : 'pointer',
          }}
          onClick={handleDirectPublish}
          disabled={isLocalTemplate}
          title={isLocalTemplate ? 'Select a database template to enable publishing' : 'Direct Publish (Admin)'}
        >
          Direct Publish (Admin)
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTop: '1px solid #E2E8F0',
  },
  title: { margin: '0 0 12px 0', fontSize: 14, fontWeight: 700, color: '#0F172A' },
  localWarning: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 12px',
    backgroundColor: '#FFF7ED',
    border: '1px solid #FED7AA',
    borderRadius: 8,
    marginBottom: 12,
  },
  localWarningIcon: {
    fontSize: 18,
    flexShrink: 0,
    marginTop: 1,
  },
  localWarningText: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    fontSize: 12,
    color: '#92400E',
    lineHeight: '1.4',
  },
  publishReadyBanner: {
    padding: '6px 12px',
    backgroundColor: '#DCFCE7',
    border: '1px solid #86EFAC',
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 12,
    fontWeight: 700,
    color: '#166534',
    textAlign: 'center' as const,
  },
  statusBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    marginBottom: 12,
  },
  statusLabel: { fontSize: 12, fontWeight: 600, color: '#64748B' },
  statusBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '4px 8px',
    borderRadius: 12,
  },
  actions: {
    display: 'flex',
    gap: 8,
  },
  btnSecondary: {
    flex: 1,
    padding: '8px',
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 12,
  },
  btnPrimary: {
    flex: 1,
    padding: '8px',
    backgroundColor: '#0EA5E9',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 12,
  },
};
