import { coreColor } from '@/constants/coreTheme';
import { ui } from '@/constants/designSystem';
﻿import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { CollegeFestImportBlock } from '../../../components/ui/CollegeFestImportBlock';
import { ArrowLeft, CheckCircle, AlertCircle, Play, Database, FileText } from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { databaseProvider as db } from '../../../providers/database';
import { jsonImportService, JuniorParticipant, ImportValidationResult } from '../../../services/jsonImportService';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useFestival } from '../../../core/hooks/useFestival';

export default function ImportJuniorDataset() {
  const router = useRouter();
  const goBack = useGoBack('/(admin)/participants');
  const { tenant_id: authTenantId } = useAuthStore();
  const tenantId = authTenantId || '';
  
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalId = activeFestival?.id;
  const isCollegeFest = activeFestival?.festival_template === 'college_fest';

  const [datasetRaw, setDatasetRaw] = useState<any>(null);
  const [dataset, setDataset] = useState<JuniorParticipant[]>([]);
  const validationRevision = useRef(0);
  const [internalValidation, setInternalValidation] = useState<ImportValidationResult | null>(null);
  const [dbConflicts, setDbConflicts] = useState<Map<string, {name: string, isMismatch: boolean}>>(new Map());
  const [isReady, setIsReady] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importReport, setImportReport] = useState<any>(null);

  const handleChooseFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      validationRevision.current += 1;
      setIsReady(false);
      setDatasetRaw(null);
      setDataset([]);
      setInternalValidation(null);
      setDbConflicts(new Map());
      setImportReport(null);
      const file = result.assets[0];
      const text = Platform.OS === 'web' && file.file
        ? await file.file.text()
        : await FileSystem.readAsStringAsync(file.uri);
      const parsed = jsonImportService.parseMarkdownWrappedJson(text);
      const participants = Array.isArray(parsed) ? parsed : parsed?.participants;
      if (!Array.isArray(participants) || participants.length === 0) {
        throw new Error('Choose a JSON file containing a non-empty participant array.');
      }
      setDatasetRaw(parsed);
    } catch (error: any) {
      Alert.alert('Unable to load JSON', error?.message || 'Could not read the selected file.');
    }
  };

  useEffect(() => {
    const revision = ++validationRevision.current;
    setIsReady(false);
    if (!festivalId || !datasetRaw) return;

    // Process dataset defensively against Metro bundler exports
    let raw = datasetRaw;
    if (raw && raw.default) raw = raw.default;

    const participants: JuniorParticipant[] = Array.isArray(raw)
      ? raw
      : (raw.participants || []);

    // Normalize names internally
    const normalized = participants.map((p: any) => ({
      ...p,
      name: jsonImportService.normalizeParticipantName(p.name),
      chest_number: p.chest_number || p.chest_no,
      items: p.items || []
    }));

    setDataset(normalized);
    const internalRes = jsonImportService.validateInternalDataset(normalized);
    setInternalValidation(internalRes);

    if (internalRes.isValid) {
      checkDbConflicts(normalized, revision);
    }
    return () => { validationRevision.current += 1; };
  }, [festivalId, datasetRaw]);

  const checkDbConflicts = async (data: JuniorParticipant[], revision: number) => {
    try {
      const chestNumbers = data.map(d => d.chest_number || d.chest_no).filter(Boolean) as string[];
      if (chestNumbers.length === 0) return;

      const { data: existing, error } = await db.validateChestNumbers(festivalId, chestNumbers);
      if (revision !== validationRevision.current) return;
      if (error) throw error;

      const conflicts = new Map<string, {name: string, isMismatch: boolean}>();
      let hasMismatch = false;

      existing.forEach((dbRow: any) => {
        const jsonRow = data.find(d => (d.chest_number || d.chest_no) === dbRow.chest_number);
        if (jsonRow) {
          const isMismatch = jsonRow.name !== dbRow.name;
          if (isMismatch) hasMismatch = true;
          conflicts.set(dbRow.chest_number, { name: dbRow.name, isMismatch });
        }
      });

      setDbConflicts(conflicts);
      
      // If there are mismatches, or internal validation failed, not ready
      if (!hasMismatch) {
        setIsReady(true);
      }
    } catch (e: any) {
      Alert.alert('Error checking database', e.message);
    }
  };

  const executeImport = async () => {
    if (!isReady || isProcessing) return;
    setIsProcessing(true);
    setProgress(0);
    setImportReport(null);

    try {
      // 1. Snapshot backup
      const backupPath = await jsonImportService.backupDataset(datasetRaw, festivalId);

      // 2. Create Session
      const { data: session, error: sessionErr } = await db.createImportSession({
        tenant_id: tenantId,
        festival_id: festivalId,
        filename: 'importjn.json',
        status: 'processing'
      });
      if (sessionErr) throw sessionErr;
      const sessionId = session?.id || null;

      // 3. Chunk Processing (50 items)
      const chunkSize = 50;
      const chunks = [];
      for (let i = 0; i < dataset.length; i += chunkSize) {
        chunks.push(dataset.slice(i, i + chunkSize));
      }

      let totalImportedParts = 0;
      let totalSkippedParts = 0;
      let totalImportedRegs = 0;
      let totalSkippedRegs = 0;
      let allErrors: any[] = [];
      let allInvalidItems: any[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        const { data: result, error: chunkErr } = await db.executeJuniorImportChunk({
          tenant_id: tenantId,
          festival_id: festivalId,
          session_id: sessionId,
          participants: chunk
        });

        if (chunkErr) {
          allErrors.push(`Chunk ${i} Failed: ${chunkErr.message}`);
          continue; // Continue next chunks
        }

        if (result) {
          totalImportedParts += result.imported_participants || 0;
          totalSkippedParts += result.skipped_participants || 0;
          totalImportedRegs += result.imported_registrations || 0;
          totalSkippedRegs += result.skipped_registrations || 0;
          
          if (result.errors) allErrors = allErrors.concat(result.errors);
          if (result.invalid_items) allInvalidItems = allInvalidItems.concat(result.invalid_items);
        }

        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      const finalReport = {
        imported_participants: totalImportedParts,
        skipped_participants: totalSkippedParts,
        imported_registrations: totalImportedRegs,
        skipped_registrations: totalSkippedRegs,
        invalid_items: allInvalidItems,
        errors: allErrors,
        backup_path: backupPath
      };

      setImportReport(finalReport);

      if (sessionId) {
        await db.updateImportSession(sessionId, {
          status: allErrors.length > 0 ? 'partial' : 'completed',
          completed_at: new Date().toISOString(),
          participants_count: totalImportedParts,
          registrations_count: totalImportedRegs,
          skipped_count: totalSkippedRegs + totalSkippedParts,
          error_count: allErrors.length + allInvalidItems.length,
          report_json: finalReport
        });
      }

      Alert.alert('Import Completed', `Imported ${totalImportedParts} participants and ${totalImportedRegs} registrations.`);

    } catch (e: any) {
      Alert.alert('Critical Import Error', e.message);
    } finally {
      setIsProcessing(false);
      setProgress(100);
    }
  };

  const downloadReport = async () => {
    if (!importReport) return;
    try {
      const jsonStr = JSON.stringify(importReport, null, 2);
      const filename = `Junior_Import_Report_${Date.now()}.json`;

      if (Platform.OS === 'web') {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const uri = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = uri;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const docDir = (FileSystem as any).documentDirectory || '';
        const fileUri = docDir + filename;
        await FileSystem.writeAsStringAsync(fileUri, jsonStr);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (isCollegeFest || activeFestival?.chest_number_template === 'team') {
    return <CollegeFestImportBlock teamTemplate={activeFestival?.chest_number_template === 'team'} />;
  }
  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBack} className="p-2 mr-2 bg-ssf-surface rounded-full border border-ssf-border">
          <ArrowLeft size={24} color={ui.colors.text} />
        </TouchableOpacity>
        <Text className="text-3xl font-poppins-black text-ssf-text">Junior Dataset Import</Text>
      </View>

      <SsfCard className="mb-6">
        <Text className="font-poppins-bold text-base text-ssf-text mb-2">Upload participant JSON</Text>
        <Text className="font-poppins text-sm text-ssf-muted mb-3">
          Select your festival's JSON file to validate and preview before importing.
        </Text>
        <SsfButton label="Choose JSON file" onPress={handleChooseFile} disabled={isProcessing} />
      </SsfCard>

      <SsfCard className="mb-6 bg-core-warning-soft-yellow-50 border border-core-warning-soft-yellow-200">
        <Text className="font-poppins-bold text-core-warning-yellow-800 mb-2">Production Safety Rules</Text>
        <Text className="font-poppins text-xs text-core-warning-yellow-700 leading-5">
          • All names are normalized to FULL CAPITALS.{'\n'}
          • Chest number conflicts block import if names mismatch.{'\n'}
          • Valid items are imported; invalid items are skipped without dropping the participant.{'\n'}
          • A storage snapshot backup is created before execution.
        </Text>
      </SsfCard>

      <View className="flex-row gap-4 mb-6">
        <SsfCard className="flex-1 items-center py-4">
          <FileText size={24} color={coreColor("#1B6B3A", 'primaryText')} className="mb-2" />
          <Text className="font-poppins-bold text-2xl">{dataset.length}</Text>
          <Text className="font-poppins text-xs text-ssf-text-muted">Total Participants</Text>
        </SsfCard>
        <SsfCard className="flex-1 items-center py-4">
          <Database size={24} color={coreColor("#1B6B3A", 'primaryText')} className="mb-2" />
          <Text className="font-poppins-bold text-2xl">
            {dataset.reduce((acc, curr) => acc + (curr.items?.length || 0), 0)}
          </Text>
          <Text className="font-poppins text-xs text-ssf-text-muted">Total Items</Text>
        </SsfCard>
      </View>

      {/* Internal JSON Validation */}
      {internalValidation && !internalValidation.isValid && (
        <SsfCard className="mb-6 bg-core-danger-soft-red-50 border border-core-danger-soft-red-300">
          <View className="flex-row items-center mb-2">
            <AlertCircle color={coreColor("#DC2626", 'danger')} size={20} className="mr-2" />
            <Text className="font-poppins-bold text-core-danger-red-700">Internal JSON Duplication Detected</Text>
          </View>
          {internalValidation.errors.map((e, i) => (
            <Text key={i} className="font-poppins text-xs text-core-danger-red-600 mb-1">• {e}</Text>
          ))}
        </SsfCard>
      )}

      {/* Database Validation Warnings */}
      {dbConflicts.size > 0 && (
        <SsfCard className="mb-6 border border-core-warning-soft-orange-300 bg-core-warning-soft-orange-50">
          <Text className="font-poppins-bold text-core-warning-orange-800 mb-2">Database Duplicates Detected</Text>
          <Text className="font-poppins text-xs text-core-warning-orange-700 mb-4">
            The following chest numbers already exist. If names mismatch, import will be blocked.
          </Text>
          {Array.from(dbConflicts.entries()).map(([chest, conflict]) => (
            <View key={chest} className={`mb-2 p-2 rounded-lg border ${conflict.isMismatch ? 'bg-core-danger-soft-red-100 border-core-danger-soft-red-300' : 'bg-core-success-soft-green-50 border-core-success-soft-green-200'}`}>
              <Text className={`font-poppins-bold ${conflict.isMismatch ? 'text-core-danger-red-800' : 'text-core-success-green-800'}`}>Chest: {chest}</Text>
              <Text className="font-poppins text-xs">DB Name: {conflict.name}</Text>
              {conflict.isMismatch && <Text className="font-poppins-bold text-xs text-core-danger-red-600 mt-1">MISMATCH! Execution blocked.</Text>}
            </View>
          ))}
        </SsfCard>
      )}

      {/* Action Area */}
      <SsfCard className="mb-6">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="font-poppins-bold text-lg">Execution Panel</Text>
          {isReady ? (
            <View className="bg-core-success-soft-green-100 px-3 py-1 rounded-full border border-core-success-soft-green-300 flex-row items-center">
              <CheckCircle size={14} color={coreColor("#16A34A", 'success')} className="mr-1" />
              <Text className="font-poppins-bold text-core-success-green-700 text-xs">Ready for Import</Text>
            </View>
          ) : (
            <View className="bg-core-danger-soft-red-100 px-3 py-1 rounded-full border border-core-danger-soft-red-300 flex-row items-center">
              <AlertCircle size={14} color={coreColor("#DC2626", 'danger')} className="mr-1" />
              <Text className="font-poppins-bold text-core-danger-red-700 text-xs">Validation Failed</Text>
            </View>
          )}
        </View>

        {isProcessing && (
          <View className="mb-4">
            <Text className="font-poppins text-xs text-ssf-text-muted mb-1">Importing Data... {progress}%</Text>
            <View className="h-2 w-full bg-core-surface-strong-gray-200 rounded-full overflow-hidden">
              <View className="h-full bg-ssf-primary" style={{ width: `${progress}%` }} />
            </View>
          </View>
        )}

        {!importReport ? (
          <SsfButton 
            label="Execute Safe Import" 
            onPress={executeImport} 
            isLoading={isProcessing} 
            disabled={!isReady || isProcessing}
            icon={<Play size={16} color={coreColor("white", 'onPrimary')} />}
          />
        ) : (
          <View className="mt-4 p-4 rounded-xl bg-core-surface-muted-gray-50 border border-core-border-gray-200">
            <Text className="font-poppins-bold text-lg mb-2">Import Report</Text>
            <Text className="font-poppins text-sm mb-1 text-core-success-green-700">âœ… Imported Participants: {importReport.imported_participants}</Text>
            <Text className="font-poppins text-sm mb-1 text-core-success-green-700">âœ… Imported Registrations: {importReport.imported_registrations}</Text>
            <Text className="font-poppins text-sm mb-1 text-core-text-muted-gray-500">â­ï¸ Skipped Participants: {importReport.skipped_participants}</Text>
            <Text className="font-poppins text-sm mb-1 text-core-text-muted-gray-500">â­ï¸ Skipped Registrations: {importReport.skipped_registrations}</Text>
            {importReport.invalid_items?.length > 0 && (
              <Text className="font-poppins text-sm mb-1 text-core-warning-orange-600">âš ï¸ Invalid Items Skipped: {importReport.invalid_items.length}</Text>
            )}
            {importReport.errors?.length > 0 && (
              <Text className="font-poppins text-sm mb-3 text-core-danger-red-600">âŒ Errors: {importReport.errors.length}</Text>
            )}
            <SsfButton 
              label="Download JSON Report" 
              variant="outline" 
              onPress={downloadReport} 
              className="mt-2"
            />
          </View>
        )}
      </SsfCard>

      {/* Dataset Preview */}
      <Text className="font-poppins-bold text-lg mb-4 text-ssf-text">Dataset Preview (Normalized)</Text>
      {dataset.map((row, idx) => (
        <View key={idx} className="mb-3 p-3 rounded-xl border border-core-border-gray-200 bg-core-surface-white shadow-sm shadow-black/5">
          <View className="flex-row justify-between mb-2">
            <View className="flex-1 mr-2">
              <Text className="text-[10px] font-poppins-bold text-core-text-muted-gray-500 uppercase">Chest No</Text>
              <Text className="font-poppins-bold text-ssf-text">{row.chest_number || row.chest_no}</Text>
            </View>
            <View className="flex-2 flex-grow">
              <Text className="text-[10px] font-poppins-bold text-core-text-muted-gray-500 uppercase">Participant Name</Text>
              <Text className="font-poppins-bold text-ssf-text">{row.name}</Text>
            </View>
          </View>
          <View>
            <Text className="text-[10px] font-poppins-bold text-core-text-muted-gray-500 uppercase mb-1">Items ({row.items?.length || 0})</Text>
            <View className="flex-row flex-wrap gap-1">
              {row.items?.map(item => (
                <View key={item} className="bg-core-surface-muted-gray-100 px-2 py-1 rounded border border-core-border-gray-200">
                  <Text className="font-poppins text-xs text-core-text-gray-700">{item}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      ))}

      <View className="h-10" />
    </ScrollView>
  );
}
