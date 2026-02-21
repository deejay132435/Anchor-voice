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
import * as Sharing from 'expo-sharing';
import { analyzeAudio, generateSuggestions, AudioAnalysisResponse } from '../services/apiService';

export default function OutgoingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<AudioAnalysisResponse | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // Incoming context (from received message)
  const [incomingInsights, setIncomingInsights] = useState<string[]>([]);
  const [incomingPhrasing, setIncomingPhrasing] = useState<string>('');
  const [showIncomingContext, setShowIncomingContext] = useState(true);

  useEffect(() => {
    // Check if we have incoming context from a received message
    if (params.incomingInsights && params.incomingPhrasing) {
      try {
        const insights = JSON.parse(params.incomingInsights as string);
        setIncomingInsights(insights);
        setIncomingPhrasing(params.incomingPhrasing as string);
        setShowIncomingContext(true);
      } catch (error) {
        console.error('Error parsing incoming context:', error);
      }
    }
  }, [params]);

  useEffect(() => {
    // Request permissions on mount
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Microphone access is needed to record voice messages.'
        );
      }
    })();

    return () => {
      // Cleanup on unmount - clear suggestions when navigating away
      setSuggestions([]);
      setShowSuggestions(false);
      
      if (recording) {
        recording.stopAndUnloadAsync();
      }
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      // Reset previous recording
      setRecordedUri(null);
      setAnalysisResults(null);
      setSuggestions([]);
      setShowSuggestions(false);

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

      // Update duration every second
      const interval = setInterval(async () => {
        if (newRecording) {
          const status = await newRecording.getStatusAsync();
          if (status.isRecording) {
            setRecordingDuration(Math.floor(status.durationMillis / 1000));
          }
        }
      }, 1000);

      // Store interval ID for cleanup
      (newRecording as any).durationInterval = interval;
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      
      // Clear duration interval
      if ((recording as any).durationInterval) {
        clearInterval((recording as any).durationInterval);
      }

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedUri(uri);
      setRecording(null);

      // Automatically trigger audio analysis + suggestions
      if (uri) {
        setIsLoadingSuggestions(true);

        try {
          // Read audio file and convert to base64
          const base64Audio = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64',
          });

          // Get actual audio duration from file
          let actualDuration = recordingDuration || 1;
          try {
            const { sound: tempSound } = await Audio.Sound.createAsync({ uri });
            const status = await tempSound.getStatusAsync();
            if (status.isLoaded && status.durationMillis) {
              actualDuration = Math.max(1, Math.round(status.durationMillis / 1000));
            }
            await tempSound.unloadAsync();
          } catch (e) {
            console.warn('Could not get exact duration, using recorded duration:', e);
          }

          // Call analyze-audio endpoint with accurate duration
          const analysis = await analyzeAudio(base64Audio, actualDuration);
          setAnalysisResults(analysis);

          // Call generate-suggestions endpoint
          const suggestionsResult = await generateSuggestions(
            analysis,
            'outgoing'
          );
          setSuggestions(suggestionsResult.suggestions);
          setShowSuggestions(true);

        } catch (error) {
          console.error('Error analyzing audio:', error);
          setSuggestions(["I'm getting heated. I need to pause before this goes any further."]);
          setShowSuggestions(true);
        } finally {
          setIsLoadingSuggestions(false);
        }
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      setIsLoadingSuggestions(false);
      Alert.alert('Error', 'Failed to stop recording.');
    }
  };


  const playRecording = async () => {
    if (!recordedUri) return;

    try {
      if (isPlaying && sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
        return;
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: recordedUri },
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
      console.error('Error playing recording:', error);
      Alert.alert('Error', 'Failed to play recording.');
    }
  };


  const shareRecording = async () => {
    if (!recordedUri) return;

    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Error', 'Sharing is not available on this device.');
        return;
      }

      await Sharing.shareAsync(recordedUri);
      
      // Clear suggestions after successful send
      setSuggestions([]);
      setShowSuggestions(false);
      
      // After sharing, navigate back and clean up
      setTimeout(() => {
        router.back();
      }, 1000);
    } catch (error) {
      console.error('Error sharing recording:', error);
      Alert.alert('Error', 'Failed to share recording.');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Incoming Context Card (when responding to a received message) */}
        {incomingInsights.length > 0 && showIncomingContext && (
          <View style={styles.incomingContextCard}>
            <View style={styles.incomingHeader}>
              <Ionicons name="chatbubble-ellipses" size={16} color="#9b59b6" />
              <Text style={styles.incomingHeaderText}>Responding to received message</Text>
              <TouchableOpacity onPress={() => setShowIncomingContext(false)}>
                <Ionicons name="close-circle" size={20} color="#a0a0b0" />
              </TouchableOpacity>
            </View>
            <View style={styles.incomingContent}>
              <Text style={styles.incomingLabel}>What to expect:</Text>
              {incomingInsights.map((insight, index) => (
                <Text key={index} style={styles.incomingInsight}>• {insight}</Text>
              ))}
              <Text style={styles.incomingLabel}>If you need to respond:</Text>
              <Text style={styles.incomingPhrasing}>{incomingPhrasing}</Text>
            </View>
          </View>
        )}

        {/* Recording Section */}
        <View style={styles.recordingSection}>
          {/* Grounding Line */}
          {!isRecording && !recordedUri && (
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
            style={[
              styles.recordButton,
              isRecording && styles.recordButtonActive,
            ]}
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isRecording ? 'stop' : 'mic'}
              size={48}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

        {/* Playback Section */}
        {recordedUri && !isRecording && (
          <View style={styles.playbackSection}>
            <TouchableOpacity
              style={styles.playButton}
              onPress={playRecording}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={32}
                color="#4a90e2"
              />
              <Text style={styles.playButtonText}>
                {isPlaying ? 'Pause' : 'Play Recording'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Analysis Results */}
        {analysisResults && (
          <View style={styles.insightsSection}>
            <View style={styles.insightsHeader}>
              <Text style={styles.insightsTitle}>Insights</Text>
              <TouchableOpacity
                onPress={() => Alert.alert(
                  'About Insights',
                  'These insights analyze your message tone, pacing, and emotional indicators to help you communicate more effectively.'
                )}
              >
                <Ionicons name="information-circle-outline" size={22} color="#9b59b6" />
              </TouchableOpacity>
            </View>
            {analysisResults.insights.map((insight, index) => (
              <View key={index} style={styles.insightItem}>
                <Ionicons name="radio-button-on" size={16} color="#9b59b6" />
                <Text style={styles.insightText}>{insight}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Suggestions Section - Always visible once loaded, even during re-recording */}
        {isLoadingSuggestions && (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="large" color="#9b59b6" />
            <Text style={styles.loadingText}>Analyzing...</Text>
          </View>
        )}

        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            {isRecording && (
              <View style={styles.recordingBanner}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingBannerText}>
                  Recording - Read these aloud if helpful
                </Text>
              </View>
            )}
            
            {/* What we noticed */}
            <View style={styles.insightsBox}>
              <Text style={styles.insightsBoxTitle}>What we noticed:</Text>
              {analysisResults?.insights.map((insight, index) => (
                <View key={index} style={styles.insightRow}>
                  <View style={styles.insightDot} />
                  <Text style={styles.insightTextSmall}>{insight}</Text>
                </View>
              ))}
            </View>

            {/* Key Detections - shows flagged phrases and emotion */}
            {analysisResults && (analysisResults.escalation_detected || analysisResults.emotion?.primary_emotion !== 'calm') && (
              <View style={styles.detectionsBox}>
                <Text style={styles.detectionsTitle}>Key Detections</Text>

                {/* Emotion */}
                {analysisResults.emotion && analysisResults.emotion.primary_emotion !== 'calm' && analysisResults.emotion.confidence > 0.2 && (
                  <View style={styles.detectionRow}>
                    <Text style={styles.detectionLabel}>Tone:</Text>
                    <View style={styles.detectionBadge}>
                      <Text style={styles.detectionBadgeText}>
                        {analysisResults.emotion.primary_emotion}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Severity */}
                {analysisResults.severity_level !== 'low' && (
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
                        <View style={styles.flaggedBullet} />
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
            )}

            {/* Example Phrasing - Single focused option */}
            <View style={styles.rewritesSection}>
              <Text style={styles.rewritesTitle}>Try saying:</Text>
              {suggestions.map((suggestion, index) => (
                <View key={index} style={styles.rewriteCard}>
                  <Text style={styles.rewriteText}>{suggestion}</Text>
                </View>
              ))}
            </View>

            {/* Disclaimer */}
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>
                Coaching only. Not therapy or legal advice. If you feel unsafe, step away and seek help.
              </Text>
            </View>
          </View>
        )}

        {/* Action Buttons - Only Re-record and Send Anyway */}
        {recordedUri && !isRecording && !isLoadingSuggestions && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rerecordButton]}
              onPress={() => {
                setRecordedUri(null);
                setAnalysisResults(null);
                // DO NOT clear suggestions - keep them visible for reference during re-record
              }}
            >
              <Text style={styles.actionButtonText}>Re-record</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.sendButton]}
              onPress={shareRecording}
            >
              <Ionicons name="share" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Send Anyway</Text>
            </TouchableOpacity>
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
  recordingSection: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 32,
  },
  groundingText: {
    fontSize: 18,
    color: '#9b59b6',
    fontWeight: '500',
    marginBottom: 32,
    textAlign: 'center',
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
  playbackSection: {
    marginBottom: 24,
    alignItems: 'center',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a0a1f',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  playButtonText: {
    fontSize: 16,
    color: '#9b59b6',
    fontWeight: '600',
  },
  analysisSection: {
    alignItems: 'center',
    padding: 32,
  },
  analyzingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#a0a0b0',
  },
  insightsSection: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  insightsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  insightsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  insightText: {
    flex: 1,
    fontSize: 15,
    color: '#e0e0e0',
  },
  suggestionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6c3483',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  suggestionsButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  suggestionsSection: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  suggestionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  suggestionItem: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  suggestionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#9b59b6',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '600',
    fontSize: 14,
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    color: '#e0e0e0',
    lineHeight: 22,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 6,
  },
  rerecordButton: {
    backgroundColor: '#6c3483',
  },
  sendButton: {
    backgroundColor: '#27ae60',
  },
  actionButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
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
  suggestionsContainer: {
    marginTop: 16,
    gap: 16,
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
  insightTextSmall: {
    flex: 1,
    fontSize: 13,
    color: '#d0d0d0',
  },
  rewritesSection: {
    gap: 12,
  },
  rewritesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  rewriteCard: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  rewriteText: {
    fontSize: 15,
    color: '#e0e0e0',
    lineHeight: 22,
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
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e74c3c',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 10,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  recordingBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  incomingContextCard: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#9b59b6',
  },
  incomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  incomingHeaderText: {
    flex: 1,
    fontSize: 12,
    color: '#9b59b6',
    fontWeight: '600',
  },
  incomingContent: {
    gap: 6,
  },
  incomingLabel: {
    fontSize: 11,
    color: '#a0a0b0',
    fontWeight: '500',
    marginTop: 6,
  },
  incomingInsight: {
    fontSize: 12,
    color: '#d0d0d0',
    lineHeight: 18,
  },
  incomingPhrasing: {
    fontSize: 13,
    color: '#e0e0e0',
    lineHeight: 19,
    fontStyle: 'italic',
  },
  detectionsBox: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
  },
  detectionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e74c3c',
    marginBottom: 12,
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
  flaggedCategory: {
    fontSize: 13,
    color: '#e0e0e0',
    fontWeight: '500',
  },
  flaggedWords: {
    fontSize: 12,
    color: '#a0a0b0',
  },
});
