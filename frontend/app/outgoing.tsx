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
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { analyzeAudio, generateSuggestions, AudioAnalysisResponse } from '../services/apiService';

export default function OutgoingScreen() {
  const router = useRouter();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<AudioAnalysisResponse | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

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
      // Cleanup on unmount
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

      // Automatically analyze after recording
      if (uri) {
        await analyzeRecording(uri);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      Alert.alert('Error', 'Failed to stop recording.');
    }
  };

  const analyzeRecording = async (uri: string) => {
    setIsAnalyzing(true);
    try {
      // Read audio file and convert to base64
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // Get file info for duration
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const durationSeconds = recordingDuration || 1; // Use recorded duration or default to 1

      // Call analysis API
      const results = await analyzeAudio(base64Audio, durationSeconds);
      setAnalysisResults(results);
    } catch (error) {
      console.error('Error analyzing audio:', error);
      Alert.alert('Error', 'Failed to analyze audio. You can still send the message.');
    } finally {
      setIsAnalyzing(false);
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

  const loadSuggestions = async () => {
    if (!analysisResults) return;

    setIsLoadingSuggestions(true);
    try {
      const response = await generateSuggestions(analysisResults, 'outgoing');
      setSuggestions(response.suggestions);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error loading suggestions:', error);
      // Use default suggestions as fallback
      setSuggestions([
        "I need some space right now. We can talk later.",
        "I'm not continuing this while it's heated.",
        "I want this to stay calm, so I'm stepping away."
      ]);
      setShowSuggestions(true);
      Alert.alert('Note', 'Using default suggestions. Please check your connection.');
    } finally {
      setIsLoadingSuggestions(false);
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
        {/* Recording Section */}
        <View style={styles.recordingSection}>
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

          <Text style={styles.recordHint}>
            {isRecording
              ? 'Tap to stop recording'
              : recordedUri
              ? 'Tap to record again'
              : 'Tap to start recording'}
          </Text>
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
        {isAnalyzing && (
          <View style={styles.analysisSection}>
            <ActivityIndicator size="large" color="#4a90e2" />
            <Text style={styles.analyzingText}>Analyzing message...</Text>
          </View>
        )}

        {analysisResults && !isAnalyzing && (
          <View style={styles.insightsSection}>
            <Text style={styles.insightsTitle}>Message Insights</Text>
            {analysisResults.insights.map((insight, index) => (
              <View key={index} style={styles.insightItem}>
                <Ionicons name="information-circle" size={20} color="#f39c12" />
                <Text style={styles.insightText}>{insight}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Suggestions Section */}
        {analysisResults && !showSuggestions && (
          <TouchableOpacity
            style={styles.suggestionsButton}
            onPress={loadSuggestions}
            disabled={isLoadingSuggestions}
          >
            {isLoadingSuggestions ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="bulb" size={20} color="#fff" />
                <Text style={styles.suggestionsButtonText}>Get Suggestions</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionsSection}>
            <Text style={styles.suggestionsTitle}>Alternative Approaches</Text>
            {suggestions.map((suggestion, index) => (
              <View key={index} style={styles.suggestionItem}>
                <Text style={styles.suggestionNumber}>{index + 1}</Text>
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Action Buttons */}
        {recordedUri && !isRecording && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rerecordButton]}
              onPress={() => {
                setRecordedUri(null);
                setAnalysisResults(null);
                setSuggestions([]);
                setShowSuggestions(false);
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
  recordHint: {
    marginTop: 16,
    fontSize: 14,
    color: '#a0a0b0',
    textAlign: 'center',
  },
  playbackSection: {
    marginBottom: 24,
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
  insightsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
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
    gap: 8,
  },
  rerecordButton: {
    backgroundColor: '#6c3483',
  },
  sendButton: {
    backgroundColor: '#27ae60',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
