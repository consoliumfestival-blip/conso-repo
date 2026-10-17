import { R2StorageProvider } from './r2StorageProvider';
import { SupabaseStorageProvider } from './supabaseStorageProvider';
import { StorageProvider } from './storageProvider';

const configuredProvider = (process.env.EXPO_PUBLIC_STORAGE_PROVIDER || 'r2').toLowerCase();

export const storageProvider: StorageProvider =
  configuredProvider === 'supabase'
    ? new SupabaseStorageProvider()
    : new R2StorageProvider();

export * from './storageProvider';
