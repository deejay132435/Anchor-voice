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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { analyzeAudio, AudioAnalysisResponse } from '../services/apiService';
import { downloadVoiceMessage, markAsListened, getRecentMessages, Message } from '../services/messagingService';
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
  const [examplePhrasing, setExamplePhrasing] = useState<string>('');

  // In-app message params
  const inAppMessageId = params.messageId as string | undefined;
  const inAppPairId = params.pairId as string | undefined;
  const inAppAudioUrl = params.audioUrl as string | undefined;
  const isInAppMessage = !!(inAppMessageId && inAppPairId && inAppAudioUrl);

  // Received in-app messages
  const [receivedMessages, setReceivedMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');

  useEffect(() => {
    // Handle in-app message
    if (isInAppMessage) {
      console.log('[Incoming] In-app message received:', inAppMessageId);
      loadInAppMessage();
      return;
    }

    // Check if audio was shared from another app
    if (params.sharedUri && typeof params.sharedUri === 'string') {
      console.log('[Incoming] Shared audio received:', params.sharedUri);
      setAudioUri(params.sharedUri);
      analyzeIncomingAudio(params.sharedUri);
    }

    // Load received in-app messages
    loadReceivedMessages();

    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [params.sharedUri, inAppMessageId]);

  const loadReceivedMessages = async () => {
    try {
      setLoadingMessages(true);
      const id = await getOrCreateDeviceId();
      setDeviceId(id);
      const pair = await getPairInfo(id);
      if (!pair) return;

      const messages = await getRecentMessages(pair.pairId);
      // Filter: only received, not deleted, not yet listened by receiver
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
    // Load this message for analysis
    setAudioUri(null);
    setInsights([]);
    setExamplePhrasing('');
    setHasAnalyzed(false);

    // Use the in-app message flow
    const loadMsg = async () => {
      try {
        setIsAnalyzing(true);
        const localUri = await downloadVoiceMessage(msg.audioUrl, msg.id);
        setAudioUri(localUri);
        await analyzeIncomingAudio(localUri);

        // Mark as listened after analysis
        const pair = await getPairInfo(deviceId);
        if (pair) {
          await markAsListened(pair.pairId, msg.id, deviceId);
          // Remove from list
          setReceivedMessages((prev) => prev.filter((m) => m.id !== msg.id));
        }
      } catch (err) {
        console.log('[Incoming] Message load error:', err);
        Alert.alert('Error', 'Could not load message.');
        setIsAnalyzing(false);
      }
    };
    loadMsg();
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

  const loadInAppMessage = async () => {
    if (!inAppAudioUrl || !inAppMessageId) return;
    try {
      setIsAnalyzing(true);
      const localUri = await downloadVoiceMessage(inAppAudioUrl, inAppMessageId);
      setAudioUri(localUri);
      await analyzeIncomingAudio(localUri);
    } catch (err) {
      console.log('[Incoming] Download error:', err);
      Alert.alert('Error', 'Could not download message.');
      setIsAnalyzing(false);
    }
  };

  const pickAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setAudioUri(asset.uri);
        
        // DO NOT auto-play - analyze first
        await analyzeIncomingAudio(asset.uri);
      }
    } catch (error) {
      console.error('Error picking audio file:', error);
      Alert.alert('Error', 'Failed to select audio file.');
    }
  };

  const analyzeIncomingAudio = async (uri: string) => {
    setIsAnalyzing(true);
    setHasAnalyzed(false);

    try {
      // Ensure we have a readable file URI (content:// URIs may not be directly readable)
      let readableUri = uri;
      if (uri.startsWith('content://')) {
        const cachedPath = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + 'incoming_audio_' + Date.now();
        await FileSystem.copyAsync({ from: uri, to: cachedPath });
        readableUri = cachedPath;
      }

      // Read audio file as base64
      const base64Audio = await FileSystem.readAsStringAsync(readableUri, {
        encoding: 'base64',
      });

      // Get actual audio duration
      let durationSeconds = 1;
      try {
        const { sound: tempSound } = await Audio.Sound.createAsync({ uri: readableUri });
        const status = await tempSound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          durationSeconds = Math.max(1, Math.round(status.durationMillis / 1000));
        }
        await tempSound.unloadAsync();
      } catch (e) {
        console.warn('Could not determine audio duration, using fallback:', e);
      }

      // Single call: analyze audio AND generate suggestions together (faster)
      const analysis = await analyzeAudio(base64Audio, durationSeconds, 'incoming');
      setInsights(analysis.insights);
      setAnalysisResults(analysis);
      setExamplePhrasing(analysis.suggestions?.[0] || "I hear you. Let me take a moment before responding.");
      setHasAnalyzed(true);
    } catch (error) {
      console.error('Error analyzing audio:', error);
      Alert.alert('Analysis Error', 'Could not analyze audio. Check your connection and try again.');
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

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
          // Mark in-app messages as listened when playback finishes
          if (isInAppMessage && inAppPairId && inAppMessageId) {
            try {
              const myDeviceId = await getOrCreateDeviceId();
              await markAsListened(inAppPairId, inAppMessageId, myDeviceId);
            } catch (err) {
              console.log('[Incoming] Mark as listened error:', err);
            }
          }
        }
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
      Alert.alert('Error', 'Failed to play audio.');
    }
  };

  const handleWait = () => {
    // Clear state and go back
    setAudioUri(null);
    setInsights([]);
    setExamplePhrasing('');
    setHasAnalyzed(false);
    router.back();
  };

  const handleRecordResponse = () => {
    // Navigate to outgoing screen with incoming context
    router.push({
      pathname: '/outgoing',
      params: {
        incomingInsights: JSON.stringify(insights),
        incomingPhrasing: examplePhrasing,
        ...(isInAppMessage ? { sendMode: 'inapp' } : {}),
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Instructions */}
        {!audioUri && (
          <View style={styles.instructionsSection}>
            <Text style={styles.groundingText}>You{"'"}re in control.</Text>
            <Text style={styles.instructionText}>
              Select a voice message to prepare yourself before listening.
            </Text>
          </View>
        )}

        {/* Received In-App Messages */}
        {!audioUri && receivedMessages.length > 0 && (
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
                  <Text style={styles.receivedCardLabel}>Voice message from partner</Text>
                  <Text style={styles.receivedCardMeta}>
                    {Math.floor(msg.audioDurationSeconds / 60)}:{Math.round(msg.audioDurationSeconds % 60).toString().padStart(2, '0')} · {formatTime(msg.timestamp)}
                  </Text>
                  <View style={styles.receivedBadges}>
                    <View style={[styles.receivedBadge, { backgroundColor: msg.analysisSummary.severity_level === 'high' ? '#e74c3c30' : msg.analysisSummary.severity_level === 'medium' ? '#f39c1230' : '#27ae6030' }]}>
                      <Text style={[styles.receivedBadgeText, { color: msg.analysisSummary.severity_level === 'high' ? '#e74c3c' : msg.analysisSummary.severity_level === 'medium' ? '#f39c12' : '#27ae60' }]}>
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

        {/* Select Audio Button */}
        {!audioUri && (
          <TouchableOpacity
            style={styles.selectButton}
            onPress={pickAudioFile}
            activeOpacity={0.8}
          >
            <Ionicons name="folder-open" size={24} color="#fff" />
            <Text style={styles.selectButtonText}>Select Voice Message</Text>
          </TouchableOpacity>
        )}

        {/* Analysis Loading */}
        {isAnalyzing && (
          <View style={styles.analysisSection}>
            <ActivityIndicator size="large" color="#9b59b6" />
            <Text style={styles.analyzingText}>Analyzing...</Text>
          </View>
        )}

        {/* Analysis Results - What to Expect */}
        {hasAnalyzed && !isAnalyzing && (
          <View style={styles.resultsContainer}>
            {/* What to Expect */}
            <View style={styles.expectSection}>
              <Text style={styles.expectTitle}>What to expect:</Text>
              {insights.map((insight, index) => (
                <View key={index} style={styles.insightRow}>
                  <View style={styles.insightDot} />
                  <Text style={styles.insightText}>{insight}</Text>
                </View>
              ))}
            </View>

            {/* Key Detections */}
            {analysisResults && (analysisResults.escalation_detected || (analysisResults.emotion?.primary_emotion !== 'calm' && analysisResults.emotion?.confidence > 0.2)) && (() => {
              const isPositive = ['excited', 'affectionate', 'grateful'].includes(analysisResults.emotion?.primary_emotion || '');
              return (
              <View style={[styles.detectionsBox, isPositive && styles.detectionsBoxPositive]}>
                <Text style={[styles.detectionsTitle, isPositive && styles.detectionsTitlePositive]}>Key Detections</Text>

                {/* Emotion */}
                {analysisResults.emotion && analysisResults.emotion.primary_emotion !== 'calm' && analysisResults.emotion.confidence > 0.2 && (
                  <View style={styles.detectionRow}>
                    <Text style={styles.detectionLabel}>Tone:</Text>
                    <View style={[styles.detectionBadge, isPositive && styles.badgePositive]}>
                      <Text style={styles.detectionBadgeText}>
                        {analysisResults.emotion.primary_emotion}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Severity */}
                {analysisResults.severity_level !== 'low' && analysisResults.severity_level !== 'none' && (
                  <View style={styles.detectionRow}>
                    <Text style={styles.detectionLabel}>Severity:</Text>
                    <View style={[
                      styles.detectionBadge,
                      analysisResults.severity_level === 'high' ? styles.badgeHigh : styles.badgeMedium
                    ]}>
                      <Text style={styles.detectionBadgeText}>
                        {analysisResults.severity_level}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Detection categories with counts — no actual words shown */}
                {analysisResults.escalation_words && Object.keys(analysisResults.escalation_words).length > 0 && (
                  <View style={styles.flaggedSection}>
                    <Text style={styles.detectionLabel}>Detected:</Text>
                    {Object.entries(analysisResults.escalation_words).map(([label, count]) => (
                      <View key={label} style={styles.flaggedRow}>
                        <View style={[styles.flaggedBullet, isPositive && styles.flaggedBulletPositive]} />
                        <Text style={styles.flaggedCategory}>
                          {label}
                        </Text>
                        <Text style={styles.flaggedWords}>
                          ({count as number} {(count as number) === 1 ? 'instance' : 'instances'})
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              );
            })()}

            {/* Example Phrasing */}
            <View style={styles.phrasingSection}>
              <Text style={styles.phrasingTitle}>If you need to respond:</Text>
              <View style={styles.phrasingCard}>
                <Text style={styles.phrasingText}>{examplePhrasing}</Text>
              </View>
            </View>

            {/* User Choices */}
            <View style={styles.choicesContainer}>
              <TouchableOpacity
                style={[styles.choiceButton, styles.listenButton]}
                onPress={playAudio}
                activeOpacity={0.8}
              >
                <Ionicons name={isPlaying ? "pause" : "play"} size={20} color="#fff" />
                <Text style={styles.choiceButtonText}>
                  {isPlaying ? 'Pause' : 'Listen now'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.choiceButton, styles.waitButton]}
                onPress={handleWait}
                activeOpacity={0.8}
              >
                <Text style={styles.choiceButtonText}>Wait</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.choiceButton, styles.recordButton]}
                onPress={handleRecordResponse}
                activeOpacity={0.8}
              >
                <Ionicons name="mic" size={20} color="#fff" />
                <Text style={styles.choiceButtonText}>Record a response</Text>
              </TouchableOpacity>
            </View>

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
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9b59b6',
    padding: 18,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  selectButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
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
  resultsContainer: {
    marginTop: 16,
    gap: 20,
  },
  expectSection: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 3,
    borderLeftColor: '#9b59b6',
  },
  expectTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  insightDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9b59b6',
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    color: '#d0d0d0',
  },
  phrasingSection: {
    gap: 12,
  },
  phrasingTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#a0a0b0',
  },
  phrasingCard: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  phrasingText: {
    fontSize: 15,
    color: '#e0e0e0',
    lineHeight: 22,
  },
  choicesContainer: {
    gap: 12,
    marginTop: 8,
  },
  choiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  listenButton: {
    backgroundColor: '#9b59b6',
  },
  waitButton: {
    backgroundColor: '#6c3483',
  },
  recordButton: {
    backgroundColor: '#27ae60',
  },
  choiceButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  disclaimerBox: {
    backgroundColor: '#1a0a1f',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#808080',
    lineHeight: 16,
    textAlign: 'center',
  },
  detectionsBox: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
  },
  detectionsBoxPositive: {
    borderLeftColor: '#27ae60',
  },
  detectionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e74c3c',
    marginBottom: 12,
  },
  detectionsTitlePositive: {
    color: '#27ae60',
  },
  detectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  detectionLabel: {
    fontSize: 12,
    color: '#a0a0b0',
    fontWeight: '500',
  },
  detectionBadge: {
    backgroundColor: '#e67e22',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  detectionBadgeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  badgeHigh: {
    backgroundColor: '#e74c3c',
  },
  badgeMedium: {
    backgroundColor: '#e67e22',
  },
  badgePositive: {
    backgroundColor: '#27ae60',
  },
  flaggedSection: {
    marginTop: 8,
    gap: 6,
  },
  flaggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  flaggedBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e74c3c',
  },
  flaggedBulletPositive: {
    backgroundColor: '#27ae60',
  },
  flaggedCategory: {
    fontSize: 13,
    color: '#e0e0e0',
    fontWeight: '500',
  },
  flaggedWords: {
    fontSize: 12,
    color: '#a0a0b0',
  },
  receivedSection: {
    marginBottom: 20,
  },
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
  receivedCardContent: {
    flex: 1,
    gap: 3,
  },
  receivedCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  receivedCardMeta: {
    fontSize: 12,
    color: '#888',
  },
  receivedBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  receivedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  receivedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
