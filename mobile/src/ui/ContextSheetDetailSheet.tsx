import { useEffect, useState } from 'react';
import type React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { renderContextSheetHtml } from '../lib/contextSheetHtml';
import type { ContextSheet } from '../types';
import { Icon } from './Icon';
import type { AppNotice } from './NoticeBanner';
import { NoticeBanner } from './NoticeBanner';

const WebViewComponent = (() => {
  try {
    return require('react-native-webview').WebView as React.ComponentType<Record<string, unknown>>;
  } catch {
    return null;
  }
})();

function joinValues(values: string[]) {
  return values.filter(Boolean).join(', ');
}

function getPdfDialogTitle(sheet: ContextSheet) {
  return `Share ${sheet.title || 'context sheet'} as PDF`;
}

function StructuredFallback({ sheet }: { sheet: ContextSheet }) {
  const relationships = [
    ['Overlain by', joinValues(sheet.data.relationships.overlainBy)],
    ['Abutted by', joinValues(sheet.data.relationships.abuttedBy)],
    ['Cut by', joinValues(sheet.data.relationships.cutBy)],
    ['Filled by', joinValues(sheet.data.relationships.filledBy)],
    ['Same as', joinValues(sheet.data.relationships.sameAs)],
    ['Part of', joinValues(sheet.data.relationships.partOf)],
    ['Consists of', joinValues(sheet.data.relationships.consistsOf)],
    ['Overlies', joinValues(sheet.data.relationships.overlies)],
    ['Butts', joinValues(sheet.data.relationships.butts)],
    ['Cuts', joinValues(sheet.data.relationships.cuts)],
    ['Fill of', joinValues(sheet.data.relationships.fillOf)],
    ['Uncertain', sheet.data.relationships.uncertain],
  ].filter(([, value]) => Boolean(value));

  const finds = [
    sheet.data.finds.none ? 'None' : null,
    sheet.data.finds.pot ? 'Pot' : null,
    sheet.data.finds.bone ? 'Bone' : null,
    sheet.data.finds.flint ? 'Flint' : null,
    sheet.data.finds.stone ? 'Stone' : null,
    sheet.data.finds.burntStone ? 'Burnt stone' : null,
    sheet.data.finds.glass ? 'Glass' : null,
    sheet.data.finds.metal ? 'Metal' : null,
    sheet.data.finds.cbm ? 'CBM' : null,
    sheet.data.finds.wood ? 'Wood' : null,
    sheet.data.finds.leather ? 'Leather' : null,
    ...sheet.data.finds.other.filter(Boolean),
  ].filter(Boolean) as string[];

  return (
    <View style={styles.fallbackWrap}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Header</Text>
        <Text style={styles.cardText}>
          Site: {[sheet.data.site.code, sheet.data.site.name].filter(Boolean).join(' ') || 'Not stated'}
        </Text>
        <Text style={styles.cardText}>
          Context number: {sheet.data.contextNumber || 'Not stated'}
        </Text>
        <Text style={styles.cardText}>Type: {sheet.data.contextType || 'Not stated'}</Text>
        <Text style={styles.cardText}>Trench: {sheet.data.trench || 'Not stated'}</Text>
        <Text style={styles.cardText}>Plan: {sheet.data.planNumber || 'Not stated'}</Text>
        <Text style={styles.cardText}>Section: {sheet.data.sectionNumber || 'Not stated'}</Text>
        <Text style={styles.cardText}>Coordinates: {sheet.data.coordinates || 'Not stated'}</Text>
        <Text style={styles.cardText}>Level: {sheet.data.level || 'Not stated'}</Text>
      </View>

      {relationships.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Relationships</Text>
          {relationships.map(([label, value]) => (
            <Text key={label} style={styles.cardText}>
              {label}: {value}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Description</Text>
        <Text style={styles.cardText}>
          {sheet.data.description || 'No description was extracted.'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Interpretation</Text>
        <Text style={styles.cardText}>
          {sheet.data.interpretationDiscussion || 'No interpretation was extracted.'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Temporal Sequence</Text>
        <Text style={styles.cardText}>
          Above: {joinValues(sheet.data.temporalSequence.above) || 'Not stated'}
        </Text>
        <Text style={styles.cardText}>
          Current: {sheet.data.temporalSequence.current || 'Not stated'}
        </Text>
        <Text style={styles.cardText}>
          Below: {joinValues(sheet.data.temporalSequence.below) || 'Not stated'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Finds</Text>
        <Text style={styles.cardText}>{finds.join(', ') || 'No finds recorded.'}</Text>
      </View>
    </View>
  );
}

export function ContextSheetDetailSheet({
  notice,
  onClose,
  sheet,
}: {
  notice: AppNotice | null;
  onClose: () => void;
  sheet: ContextSheet | null;
}) {
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [shareNotice, setShareNotice] = useState<AppNotice | null>(null);
  const renderedHtml = sheet ? renderContextSheetHtml(sheet.templateHtml, sheet.data) : null;
  const visibleNotice = shareNotice ?? notice;

  useEffect(() => {
    setShareNotice(null);
    setIsSharingPdf(false);
  }, [sheet?.id]);

  async function handleSharePdf() {
    if (!sheet || !renderedHtml || isSharingPdf) {
      return;
    }

    setShareNotice(null);
    setIsSharingPdf(true);

    try {
      const isSharingAvailable = await Sharing.isAvailableAsync();

      if (!isSharingAvailable) {
        setShareNotice({
          tone: 'error',
          text: 'PDF sharing is not available on this device.',
        });
        return;
      }

      const pdfFile = await Print.printToFileAsync({
        html: renderedHtml,
        base64: false,
      });

      await Sharing.shareAsync(pdfFile.uri, {
        dialogTitle: getPdfDialogTitle(sheet),
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      setShareNotice({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not prepare this context sheet PDF for sharing.',
      });
    } finally {
      setIsSharingPdf(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={Boolean(sheet)}>
      <SafeAreaProvider>
        <SafeAreaView edges={['top']} style={styles.screen}>
          <StatusBar style="dark" />

          {sheet ? (
            <>
              <View style={styles.header}>
                <View style={styles.titleWrap}>
                  <Text ellipsizeMode="tail" numberOfLines={2} style={styles.title}>
                    {sheet.title}
                  </Text>
                </View>

                <View style={styles.headerActions}>
                  <Pressable
                    accessibilityLabel="Share context sheet as PDF"
                    accessibilityRole="button"
                    disabled={!renderedHtml || isSharingPdf}
                    onPress={() => {
                      void handleSharePdf();
                    }}
                    style={({ pressed }) => [
                      styles.shareButton,
                      (!renderedHtml || isSharingPdf) && styles.headerButtonDisabled,
                      pressed && styles.actionPressed,
                    ]}
                  >
                    {isSharingPdf ? (
                      <ActivityIndicator color="#fff7ef" size="small" />
                    ) : (
                      <>
                        <Icon color="#fff7ef" name="share-2" size={15} />
                        <Text style={styles.shareButtonLabel}>Share PDF</Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={onClose}
                    style={({ pressed }) => [
                      styles.headerButton,
                      pressed && styles.actionPressed,
                    ]}
                  >
                    <Icon color="#2f241f" name="x" size={18} />
                  </Pressable>
                </View>
              </View>

              {WebViewComponent && renderedHtml ? (
                <View style={styles.webviewScreen}>
                  {visibleNotice ? (
                    <View style={styles.noticeWrap}>
                      <NoticeBanner notice={visibleNotice} />
                    </View>
                  ) : null}

                  <View style={styles.webviewCard}>
                    <WebViewComponent
                      bounces={false}
                      originWhitelist={['*']}
                      scalesPageToFit
                      scrollEnabled
                      setBuiltInZoomControls
                      setDisplayZoomControls={false}
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={true}
                      source={{ html: renderedHtml }}
                      style={styles.webview}
                    />
                  </View>
                </View>
              ) : (
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.content}
                  showsVerticalScrollIndicator={false}
                >
                  {visibleNotice ? <NoticeBanner notice={visibleNotice} /> : null}

                  {!WebViewComponent ? (
                    <NoticeBanner
                      notice={{
                        tone: 'info',
                        text: 'HTML preview is unavailable until react-native-webview is installed locally. Showing a structured fallback view instead.',
                      }}
                    />
                  ) : null}

                  {!renderedHtml ? (
                    <NoticeBanner
                      notice={{
                        tone: 'info',
                        text: 'This sheet does not have a stored render template. Showing structured data instead.',
                      }}
                    />
                  ) : null}

                  <StructuredFallback sheet={sheet} />
                </ScrollView>
              )}
            </>
          ) : null}
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
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  title: {
    color: '#1f1614',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
  },
  shareButton: {
    alignItems: 'center',
    backgroundColor: '#ab4d38',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  shareButtonLabel: {
    color: '#fff7ef',
    fontSize: 13,
    fontWeight: '800',
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: '#efe3d6',
    borderRadius: 16,
    height: 36,
    justifyContent: 'center',
    flexShrink: 0,
    width: 36,
  },
  headerButtonDisabled: {
    opacity: 0.45,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 16,
    paddingBottom: 36,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  webviewScreen: {
    flex: 1,
    gap: 12,
    paddingBottom: 16,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  noticeWrap: {
    paddingHorizontal: 4,
  },
  webviewCard: {
    backgroundColor: '#fffdfa',
    borderColor: 'rgba(170, 143, 126, 0.18)',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    flex: 1,
  },
  webview: {
    backgroundColor: '#fffdfa',
    flex: 1,
  },
  fallbackWrap: {
    gap: 12,
  },
  card: {
    backgroundColor: 'rgba(255, 250, 245, 0.92)',
    borderColor: 'rgba(170, 143, 126, 0.18)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  cardLabel: {
    color: '#8c7566',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardText: {
    color: '#1f1614',
    fontSize: 15,
    lineHeight: 22,
  },
  actionPressed: {
    opacity: 0.82,
  },
});
