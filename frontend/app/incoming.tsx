import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
// Screen capture protection can be enabled for production:
// import * as ScreenCapture from 'expo-screen-capture';
import { analyzeAudio, AudioAnalysisResponse } from '../services/apiService';
import { downloadVoiceMessage, markAsListened, getRecentMessages, deleteCachedMessage, Message } from '../services/messagingService';
import { getOrCreateDeviceId } from '../services/deviceService';
import { getPairInfo } from '../services/pairingService';

export default function IncomingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [insights, setInsights] = useState<string[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AudioAnalysisResponse | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // In-app message params
  const inAppMessageId = params.messageId as string | undefined;
  const inAppPairId = params.pairId as string | undefined;
  const inAppAudioUrl = params.audioUrl as string | undefined;
  const inAppSender = params.sender as string | undefined;
  const inAppEncrypted = params.encrypted === 'true';
  const isInAppMessage = !!(inAppMessageId && inAppPairId && inAppAudioUrl);

  // Received messages
  const [receivedMessages, setReceivedMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [currentPairId, setCurrentPairId] = useState<string | null>(null);
  const [hasListened, setHasListened] = useState(false);

  // TODO: Enable for production — prevents screenshots/screen recording
  // useEffect(() => {
  //   ScreenCapture.preventScreenCaptureAsync();
  //   return () => { ScreenCapture.allowScreenCaptureAsync(); };
  // }, []);

  useEffect(() => {
    if (isInAppMessage) {
      loadInAppMessage();
      return;
    }

    if (params.sharedUri && typeof params.sharedUri === 'string') {
      setAudioUri(params.sharedUri);
      analyzeIncomingAudio(params.sharedUri);
    }

    loadReceivedMessages();

    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [params.sharedUri, inAppMessageId]);

  const loadReceivedMessages = async () => {
    try {
      setLoadingMessages(true);
      const id = await getOrCreateDeviceId();
      setDeviceId(id);
      const pair = await getPairInfo(id);
      if (!pair) return;

      setCurrentPairId(pair.pairId);
      const messages = await getRecentMessages(pair.pairId);
      const unlistened = messages.filter(
        (m) => m.sender !== id && !m.deleted && !m.listenedByReceiver
      );
      setReceivedMessages(unlistened);
    } catch (err) {
      console.log('[Incoming] Load messages error:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const openReceivedMessage = (msg: Message) => {
    setAudioUri(null);
    setInsights([]);
    setSuggestions([]);
    setHasAnalyzed(false);
    setHasListened(false);
    setCurrentMessageId(msg.id);

    const loadMsg = async () => {
      try {
        setIsAnalyzing(true);
        const localUri = await downloadVoiceMessage(msg.audioUrl, msg.id, msg.sender, currentPairId || undefined, msg.encrypted);
        setAudioUri(localUri);
        // Analysis is best-effort — playback works even if it fails
        try {
          await analyzeIncomingAudio(localUri);
        } catch (err) {
          console.log('[Incoming] Analysis error (non-fatal):', err);
          setIsAnalyzing(false);
        }
      } catch (err) {
        console.log('[Incoming] Message download error:', err);
        Alert.alert('Download Error', `Could not download message: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setIsAnalyzing(false);
      }
    };
    loadMsg();
  };

  const loadInAppMessage = async () => {
    if (!inAppAudioUrl || !inAppMessageId) return;
    setCurrentMessageId(inAppMessageId);
    setCurrentPairId(inAppPairId || null);
    try {
      setIsAnalyzing(true);
      const localUri = await downloadVoiceMessage(inAppAudioUrl, inAppMessageId, inAppSender, inAppPairId, inAppEncrypted);
      setAudioUri(localUri);
      try {
        await analyzeIncomingAudio(localUri);
      } catch (err) {
        console.log('[Incoming] Analysis error (non-fatal):', err);
        setIsAnalyzing(false);
      }
    } catch (err) {
      console.log('[Incoming] Download error:', err);
      Alert.alert('Download Error', `Could not download message: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsAnalyzing(false);
    }
  };

  const analyzeIncomingAudio = async (uri: string) => {
    setIsAnalyzing(true);
    setHasAnalyzed(false);

    try {
      let readableUri = uri;
      if (uri.startsWith('content://')) {
        const cachedPath = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + 'incoming_audio_' + Date.now();
        await FileSystem.copyAsync({ from: uri, to: cachedPath });
        readableUri = cachedPath;
      }

      const base64Audio = await FileSystem.readAsStringAsync(readableUri, { encoding: 'base64' });

      let durationSeconds = 1;
      try {
        const { sound: tempSound } = await Audio.Sound.createAsync({ uri: readableUri });
        const status = await tempSound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          durationSeconds = Math.max(1, Math.round(status.durationMillis / 1000));
        }
        await tempSound.unloadAsync();
      } catch {}

      const analysis = await analyzeAudio(base64Audio, durationSeconds, 'incoming');
      setInsights(analysis.insights);
      setAnalysisResults(analysis);
      setSuggestions(analysis.suggestions || []);
      setHasAnalyzed(true);
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert('Analysis Error', 'Could not analyze audio. Check your connection.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const playAudio = async () => {
    if (!audioUri) return;

    try {
      if (isPlaying && sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true }
      );
      setSound(newSound);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
          setHasListened(true);

          // Mark as listened + auto-delete trigger
          const msgId = currentMessageId || inAppMessageId;
          const pId = currentPairId || inAppPairId;
          if (msgId && pId) {
            try {
              const myDeviceId = deviceId || await getOrCreateDeviceId();
              await markAsListened(pId, msgId, myDeviceId);
              // Delete local cached file immediately after listening
              await deleteCachedMessage(msgId);
              // Remove from received list
              setReceivedMessages((prev) => prev.filter((m) => m.id !== msgId));
            } catch (err) {
              console.log('[Incoming] Mark as listened error:', err);
            }
          }
        }
      });
    } catch (error) {
      console.error('Playback error:', error);
      setIsPlaying(false);
      Alert.alert('Error', 'Failed to play audio.');
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  const handleRecordResponse = () => {
    router.push({
      pathname: '/outgoing',
      params: {
        incomingInsights: JSON.stringify(insights),
        incomingPhrasing: suggestions[0] || "I hear you. Let me take a moment before responding.",
      }
    });
  };

  const handleNewMessage = () => {
    setAudioUri(null);
    setInsights([]);
    setSuggestions([]);
    setAnalysisResults(null);
    setHasAnalyzed(false);
    setHasListened(false);
    setCurrentMessageId(null);
    loadReceivedMessages();
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isPositiveEmotion = (emotion: string) =>
    ['calm', 'excited', 'affectionate', 'grateful', 'apologetic', 'supportive'].includes(emotion);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Instructions */}
        {!audioUri && !isAnalyzing && (
          <View style={styles.instructionsSection}>
            <Text style={styles.groundingText}>You{"'"}re in control.</Text>
            <Text style={styles.instructionText}>
              See the analysis before you listen. Take your time.
            </Text>
          </View>
        )}

        {/* Loading messages */}
        {!audioUri && !isAnalyzing && loadingMessages && (
          <View style={styles.analysisSection}>
            <ActivityIndicator size="large" color="#9b59b6" />
            <Text style={styles.analyzingText}>Checking for messages...</Text>
          </View>
        )}

        {/* Received Messages */}
        {!audioUri && !isAnalyzing && !loadingMessages && receivedMessages.length > 0 && (
          <View style={styles.receivedSection}>
            <Text style={styles.receivedTitle}>
              <Ionicons name="mail-unread" size={16} color="#f1c40f" /> New from Partner
            </Text>
            {receivedMessages.map((msg) => (
              <TouchableOpacity
                key={msg.id}
                style={styles.receivedCard}
                onPress={() => openReceivedMessage(msg)}
                activeOpacity={0.8}
              >
                <View style={styles.receivedCardLeft}>
                  <Ionicons name="volume-medium" size={22} color="#9b59b6" />
                </View>
                <View style={styles.receivedCardContent}>
                  <Text style={styles.receivedCardLabel}>Voice message</Text>
                  <Text style={styles.receivedCardMeta}>
                    {Math.floor(msg.audioDurationSeconds / 60)}:{Math.round(msg.audioDurationSeconds % 60).toString().padStart(2, '0')} · {formatTime(msg.timestamp)}
                  </Text>
                  <View style={styles.receivedBadges}>
                    <View style={[styles.receivedBadge, {
                      backgroundColor: msg.analysisSummary.severity_level === 'high' ? '#e74c3c30'
                        : msg.analysisSummary.severity_level === 'medium' ? '#f39c1230' : '#27ae6030'
                    }]}>
                      <Text style={[styles.receivedBadgeText, {
                        color: msg.analysisSummary.severity_level === 'high' ? '#e74c3c'
                          : msg.analysisSummary.severity_level === 'medium' ? '#f39c12' : '#27ae60'
                      }]}>
                        {msg.analysisSummary.severity_level}
                      </Text>
                    </View>
                    <View style={[styles.receivedBadge, { backgroundColor: '#9b59b630' }]}>
                      <Text style={[styles.receivedBadgeText, { color: '#9b59b6' }]}>
                        {msg.analysisSummary.primary_emotion}
                      </Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#666" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Empty state — no messages */}
        {!audioUri && !isAnalyzing && !loadingMessages && receivedMessages.length === 0 && !isInAppMessage && (
          <View style={styles.emptyState}>
            <Ionicons name="mail-open-outline" size={48} color="#666" />
            <Text style={styles.emptyStateTitle}>No new messages</Text>
            <Text style={styles.emptyStateText}>
              When your partner sends a voice message, it will appear here.
            </Text>
            <TouchableOpacity
              style={[styles.choiceButton, styles.listenButton, { marginTop: 20, alignSelf: 'stretch' }]}
              onPress={loadReceivedMessages}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.choiceButtonText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceButton, styles.waitButton, { alignSelf: 'stretch' }]}
              onPress={handleGoBack}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
              <Text style={styles.choiceButtonText}>Go back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading — but still show play button if audio is ready */}
        {isAnalyzing && (
          <View style={styles.analysisSection}>
            <ActivityIndicator size="large" color="#9b59b6" />
            <Text style={styles.analyzingText}>Preparing analysis...</Text>
            <Text style={styles.analyzingSubtext}>You{"'"}ll see the analysis before hearing the message</Text>
            {audioUri && (
              <TouchableOpacity
                style={[styles.choiceButton, styles.listenButton, { marginTop: 20 }]}
                onPress={playAudio}
                activeOpacity={0.8}
              >
                <Ionicons name={isPlaying ? "pause" : "play"} size={20} color="#fff" />
                <Text style={styles.choiceButtonText}>
                  {isPlaying ? 'Pause' : 'Listen now'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Audio ready but analysis failed — still let user listen */}
        {audioUri && !isAnalyzing && !hasAnalyzed && (
          <View style={styles.resultsContainer}>
            <View style={styles.expectSection}>
              <Text style={styles.expectTitle}>Message ready</Text>
              <Text style={styles.insightText}>Analysis unavailable — you can still listen.</Text>
            </View>
            <View style={styles.choicesContainer}>
              <TouchableOpacity
                style={[styles.choiceButton, styles.listenButton]}
                onPress={playAudio}
                activeOpacity={0.8}
              >
                <Ionicons name={isPlaying ? "pause" : "play"} size={20} color="#fff" />
                <Text style={styles.choiceButtonText}>
                  {isPlaying ? 'Pause' : hasListened ? 'Listen again' : 'Listen now'}
                </Text>
              </TouchableOpacity>

              {hasListened && (
                <TouchableOpacity
                  style={[styles.choiceButton, styles.respondButton]}
                  onPress={handleRecordResponse}
                  activeOpacity={0.8}
                >
                  <Ionicons name="mic" size={20} color="#fff" />
                  <Text style={styles.choiceButtonText}>Prepare a response</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.choiceButton, styles.waitButton]}
                onPress={handleGoBack}
                activeOpacity={0.8}
              >
                <Text style={styles.choiceButtonText}>
                  {hasListened ? 'Done' : 'Not now'}
                </Text>
              </TouchableOpacity>

              {hasListened && (
                <TouchableOpacity style={styles.newMessageLink} onPress={handleNewMessage}>
                  <Text style={styles.newMessageLinkText}>Open another message</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Analysis Results */}
        {hasAnalyzed && !isAnalyzing && (
          <View style={styles.resultsContainer}>
            {/* What to Expect */}
            <View style={styles.expectSection}>
              <Text style={styles.expectTitle}>What to expect:</Text>
              {insights.map((insight, i) => (
                <View key={i} style={styles.insightRow}>
                  <View style={[
                    styles.insightDot,
                    isPositiveEmotion(analysisResults?.emotion?.primary_emotion || '') && styles.insightDotPositive,
                  ]} />
                  <Text style={styles.insightText}>{insight}</Text>
                </View>
              ))}
            </View>

            {/* Key Detections */}
            {analysisResults && analysisResults.emotion?.primary_emotion !== 'calm' && analysisResults.emotion?.confidence > 0.2 && (() => {
              const positive = isPositiveEmotion(analysisResults.emotion?.primary_emotion || '');
              return (
                <View style={[styles.detectionsBox, positive && styles.detectionsBoxPositive]}>
                  <Text style={[styles.detectionsTitle, positive && styles.detectionsTitlePositive]}>
                    {positive ? 'Tone' : 'Key Detections'}
                  </Text>
                  <View style={styles.detectionRow}>
                    <Text style={styles.detectionLabel}>Tone:</Text>
                    <View style={[styles.detectionBadge, positive && styles.badgePositive]}>
                      <Text style={styles.detectionBadgeText}>
                        {analysisResults.emotion.primary_emotion}
                      </Text>
                    </View>
                  </View>
                  {analysisResults.severity_level !== 'low' && analysisResults.severity_level !== 'none' && (
                    <View style={styles.detectionRow}>
                      <Text style={styles.detectionLabel}>Severity:</Text>
                      <View style={[
                        styles.detectionBadge,
                        analysisResults.severity_level === 'high' ? styles.badgeHigh : styles.badgeMedium
                      ]}>
                        <Text style={styles.detectionBadgeText}>{analysisResults.severity_level}</Text>
                      </View>
                    </View>
                  )}
                  {analysisResults.escalation_words && Object.keys(analysisResults.escalation_words).length > 0 && (
                    <View style={styles.flaggedSection}>
                      {Object.entries(analysisResults.escalation_words).map(([label, count]) => (
                        <View key={label} style={styles.flaggedRow}>
                          <View style={[styles.flaggedBullet, positive && styles.flaggedBulletPositive]} />
                          <Text style={styles.flaggedCategory}>{label}</Text>
                          <Text style={styles.flaggedCount}>
                            ({count as number} {(count as number) === 1 ? 'instance' : 'instances'})
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Suggested Responses */}
            {suggestions.length > 0 && (
              <View style={styles.suggestionsSection}>
                <Text style={styles.suggestionsTitle}>If you need to respond:</Text>
                {suggestions.map((suggestion, i) => (
                  <View key={i} style={styles.suggestionCard}>
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.choicesContainer}>
              <TouchableOpacity
                style={[styles.choiceButton, styles.listenButton]}
                onPress={playAudio}
                activeOpacity={0.8}
              >
                <Ionicons name={isPlaying ? "pause" : "play"} size={20} color="#fff" />
                <Text style={styles.choiceButtonText}>
                  {isPlaying ? 'Pause' : hasListened ? 'Listen again' : 'Listen now'}
                </Text>
              </TouchableOpacity>

              {hasListened && (
                <TouchableOpacity
                  style={[styles.choiceButton, styles.respondButton]}
                  onPress={handleRecordResponse}
                  activeOpacity={0.8}
                >
                  <Ionicons name="mic" size={20} color="#fff" />
                  <Text style={styles.choiceButtonText}>Prepare a response</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.choiceButton, styles.waitButton]}
                onPress={handleGoBack}
                activeOpacity={0.8}
              >
                <Text style={styles.choiceButtonText}>
                  {hasListened ? 'Done' : 'Not now'}
                </Text>
              </TouchableOpacity>

              {hasListened && (
                <TouchableOpacity
                  style={styles.newMessageLink}
                  onPress={handleNewMessage}
                >
                  <Text style={styles.newMessageLinkText}>Open another message</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Self-delete notice */}
            {hasListened && currentMessageId && (
              <View style={styles.deleteNotice}>
                <Ionicons name="shield-checkmark" size={14} color="#27ae60" />
                <Text style={styles.deleteNoticeText}>
                  Message will self-delete once both you and your partner have listened.
                </Text>
              </View>
            )}

            {/* Disclaimer */}
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>
                Coaching only. Not therapy or legal advice. If you feel unsafe, step away and seek help.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
  },
  instructionsSection: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 32,
  },
  groundingText: {
    fontSize: 18,
    color: '#f1c40f',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 14,
    color: '#a0a0b0',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Received messages
  receivedSection: { marginBottom: 20 },
  receivedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1c40f',
    marginBottom: 12,
  },
  receivedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a0a2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#9b59b630',
  },
  receivedCardLeft: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#9b59b620',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  receivedCardContent: { flex: 1, gap: 3 },
  receivedCardLabel: { fontSize: 14, fontWeight: '600', color: '#fff' },
  receivedCardMeta: { fontSize: 12, color: '#888' },
  receivedBadges: { flexDirection: 'row', gap: 6, marginTop: 4 },
  receivedBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  receivedBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  // Empty state
  emptyState: {
    alignItems: 'center',
    padding: 32,
    marginTop: 16,
    gap: 12,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Analysis
  analysisSection: {
    alignItems: 'center',
    padding: 32,
    marginTop: 48,
  },
  analyzingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9b59b6',
    fontWeight: '500',
  },
  analyzingSubtext: {
    marginTop: 8,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  // Results
  resultsContainer: { marginTop: 16, gap: 16 },
  expectSection: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 3,
    borderLeftColor: '#9b59b6',
  },
  expectTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  insightRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  insightDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9b59b6' },
  insightDotPositive: { backgroundColor: '#27ae60' },
  insightText: { flex: 1, fontSize: 14, color: '#d0d0d0' },
  // Detections
  detectionsBox: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
  },
  detectionsBoxPositive: { borderLeftColor: '#27ae60' },
  detectionsTitle: { fontSize: 14, fontWeight: '600', color: '#e74c3c', marginBottom: 12 },
  detectionsTitlePositive: { color: '#27ae60' },
  detectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  detectionLabel: { fontSize: 12, color: '#a0a0b0', fontWeight: '500' },
  detectionBadge: { backgroundColor: '#e67e22', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  detectionBadgeText: { fontSize: 12, color: '#fff', fontWeight: '600', textTransform: 'capitalize' },
  badgeHigh: { backgroundColor: '#e74c3c' },
  badgeMedium: { backgroundColor: '#e67e22' },
  badgePositive: { backgroundColor: '#27ae60' },
  flaggedSection: { marginTop: 8, gap: 6 },
  flaggedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  flaggedBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e74c3c' },
  flaggedBulletPositive: { backgroundColor: '#27ae60' },
  flaggedCategory: { fontSize: 13, color: '#e0e0e0', fontWeight: '500' },
  flaggedCount: { fontSize: 12, color: '#a0a0b0' },
  // Suggestions
  suggestionsSection: { gap: 10 },
  suggestionsTitle: { fontSize: 14, fontWeight: '500', color: '#a0a0b0' },
  suggestionCard: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  suggestionText: { fontSize: 15, color: '#e0e0e0', lineHeight: 22 },
  // Choices
  choicesContainer: { gap: 12, marginTop: 8 },
  choiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  listenButton: { backgroundColor: '#9b59b6' },
  respondButton: { backgroundColor: '#27ae60' },
  waitButton: { backgroundColor: '#6c3483' },
  choiceButtonText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  newMessageLink: { alignItems: 'center', paddingVertical: 8 },
  newMessageLinkText: { fontSize: 14, color: '#9b59b6' },
  // Delete notice
  deleteNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0a1f0a',
    borderRadius: 8,
    padding: 12,
  },
  deleteNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#27ae60',
    lineHeight: 17,
  },
  // Disclaimer
  disclaimerBox: {
    backgroundColor: '#1a0a1f',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#808080',
    lineHeight: 16,
    textAlign: 'center',
  },
});
