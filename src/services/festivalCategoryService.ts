import { festivalCategoryRepository } from '../lib/repositories/festivalCategoryRepository';
import type { FestivalCategoryInput } from '../types/festivalCategory';

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

export const generateCategoryCode = (name: string) => name
  .trim()
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9\s_]/g, '')
  .replace(/[\s_]+/g, '_')
  .replace(/^_+|_+$/g, '');

const friendlyError = (error: { code?: string; message: string } | null): never => {
  if (error?.code === '23505') throw new Error('A category with this name or code already exists.');
  if (error?.code === '23514') throw new Error('Category code must start with a letter and use lowercase letters, numbers, or underscores.');
  throw new Error(error?.message || 'Unable to save the category. Please try again.');
};

const validate = (input: FestivalCategoryInput) => {
  const normalized = { ...input, name: input.name.trim(), code: input.code.trim().toLowerCase() };
  if (!normalized.name) throw new Error('Category name is required.');
  if (!CODE_PATTERN.test(normalized.code)) {
    throw new Error('Category code must start with a letter and use lowercase letters, numbers, or underscores.');
  }
  if (!Number.isInteger(normalized.sort_order)) throw new Error('Sort order must be a whole number.');
  return normalized;
};

export const festivalCategoryService = {
  async list(festivalId: string, activeOnly = false) {
    const { data, error } = await festivalCategoryRepository.list(festivalId, activeOnly);
    if (error) friendlyError(error);
    return data ?? [];
  },
  async create(tenantId: string, festivalId: string, input: FestivalCategoryInput) {
    const { data, error } = await festivalCategoryRepository.create(tenantId, festivalId, validate(input));
    if (error) friendlyError(error);
    if (!data) throw new Error('The category was not returned after creation.');
    return data;
  },
  async update(id: string, input: FestivalCategoryInput) {
    const { data, error } = await festivalCategoryRepository.update(id, validate(input));
    if (error) friendlyError(error);
    if (!data) throw new Error('The category was not returned after update.');
    return data;
  },
  async setActive(id: string, isActive: boolean) {
    const { data, error } = await festivalCategoryRepository.setActive(id, isActive);
    if (error) friendlyError(error);
    if (!data) throw new Error('The category status was not returned after update.');
    return data;
  },
  async remove(id: string) {
    const { data, error } = await festivalCategoryRepository.remove(id);
    if (error) friendlyError(error);
    if (data?.status === 'blocked') throw new Error(data.message || 'This category is in use and cannot be deleted.');
    return data;
  },
};
