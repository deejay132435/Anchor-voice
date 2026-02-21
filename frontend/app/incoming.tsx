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
import { analyzeAudio, generateSuggestions, AudioAnalysisResponse } from '../services/apiService';

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

  useEffect(() => {
    // Check if audio was shared from another app
    if (params.sharedUri && typeof params.sharedUri === 'string') {
      console.log('[Incoming] Shared audio received:', params.sharedUri);
      setAudioUri(params.sharedUri);
      analyzeIncomingAudio(params.sharedUri);
    }

    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [params.sharedUri]);

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

      // Call analyze-audio endpoint
      const analysis = await analyzeAudio(base64Audio, durationSeconds);
      setInsights(analysis.insights);
      setAnalysisResults(analysis);

      // Call generate-suggestions endpoint for a response phrase
      const suggestionsResult = await generateSuggestions(
        analysis,
        'incoming'
      );
      setExamplePhrasing(suggestionsResult.suggestions[0] || "I hear you. Let me take a moment before responding.");
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

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
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
            {analysisResults && (analysisResults.escalation_detected || (analysisResults.emotion?.primary_emotion !== 'calm' && analysisResults.emotion?.confidence > 0.2)) && (
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
    color: '#9b59b6',
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
