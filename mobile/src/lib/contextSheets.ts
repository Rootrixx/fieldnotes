import { FunctionsHttpError } from '@supabase/supabase-js';

import type { ContextSheet, ContextSheetData, ContextSheetTemplate } from '../types';
import { getSupabaseClient } from './supabase';

type ContextSheetRow = {
  id: string;
  title: string;
  template_id: string;
  data: ContextSheetData;
  created_at: string;
  updated_at: string;
  context_sheet_templates?:
    | {
        render_html?: string | null;
      }
    | Array<{
        render_html?: string | null;
      }>
    | null;
  context_sheet_notes?: Array<{
    note_id: string;
  }> | null;
};

type ContextSheetResponse = {
  contextSheet?: {
    id: string;
  };
  error?: string;
};

type TemplateImportResponse = {
  template?: {
    id: string;
    name: string;
    createdAt: string;
  };
  error?: string;
};

type ContextSheetErrorResponse = {
  error?: string;
  stage?: string;
};

type ContextSheetTemplateRow = {
  id: string;
  user_id: string | null;
  name: string;
  created_at: string;
};

const CREATE_CONTEXT_SHEET_FUNCTION_NAME =
  process.env.EXPO_PUBLIC_SUPABASE_CREATE_CONTEXT_SHEET_FUNCTION?.trim() ||
  'create-context-sheet';
const IMPORT_CONTEXT_SHEET_TEMPLATE_FUNCTION_NAME =
  process.env.EXPO_PUBLIC_SUPABASE_IMPORT_CONTEXT_SHEET_TEMPLATE_FUNCTION?.trim() ||
  'import-context-sheet-template';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function mapContextSheet(row: ContextSheetRow): ContextSheet {
  const templateValue = row.context_sheet_templates;
  const templateHtml = Array.isArray(templateValue)
    ? templateValue[0]?.render_html ?? null
    : templateValue?.render_html ?? null;

  return {
    id: row.id,
    title: row.title,
    templateId: row.template_id,
    templateHtml,
    data: row.data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    noteCount: Array.isArray(row.context_sheet_notes) ? row.context_sheet_notes.length : 0,
  };
}

function mapContextSheetTemplate(row: ContextSheetTemplateRow): ContextSheetTemplate {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    isDefault: row.user_id === null,
  };
}

async function parseFunctionError(error: FunctionsHttpError, action: string) {
  try {
    const responsePayload = (await error.context.json()) as ContextSheetErrorResponse;
    const errorText = responsePayload.error?.trim() || 'The Edge Function returned an error.';
    const stageText = responsePayload.stage?.trim();

    return stageText
      ? `${action} failed at ${stageText}: ${errorText}`
      : `${action} failed: ${errorText}`;
  } catch {
    return `${action} failed: The Edge Function returned an unreadable error.`;
  }
}

export async function listContextSheets() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('context_sheets')
    .select(
      `
        id,
        title,
        template_id,
        data,
        created_at,
        updated_at,
        context_sheet_templates(render_html),
        context_sheet_notes(note_id)
      `
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(
      `Could not load context sheets: ${getErrorMessage(
        error,
        'The database query failed.'
      )}`
    );
  }

  return (data ?? []).map((row) => mapContextSheet(row as ContextSheetRow));
}

export async function listContextSheetTemplates() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('context_sheet_templates')
    .select('id, user_id, name, created_at')
    .order('user_id', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(
      `Could not load context sheet templates: ${getErrorMessage(
        error,
        'The database query failed.'
      )}`
    );
  }

  return (data ?? []).map((row) =>
    mapContextSheetTemplate(row as ContextSheetTemplateRow)
  );
}

export async function createContextSheet(noteIds: string[], templateId?: string | null) {
  const cleanedNoteIds = Array.from(
    new Set(noteIds.map((noteId) => noteId.trim()).filter(Boolean))
  );

  if (cleanedNoteIds.length === 0) {
    throw new Error('Pick at least one processed note before creating a context sheet.');
  }

  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<ContextSheetResponse>(
    CREATE_CONTEXT_SHEET_FUNCTION_NAME,
    {
      body: {
        noteIds: cleanedNoteIds,
        templateId: templateId?.trim() || undefined,
      },
    }
  );

  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw new Error(await parseFunctionError(error, 'Context sheet creation'));
    }

    throw new Error(
      `Context sheet creation failed: ${getErrorMessage(
        error,
        'The Edge Function could not be reached.'
      )}`
    );
  }

  if (!data?.contextSheet) {
    throw new Error('The server finished without returning a context sheet.');
  }

  return data.contextSheet;
}

export async function importContextSheetTemplate({
  base64,
  fileName,
  mimeType,
}: {
  base64: string;
  fileName: string;
  mimeType: string;
}) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<TemplateImportResponse>(
    IMPORT_CONTEXT_SHEET_TEMPLATE_FUNCTION_NAME,
    {
      body: {
        base64,
        fileName,
        mimeType,
      },
    }
  );

  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw new Error(await parseFunctionError(error, 'Template import'));
    }

    throw new Error(
      `Template import failed: ${getErrorMessage(
        error,
        'The Edge Function could not be reached.'
      )}`
    );
  }

  if (!data?.template) {
    throw new Error('The server finished without returning a context sheet template.');
  }

  return data.template;
}
