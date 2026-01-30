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

export default function IncomingScreen() {
  const router = useRouter();
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [insights, setInsights] = useState<string[]>([]);
  const [examplePhrasing, setExamplePhrasing] = useState<string>('');

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
      // Show "Analyzing..." for 800ms
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Mock analysis - Phase 1 MVP
      // Phase 2 will call actual backend API
      const mockInsights = [
        "Raised intensity detected",
        "Fast pacing may escalate"
      ];
      
      const mockPhrasing = "I hear you. I need time to think about this before I respond.";
      
      setInsights(mockInsights);
      setExamplePhrasing(mockPhrasing);
      setHasAnalyzed(true);
    } catch (error) {
      console.error('Error analyzing audio:', error);
      Alert.alert('Error', 'Failed to analyze audio.');
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
    // Navigate to outgoing screen to record a response
    router.push('/outgoing');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Instructions */}
        {!audioUri && (
          <View style={styles.instructionsSection}>
            <Text style={styles.groundingText}>You're in control.</Text>
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
});
