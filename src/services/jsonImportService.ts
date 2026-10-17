import { storageService } from './storage/storageService';

export interface JuniorParticipant {
  chest_no?: string;
  chest_number?: string;
  name: string;
  items: string[];
}

export interface ImportValidationResult {
  isValid: boolean;
  errors: string[];
  duplicateChests: string[];
  duplicateNames: string[];
}

export const normalizeParticipantName = (name: string): string => {
  if (!name) return '';
  return name
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

export const jsonImportService = {
  /**
   * Normalizes participant name to FULL CAPS, trimmed, and unicode normalized.
   */
  normalizeParticipantName,

  /**
   * Validates internal JSON structure for duplicates
   */
  validateInternalDataset(data: JuniorParticipant[]): ImportValidationResult {
    const result: ImportValidationResult = {
      isValid: true,
      errors: [],
      duplicateChests: [],
      duplicateNames: [],
    };

    const chestMap = new Map<string, number>();
    const nameMap = new Map<string, number>();

    data.forEach((p, index) => {
      const chest = p.chest_number || p.chest_no;
      if (!chest) {
        result.errors.push(`Row ${index}: Missing chest number`);
      } else {
        if (chestMap.has(chest)) {
          result.duplicateChests.push(chest);
        } else {
          chestMap.set(chest, index);
        }
      }

      const normName = normalizeParticipantName(p.name);
      if (!normName) {
        result.errors.push(`Row ${index}: Missing name for chest ${chest}`);
      } else {
        if (nameMap.has(normName)) {
          // Warning: Duplicate name might be valid for different participants in different categories,
          // but in a single import it's suspicious. We will just track it.
          result.duplicateNames.push(normName);
        } else {
          nameMap.set(normName, index);
        }
      }
    });

    if (result.duplicateChests.length > 0) {
      result.isValid = false;
      result.errors.push(`Found duplicate chest numbers in JSON: ${result.duplicateChests.join(', ')}`);
    }

    return result;
  },

  /**
   * Safe parser for both clean JSON and Markdown codeblock wrapped JSON files.
   */
  parseMarkdownWrappedJson(text: string): any {
    try {
      // 1. Try direct parsing first
      return JSON.parse(text);
    } catch {
      // 2. Fallback to markdown JSON block regex extraction
      const match = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1]);
        } catch (e: any) {
          throw new Error(`Found Markdown JSON block but failed to parse it: ${e.message}`);
        }
      }
      throw new Error("Could not parse file. Ensure it is either valid JSON or wrapped in a ```json codeblock.");
    }
  },

  /**
   * Creates a snapshot of the dataset in storage
   */
  async backupDataset(data: any, festivalId: string, type: string = 'jn'): Promise<string> {
    try {
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const objectKey = `import-history/import${type}_${festivalId}_${Date.now()}.json`;
      
      const uploadResult = await storageService.upload(
        blob,
        objectKey,
        'application/json',
        'private'
      );
      
      return objectKey;
    } catch (e) {
      console.warn('Failed to backup dataset:', e);
      return '';
    }
  }
};
