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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { analyzeAudio, generateSuggestions, AudioAnalysisResponse } from '../services/apiService';

export default function IncomingScreen() {
  const router = useRouter();
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<AudioAnalysisResponse | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [preparationCue, setPreparationCue] = useState<string>('');

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  const pickAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setAudioUri(asset.uri);
        
        // Automatically analyze the audio
        await analyzeIncomingAudio(asset.uri);
      }
    } catch (error) {
      console.error('Error picking audio file:', error);
      Alert.alert('Error', 'Failed to select audio file.');
    }
  };

  const analyzeIncomingAudio = async (uri: string) => {
    setIsAnalyzing(true);
    try {
      // Read audio file and convert to base64
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const estimatedDuration = 5; // Default estimate since we can't get exact duration easily

      // Call analysis API
      const results = await analyzeAudio(base64Audio, estimatedDuration);
      setAnalysisResults(results);

      // Generate preparation cue based on analysis
      if (results.raised_voice || results.emotional_charge) {
        setPreparationCue("Take a deep breath. You've got this.");
      } else {
        setPreparationCue("You've got this");
      }

      // Automatically load suggestions
      await loadResponseSuggestions(results);
    } catch (error) {
      console.error('Error analyzing audio:', error);
      Alert.alert('Error', 'Failed to analyze audio.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadResponseSuggestions = async (results: AudioAnalysisResponse) => {
    setIsLoadingSuggestions(true);
    try {
      const response = await generateSuggestions(results, 'incoming');
      setSuggestions(response.suggestions);
    } catch (error) {
      console.error('Error loading suggestions:', error);
      // Use default suggestions on error
      setSuggestions([
        "I need time to think about this. Let's talk when we're both calm.",
        "I hear you, but I need to step away for now.",
        "Let's take a break and come back to this later.",
      ]);
    } finally {
      setIsLoadingSuggestions(false);
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
      Alert.alert('Error', 'Failed to play audio.');
    }
  };

  const getResponseApproach = () => {
    if (!analysisResults) return null;

    if (analysisResults.raised_voice || analysisResults.emotional_charge) {
      return {
        title: 'Recommended Approach: Disengage',
        description: 'The message shows signs of escalation. Consider taking space before responding.',
        icon: 'shield-checkmark' as const,
        color: '#e74c3c',
      };
    } else if (analysisResults.fast_pacing) {
      return {
        title: 'Recommended Approach: Pause & Reflect',
        description: 'Take your time to process before responding. No rush.',
        icon: 'time' as const,
        color: '#f39c12',
      };
    } else {
      return {
        title: 'Recommended Approach: Calm Response',
        description: 'The message seems relatively calm. Respond when ready.',
        icon: 'checkmark-circle' as const,
        color: '#27ae60',
      };
    }
  };

  const responseApproach = getResponseApproach();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Instructions */}
        {!audioUri && (
          <View style={styles.instructionsSection}>
            <Ionicons name="information-circle" size={48} color="#4a90e2" />
            <Text style={styles.instructionsTitle}>Process Received Message</Text>
            <Text style={styles.instructionsText}>
              Select a voice message you received to get preparation cues and response suggestions.
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
            <Text style={styles.selectButtonText}>Select Audio File</Text>
          </TouchableOpacity>
        )}

        {/* Preparation Cue */}
        {preparationCue && !isAnalyzing && (
          <View style={styles.preparationCue}>
            <Ionicons name="shield" size={32} color="#4a90e2" />
            <Text style={styles.preparationText}>{preparationCue}</Text>
          </View>
        )}

        {/* Analysis Loading */}
        {isAnalyzing && (
          <View style={styles.analysisSection}>
            <ActivityIndicator size="large" color="#4a90e2" />
            <Text style={styles.analyzingText}>Analyzing message...</Text>
          </View>
        )}

        {/* Playback Section */}
        {audioUri && !isAnalyzing && (
          <View style={styles.playbackSection}>
            <TouchableOpacity
              style={styles.playButton}
              onPress={playAudio}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isPlaying ? 'pause-circle' : 'play-circle'}
                size={64}
                color="#4a90e2"
              />
            </TouchableOpacity>
            <Text style={styles.playHint}>
              {isPlaying ? 'Playing message...' : 'Tap to listen'}
            </Text>
          </View>
        )}

        {/* Response Approach */}
        {responseApproach && !isAnalyzing && (
          <View style={[
            styles.approachSection,
            { borderLeftColor: responseApproach.color }
          ]}>
            <View style={styles.approachHeader}>
              <Ionicons name={responseApproach.icon} size={24} color={responseApproach.color} />
              <Text style={styles.approachTitle}>{responseApproach.title}</Text>
            </View>
            <Text style={styles.approachDescription}>{responseApproach.description}</Text>
          </View>
        )}

        {/* Response Suggestions */}
        {isLoadingSuggestions && (
          <View style={styles.loadingSuggestions}>
            <ActivityIndicator size="small" color="#4a90e2" />
            <Text style={styles.loadingText}>Loading suggestions...</Text>
          </View>
        )}

        {suggestions.length > 0 && !isLoadingSuggestions && (
          <View style={styles.suggestionsSection}>
            <Text style={styles.suggestionsTitle}>Response Examples</Text>
            <Text style={styles.suggestionsSubtitle}>
              Here are some calm ways you could respond:
            </Text>
            {suggestions.map((suggestion, index) => (
              <View key={index} style={styles.suggestionItem}>
                <View style={styles.suggestionNumber}>
                  <Text style={styles.suggestionNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Action Buttons */}
        {audioUri && !isAnalyzing && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.newMessageButton]}
              onPress={() => {
                setAudioUri(null);
                setAnalysisResults(null);
                setSuggestions([]);
                setPreparationCue('');
              }}
            >
              <Text style={styles.actionButtonText}>Process Another</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.doneButton]}
              onPress={() => router.back()}
            >
              <Text style={styles.actionButtonText}>Done</Text>
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
  instructionsSection: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 32,
  },
  instructionsTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    textAlign: 'center',
  },
  instructionsText: {
    fontSize: 15,
    color: '#a0a0b0',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
    paddingHorizontal: 16,
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
  preparationCue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a0a1f',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    gap: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#9b59b6',
  },
  preparationText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
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
  playbackSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  playButton: {
    alignItems: 'center',
  },
  playHint: {
    marginTop: 12,
    fontSize: 14,
    color: '#a0a0b0',
  },
  approachSection: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderLeftWidth: 4,
  },
  approachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  approachTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  approachDescription: {
    fontSize: 14,
    color: '#d0d0d0',
    lineHeight: 20,
  },
  loadingSuggestions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#a0a0b0',
  },
  suggestionsSection: {
    backgroundColor: '#1a0a1f',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  suggestionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  suggestionsSubtitle: {
    fontSize: 14,
    color: '#a0a0b0',
    marginBottom: 16,
  },
  suggestionItem: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  suggestionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#9b59b6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionNumberText: {
    color: '#fff',
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
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  newMessageButton: {
    backgroundColor: '#6c3483',
  },
  doneButton: {
    backgroundColor: '#27ae60',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
