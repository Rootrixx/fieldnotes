import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { syncVoiceNotesManually } from './src/lib/noteSync';
import {
  formatDuration,
  formatDate,
  formatHeaderDate,
  getPlaybackProgress,
  getSyncProgressLabel,
  isVoiceNotePendingSync,
  type SyncRunState,
} from './src/lib/voiceNoteUi';
import {
  getSupabaseClient,
  isSupabaseConfigured,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  supabase,
} from './src/lib/supabase';
import {
  deleteVoiceNote,
  initializeVoiceNotesStore,
  listVoiceNotes,
  persistVoiceNote,
  updateVoiceNote,
} from './src/lib/voiceNotes';
import { DocumentsScreen } from './src/screens/DocumentsScreen';
import { NotesScreen } from './src/screens/NotesScreen';
import type { ContextSheet, VoiceNote } from './src/types';
import { BottomTabButton } from './src/ui/BottomTabButton';
import { ContextSheetDetailSheet } from './src/ui/ContextSheetDetailSheet';
import { Icon } from './src/ui/Icon';
import { NoteDetailSheet } from './src/ui/NoteDetailSheet';
import type { AppNotice } from './src/ui/NoticeBanner';
import { RecorderSheet } from './src/ui/RecorderSheet';
import { SettingsSheet } from './src/ui/SettingsSheet';

type AppTab = 'notes' | 'records';
type RecordingPrompt = {
  id: string;
  label: string;
  helper: string;
};
type LiveSpeechStatus = 'idle' | 'listening' | 'unavailable' | 'error';
type SpeechRecognizer = {
  start: (locale: string, options?: Record<string, unknown>) => Promise<unknown>;
  stop: () => Promise<unknown>;
  cancel: () => Promise<unknown>;
  destroy: () => Promise<unknown>;
  removeAllListeners: () => void;
  isAvailable: () => Promise<boolean>;
  onSpeechEnd?: () => void;
  onSpeechError?: (event: { error?: unknown }) => void;
  onSpeechPartialResults?: (event: { value?: string[] }) => void;
  onSpeechResults?: (event: { value?: string[] }) => void;
};

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  numberOfChannels: 1,
  bitRate: 96000,
};

const RECORDING_PROMPTS: RecordingPrompt[] = [
  {
    id: 'context',
    label: 'Context number and trench',
    helper: 'Say the context, trench, plan, section, and level if you have them.',
  },
  {
    id: 'soil-color',
    label: 'Soil color',
    helper: 'Describe the color clearly, including mottling or changes across the context.',
  },
  {
    id: 'soil-composition',
    label: 'Soil composition and texture',
    helper: 'Call out inclusions, compaction, moisture, stones, clay, silt, sand, or organics.',
  },
  {
    id: 'relationships',
    label: 'Stratigraphic relationships',
    helper: 'Mention what it overlies, is cut by, fills, abuts, or is equivalent to.',
  },
  {
    id: 'finds-samples',
    label: 'Finds and samples',
    helper: 'Name finds, small finds, samples, building material, or say none observed.',
  },
  {
    id: 'interpretation',
    label: 'Interpretation',
    helper: 'Say what you think the context is and any uncertainty to revisit later.',
  },
];

const RECORDING_PROMPT_MATCHERS: Record<string, RegExp[]> = {
  context: [
    /\bcontext\b/i,
    /\btrench\b/i,
    /\bplan\b/i,
    /\bsection\b/i,
    /\blevel\b/i,
    /\bcoordinate/i,
  ],
  'soil-color': [
    /\bsoil colou?r\b/i,
    /\bcolou?r\b/i,
    /\bbrown\b/i,
    /\byellow\b/i,
    /\bred\b/i,
    /\bblack\b/i,
    /\bgr[ae]y\b/i,
    /\bmottl/i,
  ],
  'soil-composition': [
    /\bcomposition\b/i,
    /\btexture\b/i,
    /\bclay\b/i,
    /\bsilt\b/i,
    /\bsand\b/i,
    /\bgravel\b/i,
    /\bstone\b/i,
    /\bcompact/i,
    /\bloose\b/i,
    /\bmoist\b/i,
    /\borganic/i,
  ],
  relationships: [
    /\brelationship/i,
    /\boverlies\b/i,
    /\boverlain\b/i,
    /\babut/i,
    /\bcut by\b/i,
    /\bcuts\b/i,
    /\bfilled by\b/i,
    /\bfill of\b/i,
    /\bsame as\b/i,
    /\bpart of\b/i,
  ],
  'finds-samples': [
    /\bfinds?\b/i,
    /\bsamples?\b/i,
    /\bsmall finds?\b/i,
    /\bpot\b/i,
    /\bbone\b/i,
    /\bflint\b/i,
    /\bglass\b/i,
    /\bmetal\b/i,
    /\bcbm\b/i,
    /\bwood\b/i,
    /\bleather\b/i,
    /\bno finds?\b/i,
  ],
  interpretation: [
    /\binterpret/i,
    /\bprobably\b/i,
    /\bpossibly\b/i,
    /\buncertain\b/i,
    /\bdeposit\b/i,
    /\bfeature\b/i,
    /\bstructure\b/i,
    /\bmasonry\b/i,
  ],
};

