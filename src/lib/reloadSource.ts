import type { FormRoot } from '@/types/form';
import { buildAnyXML, parseAnyXML } from '@/lib/xmlParser';

export interface ReloadFileHandle {
  getFile: () => Promise<{ text: () => Promise<string> }>;
}

export const isFormDirty = (
  form: FormRoot | null,
  savedBaselineXml: string | null
): boolean => {
  if (!form) return false;
  if (!savedBaselineXml) return true;
  return buildAnyXML(form) !== savedBaselineXml;
};

export const resolveSavedBaselineAfterReload = (
  currentSavedBaselineXml: string | null,
  hasFileHandle: boolean,
  reloadedXml: string
): string | null => currentSavedBaselineXml === null && !hasFileHandle
  ? null
  : reloadedXml;

export const shouldContinueAfterSave = async (
  saveRequested: boolean,
  save: () => Promise<boolean>
): Promise<boolean> => !saveRequested || save();

export const loadReloadForm = async (
  fileHandle: ReloadFileHandle | null,
  fallbackXml: string | null
): Promise<FormRoot> => {
  const xml = fileHandle
    ? await (await fileHandle.getFile()).text()
    : fallbackXml;

  if (!xml) {
    throw new Error('No reload source is available');
  }

  const parsed = parseAnyXML(xml);
  if (!parsed) {
    throw new Error('Failed to parse reload XML');
  }

  return parsed;
};
