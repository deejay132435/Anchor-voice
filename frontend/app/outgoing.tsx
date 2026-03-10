import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { analyzeAudio, AudioAnalysisResponse, fixGrammar, generateTts } from '../services/apiService';
import { getOrCreateDeviceId } from '../services/deviceService';
import { getPairInfo } from '../services/pairingService';
import { sendVoiceMessage } from '../services/messagingService';

type Mode = 'choose' | 'record' | 'tts';

export default function OutgoingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Mode selection
  const [mode, setMode] = useState<Mode>('choose');

  // Recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // TTS state
  const [ttsText, setTtsText] = useState('');
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const [isFixingGrammar, setIsFixingGrammar] = useState(false);
  const [ttsAudioUri, setTtsAudioUri] = useState<string | null>(null);
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);

  // Playback
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Analysis
  const [analysisResults, setAnalysisResults] = useState<AudioAnalysisResponse | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  // Pairing
  const [isPaired, setIsPaired] = useState(false);
  const [pairId, setPairId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [isSendingToPartner, setIsSendingToPartner] = useState(false);

  // Incoming context
  const [incomingInsights, setIncomingInsights] = useState<string[]>([]);
  const [incomingPhrasing, setIncomingPhrasing] = useState<string>('');
  const [showIncomingContext, setShowIncomingContext] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed to record voice messages.');
      }
      try {
        const id = await getOrCreateDeviceId();
        setDeviceId(id);
        const pair = await getPairInfo(id);
        setIsPaired(!!pair);
        setPairId(pair?.pairId || null);
      } catch (err) {
        console.log('[Outgoing] Init error:', err);
      }
    };
    init();

    return () => {
      if (recording) recording.stopAndUnloadAsync();
      if (sound) sound.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (params.incomingInsights && params.incomingPhrasing) {
      try {
        setIncomingInsights(JSON.parse(params.incomingInsights as string));
        setIncomingPhrasing(params.incomingPhrasing as string);
        setShowIncomingContext(true);
      } catch {}
    }
  }, [params]);

  // Get the active audio URI (recorded or TTS)
  const activeAudioUri = recordedUri || ttsAudioUri;

  // ---- Recording ----
  const startRecording = async () => {
    try {
      setRecordedUri(null);
      setAnalysisResults(null);
      setSuggestions([]);
      setHasAnalyzed(false);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);

      const interval = setInterval(async () => {
        if (newRecording) {
          const status = await newRecording.getStatusAsync();
          if (status.isRecording) {
            setRecordingDuration(Math.floor(status.durationMillis / 1000));
          }
        }
      }, 1000);
      (newRecording as any).durationInterval = interval;
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      setIsRecording(false);
      if ((recording as any).durationInterval) {
        clearInterval((recording as any).durationInterval);
      }
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedUri(uri);
      setRecording(null);

      if (uri) {
        await analyzeAudioFile(uri);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      setIsAnalyzing(false);
    }
  };

  // ---- TTS ----
  const handleFixGrammar = async () => {
    if (!ttsText.trim()) return;
    setIsFixingGrammar(true);
    try {
      const result = await fixGrammar(ttsText.trim());
      if (result.changed) {
        setCorrectedText(result.corrected);
      } else {
        setCorrectedText(null);
        Alert.alert('Looks good', 'No grammar corrections needed.');
      }
    } catch (err) {
      console.error('Grammar fix error:', err);
      Alert.alert('Error', 'Could not check grammar. Try again.');
    } finally {
      setIsFixingGrammar(false);
    }
  };

  const acceptCorrection = () => {
    if (correctedText) {
      setTtsText(correctedText);
      setCorrectedText(null);
    }
  };

  const generateTtsAudio = async () => {
    if (!ttsText.trim()) return;
    setIsGeneratingTts(true);
    try {
      const ttsPath = await generateTts(ttsText.trim());
      setTtsAudioUri(ttsPath);

      // Analyze the generated audio
      await analyzeAudioFile(ttsPath);
    } catch (err: any) {
      console.error('TTS error:', err);
      Alert.alert('Error', err.message || 'Failed to generate voice.');
    } finally {
      setIsGeneratingTts(false);
    }
  };

  // ---- Shared analysis ----
  const analyzeAudioFile = async (uri: string) => {
    setIsAnalyzing(true);
    setHasAnalyzed(false);
    try {
      const base64Audio = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

      let actualDuration = recordingDuration || 1;
      try {
        const { sound: tempSound } = await Audio.Sound.createAsync({ uri });
        const status = await tempSound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          actualDuration = Math.max(1, Math.round(status.durationMillis / 1000));
        }
        await tempSound.unloadAsync();
      } catch {}

      const analysis = await analyzeAudio(base64Audio, actualDuration, 'outgoing');
      setAnalysisResults(analysis);
      setSuggestions(analysis.suggestions || []);
      setHasAnalyzed(true);
    } catch (error) {
      console.error('Analysis error:', error);
      setSuggestions(["Take a breath. You've got this."]);
      setHasAnalyzed(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ---- Playback ----
  const playAudio = async () => {
    if (!activeAudioUri) return;
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
        { uri: activeAudioUri },
        { shouldPlay: true }
      );
      setSound(newSound);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });
    } catch (error) {
      console.error('Playback error:', error);
      Alert.alert('Error', 'Failed to play audio.');
    }
  };

  // ---- Send ----
  const sendToPartner = async () => {
    if (!activeAudioUri || !pairId || !deviceId) return;
    setIsSendingToPartner(true);
    try {
      let duration = recordingDuration || 3;
      try {
        const { sound: tempSound } = await Audio.Sound.createAsync({ uri: activeAudioUri });
        const status = await tempSound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          duration = Math.max(1, Math.round(status.durationMillis / 1000));
        }
        await tempSound.unloadAsync();
      } catch {}

      const summary = {
        severity_level: analysisResults?.severity_level || 'low',
        primary_emotion: analysisResults?.emotion?.primary_emotion || 'calm',
        insights: analysisResults?.insights || [],
      };

      await sendVoiceMessage(pairId, deviceId, activeAudioUri, duration, summary);
      Alert.alert('Sent', 'Voice message sent to your partner.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.log('[Outgoing] Send error:', err?.message || err);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setIsSendingToPartner(false);
    }
  };

  const shareRecording = async () => {
    if (!activeAudioUri) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Error', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(activeAudioUri);
      setTimeout(() => router.back(), 1000);
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const resetAll = () => {
    setRecordedUri(null);
    setTtsAudioUri(null);
    setAnalysisResults(null);
    setSuggestions([]);
    setHasAnalyzed(false);
    setTtsText('');
    setCorrectedText(null);
    setMode('choose');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isPositiveEmotion = (emotion: string) =>
    ['calm', 'excited', 'affectionate', 'grateful', 'apologetic', 'supportive'].includes(emotion);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Incoming Context Card */}
        {incomingInsights.length > 0 && showIncomingContext && (
          <View style={styles.contextCard}>
            <View style={styles.contextHeader}>
              <Ionicons name="chatbubble-ellipses" size={16} color="#9b59b6" />
              <Text style={styles.contextHeaderText}>Responding to received message</Text>
              <TouchableOpacity onPress={() => setShowIncomingContext(false)}>
                <Ionicons name="close-circle" size={20} color="#a0a0b0" />
              </TouchableOpacity>
            </View>
            <View style={styles.contextContent}>
              <Text style={styles.contextLabel}>What to expect:</Text>
              {incomingInsights.map((insight, i) => (
                <Text key={i} style={styles.contextInsight}>- {insight}</Text>
              ))}
              <Text style={styles.contextLabel}>Suggested phrasing:</Text>
              <Text style={styles.contextPhrasing}>{incomingPhrasing}</Text>
            </View>
          </View>
        )}

        {/* Mode Selection */}
        {mode === 'choose' && !activeAudioUri && (
          <View style={styles.chooseSection}>
            <Text style={styles.groundingText}>Take your time.</Text>
            <Text style={styles.chooseSubtext}>How would you like to prepare your message?</Text>

            <TouchableOpacity
              style={[styles.modeButton, styles.recordModeButton]}
              onPress={() => setMode('record')}
              activeOpacity={0.8}
            >
              <Ionicons name="mic" size={32} color="#fff" />
              <Text style={styles.modeButtonTitle}>Record Voice</Text>
              <Text style={styles.modeButtonDesc}>Speak naturally, get analysis and suggestions</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeButton, styles.ttsModeButton]}
              onPress={() => setMode('tts')}
              activeOpacity={0.8}
            >
              <Ionicons name="text" size={32} color="#f1c40f" />
              <Text style={styles.modeButtonTitle}>Type Message</Text>
              <Text style={styles.modeButtonDesc}>Type it out, fix grammar, convert to voice</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Record Mode */}
        {mode === 'record' && !activeAudioUri && (
          <View style={styles.recordSection}>
            {!isRecording && (
              <Text style={styles.groundingText}>Take your time.</Text>
            )}

            {isRecording && (
              <View style={styles.recordingIndicator}>
                <View style={styles.pulseCircle} />
                <Text style={styles.recordingText}>Recording...</Text>
                <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordButtonActive]}
              onPress={isRecording ? stopRecording : startRecording}
              activeOpacity={0.8}
            >
              <Ionicons name={isRecording ? 'stop' : 'mic'} size={48} color="#fff" />
            </TouchableOpacity>

            {!isRecording && (
              <TouchableOpacity onPress={() => setMode('choose')} style={styles.backLink}>
                <Text style={styles.backLinkText}>Back to options</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* TTS Mode */}
        {mode === 'tts' && !ttsAudioUri && (
          <View style={styles.ttsSection}>
            <Text style={styles.ttsLabel}>Type your message</Text>
            <TextInput
              style={styles.ttsInput}
              value={ttsText}
              onChangeText={(text) => {
                setTtsText(text);
                setCorrectedText(null);
              }}
              placeholder="What do you want to say?"
              placeholderTextColor="#666"
              multiline
              maxLength={500}
              autoFocus
            />
            <Text style={styles.charCount}>{ttsText.length}/500</Text>

            {/* Grammar correction result */}
            {correctedText && (
              <View style={styles.correctionCard}>
                <Text style={styles.correctionLabel}>Suggested correction:</Text>
                <Text style={styles.correctionText}>{correctedText}</Text>
                <View style={styles.correctionActions}>
                  <TouchableOpacity style={styles.acceptButton} onPress={acceptCorrection}>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.acceptButtonText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.keepButton} onPress={() => setCorrectedText(null)}>
                    <Text style={styles.keepButtonText}>Keep Original</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* TTS Action Buttons */}
            <View style={styles.ttsActions}>
              <TouchableOpacity
                style={[styles.ttsActionButton, styles.grammarButton]}
                onPress={handleFixGrammar}
                disabled={!ttsText.trim() || isFixingGrammar}
              >
                {isFixingGrammar ? (
                  <ActivityIndicator color="#f1c40f" size="small" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={18} color="#f1c40f" />
                    <Text style={styles.grammarButtonText}>Fix Grammar</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ttsActionButton, styles.generateButton, (!ttsText.trim() || isGeneratingTts) && styles.disabledButton]}
                onPress={generateTtsAudio}
                disabled={!ttsText.trim() || isGeneratingTts}
              >
                {isGeneratingTts ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="volume-high" size={18} color="#fff" />
                    <Text style={styles.generateButtonText}>Generate Voice</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => setMode('choose')} style={styles.backLink}>
              <Text style={styles.backLinkText}>Back to options</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Analysis Loading */}
        {isAnalyzing && (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="large" color="#9b59b6" />
            <Text style={styles.loadingText}>Analyzing your message...</Text>
          </View>
        )}

        {/* Analysis Results + Actions (shown after analysis) */}
        {hasAnalyzed && !isAnalyzing && activeAudioUri && (
          <View style={styles.resultsContainer}>
            {/* Listen First */}
            <View style={styles.listenFirstCard}>
              <TouchableOpacity
                style={[styles.listenButton, isPlaying && styles.listenButtonActive]}
                onPress={playAudio}
                activeOpacity={0.8}
              >
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color="#fff" />
                <Text style={styles.listenButtonText}>
                  {isPlaying ? 'Pause' : 'Listen to your message'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Insights */}
            {analysisResults && (
              <View style={styles.insightsBox}>
                <Text style={styles.insightsBoxTitle}>What we noticed:</Text>
                {analysisResults.insights.map((insight, i) => (
                  <View key={i} style={styles.insightRow}>
                    <View style={[
                      styles.insightDot,
                      isPositiveEmotion(analysisResults.emotion?.primary_emotion || '') && styles.insightDotPositive,
                    ]} />
                    <Text style={styles.insightText}>{insight}</Text>
                  </View>
                ))}
              </View>
            )}

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

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <View style={styles.suggestionsSection}>
                <Text style={styles.suggestionsTitle}>
                  {isPositiveEmotion(analysisResults?.emotion?.primary_emotion || '')
                    ? 'Try saying:'
                    : 'Try saying instead:'}
                </Text>
                {suggestions.map((suggestion, i) => (
                  <View key={i} style={styles.suggestionCard}>
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              {isPaired && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.sendButton]}
                  onPress={sendToPartner}
                  disabled={isSendingToPartner}
                >
                  {isSendingToPartner ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="send" size={20} color="#fff" />
                      <Text style={styles.actionButtonText}>Send to Partner</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionButton, styles.shareActionButton]}
                onPress={shareRecording}
              >
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Send via...</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.rerecordButton]}
                onPress={resetAll}
              >
                <Ionicons name="refresh" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Start Over</Text>
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
  // Context card
  contextCard: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#9b59b6',
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  contextHeaderText: {
    flex: 1,
    fontSize: 12,
    color: '#9b59b6',
    fontWeight: '600',
  },
  contextContent: { gap: 6 },
  contextLabel: { fontSize: 11, color: '#a0a0b0', fontWeight: '500', marginTop: 6 },
  contextInsight: { fontSize: 12, color: '#d0d0d0', lineHeight: 18 },
  contextPhrasing: { fontSize: 13, color: '#e0e0e0', lineHeight: 19, fontStyle: 'italic' },
  // Choose mode
  chooseSection: {
    alignItems: 'center',
    marginTop: 24,
    gap: 16,
  },
  groundingText: {
    fontSize: 18,
    color: '#f1c40f',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 8,
  },
  chooseSubtext: {
    fontSize: 14,
    color: '#a0a0b0',
    textAlign: 'center',
    marginBottom: 8,
  },
  modeButton: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  recordModeButton: {
    backgroundColor: '#9b59b6',
  },
  ttsModeButton: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1.5,
    borderColor: '#f1c40f50',
  },
  modeButtonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  modeButtonDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  // Record mode
  recordSection: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 32,
  },
  recordingIndicator: {
    alignItems: 'center',
    marginBottom: 24,
  },
  pulseCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#e74c3c',
    marginBottom: 8,
  },
  recordingText: {
    fontSize: 18,
    color: '#e74c3c',
    fontWeight: '600',
  },
  durationText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '700',
    marginTop: 4,
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#9b59b6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonActive: {
    backgroundColor: '#e74c3c',
  },
  backLink: {
    marginTop: 20,
  },
  backLinkText: {
    fontSize: 14,
    color: '#9b59b6',
  },
  // TTS mode
  ttsSection: {
    marginTop: 16,
    gap: 12,
  },
  ttsLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  ttsInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    paddingTop: 16,
    fontSize: 16,
    color: '#fff',
    minHeight: 120,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#333',
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: '#666',
    textAlign: 'right',
  },
  correctionCard: {
    backgroundColor: '#0a1f0a',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#27ae60',
    gap: 10,
  },
  correctionLabel: {
    fontSize: 12,
    color: '#27ae60',
    fontWeight: '600',
  },
  correctionText: {
    fontSize: 15,
    color: '#e0e0e0',
    lineHeight: 22,
  },
  correctionActions: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#27ae60',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  keepButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#666',
  },
  keepButtonText: {
    color: '#a0a0b0',
    fontSize: 14,
  },
  ttsActions: {
    flexDirection: 'row',
    gap: 10,
  },
  ttsActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  grammarButton: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#f1c40f50',
  },
  grammarButtonText: {
    color: '#f1c40f',
    fontWeight: '600',
    fontSize: 14,
  },
  generateButton: {
    backgroundColor: '#9b59b6',
  },
  generateButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.5,
  },
  // Loading
  loadingSection: {
    alignItems: 'center',
    padding: 32,
    marginTop: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#9b59b6',
    fontWeight: '500',
  },
  // Results
  resultsContainer: {
    marginTop: 16,
    gap: 16,
  },
  listenFirstCard: {
    marginBottom: 4,
  },
  listenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a0a2e',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  listenButtonActive: {
    backgroundColor: '#6c3483',
  },
  listenButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  insightsBox: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#9b59b6',
  },
  insightsBoxTitle: {
    fontSize: 14,
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
  insightDotPositive: {
    backgroundColor: '#27ae60',
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    color: '#d0d0d0',
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
  badgeHigh: { backgroundColor: '#e74c3c' },
  badgeMedium: { backgroundColor: '#e67e22' },
  badgePositive: { backgroundColor: '#27ae60' },
  flaggedSection: { marginTop: 8, gap: 6 },
  flaggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  flaggedBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e74c3c',
  },
  flaggedBulletPositive: { backgroundColor: '#27ae60' },
  flaggedCategory: { fontSize: 13, color: '#e0e0e0', fontWeight: '500' },
  flaggedCount: { fontSize: 12, color: '#a0a0b0' },
  // Suggestions
  suggestionsSection: { gap: 10 },
  suggestionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  suggestionCard: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  suggestionText: {
    fontSize: 15,
    color: '#e0e0e0',
    lineHeight: 22,
  },
  // Actions
  actionButtons: {
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  sendButton: { backgroundColor: '#9b59b6' },
  shareActionButton: { backgroundColor: '#27ae60' },
  rerecordButton: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#333',
  },
  actionButtonText: {
    fontSize: 14,
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
});
