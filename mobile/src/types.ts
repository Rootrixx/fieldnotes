export type VoiceNoteSyncStatus =
  | 'pending_upload'
  | 'uploading'
  | 'uploaded'
  | 'synced'
  | 'failed';

export type VoiceNoteProcessingStatus =
  | 'not_started'
  | 'transcribing'
  | 'complete'
  | 'failed';

export type VoiceNote = {
  id: string;
  fileUri: string;
  createdAt: string;
  durationMillis: number;
  sizeBytes: number | null;
  syncStatus: VoiceNoteSyncStatus;
  processingStatus: VoiceNoteProcessingStatus;
  storagePath: string | null;
  transcriptText: string | null;
  remoteNoteId: string | null;
  lastError: string | null;
  retryCount: number;
  updatedAt: string;
};

export type ContextSheetData = {
  site: {
    name: string;
    code: string;
  };
  additionalSheets: string;
  contextNumber: string;
  contextType: string;
  trench: string;
  planNumber: string;
  sectionNumber: string;
  coordinates: string;
  level: string;
  relationships: {
    overlainBy: string[];
    abuttedBy: string[];
    cutBy: string[];
    filledBy: string[];
    sameAs: string[];
    partOf: string[];
    consistsOf: string[];
    overlies: string[];
    butts: string[];
    cuts: string[];
    fillOf: string[];
    uncertain: string;
  };
  description: string;
  interpretationDiscussion: string;
  temporalSequence: {
    above: string[];
    current: string;
    below: string[];
  };
  finds: {
    none: boolean;
    pot: boolean;
    bone: boolean;
    flint: boolean;
    stone: boolean;
    burntStone: boolean;
    glass: boolean;
    metal: boolean;
    cbm: boolean;
    wood: boolean;
    leather: boolean;
    other: string[];
  };
  smallFinds: string;
  samples: string;
  buildingMaterials: string;
  recorder: string;
  date: string;
  initials: string;
};

export type ContextSheet = {
  id: string;
  title: string;
  templateId: string;
  templateHtml: string | null;
  data: ContextSheetData;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
};

export type ContextSheetTemplate = {
  id: string;
  name: string;
  createdAt: string;
  isDefault: boolean;
};
