import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import type { AppNotice } from './NoticeBanner';
import { NoticeBanner } from './NoticeBanner';
import { Icon } from './Icon';

type RecordingPrompt = {
  id: string;
  label: string;
  helper: string;
};
type LiveSpeechStatus = 'idle' | 'listening' | 'unavailable' | 'error';

export function RecorderSheet({
  coveredPromptIds,
  errorNotice,
  hasRecordingPermission,
  isLoading,
  isMissingPromptReviewOpen,
  isOpen,
  isRecording,
  isSaving,
  liveSpeechStatus,
  liveTranscript,
  missingPrompts,
  onClose,
  onDismissMissingPromptReview,
  onStartRecording,
  onStopRecording,
  onStopRecordingWithMissingPrompts,
  onTogglePrompt,
  pulseOpacity,
  pulseScale,
  prompts,
  timerLabel,
}: {
  coveredPromptIds: string[];
  errorNotice: AppNotice | null;
  hasRecordingPermission: boolean | null;
  isLoading: boolean;
  isMissingPromptReviewOpen: boolean;
  isOpen: boolean;
  isRecording: boolean;
  isSaving: boolean;
  liveSpeechStatus: LiveSpeechStatus;
  liveTranscript: string;
  missingPrompts: RecordingPrompt[];
  onClose: () => void;
  onDismissMissingPromptReview: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onStopRecordingWithMissingPrompts: () => void;
  onTogglePrompt: (promptId: string) => void;
  pulseOpacity: Animated.AnimatedInterpolation<number>;
  pulseScale: Animated.AnimatedInterpolation<number>;
  prompts: RecordingPrompt[];
  timerLabel: string;
}) {
  const coveredPromptCount = coveredPromptIds.length;
  const promptProgressLabel = `${coveredPromptCount}/${prompts.length} prompts covered`;
  const canStopRecording = !isRecording || missingPrompts.length === 0;
  const liveSpeechLabel =
    liveSpeechStatus === 'listening'
      ? 'Live speech listening'
      : liveSpeechStatus === 'unavailable'
        ? 'Live speech unavailable in this build'
        : liveSpeechStatus === 'error'
          ? 'Live speech paused'
          : 'Live speech ready';

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => {
        if (!isRecording && !isSaving) {
          onClose();
        }
      }}
      visible={isOpen}
    >
      <SafeAreaProvider>
        <SafeAreaView edges={['top']} style={styles.screen}>
          <StatusBar style="dark" />

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>New voice note</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={isRecording || isSaving}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                (pressed || isRecording || isSaving) && styles.actionPressed,
              ]}
            >
              <Icon color="#2f241f" name="x" size={18} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheet}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.body}>
              {isRecording
                ? 'Prompts can check off as you speak. You can still tap them manually.'
                : "Click record when you're ready."}
            </Text>
            <Text style={styles.timer}>{timerLabel}</Text>

            <View style={styles.actionWrap}>
              <Animated.View
                style={[
                  styles.pulse,
                  !isRecording ? styles.pulseHidden : null,
                  {
                    opacity: pulseOpacity,
                    transform: [{ scale: pulseScale }],
                  },
                ]}
              />

              <Pressable
                accessibilityRole="button"
                disabled={isLoading || isSaving}
                onPress={isRecording ? onStopRecording : onStartRecording}
                style={({ pressed }) => [
                  styles.action,
                  isRecording ? styles.actionStop : styles.actionStart,
                  (pressed || isLoading || isSaving) && styles.actionPressed,
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff7ef" />
                ) : (
                  <Icon
                    color="#fff7ef"
                    name={isRecording ? 'square' : 'mic'}
                    size={26}
                  />
                )}
              </Pressable>
            </View>

            <View style={styles.promptHeader}>
              <Text style={styles.promptTitle}>Recording prompts</Text>
              <Text style={styles.promptProgress}>{promptProgressLabel}</Text>
            </View>
            <Text style={styles.promptNote}>
              {liveSpeechStatus === 'unavailable'
                ? 'Live speech needs the custom iPhone build. Expo Go can still use manual prompt checkoff.'
                : 'Live speech listens for prompt keywords and checks off matching items.'}
            </Text>

            {isRecording ? (
              <View
                style={[
                  styles.liveSpeechPanel,
                  liveSpeechStatus === 'listening' && styles.liveSpeechPanelActive,
                ]}
              >
                <View style={styles.liveSpeechHeader}>
                  <View
                    style={[
                      styles.liveSpeechDot,
                      liveSpeechStatus === 'listening' && styles.liveSpeechDotActive,
                    ]}
                  />
                  <Text style={styles.liveSpeechLabel}>{liveSpeechLabel}</Text>
                </View>
                <Text numberOfLines={3} style={styles.liveTranscript}>
                  {liveTranscript || 'Say context details and prompt keywords out loud.'}
                </Text>
              </View>
            ) : null}

            <View style={styles.promptList}>
              {prompts.map((prompt) => {
                const isCovered = coveredPromptIds.includes(prompt.id);

                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isCovered }}
                    disabled={!isRecording || isSaving}
                    key={prompt.id}
                    onPress={() => {
                      onTogglePrompt(prompt.id);
                    }}
                    style={({ pressed }) => [
                      styles.promptRow,
                      isCovered && styles.promptRowCovered,
                      (!isRecording || isSaving) && styles.promptRowDisabled,
                      pressed && styles.actionPressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.promptCheck,
                        isCovered && styles.promptCheckCovered,
                      ]}
                    >
                      {isCovered ? <Icon color="#fff7ef" name="check" size={15} /> : null}
                    </View>

                    <View style={styles.promptCopy}>
                      <Text style={styles.promptLabel}>{prompt.label}</Text>
                      <Text style={styles.promptHelper}>{prompt.helper}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {isMissingPromptReviewOpen ? (
              <View style={styles.reviewPanel}>
                <View style={styles.reviewTitleRow}>
                  <Icon color="#8a3b2d" name="alert-circle" size={20} />
                  <Text style={styles.reviewTitle}>Are you sure you want to stop?</Text>
                </View>

                <Text style={styles.reviewBody}>
                  These prompts are still unchecked. You can keep recording, or stop
                  anyway and save the note as-is.
                </Text>

                <View style={styles.missingList}>
                  {missingPrompts.map((prompt) => (
                    <Text key={prompt.id} style={styles.missingItem}>
                      {prompt.label}
                    </Text>
                  ))}
                </View>

                <View style={styles.reviewActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={onDismissMissingPromptReview}
                    style={({ pressed }) => [
                      styles.reviewButton,
                      pressed && styles.actionPressed,
                    ]}
                  >
                    <Text style={styles.reviewButtonText}>Continue recording</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    disabled={isSaving}
                    onPress={onStopRecordingWithMissingPrompts}
                    style={({ pressed }) => [
                      styles.reviewSecondaryButton,
                      (pressed || isSaving) && styles.actionPressed,
                    ]}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#8a3b2d" />
                    ) : (
                      <Text style={styles.reviewSecondaryButtonText}>Stop anyway</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            {errorNotice ? <NoticeBanner notice={errorNotice} /> : null}

            {hasRecordingPermission === false ? (
              <Text style={styles.hint}>
                Microphone permission is required before you can record.
              </Text>
            ) : (
              <Text style={styles.hint}>
                {canStopRecording
                  ? 'This note will be saved on device and you can convert it into text when you have internet.'
                  : 'Tap prompts as you cover them. If something does not apply, you can still stop anyway from the review.'}
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8f1e8',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: {
    color: '#1f1614',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#efe3d6',
    borderRadius: 18,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  sheet: {
    alignItems: 'center',
    gap: 18,
    justifyContent: 'center',
    paddingBottom: 48,
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  body: {
    color: '#655146',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 280,
    textAlign: 'center',
  },
  timer: {
    color: '#1d1512',
    fontSize: 58,
    fontWeight: '800',
    letterSpacing: 0,
  },
  actionWrap: {
    alignItems: 'center',
    height: 180,
    justifyContent: 'center',
    width: 180,
  },
  pulse: {
    backgroundColor: '#d97a61',
    borderRadius: 999,
    height: 172,
    position: 'absolute',
    width: 172,
  },
  pulseHidden: {
    opacity: 0,
  },
  action: {
    alignItems: 'center',
    borderRadius: 999,
    height: 112,
    justifyContent: 'center',
    width: 112,
  },
  actionStart: {
    backgroundColor: '#ab4d38',
  },
  actionStop: {
    backgroundColor: '#6b2c22',
  },
  hint: {
    color: '#6f5c51',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 280,
    textAlign: 'center',
  },
  actionPressed: {
    opacity: 0.82,
  },
  promptHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    maxWidth: 420,
    width: '100%',
  },
  promptTitle: {
    color: '#1f1614',
    fontSize: 17,
    fontWeight: '800',
  },
  promptProgress: {
    color: '#8c7566',
    fontSize: 13,
    fontWeight: '700',
  },
  promptNote: {
    color: '#735f54',
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 420,
    width: '100%',
  },
  liveSpeechPanel: {
    backgroundColor: '#fff7ef',
    borderColor: 'rgba(154, 126, 110, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    maxWidth: 420,
    padding: 12,
    width: '100%',
  },
  liveSpeechPanelActive: {
    borderColor: 'rgba(63, 126, 87, 0.35)',
  },
  liveSpeechHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  liveSpeechDot: {
    backgroundColor: '#bda99c',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  liveSpeechDotActive: {
    backgroundColor: '#3f7e57',
  },
  liveSpeechLabel: {
    color: '#2d211d',
    fontSize: 13,
    fontWeight: '800',
  },
  liveTranscript: {
    color: '#6b594f',
    fontSize: 13,
    lineHeight: 18,
  },
  promptList: {
    gap: 10,
    maxWidth: 420,
    width: '100%',
  },
  promptRow: {
    alignItems: 'flex-start',
    backgroundColor: '#fff7ef',
    borderColor: 'rgba(154, 126, 110, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  promptRowCovered: {
    backgroundColor: '#f3eadf',
    borderColor: 'rgba(70, 132, 90, 0.32)',
  },
  promptRowDisabled: {
    opacity: 0.78,
  },
  promptCheck: {
    alignItems: 'center',
    borderColor: '#bba696',
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    marginTop: 1,
    width: 24,
  },
  promptCheckCovered: {
    backgroundColor: '#3f7e57',
    borderColor: '#3f7e57',
  },
  promptCopy: {
    flex: 1,
    gap: 3,
  },
  promptLabel: {
    color: '#241914',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  promptHelper: {
    color: '#6b594f',
    fontSize: 13,
    lineHeight: 18,
  },
  reviewPanel: {
    backgroundColor: '#f7ddd2',
    borderColor: 'rgba(138, 59, 45, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    maxWidth: 420,
    padding: 16,
    width: '100%',
  },
  reviewTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  reviewTitle: {
    color: '#2a1813',
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  reviewBody: {
    color: '#624338',
    fontSize: 14,
    lineHeight: 20,
  },
  missingList: {
    gap: 6,
  },
  missingItem: {
    color: '#392119',
    fontSize: 14,
    fontWeight: '700',
  },
  reviewActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  reviewButton: {
    alignItems: 'center',
    backgroundColor: '#8a3b2d',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  reviewButtonText: {
    color: '#fff7ef',
    fontSize: 14,
    fontWeight: '800',
  },
  reviewSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#fff7ef',
    borderColor: 'rgba(138, 59, 45, 0.28)',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 39,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  reviewSecondaryButtonText: {
    color: '#8a3b2d',
    fontSize: 14,
    fontWeight: '800',
  },
});
