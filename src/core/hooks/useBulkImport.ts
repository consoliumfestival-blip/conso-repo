import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { participantService } from '../../services/participantService';
import { getCategory, validateParticipant, calculateAge, DEFAULT_FESTIVAL_YEAR } from '../utils/participantValidation';

export interface ImportRow {
  name: string;
  category_code: string;
  phone?: string;
  org_name?: string;
  dob?: string;
  gender?: string;
  class_std?: string;
  education_type?: string;
  event1?: string;
  event2?: string;
  event3?: string;
  event4?: string;
  organisation_id?: string;
  [key: string]: any;
}

export interface ValidatedRow extends ImportRow {
  _resolvedCategory: string;
  _errors: string[];
  _originalIndex: number;
}

export const useBulkImport = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileDetails, setFileDetails] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const selectFile = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          '*/*'
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setLoading(false);
        return;
      }

      const file = result.assets[0];
      setFileDetails(file);
      await parseFile(file.uri);
    } catch (err: any) {
      setError(err.message || 'Failed to select file');
      setLoading(false);
    }
  };

  const parseFile = async (uri: string) => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const buffer = await new Response(blob).arrayBuffer();
      
      const workbook = XLSX.read(buffer, { 
        type: 'array',
        cellDates: true,
        cellNF: false,
        cellText: false 
      });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (json.length < 2) {
        setError('File is missing headers or data.');
        setLoading(false);
        return;
      }

      const fileHeaders = (json[0] as string[]).map(h => String(h).toLowerCase().trim().replace(/\s+/g, '_'));
      setHeaders(fileHeaders);

      const rawRows = json.slice(1) as any[][];
      const mappedPreview = rawRows
        .filter(row => row.length > 0 && row.some(cell => !!cell))
        .map((row) => {
          const obj: any = {};
          fileHeaders.forEach((header, index) => {
            let val = row[index];
            if (header.includes('dob') || header.includes('date')) {
              if (val instanceof Date) {
                val = val.toISOString().split('T')[0];
              } else if (typeof val === 'number') {
                const excelEpoch = new Date(1899, 11, 30);
                const date = new Date(excelEpoch.getTime() + val * 86400000);
                val = date.toISOString().split('T')[0];
              } else if (typeof val === 'string') {
                const parts = val.split(/[\/\-\.]/);
                if (parts.length === 3) {
                  if (parts[0].length <= 2 && parts[2].length === 4) {
                    val = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                  }
                }
              }
            }
            obj[header] = val;
          });
          return obj;
        });

      setPreviewData(mappedPreview);
      setLoading(false);
    } catch (err: any) {
      setError('Failed to parse file. Ensure it is a valid Excel or CSV file.');
      setLoading(false);
    }
  };

  const validateRows = async (mappedData: ImportRow[], tenantId: string, festivalYear: number = DEFAULT_FESTIVAL_YEAR): Promise<ValidatedRow[]> => {
    setLoading(true);
    try {
      const existingSet = await participantService.getDuplicateKeys(tenantId);

      const validated = mappedData.map((row, index) => {
        const errors: string[] = [];
        let resolvedCategory = row.category_code || '';
        
        if (!row.name || !String(row.name).trim()) errors.push('Name is required');

        try {
          resolvedCategory = getCategory({
            class_std: row.class_std ? String(row.class_std) : undefined,
            dob: row.dob ? String(row.dob) : null,
            education_type: row.education_type ? String(row.education_type) : null,
          }, festivalYear);
        } catch (e: any) {
          errors.push('Category error: ' + e.message);
        }

        try {
          if (row.dob) {
            validateParticipant({
              class_std: row.class_std ? String(row.class_std) : undefined,
              dob: String(row.dob),
              education_type: row.education_type ? String(row.education_type) : null,
            }, festivalYear);
          }
        } catch (e: any) {
          errors.push(e.message);
        }

        if (row.phone) {
          const phoneStr = String(row.phone).replace(/\D/g, '');
          if (phoneStr.length > 0 && phoneStr.length < 10) errors.push('Phone must be at least 10 digits');
        }

        const dobStr = row.dob ? new Date(String(row.dob)).toISOString().split('T')[0] : 'nodob';
        if (row.name && existingSet.has(`${String(row.name).toLowerCase().trim()}_${dobStr}`)) {
          errors.push('Duplicate participant found in system');
        }

        return { 
          ...row, 
          _resolvedCategory: resolvedCategory, 
          _errors: errors, 
          _originalIndex: index 
        };
      });
      
      return validated;
    } finally {
      setLoading(false);
    }
  };

  const importData = async (
    validatedData: ValidatedRow[], 
    tenantId: string, 
    festivalId: string,
    targetOrganisationId: string | null = null,
    festivalYear: number = DEFAULT_FESTIVAL_YEAR
  ) => {
    try {
      setLoading(true);
      setError(null);
      
      const validInserts: any[] = [];
      const rowErrors: { row: number; errors: string[] }[] = [];

      validatedData.forEach((row, i) => {
        if (row._errors.length > 0) {
          rowErrors.push({ row: i + 1, errors: row._errors });
        } else {
          validInserts.push({
            tenant_id: tenantId,
            festival_id: festivalId,
            organisation_id: targetOrganisationId,
            unit_org_id: targetOrganisationId,
            name: row.name,
            category_code: row._resolvedCategory,
            phone: row.phone || null,
            dob: row.dob ? new Date(String(row.dob)).toISOString() : null,
            age: row.dob ? calculateAge(String(row.dob), festivalYear) : null,
            class_std: row.class_std ? String(row.class_std) : null,
            gender: row.gender || 'both',
            status: 'pending',
            registered_by: 'admin'
          });
        }
      });

      let insertedCount = 0;
      if (validInserts.length > 0) {
         const data = await participantService.createParticipants(validInserts);
         insertedCount = data.length;
      }

      return {
        success: true,
        imported: insertedCount,
        skipped: rowErrors.length,
        errors: rowErrors
      };
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPreviewData([]);
    setHeaders([]);
    setFileDetails(null);
    setError(null);
  };

  return {
    loading,
    error,
    previewData,
    headers,
    fileDetails,
    selectFile,
    validateRows,
    importData,
    setPreviewData,
    reset,
  };
};