const VoiceRecognizer = (() => {
  try {
    const voiceModule = require('@react-native-voice/voice');

    return (voiceModule.default ?? voiceModule) as SpeechRecognizer;
  } catch {
    return null;
  }
})();

export default function App() {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder);
  const [currentTab, setCurrentTab] = useState<AppTab>('notes');
  const [savedNotes, setSavedNotes] = useState<VoiceNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedContextSheet, setSelectedContextSheet] = useState<ContextSheet | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [queuedPlaybackId, setQueuedPlaybackId] = useState<string | null>(null);
  const [hasRecordingPermission, setHasRecordingPermission] = useState<boolean | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accountSession, setAccountSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);
  const [authAction, setAuthAction] = useState<'signin' | 'signup' | 'signout' | null>(
    null
  );
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authNotice, setAuthNotice] = useState<AppNotice | null>(null);
  const [syncNotice, setSyncNotice] = useState<AppNotice | null>(null);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [syncRunState, setSyncRunState] = useState<SyncRunState | null>(null);
  const [coveredRecordingPromptIds, setCoveredRecordingPromptIds] = useState<string[]>(
    []
  );
  const [isMissingPromptReviewOpen, setIsMissingPromptReviewOpen] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [liveSpeechStatus, setLiveSpeechStatus] = useState<LiveSpeechStatus>(
    VoiceRecognizer ? 'idle' : 'unavailable'
  );
  const [isRecorderPaused, setIsRecorderPaused] = useState(false);
  const [continuationNote, setContinuationNote] = useState<VoiceNote | null>(null);
  const pulseAnimation = useRef(new Animated.Value(0)).current;
  const shouldListenForSpeechRef = useRef(false);
  const isStartingSpeechRef = useRef(false);

  const activeNote = activeNoteId
    ? savedNotes.find((note) => note.id === activeNoteId) ?? null
    : null;
  const selectedNote = selectedNoteId
    ? savedNotes.find((note) => note.id === selectedNoteId) ?? null
    : null;

  const player = useAudioPlayer(activeNote ? { uri: activeNote.fileUri } : null, {
    keepAudioSessionActive: true,
    updateInterval: 250,
  });
  const playerStatus = useAudioPlayerStatus(player);

  const accountEmail = accountSession?.user.email ?? null;
  const pendingSyncCount = savedNotes.filter(isVoiceNotePendingSync).length;
  const isBusy = isLoading || isSaving || isSyncing || deletingNoteId !== null;
  const isAuthBusy = isAuthLoading || authAction !== null;
  const noteCountLabel =
    savedNotes.length === 1 ? '1 voice note' : `${savedNotes.length} voice notes`;
  const pendingSyncLabel =
    pendingSyncCount === 0
      ? 'Everything is synced'
      : pendingSyncCount === 1
        ? '1 note needs sync'
        : `${pendingSyncCount} notes need sync`;
  const activeSyncNote =
    savedNotes.find(
      (note) =>
        note.syncStatus === 'uploading' || note.processingStatus === 'transcribing'
    ) ?? null;
  const syncProgressLabel = getSyncProgressLabel(savedNotes, syncRunState, isSyncing);
  const playbackProgress = getPlaybackProgress(
    playerStatus.currentTime,
    playerStatus.duration
  );
  const shouldShowSyncPanel =
    isSyncing || pendingSyncCount > 0 || syncNotice?.tone === 'error';
  const errorNotice: AppNotice | null = errorMessage
    ? { tone: 'error', text: errorMessage }
    : null;
  const isRecordingSessionActive = recorderState.isRecording || isRecorderPaused;
  const missingRecordingPrompts = RECORDING_PROMPTS.filter(
    (prompt) => !coveredRecordingPromptIds.includes(prompt.id)
  );

  useEffect(() => {
    let isMounted = true;

    async function loadApp() {
      try {
        await initializeVoiceNotesStore();

        const [permission, notes] = await Promise.all([
          getRecordingPermissionsAsync(),
          listVoiceNotes(),
        ]);

        if (!isMounted) {
          return;
        }

        setHasRecordingPermission(permission.granted);
        setSavedNotes(notes);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(getErrorMessage(error, 'Could not load local notes.'));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadApp();

    return () => {
      isMounted = false;
      void setAudioModeAsync({ allowsRecording: false });
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;

    async function loadSession() {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error) {
        setAuthNotice({
          tone: 'error',
          text: getErrorMessage(error, 'Could not restore the account session.'),
        });
      }

      setAccountSession(data.session);
      setIsAuthLoading(false);
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      setAccountSession(session);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (playerStatus.didJustFinish) {
      setActiveNoteId(null);
      setQueuedPlaybackId(null);
    }
  }, [playerStatus.didJustFinish]);

  useEffect(() => {
    if (!activeNoteId || queuedPlaybackId !== activeNoteId || !playerStatus.isLoaded) {
      return;
    }

    player.play();
    setQueuedPlaybackId(null);
  }, [activeNoteId, player, playerStatus.isLoaded, queuedPlaybackId]);

  useEffect(() => {
    if (!accountEmail) {
      return;
    }

    setEmailInput(accountEmail);
  }, [accountEmail]);

  useEffect(() => {
    if (!accountSession) {
      return;
    }

    setPasswordInput('');
  }, [accountSession]);

  useEffect(() => {
    if (!isSyncing) {
      return;
    }

    let isMounted = true;

    async function pollNotes() {
      try {
        const notes = await listVoiceNotes();

        if (isMounted) {
          setSavedNotes(notes);
        }
      } catch {
        // Ignore transient refresh failures while sync is running.
      }
    }

    void pollNotes();
    const intervalId = setInterval(() => {
      void pollNotes();
    }, 900);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [isSyncing]);

  useEffect(() => {
    if (!recorderState.isRecording) {
      pulseAnimation.stopAnimation();
      pulseAnimation.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          duration: 1600,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          duration: 0,
          toValue: 0,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [pulseAnimation, recorderState.isRecording]);

  useEffect(() => {
    if (missingRecordingPrompts.length === 0) {
      setIsMissingPromptReviewOpen(false);
    }
  }, [missingRecordingPrompts.length]);

  useEffect(() => {
    return () => {
      void stopLiveSpeechRecognition();
    };
  }, []);

  async function refreshNotes() {
    const notes = await listVoiceNotes();
    setSavedNotes(notes);
  }

  function checkPromptsFromTranscript(text: string) {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return;
    }

    const matchedPromptIds = RECORDING_PROMPTS
      .filter((prompt) =>
        RECORDING_PROMPT_MATCHERS[prompt.id]?.some((matcher) =>
          matcher.test(normalizedText)
        )
      )
      .map((prompt) => prompt.id);

    if (matchedPromptIds.length === 0) {
      return;
    }

    setCoveredRecordingPromptIds((currentPromptIds) => {
      const nextPromptIds = new Set(currentPromptIds);
      matchedPromptIds.forEach((promptId) => {
        nextPromptIds.add(promptId);
      });

      return Array.from(nextPromptIds);
    });
  }

  async function startLiveSpeechRecognition() {
    if (!VoiceRecognizer) {
      setLiveSpeechStatus('unavailable');
      return;
    }

    if (isStartingSpeechRef.current) {
      return;
    }

    isStartingSpeechRef.current = true;
    shouldListenForSpeechRef.current = true;

    try {
      const isAvailable = await VoiceRecognizer.isAvailable();

      if (!isAvailable) {
        setLiveSpeechStatus('unavailable');
        return;
      }

      VoiceRecognizer.onSpeechPartialResults = (event) => {
        const text = event.value?.join(' ') ?? '';
        setLiveTranscript(text);
        checkPromptsFromTranscript(text);
      };
      VoiceRecognizer.onSpeechResults = (event) => {
        const text = event.value?.join(' ') ?? '';
        setLiveTranscript(text);
        checkPromptsFromTranscript(text);
      };
      VoiceRecognizer.onSpeechError = () => {
        if (shouldListenForSpeechRef.current) {
          setLiveSpeechStatus('error');
        }
      };
      VoiceRecognizer.onSpeechEnd = () => {
        if (!shouldListenForSpeechRef.current) {
          return;
        }

        setLiveSpeechStatus('idle');
        setTimeout(() => {
          if (shouldListenForSpeechRef.current) {
            void startLiveSpeechRecognition();
          }
        }, 650);
      };

      await VoiceRecognizer.start('en-US');
      setLiveSpeechStatus('listening');
    } catch {
      setLiveSpeechStatus('error');
    } finally {
      isStartingSpeechRef.current = false;
    }
  }

  async function stopLiveSpeechRecognition() {
    shouldListenForSpeechRef.current = false;

    if (!VoiceRecognizer) {
      return;
    }

    try {
      await VoiceRecognizer.stop();
      await VoiceRecognizer.destroy();
    } catch {
      try {
        await VoiceRecognizer.cancel();
      } catch {
        // Ignore shutdown errors from a recognizer that was never started.
      }
    } finally {
      VoiceRecognizer.removeAllListeners();
      setLiveSpeechStatus(VoiceRecognizer ? 'idle' : 'unavailable');
    }
  }

  async function handleStartRecording() {
    setErrorMessage(null);
    setSyncNotice(null);
    setCoveredRecordingPromptIds([]);
    setIsMissingPromptReviewOpen(false);
    setLiveTranscript('');
    setLiveSpeechStatus(VoiceRecognizer ? 'idle' : 'unavailable');
    setIsRecorderPaused(false);

    try {
      let granted = hasRecordingPermission;

      if (!granted) {
        const permission = await requestRecordingPermissionsAsync();
        granted = permission.granted;
        setHasRecordingPermission(permission.granted);
      }

      if (!granted) {
        setErrorMessage('Microphone access is required to record voice notes.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      void startLiveSpeechRecognition();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, 'Could not start recording on this device.')
      );
    }
  }

  async function handleStopRecording({ allowMissingPrompts = false } = {}) {
    if (!isRecordingSessionActive) {
      return;
    }

    if (!allowMissingPrompts && missingRecordingPrompts.length > 0) {
      setIsMissingPromptReviewOpen(true);
      return;
    }

    setErrorMessage(null);
    setSyncNotice(null);
    setIsSaving(true);

    try {
      await stopLiveSpeechRecognition();
      await recorder.stop();
      setIsRecorderPaused(false);

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const sourceUri = recorder.uri ?? recorderState.url;

      if (!sourceUri) {
        throw new Error('The recording finished without a local audio file.');
      }

      await persistVoiceNote({
        sourceUri,
        durationMillis: recorderState.durationMillis,
        preferredExtension: RECORDING_OPTIONS.extension,
        transcriptText: liveTranscript,
      });
      await refreshNotes();
      setCurrentTab('notes');
      setIsRecorderOpen(false);
      setCoveredRecordingPromptIds([]);
      setIsMissingPromptReviewOpen(false);
      setLiveTranscript('');
      setContinuationNote(null);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, 'Could not save the recording locally.')
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleRecordingPause() {
    if (!isRecordingSessionActive || isSaving) {
      return;
    }

    setErrorMessage(null);

    try {
      if (isRecorderPaused) {
        recorder.record();
        setIsRecorderPaused(false);
        void startLiveSpeechRecognition();
        return;
      }

      recorder.pause();
      setIsRecorderPaused(true);
      await stopLiveSpeechRecognition();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, 'Could not pause or resume this recording.')
      );
    }
  }

  function handleToggleRecordingPrompt(promptId: string) {
    setCoveredRecordingPromptIds((currentPromptIds) => {
      if (currentPromptIds.includes(promptId)) {
        return currentPromptIds.filter((currentPromptId) => currentPromptId !== promptId);
      }

      return [...currentPromptIds, promptId];
    });
  }

  async function handleSaveTranscript(note: VoiceNote, transcriptText: string) {
    if (isRecordingSessionActive || isSaving || isSyncing) {
      return;
    }

    setErrorMessage(null);

    try {
      await updateVoiceNote(note.id, {
        transcriptText: transcriptText.trim() || null,
        lastError: null,
      });
      await refreshNotes();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not save transcript edits.'));
    }
  }

  function handleContinueRecording(note: VoiceNote) {
    if (isRecordingSessionActive || isSaving || isSyncing) {
      return;
    }

    player.pause();
    setActiveNoteId(null);
    setQueuedPlaybackId(null);
    setSelectedNoteId(null);
    setContinuationNote(note);
    setCoveredRecordingPromptIds([]);
    setIsMissingPromptReviewOpen(false);
    setLiveTranscript('');
    setIsRecorderPaused(false);
    setErrorMessage(null);
    setIsRecorderOpen(true);
  }

  async function handleTogglePlayback(note: VoiceNote) {
    if (isRecordingSessionActive || isSaving || deletingNoteId === note.id) {
      return;
    }

    setErrorMessage(null);

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      if (activeNoteId === note.id) {
        if (playerStatus.playing) {
          player.pause();
        } else {
          player.play();
        }

        return;
      }

      setActiveNoteId(note.id);
      setQueuedPlaybackId(note.id);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, 'Could not play this saved note on the device.')
      );
      setActiveNoteId(null);
      setQueuedPlaybackId(null);
    }
  }

  async function handleDeleteNote(note: VoiceNote) {
    if (isRecordingSessionActive || isSaving || isSyncing) {
      return;
    }

    setErrorMessage(null);
    setDeletingNoteId(note.id);

    try {
      if (activeNoteId === note.id) {
        player.pause();
        setActiveNoteId(null);
        setQueuedPlaybackId(null);
      }

      if (selectedNoteId === note.id) {
        setSelectedNoteId(null);
      }

      await deleteVoiceNote(note);
      await refreshNotes();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, 'Could not remove this saved note from the device.')
      );
    } finally {
      setDeletingNoteId(null);
    }
  }

  async function handleSignIn() {
    const normalizedEmail = normalizeEmail(emailInput);
    const normalizedPassword = normalizePassword(passwordInput);

    setAuthNotice(null);
    setSyncNotice(null);

    if (!normalizedEmail) {
      setAuthNotice({
        tone: 'error',
        text: 'Enter a valid email address before signing in.',
      });
      return;
    }

    if (!normalizedPassword) {
      setAuthNotice({
        tone: 'error',
        text: 'Enter the account password before signing in.',
      });
      return;
    }

    if (!isSupabaseConfigured) {
      setAuthNotice({
        tone: 'error',
        text: 'Supabase auth is not configured yet. Add the project URL and anon key in mobile/.env first.',
      });
      return;
    }

    setAuthAction('signin');

    try {
      const session = await signInWithEmailPassword(
        normalizedEmail,
        normalizedPassword
      );
      setEmailInput(normalizedEmail);
      setAccountSession(session);
      setAuthNotice({
        tone: 'success',
        text: `Signed in as ${normalizedEmail}. Manual sync is now available.`,
      });
    } catch (error) {
      setAuthNotice({
        tone: 'error',
        text: getErrorMessage(error, 'Could not sign in with this email and password.'),
      });
    } finally {
      setAuthAction(null);
    }
  }

  async function handleCreateAccount() {
    const normalizedEmail = normalizeEmail(emailInput);
    const normalizedPassword = normalizePassword(passwordInput);

    setAuthNotice(null);
    setSyncNotice(null);

    if (!normalizedEmail) {
      setAuthNotice({
        tone: 'error',
        text: 'Enter a valid email address before creating an account.',
      });
      return;
    }

    if (!normalizedPassword) {
      setAuthNotice({
        tone: 'error',
        text: 'Use a password with at least 6 characters.',
      });
      return;
    }

    if (!isSupabaseConfigured) {
      setAuthNotice({
        tone: 'error',
        text: 'Supabase auth is not configured yet. Add the project URL and anon key in mobile/.env first.',
      });
      return;
    }

    setAuthAction('signup');

    try {
      const session = await signUpWithEmailPassword(
        normalizedEmail,
        normalizedPassword
      );
      setEmailInput(normalizedEmail);
      setAccountSession(session);
      setAuthNotice(
        session
          ? {
              tone: 'success',
              text: `Account created and signed in as ${normalizedEmail}.`,
            }
          : {
              tone: 'info',
              text: 'Account created, but Supabase is requiring email confirmation before sign-in. Disable Confirm email in the Email provider for a password-only dev flow.',
            }
      );
    } catch (error) {
      setAuthNotice({
        tone: 'error',
        text: getErrorMessage(error, 'Could not create this account.'),
      });
    } finally {
      setAuthAction(null);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    setAuthNotice(null);
    setSyncNotice(null);
    setAuthAction('signout');

    try {
      const { error } = await getSupabaseClient().auth.signOut();

      if (error) {
        throw error;
      }

      setAccountSession(null);
      setPasswordInput('');
      setAuthNotice({
        tone: 'info',
        text: 'Signed out. Local notes remain on this device until you sign in again.',
      });
    } catch (error) {
      setAuthNotice({
        tone: 'error',
        text: getErrorMessage(error, 'Could not sign out of this account.'),
      });
    } finally {
      setAuthAction(null);
    }
  }

  async function handleSyncPress() {
    setAuthNotice(null);
    setSyncNotice(null);

    if (savedNotes.length === 0) {
      setSyncNotice({
        tone: 'info',
        text: 'Record at least one note before syncing to the server.',
      });
      return;
    }

    if (!isSupabaseConfigured) {
      setIsSettingsOpen(true);
      setAuthNotice({
        tone: 'error',
        text: 'Supabase sync is not configured yet. Add the project URL and anon key in mobile/.env first.',
      });
      return;
    }

    if (!accountSession) {
      setIsSettingsOpen(true);
      setAuthNotice({
        tone: 'info',
        text: 'Sign in with email before syncing notes to the server.',
      });
      return;
    }

    const notesToSync = savedNotes.filter(isVoiceNotePendingSync);

    if (notesToSync.length === 0) {
      setSyncNotice({
        tone: 'info',
        text: 'Nothing to sync. All saved notes are already uploaded and transcribed.',
      });
      return;
    }

    setSyncRunState({
      noteIds: notesToSync.map((note) => note.id),
      startedAt: new Date().toISOString(),
      total: notesToSync.length,
    });
    setIsSyncing(true);

    try {
      const result = await syncVoiceNotesManually();
      await refreshNotes();
      const refreshedNotes = await listVoiceNotes();
      const firstFailedNote = refreshedNotes.find((note) => Boolean(note.lastError));

      if (result.status === 'noop') {
        setSyncNotice({
          tone: 'info',
          text: 'Nothing to sync. All saved notes are already uploaded and transcribed.',
        });
        return;
      }

      if (result.status === 'success') {
        setSyncNotice({
          tone: 'success',
          text:
            result.syncedCount === 1
              ? '1 note synced and transcribed successfully.'
              : `${result.syncedCount} notes synced and transcribed successfully.`,
        });
        return;
      }

      if (result.status === 'partial') {
        setSyncNotice({
          tone: 'info',
          text: `${result.syncedCount} notes synced successfully. ${result.failedCount} still need attention.`,
        });
        return;
      }

      setSyncNotice({
        tone: 'error',
        text:
          result.failedCount === 1
            ? `Sync failed for 1 note. ${firstFailedNote?.lastError ?? 'Review the note status and try again.'}`
            : `Sync failed for ${result.failedCount} notes. ${firstFailedNote?.lastError ?? 'Review the note statuses and try again.'}`,
      });
    } catch (error) {
      setSyncNotice({
        tone: 'error',
        text: getErrorMessage(error, 'Could not sync notes to the server.'),
      });
    } finally {
      setIsSyncing(false);
      setSyncRunState(null);
    }
  }

  const pulseScale = pulseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.75],
  });
  const pulseOpacity = pulseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0],
  });

  return (
    <SafeAreaProvider>
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <View style={styles.backgroundGlowTop} />
        <View style={styles.backgroundGlowBottom} />

        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>{formatHeaderDate(new Date())}</Text>
              <Text style={styles.appName}>FieldNotes</Text>
            </View>

            <View style={styles.headerActions}>
              {isBusy || isAuthBusy ? <ActivityIndicator color="#aa4c38" /> : null}

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setIsSettingsOpen(true);
                }}
                style={({ pressed }) => [
                  styles.accountShortcut,
                  pressed && styles.actionPressed,
                ]}
              >
                <View
                  style={[
                    styles.accountShortcutDot,
                    accountSession
                      ? styles.accountShortcutDotActive
                      : styles.accountShortcutDotIdle,
                  ]}
                />
                <Icon color="#1b1412" name="settings" size={18} />
              </Pressable>
            </View>
          </View>

          {currentTab === 'notes' ? (
            <NotesScreen
              accountConnected={Boolean(accountSession)}
              activeSyncNote={activeSyncNote}
              isAuthBusy={isAuthBusy}
              isBusy={isBusy}
              isRecording={isRecordingSessionActive}
              isSyncing={isSyncing}
              noteCountLabel={noteCountLabel}
              notes={savedNotes}
              onOpenNote={setSelectedNoteId}
              onSyncPress={() => {
                void handleSyncPress();
              }}
              pendingSyncCount={pendingSyncCount}
              pendingSyncLabel={pendingSyncLabel}
              shouldShowSyncPanel={shouldShowSyncPanel}
              syncNotice={syncNotice}
              syncProgressLabel={syncProgressLabel}
            />
          ) : (
            <DocumentsScreen
              accountConnected={Boolean(accountSession)}
              isSupabaseConfigured={isSupabaseConfigured}
              notes={savedNotes}
              onOpenContextSheet={setSelectedContextSheet}
            />
          )}

          <View style={styles.bottomDock}>
            <BottomTabButton
              icon="disc"
              isActive={currentTab === 'notes'}
              label="Notes"
              onPress={() => {
                setCurrentTab('notes');
              }}
            />

            <View style={styles.bottomDockSpacer} />

            <BottomTabButton
              icon="book-open"
              isActive={currentTab === 'records'}
              label="Documents"
              onPress={() => {
                setCurrentTab('records');
              }}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={() => {
              setErrorMessage(null);
              setContinuationNote(null);
              setCoveredRecordingPromptIds([]);
              setIsMissingPromptReviewOpen(false);
              setLiveTranscript('');
              setIsRecorderPaused(false);
              setIsRecorderOpen(true);
            }}
            style={({ pressed }) => [
              styles.recordFab,
              (pressed || isSaving) && styles.actionPressed,
            ]}
          >
            <View style={styles.recordFabInner}>
              <Icon color="#fff7ef" name="mic" size={20} />
              <Text style={styles.recordFabLabel}>Record</Text>
            </View>
          </Pressable>
        </SafeAreaView>

        <NoteDetailSheet
          deletingNoteId={deletingNoteId}
          errorNotice={errorNotice}
          isBusy={isBusy}
          isPlayerLoaded={playerStatus.isLoaded}
          isPlaying={Boolean(selectedNote && activeNoteId === selectedNote.id && playerStatus.playing)}
          isRecording={isRecordingSessionActive}
          note={selectedNote}
          onClose={() => {
            setSelectedNoteId(null);
          }}
          onContinueRecording={handleContinueRecording}
          onDelete={(note) => {
            void handleDeleteNote(note);
          }}
          onSaveTranscript={(note, transcriptText) => {
            void handleSaveTranscript(note, transcriptText);
          }}
          onTogglePlayback={(note) => {
            void handleTogglePlayback(note);
          }}
          playbackDuration={playerStatus.duration}
          playbackProgress={playbackProgress}
          playbackTime={playerStatus.currentTime}
          queuedPlaybackId={queuedPlaybackId}
        />

        <RecorderSheet
          errorNotice={errorNotice}
          hasRecordingPermission={hasRecordingPermission}
          isLoading={isLoading}
          isMissingPromptReviewOpen={isMissingPromptReviewOpen}
          isOpen={isRecorderOpen}
          isPaused={isRecorderPaused}
          isRecording={isRecordingSessionActive}
          isSaving={isSaving}
          liveSpeechStatus={liveSpeechStatus}
          liveTranscript={liveTranscript}
          missingPrompts={missingRecordingPrompts}
          onClose={() => {
            setContinuationNote(null);
            setCoveredRecordingPromptIds([]);
            setIsMissingPromptReviewOpen(false);
            setLiveTranscript('');
            setIsRecorderPaused(false);
            setIsRecorderOpen(false);
          }}
          onDismissMissingPromptReview={() => {
            setIsMissingPromptReviewOpen(false);
          }}
          onStartRecording={() => {
            void handleStartRecording();
          }}
          onStopRecording={() => {
            void handleStopRecording();
          }}
          onStopRecordingWithMissingPrompts={() => {
            void handleStopRecording({ allowMissingPrompts: true });
          }}
          onTogglePause={() => {
            void handleToggleRecordingPause();
          }}
          onTogglePrompt={handleToggleRecordingPrompt}
          pulseOpacity={pulseOpacity}
          pulseScale={pulseScale}
          prompts={RECORDING_PROMPTS}
          recordingContextLabel={
            continuationNote ? `Adding more to ${formatDate(continuationNote.createdAt)}` : null
          }
          timerLabel={formatDuration(recorderState.durationMillis)}
          coveredPromptIds={coveredRecordingPromptIds}
        />

        <SettingsSheet
          authAction={authAction}
          authNotice={authNotice}
          emailInput={emailInput}
          isSupabaseConfigured={isSupabaseConfigured}
          onClose={() => {
            setIsSettingsOpen(false);
          }}
          onCreateAccount={() => {
            void handleCreateAccount();
          }}
          onEmailChange={setEmailInput}
          onPasswordChange={setPasswordInput}
          onSignIn={() => {
            void handleSignIn();
          }}
          onSignOut={() => {
            void handleSignOut();
          }}
          passwordInput={passwordInput}
          session={accountSession}
          visible={isSettingsOpen}
        />

        <ContextSheetDetailSheet
          notice={null}
          onClose={() => {
            setSelectedContextSheet(null);
          }}
          sheet={selectedContextSheet}
        />
      </View>
    </SafeAreaProvider>
  );
}

