import { Directory, File as ExpoFile, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  VoiceNote,
  VoiceNoteProcessingStatus,
  VoiceNoteSyncStatus,
} from '../types';

type VoiceNoteRow = {
  id: string;
  file_uri: string;
  created_at: string;
  duration_ms: number;
  size_bytes: number | null;
  sync_status: VoiceNoteSyncStatus;
  processing_status: VoiceNoteProcessingStatus;
  storage_path: string | null;
  transcript_text: string | null;
  remote_note_id: string | null;
  last_error: string | null;
  retry_count: number | null;
  updated_at: string | null;
};

type TableInfoRow = {
  name: string;
};

type VoiceNotePatch = Partial<
  Pick<
    VoiceNote,
    | 'syncStatus'
    | 'processingStatus'
    | 'storagePath'
    | 'transcriptText'
    | 'remoteNoteId'
    | 'lastError'
    | 'retryCount'
    | 'updatedAt'
  >
>;

const DATABASE_NAME = 'fieldnotes.db';
const AUDIO_DIRECTORY_NAME = 'voice-notes';
const SYNCABLE_SYNC_STATUSES: VoiceNoteSyncStatus[] = [
  'pending_upload',
  'uploading',
  'uploaded',
  'failed',
];

let databasePromise: Promise<SQLiteDatabase> | null = null;

function ensureAudioDirectory() {
  const audioDirectory = new Directory(Paths.document, AUDIO_DIRECTORY_NAME);

  if (!audioDirectory.exists) {
    audioDirectory.create({ idempotent: true, intermediates: true });
  }

  return audioDirectory;
}

async function ensureVoiceNotesColumns(database: SQLiteDatabase) {
  const columns = await database.getAllAsync<TableInfoRow>(
    'PRAGMA table_info(voice_notes)'
  );
  const existingColumns = new Set(columns.map((column) => column.name));
  const columnDefinitions: Record<string, string> = {
    sync_status: "TEXT NOT NULL DEFAULT 'pending_upload'",
    processing_status: "TEXT NOT NULL DEFAULT 'not_started'",
    storage_path: 'TEXT',
    transcript_text: 'TEXT',
    remote_note_id: 'TEXT',
    last_error: 'TEXT',
    retry_count: 'INTEGER NOT NULL DEFAULT 0',
    updated_at: "TEXT NOT NULL DEFAULT ''",
  };

  for (const [columnName, definition] of Object.entries(columnDefinitions)) {
    if (existingColumns.has(columnName)) {
      continue;
    }

    await database.execAsync(
      `ALTER TABLE voice_notes ADD COLUMN ${columnName} ${definition};`
    );
  }

  await database.runAsync(
    "UPDATE voice_notes SET updated_at = COALESCE(NULLIF(updated_at, ''), created_at)"
  );
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME);
  }

  const database = await databasePromise;

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS voice_notes (
      id TEXT PRIMARY KEY NOT NULL,
      file_uri TEXT NOT NULL,
      created_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      size_bytes INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'pending_upload',
      processing_status TEXT NOT NULL DEFAULT 'not_started',
      storage_path TEXT,
      transcript_text TEXT,
      remote_note_id TEXT,
      last_error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);

  await ensureVoiceNotesColumns(database);

  return database;
}

function mapVoiceNote(row: VoiceNoteRow): VoiceNote {
  return {
    id: row.id,
    fileUri: row.file_uri,
    createdAt: row.created_at,
    durationMillis: row.duration_ms,
    sizeBytes: row.size_bytes,
    syncStatus: row.sync_status ?? 'pending_upload',
    processingStatus: row.processing_status ?? 'not_started',
    storagePath: row.storage_path,
    transcriptText: row.transcript_text,
    remoteNoteId: row.remote_note_id,
    lastError: row.last_error,
    retryCount: row.retry_count ?? 0,
    updatedAt: row.updated_at || row.created_at,
  };
}

