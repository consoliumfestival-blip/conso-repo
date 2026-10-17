import { ui } from '@/constants/designSystem';
﻿import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { CollegeFestImportBlock } from '../../../components/ui/CollegeFestImportBlock';
import { ArrowLeft, CheckCircle, AlertCircle, Play, Database, FileText, Upload } from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { databaseProvider as db } from '../../../providers/database';
import { jsonImportService, JuniorParticipant, ImportValidationResult } from '../../../services/jsonImportService';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useFestival } from '../../../core/hooks/useFestival';

export default function ImportSeniorDataset() {
  const router = useRouter();
  const goBack = useGoBack('/(admin)/participants');
  const { tenant_id: authTenantId } = useAuthStore();
  const tenantId = authTenantId || '';
  
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalId = activeFestival?.id;
  const isCollegeFest = activeFestival?.festival_template === 'college_fest';

  const [rawText, setRawText] = useState<string>('');
  const [dataset, setDataset] = useState<JuniorParticipant[]>([]);
  const [internalValidation, setInternalValidation] = useState<ImportValidationResult | null>(null);
  const [dbConflicts, setDbConflicts] = useState<Map<string, {name: string, isMismatch: boolean}>>(new Map());
  const [isReady, setIsReady] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importReport, setImportReport] = useState<any>(null);

  // Auto-fetch file on load if served by local dev server
  useEffect(() => {
    if (!festivalId) return;
    autoLoadFile();
  }, [festivalId]);

  const autoLoadFile = async () => {
    try {
      const response = await fetch('/import_sn.json');
      if (response.ok) {
        const text = await response.text();
        processFileContent(text);
      }
    } catch (e) {
      console.log('Auto-fetch not available in this environment, falling back to manual file picker.');
    }
  };

  const handleFileUpload = (event: any) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      processFileContent(text);
    };
    reader.readAsText(file);
  };

  const processFileContent = (text: string) => {
    try {
      setRawText(text);
      const parsed = jsonImportService.parseMarkdownWrappedJson(text);
      
      const participants: JuniorParticipant[] = Array.isArray(parsed) 
        ? parsed 
        : (parsed.participants || []);
      
      // Normalize names internally (TRIM, collapse spaces, Unicode normalization, FULL CAPS)
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
        checkDbConflicts(normalized);
      } else {
        setIsReady(false);
      }
    } catch (err: any) {
      Alert.alert('Parser Error', err.message);
      setIsReady(false);
    }
  };

  const checkDbConflicts = async (data: JuniorParticipant[]) => {
    try {
      const chestNumbers = data.map(d => d.chest_number || d.chest_no).filter(Boolean) as string[];
      if (chestNumbers.length === 0) return;

      const { data: existing, error } = await db.validateChestNumbers(festivalId, chestNumbers);
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
      } else {
        setIsReady(false);
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
      // 1. Snapshot backup to Cloud storage
      const backupPath = await jsonImportService.backupDataset(rawText, festivalId, 'sn');

      // 2. Create Session
      const { data: session, error: sessionErr } = await db.createImportSession({
        tenant_id: tenantId,
        festival_id: festivalId,
        filename: 'import_sn.json',
        status: 'processing'
      });
      if (sessionErr) throw sessionErr;
      const sessionId = session?.id || null;

      // 3. Chunk Processing (50 items per chunk)
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
        
        const { data: result, error: chunkErr } = await db.executeSeniorImportChunk({
          tenant_id: tenantId,
          festival_id: festivalId,
          session_id: sessionId,
          participants: chunk
        });

        if (chunkErr) {
          allErrors.push(`Chunk ${i} Failed: ${chunkErr.message}`);
          continue; // Continue next chunks to isolate failures
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
      const filename = `Senior_Import_Report_${Date.now()}.json`;

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

  // Find conflicts
  const conflictsList = Array.from(dbConflicts.entries()).map(([chest, info]) => ({
    chest,
    ...info
  }));
  const mismatchCount = conflictsList.filter(c => c.isMismatch).length;

  if (isCollegeFest) return <CollegeFestImportBlock />;
  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBack} className="p-2 mr-2 bg-ssf-surface rounded-full border border-ssf-border">
          <ArrowLeft size={24} color={ui.colors.text} />
        </TouchableOpacity>
        <Text className="text-3xl font-poppins-black text-ssf-text">Senior Dataset Import</Text>
      </View>

      <SsfCard className="mb-6 bg-emerald-50 border border-emerald-200">
        <Text className="font-poppins-bold text-emerald-800 mb-2">Senior Import Rules</Text>
        <Text className="font-poppins text-xs text-emerald-700 leading-5">
          â€¢ Normalizes all names to FULL CAPITALS.{'\n'}
          â€¢ Prevents chest number duplication. Mismatch conflicts are flagged in RED.{'\n'}
          â€¢ Partial-Safe Mode: imports participant and valid items, skips only invalid item codes.{'\n'}
          â€¢ Deduplicates registrations automatically. Zero-corruption policy.
        </Text>
      </SsfCard>

      {dataset.length === 0 ? (
        <SsfCard className="p-8 items-center border-dashed border-2 border-ssf-border mb-6">
          <Upload size={48} color={ui.colors.textMuted} className="mb-4" />
          <Text className="font-poppins-bold text-lg text-ssf-text mb-2">Upload import_sn.json</Text>
          <Text className="font-poppins text-xs text-ssf-text-muted text-center mb-6 max-w-xs">
            Select the production file at:{'\n'}
            <Text className="font-poppins-bold">web-for-sahi--main/import_sn.json</Text>
          </Text>
          
          {Platform.OS === 'web' ? (
            <input 
              type="file" 
              accept=".json" 
              onChange={handleFileUpload} 
              style={{
                fontFamily: 'Poppins_600SemiBold',
                backgroundColor: '#065F46',
                color: ui.colors.surface,
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer'
              }}
            />
          ) : (
            <Text className="text-xs text-red-500 font-poppins">Please import via web dashboard browser.</Text>
          )}
        </SsfCard>
      ) : (
        <>
          <View className="flex-row gap-4 mb-6">
            <SsfCard className="flex-1 items-center py-4">
              <FileText size={24} color="#065F46" className="mb-2" />
              <Text className="font-poppins-bold text-2xl">{dataset.length}</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">Total Participants</Text>
            </SsfCard>
            <SsfCard className="flex-1 items-center py-4">
              <Database size={24} color="#065F46" className="mb-2" />
              <Text className="font-poppins-bold text-2xl">
                {dataset.reduce((acc, curr) => acc + (curr.items?.length || 0), 0)}
              </Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">Total Items</Text>
            </SsfCard>
          </View>

          {/* Validation Status Card */}
          <SsfCard className="mb-6">
            <Text className="font-poppins-bold text-lg mb-4 text-ssf-text">Import Pre-Validation</Text>
            
            {internalValidation?.isValid && mismatchCount === 0 ? (
              <View className="flex-row items-center bg-green-50 p-4 rounded-xl border border-green-200 mb-4">
                <CheckCircle size={24} color="#15803d" className="mr-3" />
                <View className="flex-1">
                  <Text className="font-poppins-bold text-green-800">Dataset Ready</Text>
                  <Text className="font-poppins text-xs text-green-700">No chest conflicts or formatting issues found. Safe to import!</Text>
                </View>
              </View>
            ) : (
              <View className="bg-red-50 p-4 rounded-xl border border-red-200 mb-4">
                <View className="flex-row items-center mb-2">
                  <AlertCircle size={24} color={ui.colors.destructive} className="mr-3" />
                  <Text className="font-poppins-bold text-red-800">Conflicts Detected</Text>
                </View>
                {internalValidation?.duplicateChests.length ? (
                  <Text className="font-poppins text-xs text-red-700 mb-1">
                    â€¢ Duplicate Chest Numbers inside JSON: {internalValidation.duplicateChests.join(', ')}
                  </Text>
                ) : null}
                {mismatchCount > 0 ? (
                  <Text className="font-poppins text-xs text-red-700">
                    â€¢ Database Conflicts: {mismatchCount} chest numbers mismatch existing participants.
                  </Text>
                ) : null}
              </View>
            )}

            {/* database conflict detailed view */}
            {conflictsList.length > 0 ? (
              <View className="mt-2">
                <Text className="font-poppins-bold text-xs text-ssf-text-muted mb-2">Chest Number Duplicates / Matches in Database:</Text>
                {conflictsList.map(c => (
                  <View key={c.chest} className={`flex-row justify-between p-2 mb-1 rounded ${c.isMismatch ? 'bg-red-100 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                    <Text className="font-poppins-bold text-xs text-ssf-text">Chest {c.chest}</Text>
                    <Text className={`font-poppins text-xs ${c.isMismatch ? 'text-red-700 font-poppins-bold' : 'text-green-700'}`}>
                      {c.isMismatch ? `Name Conflict! DB: ${c.name}` : `Matches Existing: ${c.name} (Safe Skip)`}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Action Buttons */}
            <View className="flex-row gap-4 mt-6">
              <SsfButton 
                label="Reset" 
                variant="outline" 
                className="flex-1" 
                onPress={() => { setDataset([]); setInternalValidation(null); setDbConflicts(new Map()); setIsReady(false); }} 
              />
              <SsfButton 
                label={isProcessing ? `${progress}% Processing...` : "Run Senior Import"} 
                className="flex-1" 
                onPress={executeImport} 
                disabled={!isReady || isProcessing} 
              />
            </View>
          </SsfCard>
        </>
      )}

      {/* Reports Card */}
      {importReport ? (
        <SsfCard className="mb-6">
          <Text className="font-poppins-bold text-lg mb-4 text-ssf-text">Import Execution Report</Text>
          <View style={{ gap: 12 }}>
            <View className="flex-row justify-between border-b border-ssf-border pb-2">
              <Text className="font-poppins text-sm text-ssf-text-muted">Imported Participants:</Text>
              <Text className="font-poppins-bold text-sm text-ssf-text">{importReport.imported_participants}</Text>
            </View>
            <View className="flex-row justify-between border-b border-ssf-border pb-2">
              <Text className="font-poppins text-sm text-ssf-text-muted">Skipped Participants (Already Exist):</Text>
              <Text className="font-poppins-bold text-sm text-ssf-text">{importReport.skipped_participants}</Text>
            </View>
            <View className="flex-row justify-between border-b border-ssf-border pb-2">
              <Text className="font-poppins text-sm text-ssf-text-muted">Imported Registrations:</Text>
              <Text className="font-poppins-bold text-sm text-ssf-text">{importReport.imported_registrations}</Text>
            </View>
            <View className="flex-row justify-between border-b border-ssf-border pb-2">
              <Text className="font-poppins text-sm text-ssf-text-muted">Skipped Registrations (Duplicates):</Text>
              <Text className="font-poppins-bold text-sm text-ssf-text">{importReport.skipped_registrations}</Text>
            </View>
            
            {importReport.invalid_items?.length > 0 ? (
              <View className="bg-orange-50 border border-orange-100 p-3 rounded-lg mt-2">
                <Text className="font-poppins-bold text-orange-800 text-xs mb-1">Skipped Invalid Items:</Text>
                {importReport.invalid_items.map((it: any, index: number) => (
                  <Text key={index} className="font-poppins text-xs text-orange-700">
                    â€¢ Chest {it.chest_number}: Item {it.item_code} ({it.error})
                  </Text>
                ))}
              </View>
            ) : null}

            {importReport.errors?.length > 0 ? (
              <View className="bg-red-50 border border-red-100 p-3 rounded-lg mt-2">
                <Text className="font-poppins-bold text-red-800 text-xs mb-1">Errors Blocked:</Text>
                {importReport.errors.map((err: any, index: number) => (
                  <Text key={index} className="font-poppins text-xs text-red-700">
                    â€¢ {typeof err === 'object' ? `Chest ${err.chest_number}: ${err.error} (DB: ${err.existing_name} vs JSON: ${err.import_name})` : err}
                  </Text>
                ))}
              </View>
            ) : null}
            
            <SsfButton 
              label="Download Import Report" 
              variant="outline" 
              className="mt-4" 
              onPress={downloadReport} 
            />
          </View>
        </SsfCard>
      ) : null}
    </ScrollView>
  );
}
