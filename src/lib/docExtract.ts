// docExtract.ts  (server-only)
//
// Extracts plain text from an uploaded ticket attachment so it can be handed
// to the AI Fix / Generate agents. PDFs are NOT handled here — they're passed
// through as a file for the Claude Agent SDK's own Read tool to read directly
// (proven to work, including for large/scanned PDFs). Only .docx (modern
// Word, a zip of XML) needs server-side extraction; legacy binary .doc is
// intentionally unsupported — parsing the old binary format needs a much
// heavier dependency than this internal tool warrants.

import mammoth from 'mammoth';

export type AttachmentKind = 'pdf' | 'docx' | 'unsupported';

export const detectAttachmentKind = (filename: string): AttachmentKind => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  return 'unsupported';
};

export const extractDocxText = async (buffer: Buffer): Promise<string> => {
  const { value } = await mammoth.extractRawText({ buffer });
  return value.trim();
};

export const UNSUPPORTED_ATTACHMENT_MESSAGE =
  'Only PDF and modern Word (.docx) attachments are supported. Legacy .doc files aren\'t — please re-save as .docx or export to PDF and try again.';
