import { ui } from '@/constants/designSystem';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { useBulkImport, ImportRow, ValidatedRow } from '../../../core/hooks/useBulkImport';
import { UploadCloud, FileSpreadsheet, ArrowLeft, Download, CheckCircle, AlertCircle, Edit2 } from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { participantService } from '../../../services/participantService';
import { useFestival } from '../../../core/hooks/useFestival';
import { CollegeFestImportBlock } from '../../../components/ui/CollegeFestImportBlock';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

export default function ImportParticipants() {
  const router = useRouter();
  const goBack = useGoBack('/(admin)/participants');
  const { tenant_id: authTenantId } = useAuthStore();
  const tenantId = authTenantId || '';

  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalId = activeFestival?.id;
  const isCollegeFest = activeFestival?.festival_template === 'college_fest';

  const {
    loading,
    error,
    previewData,
    headers,
    fileDetails,
    selectFile,
    validateRows,
    importData,
    reset,
  } = useBulkImport();

  const [columnMapping, setColumnMapping] = useState<{ [key: string]: string }>({
    name: '',
    category_code: '',
    phone: '',
    dob: '',
    class_std: '',
    education_type: '',
    gender: '',
    event1: '',
    event2: '',
    event3: '',
    event4: '',
  });

  const [validatedData, setValidatedData] = useState<ValidatedRow[] | null>(null);
  const [importResult, setImportResult] = useState<{success?: boolean, imported?: number, errors?: any[]} | null>(null);

  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [organisations, setOrganisations] = useState<any[]>([]);

  useEffect(() => {
    if (tenantId) {
      participantService.listOrganisations(tenantId).then((data) => {
        setOrganisations(data);
      });
    }
  }, [tenantId]);

  const handleMapColumn = (field: string, header: string) => {
    setColumnMapping(prev => ({ ...prev, [field]: header }));
    setValidatedData(null); 
  };

  const downloadTemplate = async () => {
    const ws_data = [
      ["Name", "Category Code", "DOB", "Class", "Education Type", "Gender", "Phone", "Event 1", "Event 2", "Event 3", "Event 4"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const filename = `Participant_Import_Template.xlsx`;

    if (Platform.OS === 'web') {
      const uri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
      const link = document.createElement('a');
      link.href = uri;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const docDir = (FileSystem as any).documentDirectory || '';
      const fileUri = docDir + filename;
      const encType = (FileSystem as any).EncodingType?.Base64 || 'base64';
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: encType });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Error', 'Sharing not available on this device');
      }
    }
  };

  const runValidation = async () => {
    if (!selectedOrgId) {
      Alert.alert('Missing Target', 'Please select a Target Organisation.');
      return;
    }

    const hasAutoInfo = columnMapping.dob || columnMapping.class_std || columnMapping.education_type;
    if (!columnMapping.name || (!columnMapping.category_code && !hasAutoInfo)) {
      Alert.alert('Error', 'Please map Name and either a Category column OR (DOB/Class) to proceed.');
      return;
    }

    const mappedRows: ImportRow[] = previewData.map(row => ({
      name: row[columnMapping.name],
      category_code: columnMapping.category_code ? row[columnMapping.category_code] : undefined,
      dob: columnMapping.dob ? row[columnMapping.dob] : undefined,
      class_std: columnMapping.class_std ? row[columnMapping.class_std] : undefined,
      education_type: columnMapping.education_type ? row[columnMapping.education_type] : undefined,
      phone: columnMapping.phone ? row[columnMapping.phone] : undefined,
      gender: columnMapping.gender ? row[columnMapping.gender] : undefined,
      event1: columnMapping.event1 ? row[columnMapping.event1] : undefined,
      event2: columnMapping.event2 ? row[columnMapping.event2] : undefined,
      event3: columnMapping.event3 ? row[columnMapping.event3] : undefined,
      event4: columnMapping.event4 ? row[columnMapping.event4] : undefined,
    }));

    try {
      const result = await validateRows(mappedRows, tenantId);
      setValidatedData(result);
    } catch (err: any) {
      Alert.alert('Validation Error', err.message);
    }
  };

  const handleInlineEdit = (index: number, field: string, value: string) => {
    if (!validatedData) return;
    const newData = [...validatedData];
    newData[index] = { ...newData[index], [field]: value };
    setValidatedData(newData);
  };

  const processImport = async () => {
    if (!validatedData) return;
    if (!tenantId || !festivalId) {
      Alert.alert('Import unavailable', 'Your tenant and active festival context are still loading. Please try again.');
      return;
    }
    try {
      const targetOrg = organisations.find(o => o.id === selectedOrgId);
      const targetTenantId = targetOrg?.tenant_id || tenantId;

      const result = await importData(validatedData, targetTenantId, festivalId, selectedOrgId);
      setImportResult(result);
      if (result.errors && result.errors.length > 0) {
        Alert.alert('Import Completed with Errors', `Imported ${result.imported} participants. Skipped ${result.skipped} rows due to validation errors. See below.`);
      } else {
        Alert.alert('Success', 'All participants imported successfully!', [
          { text: 'OK', onPress: () => router.replace('/(admin)/participants') }
        ]);
      }
    } catch (err: any) {
      Alert.alert('Import Failed', err.message);
    }
  };

  if (isCollegeFest) return <CollegeFestImportBlock />;

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={goBack} className="p-2 mr-2 bg-ssf-surface rounded-full border border-ssf-border">
            <ArrowLeft size={24} color={ui.colors.text} />
          </TouchableOpacity>
          <Text className="text-3xl font-poppins-black text-ssf-text">Bulk Import</Text>
        </View>
        <SsfButton 
          label="Template" 
          variant="outline" 
          size="sm" 
          icon={<Download size={16} color="#1B6B3A" />} 
          onPress={downloadTemplate}
        />
      </View>

      <SsfCard className="mb-6">
        <Text className="text-xl font-poppins-bold mb-4">1. Select Target Organisation</Text>
        {organisations.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {organisations.map((org: any) => (
              <TouchableOpacity
                key={org.id}
                className={`px-3 py-2 rounded-xl border ${selectedOrgId === org.id ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                onPress={() => setSelectedOrgId(org.id)}
              >
                <Text className={`font-poppins-bold text-sm ${selectedOrgId === org.id ? 'text-white' : 'text-ssf-text'}`}>
                  {org.name} <Text className="font-poppins font-normal text-xs opacity-80">({org.org_type})</Text>
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text className="font-poppins text-xs italic text-red-500">No organisations found. Please set up the hierarchy first.</Text>
        )}
      </SsfCard>

      {!fileDetails ? (
        <SsfCard className="items-center py-10">
          <UploadCloud size={48} color="#1B6B3A" className="mb-4" />
          <Text className="text-lg font-poppins-bold text-center mb-2">Upload Excel or CSV</Text>
          <Text className="text-sm text-ssf-text-muted text-center mb-6">Max size 5MB. .xlsx, .csv formats supported.</Text>
          <SsfButton label="Browse File" onPress={selectFile} isLoading={loading} />
          {error && <Text className="text-red-500 mt-4 text-center font-poppins">{error}</Text>}
        </SsfCard>
      ) : (
        <View>
          <SsfCard className="mb-6 border border-ssf-primary bg-ui-success-soft">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <FileSpreadsheet size={24} color="#1B6B3A" className="mr-3" />
                <View className="flex-1">
                  <Text className="font-poppins-bold" numberOfLines={1}>{fileDetails.name}</Text>
                  <Text className="text-xs text-ssf-text-muted">{previewData.length} records found</Text>
                </View>
              </View>
              <TouchableOpacity onPress={reset}>
                <Text className="text-red-500 font-poppins-bold text-sm">Cancel</Text>
              </TouchableOpacity>
            </View>
          </SsfCard>

          {previewData.length > 0 && !validatedData && (
            <SsfCard className="mb-6">
              <Text className="text-lg font-poppins-bold mb-4">2. Map Columns</Text>
              
              {[
                { key: 'name', label: 'Participant Name (Required)' },
                { key: 'category_code', label: 'Category (Optional if Class/DOB provided)' },
                { key: 'dob', label: 'Date of Birth (YYYY-MM-DD)' },
                { key: 'class_std', label: 'Class/Standard (1-12)' },
                { key: 'gender', label: 'Gender (boys/girls)' },
                { key: 'phone', label: 'Phone Number' },
              ].map(field => (
                <View key={field.key} className="mb-4">
                  <Text className="font-poppins text-ssf-text mb-2">{field.label}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
                    {headers.map(header => (
                      <TouchableOpacity
                        key={`${field.key}-${header}`}
                        onPress={() => handleMapColumn(field.key, header)}
                        className={`px-3 py-2 rounded-lg border mr-2 ${columnMapping[field.key] === header ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                      >
                        <Text className={`font-poppins text-sm ${columnMapping[field.key] === header ? 'text-white font-poppins-bold' : 'text-ssf-text'}`}>
                          {header}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ))}

              <View className="mt-4">
                <SsfButton label="Validate & Preview" onPress={runValidation} isLoading={loading} />
              </View>
            </SsfCard>
          )}

          {validatedData && !importResult && (
            <SsfCard className="mb-10">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-lg font-poppins-bold">3. Preview & Fix</Text>
                <TouchableOpacity onPress={runValidation} className="bg-ssf-surface px-3 py-1 rounded-lg border border-ssf-border">
                  <Text className="font-poppins-bold text-xs text-ssf-primary">Re-Validate</Text>
                </TouchableOpacity>
              </View>
              
              <Text className="font-poppins text-xs text-ssf-text-muted mb-4">
                Tap on any cell with a red border to edit the value. Green rows are ready to import.
              </Text>

              {validatedData.map((row, idx) => {
                const hasError = row._errors.length > 0;
                return (
                  <View key={idx} className={`mb-3 p-3 rounded-xl border ${hasError ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
                    <View className="flex-row justify-between mb-2">
                      <View className="flex-1 mr-2">
                        <Text className="text-[10px] font-poppins-bold text-gray-500 uppercase">Name</Text>
                        <TextInput 
                          value={row.name || ''} 
                          onChangeText={(v) => handleInlineEdit(idx, 'name', v)}
                          className={`font-poppins-bold text-ssf-text bg-white px-2 py-1 rounded border ${!row.name ? 'border-red-400' : 'border-gray-200'}`}
                        />
                      </View>
                      <View className="flex-1 mr-2">
                        <Text className="text-[10px] font-poppins-bold text-gray-500 uppercase">DOB</Text>
                        <TextInput 
                          value={row.dob || ''} 
                          onChangeText={(v) => handleInlineEdit(idx, 'dob', v)}
                          placeholder="YYYY-MM-DD"
                          className="font-poppins text-sm text-ssf-text bg-white px-2 py-1 rounded border border-gray-200"
                        />
                      </View>
                      <View className="w-16">
                        <Text className="text-[10px] font-poppins-bold text-gray-500 uppercase">Class</Text>
                        <TextInput 
                          value={row.class_std ? String(row.class_std) : ''} 
                          onChangeText={(v) => handleInlineEdit(idx, 'class_std', v)}
                          className="font-poppins text-sm text-ssf-text bg-white px-2 py-1 rounded border border-gray-200 text-center"
                        />
                      </View>
                    </View>
                    
                    <View className="flex-row items-center justify-between mt-1">
                      <Text className="font-poppins text-xs text-gray-600">
                        Resolved Category: <Text className="font-poppins-bold text-ssf-primary">{row._resolvedCategory || 'None'}</Text>
                      </Text>
                      {hasError ? (
                        <AlertCircle size={16} color="#DC2626" />
                      ) : (
                        <CheckCircle size={16} color="#16A34A" />
                      )}
                    </View>

                    {hasError && (
                      <View className="mt-2 pt-2 border-t border-red-200">
                        {row._errors.map((e, i) => (
                          <Text key={i} className="font-poppins text-[10px] text-red-600">• {e}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}

              <View className="mt-6">
                <SsfButton 
                  label={`Import Valid Records`}
                  isLoading={loading}
                  onPress={processImport}
                />
              </View>
            </SsfCard>
          )}
          
          {importResult?.errors && importResult.errors.length > 0 && (
            <View className="mt-6 bg-red-50 p-4 rounded-xl border border-red-200">
              <Text className="font-poppins-bold text-red-700 mb-2">Import Errors ({importResult.errors.length} rows failed)</Text>
              {importResult.errors.map((err, idx) => (
                <View key={idx} className="mb-2">
                  <Text className="font-poppins-bold text-red-600 text-sm">Row {err.row}:</Text>
                  {err.errors.map((msg: string, i: number) => (
                    <Text key={i} className="font-poppins text-red-500 text-xs ml-2">• {msg}</Text>
                  ))}
                </View>
              ))}
              <SsfButton 
                label="Dismiss & Continue" 
                variant="outline"
                className="mt-4"
                onPress={() => router.replace('/(admin)/participants')}
              />
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