function normalizeEmail(value: string) {
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue || !normalizedValue.includes('@')) {
    return null;
  }

  return normalizedValue;
}

function normalizePassword(value: string) {
  const normalizedValue = value.trim();

  if (normalizedValue.length < 6) {
    return null;
  }

  return normalizedValue;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4ece2',
  },
  safeArea: {
    flex: 1,
  },
  backgroundGlowTop: {
    backgroundColor: '#f0d4c4',
    borderRadius: 220,
    height: 260,
    opacity: 0.7,
    position: 'absolute',
    right: -70,
    top: -90,
    width: 260,
  },
  backgroundGlowBottom: {
    backgroundColor: '#ddd6f7',
    borderRadius: 240,
    bottom: -120,
    height: 280,
    left: -90,
    opacity: 0.42,
    position: 'absolute',
    width: 280,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  headerCopy: {
    gap: 6,
  },
  headerEyebrow: {
    color: '#8c7566',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  appName: {
    color: '#1e1512',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  accountShortcut: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 247, 239, 0.94)',
    borderColor: 'rgba(154, 126, 110, 0.18)',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 44,
  },
  accountShortcutDot: {
    borderRadius: 4,
    height: 8,
    position: 'absolute',
    right: 9,
    top: 9,
    width: 8,
  },
  accountShortcutDotActive: {
    backgroundColor: '#2c9f67',
  },
  accountShortcutDotIdle: {
    backgroundColor: '#c8b5a8',
  },
  bottomDock: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 247, 239, 0.96)',
    borderColor: 'rgba(155, 132, 118, 0.18)',
    borderRadius: 28,
    borderWidth: 1,
    bottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    position: 'absolute',
    right: 20,
  },
  bottomDockSpacer: {
    width: 104,
  },
  recordFab: {
    alignItems: 'center',
    backgroundColor: '#ab4d38',
    borderRadius: 999,
    bottom: 34,
    height: 74,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -37,
    position: 'absolute',
    width: 74,
  },
  recordFabInner: {
    alignItems: 'center',
    gap: 4,
  },
  recordFabLabel: {
    color: '#fff7ef',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  actionPressed: {
    opacity: 0.82,
  },
});
