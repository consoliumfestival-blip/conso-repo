import { participantRepository } from '../lib/repositories/participantRepository';

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

// Pure JS UUID generator for React Native Web compatibility
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export type AssignmentPreviewReport = {
  totalSelected: number;
  targetUnitName: string;
  currentUnits: { id: string; name: string; count: number }[];
  skipped: { participantId: string; name: string; reason: string }[];
  validIds: string[];
  validHashes: string[];
};

export const participantUnitAssignmentService = {
  async previewUnitAssignment(
    participantIds: string[],
    targetUnitId: string,
    tenantId: string
  ): Promise<AssignmentPreviewReport> {
    // 1. Fetch preview data and integrity hashes from the DB RPC
    const { data: dbPreview, error } = await participantRepository.previewBulkUnitAssignment(
      participantIds,
      targetUnitId,
      tenantId
    );
    throwIfError(error);

    // 2. Fetch organisations to resolve target and old unit names
    const { data: orgs, error: orgsErr } = await participantRepository.listOrganisations<any>(tenantId);
    throwIfError(orgsErr);
    const targetOrg = (orgs || []).find((o: any) => o.id === targetUnitId);
    const targetUnitName = targetOrg ? `${targetOrg.name} (${targetOrg.org_type})` : 'Target Organisation';

    const orgMap = new Map<string, string>();
    (orgs || []).forEach((o: any) => orgMap.set(o.id, `${o.name} (${o.org_type})`));

    // 3. Process records, checking locks and current units
    const currentUnitsMap = new Map<string, { id: string; name: string; count: number }>();
    const skipped: { participantId: string; name: string; reason: string }[] = [];
    const validIds: string[] = [];
    const validHashes: string[] = [];

    (dbPreview || []).forEach((p: any) => {
      // Determine lock state
      if (p.is_locked) {
        skipped.push({
          participantId: p.id,
          name: p.name,
          reason: `Locked for: ${p.lock_reason || 'Administrative Action'} [Scope: ${p.lock_scope || 'all'}]`,
        });
        return;
      }

      // Check if already in target unit
      if (p.organisation_id === targetUnitId) {
        skipped.push({
          participantId: p.id,
          name: p.name,
          reason: 'Already assigned to the target organisation',
        });
        return;
      }

      // Add to valid reassignments
      validIds.push(p.id);
      validHashes.push(p.integrity_hash);

      // Track current organisation breakdown
      const oldOrgId = p.organisation_id || 'unassigned';
      const oldOrgName = oldOrgId === 'unassigned' ? 'Unassigned' : orgMap.get(oldOrgId) || 'Unknown Unit';
      const existing = currentUnitsMap.get(oldOrgId);
      if (existing) {
        existing.count += 1;
      } else {
        currentUnitsMap.set(oldOrgId, { id: oldOrgId, name: oldOrgName, count: 1 });
      }
    });

    const currentUnits = Array.from(currentUnitsMap.values());

    return {
      totalSelected: participantIds.length,
      targetUnitName,
      currentUnits,
      skipped,
      validIds,
      validHashes,
    };
  },

  async executeBulkUnitAssignment(
    participantIds: string[],
    expectedHashes: string[],
    targetUnitId: string,
    tenantId: string,
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ success: boolean; batchId: string; successCount: number }> {
    if (participantIds.length === 0) {
      throw new Error('No valid participants selected for reassignment');
    }

    const batchId = generateUUID();
    const totalRecords = participantIds.length;

    // 1. Initialize batch in database (status 'processing')
    const { data: batch, error: batchErr } = await participantRepository.createParticipantUnitBatch<any>({
      id: batchId,
      status: 'processing',
      total_records: totalRecords,
      tenant_id: tenantId,
      target_unit_id: targetUnitId,
    });
    throwIfError(batchErr);

    // 2. Log system event
    await participantRepository.createSystemEvent({
      event_type: 'BULK_UNIT_REASSIGNMENT_STARTED',
      tenant_id: tenantId,
      event_metadata: { batch_id: batchId, total_records: totalRecords, target_unit_id: targetUnitId },
    });

    // 3. Chunk execution sequentially (200 rows per chunk)
    const chunkSize = 200;
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < totalRecords; i += chunkSize) {
        const chunkIds = participantIds.slice(i, i + chunkSize);
        const chunkHashes = expectedHashes.slice(i, i + chunkSize);

        const { data: rpcRes, error: rpcErr } = await participantRepository.executeBulkUnitAssignment(
          chunkIds,
          chunkHashes,
          targetUnitId,
          batchId,
          tenantId
        );

        if (rpcErr) {
          throw new Error(`Chunk execution error: ${rpcErr.message}`);
        }

        if (rpcRes && !rpcRes.success) {
          throw new Error(`Chunk execution failed: ${rpcRes.error || 'Unknown error'}`);
        }

        // Accumulate statistics
        successCount += rpcRes.updated_count || 0;
        skippedCount += rpcRes.skipped_count || 0;
        failedCount += rpcRes.failed_count || 0;

        // Update progress on batch table (enables resuming if interrupted later)
        const currentProcessed = i + chunkIds.length;
        const lastId = chunkIds[chunkIds.length - 1];

        await participantRepository.updateParticipantUnitBatch(batchId, {
          processed_count: currentProcessed,
          last_processed_participant_id: lastId,
          success_count: successCount,
          skipped_count: skippedCount,
          failed_count: failedCount,
        });

        if (onProgress) {
          onProgress(currentProcessed, totalRecords);
        }
      }

      // 4. Update batch record as completed
      const finalStatus = successCount === totalRecords ? 'completed' : 'partial';
      await participantRepository.updateParticipantUnitBatch(batchId, {
        status: finalStatus,
        completed_at: new Date().toISOString(),
      });

      // Log completion system event
      await participantRepository.createSystemEvent({
        event_type: 'BULK_UNIT_REASSIGNMENT_COMPLETED',
        tenant_id: tenantId,
        event_metadata: { batch_id: batchId, status: finalStatus, success_count: successCount },
      });

      return { success: true, batchId, successCount };
    } catch (err: any) {
      // Mark batch as failed
      await participantRepository.updateParticipantUnitBatch(batchId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        notes: err.message,
      });

      // Log failure system event
      await participantRepository.createSystemEvent({
        event_type: 'BULK_UNIT_REASSIGNMENT_FAILED',
        tenant_id: tenantId,
        event_metadata: { batch_id: batchId, error: err.message },
      });

      throw err;
    }
  },

  async rollbackUnitAssignment(
    batchId: string,
    tenantId: string
  ): Promise<{ success: boolean; revertedCount: number; skippedCount: number }> {
    // 1. Log rollback start system event
    await participantRepository.createSystemEvent({
      event_type: 'ROLLBACK_STARTED',
      tenant_id: tenantId,
      event_metadata: { batch_id: batchId },
    });

    // 2. Invoke the Database RPC (which updates status, skipped count, and logs details)
    const { data: rpcRes, error } = await participantRepository.rollbackUnitAssignment(batchId);
    throwIfError(error);

    if (rpcRes && !rpcRes.success) {
      throw new Error(`Rollback execution failed: ${rpcRes.error || 'Unknown error'}`);
    }

    return {
      success: true,
      revertedCount: rpcRes.reverted_count || 0,
      skippedCount: rpcRes.skipped_count || 0,
    };
  },

  async listAuditLogs<T>(): Promise<T[]> {
    const { data, error } = await participantRepository.listParticipantUnitAuditLogs<T>();
    throwIfError(error);
    return data;
  },

  async listBatches<T>(tenantId: string): Promise<T[]> {
    const { data, error } = await participantRepository.listParticipantUnitBatches<T>(tenantId);
    throwIfError(error);
    return data;
  },
};