function createVoiceNoteId() {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeFileExtension(extension: string) {
  const normalized = extension.replace('.', '').trim().toLowerCase();

  if (!normalized || normalized.length > 8) {
    return null;
  }

  return normalized;
}

function getFileExtension(uri: string, fallbackExtension?: string) {
  const cleanUri = uri.split('?')[0] ?? uri;
  const extension = cleanUri.split('.').pop() ?? '';
  const sanitizedExtension = sanitizeFileExtension(extension);

  if (sanitizedExtension) {
    return sanitizedExtension;
  }

  return sanitizeFileExtension(fallbackExtension ?? '') ?? 'm4a';
}

async function waitForFileToBeReady(uri: string) {
  const sourceFile = new ExpoFile(uri);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const fileInfo = sourceFile.info();

    if (sourceFile.exists && (fileInfo.size ?? 0) > 0) {
      return sourceFile;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
  }

  return sourceFile;
}

function createUpdatedAt() {
  return new Date().toISOString();
}

export async function initializeVoiceNotesStore() {
  ensureAudioDirectory();
  await getDatabase();
}

export async function listVoiceNotes() {
  const database = await getDatabase();
  const rows = await database.getAllAsync<VoiceNoteRow>(
    `SELECT
       id,
       file_uri,
       created_at,
       duration_ms,
       size_bytes,
       sync_status,
       processing_status,
       storage_path,
       transcript_text,
       remote_note_id,
       last_error,
       retry_count,
       updated_at
     FROM voice_notes
     ORDER BY created_at DESC`
  );

  return rows.map(mapVoiceNote);
}

export async function listSyncableVoiceNotes() {
  const database = await getDatabase();
  const syncStatusPlaceholders = SYNCABLE_SYNC_STATUSES.map(() => '?').join(', ');
  const rows = await database.getAllAsync<VoiceNoteRow>(
    `SELECT
       id,
       file_uri,
       created_at,
       duration_ms,
       size_bytes,
       sync_status,
       processing_status,
       storage_path,
       transcript_text,
       remote_note_id,
       last_error,
       retry_count,
       updated_at
     FROM voice_notes
     WHERE sync_status IN (${syncStatusPlaceholders})
        OR processing_status != 'complete'
     ORDER BY created_at ASC`,
    SYNCABLE_SYNC_STATUSES
  );

  return rows.map(mapVoiceNote);
}

export async function persistVoiceNote({
  sourceUri,
  durationMillis,
  preferredExtension,
  transcriptText,
}: {
  sourceUri: string;
  durationMillis: number;
  preferredExtension?: string;
  transcriptText?: string | null;
}) {
  const database = await getDatabase();
  const audioDirectory = ensureAudioDirectory();
  const noteId = createVoiceNoteId();
  const createdAt = new Date().toISOString();
  const sourceFile = await waitForFileToBeReady(sourceUri);
  const destinationFile = new ExpoFile(
    audioDirectory,
    `${noteId}.${getFileExtension(sourceUri, preferredExtension)}`
  );

  sourceFile.copy(destinationFile);

  const fileInfo = destinationFile.info();
  const voiceNote: VoiceNote = {
    id: noteId,
    fileUri: destinationFile.uri,
    createdAt,
    durationMillis: Math.max(0, Math.round(durationMillis)),
    sizeBytes: fileInfo.size ?? null,
    syncStatus: 'pending_upload',
    processingStatus: 'not_started',
    storagePath: null,
    transcriptText: transcriptText?.trim() || null,
    remoteNoteId: null,
    lastError: null,
    retryCount: 0,
    updatedAt: createdAt,
  };

  await database.runAsync(
    `INSERT INTO voice_notes (
       id,
       file_uri,
       created_at,
       duration_ms,
       size_bytes,
       sync_status,
       processing_status,
       storage_path,
       transcript_text,
       remote_note_id,
       last_error,
       retry_count,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      voiceNote.id,
      voiceNote.fileUri,
      voiceNote.createdAt,
      voiceNote.durationMillis,
      voiceNote.sizeBytes,
      voiceNote.syncStatus,
      voiceNote.processingStatus,
      voiceNote.storagePath,
      voiceNote.transcriptText,
      voiceNote.remoteNoteId,
      voiceNote.lastError,
      voiceNote.retryCount,
      voiceNote.updatedAt,
    ]
  );

  return voiceNote;
}

export async function updateVoiceNote(noteId: string, patch: VoiceNotePatch) {
  const database = await getDatabase();
  const assignments: string[] = [];
  const values: Array<number | string | null> = [];
  const updatedAt = patch.updatedAt ?? createUpdatedAt();
  const patchEntries: Array<[keyof VoiceNotePatch, number | string | null]> = [
    ['syncStatus', patch.syncStatus ?? null],
    ['processingStatus', patch.processingStatus ?? null],
    ['storagePath', patch.storagePath ?? null],
    ['transcriptText', patch.transcriptText ?? null],
    ['remoteNoteId', patch.remoteNoteId ?? null],
    ['lastError', patch.lastError ?? null],
    ['retryCount', patch.retryCount ?? null],
  ];
  const columnMap: Record<keyof VoiceNotePatch, string> = {
    syncStatus: 'sync_status',
    processingStatus: 'processing_status',
    storagePath: 'storage_path',
    transcriptText: 'transcript_text',
    remoteNoteId: 'remote_note_id',
    lastError: 'last_error',
    retryCount: 'retry_count',
    updatedAt: 'updated_at',
  };

  for (const [key, value] of patchEntries) {
    if (value === null && !(key in patch)) {
      continue;
    }

    assignments.push(`${columnMap[key]} = ?`);
    values.push(value);
  }

  assignments.push('updated_at = ?');
  values.push(updatedAt);
  values.push(noteId);

  if (assignments.length === 0) {
    return;
  }

  await database.runAsync(
    `UPDATE voice_notes
     SET ${assignments.join(', ')}
     WHERE id = ?`,
    values
  );
}

export async function deleteVoiceNote(note: VoiceNote) {
  const database = await getDatabase();
  const file = new ExpoFile(note.fileUri);

  if (file.exists) {
    file.delete();
  }

  await database.runAsync('DELETE FROM voice_notes WHERE id = ?', [note.id]);
}
