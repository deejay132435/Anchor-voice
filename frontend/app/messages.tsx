import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { getOrCreateDeviceId } from '../services/deviceService';
import { getPairInfo } from '../services/pairingService';
import {
  Message,
  subscribeToMessages,
  downloadVoiceMessage,
  markAsListened,
  getRecentMessages,
} from '../services/messagingService';

export default function MessagesScreen() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState<string>('');
  const [pairId, setPairId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      const id = await getOrCreateDeviceId();
      setDeviceId(id);

      const pair = await getPairInfo(id);
      if (!pair) {
        Alert.alert('Not paired', 'Connect with a partner first.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      setPairId(pair.pairId);

      // Load existing messages
      const existing = await getRecentMessages(pair.pairId);
      setMessages(existing);
      setIsLoading(false);

      // Subscribe to real-time updates
      unsubscribe = subscribeToMessages(
        pair.pairId,
        (newMsg) => {
          setMessages((prev) => {
            // Avoid duplicates (initial load + listener overlap)
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        },
        (updatedMsg) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
          );
        }
      );
    };

    init();

    return () => {
      if (unsubscribe) unsubscribe();
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const playMessage = async (message: Message) => {
    if (message.deleted) return;

    // Stop current playback
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    if (playingId === message.id) {
      setPlayingId(null);
      return;
    }

    try {
      setPlayingId(message.id);

      const localUri = await downloadVoiceMessage(message.audioUrl, message.id);

      const { sound } = await Audio.Sound.createAsync(
        { uri: localUri },
        { shouldPlay: true }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          soundRef.current = null;
          // Mark as listened when playback completes
          if (message.sender !== deviceId) {
            markAsListened(pairId, message.id, deviceId);
          }
        }
      });
    } catch (err) {
      console.log('[Messages] Playback error:', err);
      setPlayingId(null);
      Alert.alert('Error', 'Could not play message');
    }
  };

  const getSeverityColor = (level: string) => {
    switch (level) {
      case 'high': return '#e74c3c';
      case 'medium': return '#f39c12';
      default: return '#27ae60';
    }
  };

  const getEmotionColor = (emotion: string) => {
    const positive = ['calm', 'excited', 'affectionate', 'grateful'];
    return positive.includes(emotion) ? '#27ae60' : '#9b59b6';
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

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.sender === deviceId;
    const isPlaying = playingId === item.id;

    return (
      <View style={[styles.messageRow, isMine ? styles.myMessageRow : styles.theirMessageRow]}>
        <View style={[styles.messageCard, isMine ? styles.myMessage : styles.theirMessage]}>
          {/* Header */}
          <View style={styles.messageHeader}>
            <Ionicons
              name={isMine ? 'arrow-up-circle' : 'arrow-down-circle'}
              size={16}
              color={isMine ? '#9b59b6' : '#3498db'}
            />
            <Text style={styles.messageDirection}>
              {isMine ? 'Sent' : 'Received'}
            </Text>
            <Text style={styles.messageTime}>{formatTime(item.timestamp)}</Text>
          </View>

          {/* Badges */}
          <View style={styles.badgesRow}>
            <View style={[styles.badge, { backgroundColor: getEmotionColor(item.analysisSummary.primary_emotion) + '30' }]}>
              <Text style={[styles.badgeText, { color: getEmotionColor(item.analysisSummary.primary_emotion) }]}>
                {item.analysisSummary.primary_emotion}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: getSeverityColor(item.analysisSummary.severity_level) + '30' }]}>
              <Text style={[styles.badgeText, { color: getSeverityColor(item.analysisSummary.severity_level) }]}>
                {item.analysisSummary.severity_level}
              </Text>
            </View>
            <Text style={styles.durationText}>{formatDuration(item.audioDurationSeconds)}</Text>
          </View>

          {/* Play Button */}
          {item.deleted ? (
            <View style={styles.deletedContainer}>
              <Ionicons name="checkmark-done" size={16} color="#666" />
              <Text style={styles.deletedText}>Message expired</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.playButton, isPlaying && styles.playingButton]}
              onPress={() => playMessage(item)}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={20}
                color="#fff"
              />
              <Text style={styles.playButtonText}>
                {isPlaying ? 'Pause' : 'Play'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Status */}
          <View style={styles.statusRow}>
            {item.listenedByReceiver ? (
              <Ionicons name="checkmark-done" size={14} color="#27ae60" />
            ) : (
              <Ionicons name="checkmark" size={14} color="#888" />
            )}
            <Text style={styles.statusText}>
              {item.deleted ? 'Expired' : item.listenedByReceiver ? 'Listened' : 'Sent'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9b59b6" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          messages.length === 0 && styles.emptyListContent,
        ]}
        onContentSizeChange={() => {
          if (messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color="#333" />
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>
              Send a voice message to start the conversation.
            </Text>
          </View>
        }
      />

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.recordButton}
          onPress={() => router.push({ pathname: '/outgoing', params: { sendMode: 'inapp' } })}
        >
          <Ionicons name="mic" size={24} color="#fff" />
          <Text style={styles.recordButtonText}>Record & Send</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#a0a0b0',
    fontSize: 15,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  messageRow: {
    marginBottom: 12,
  },
  myMessageRow: {
    alignItems: 'flex-end',
  },
  theirMessageRow: {
    alignItems: 'flex-start',
  },
  messageCard: {
    borderRadius: 16,
    padding: 14,
    maxWidth: '85%',
    minWidth: '60%',
  },
  myMessage: {
    backgroundColor: '#1a0a2e',
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    backgroundColor: '#1a1a2e',
    borderBottomLeftRadius: 4,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  messageDirection: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a0a0b0',
  },
  messageTime: {
    fontSize: 11,
    color: '#666',
    marginLeft: 'auto',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  durationText: {
    fontSize: 12,
    color: '#888',
    marginLeft: 'auto',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#9b59b6',
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  playingButton: {
    backgroundColor: '#6c3483',
  },
  playButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  deletedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 8,
  },
  deletedText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'flex-end',
  },
  statusText: {
    fontSize: 11,
    color: '#888',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#1a1a2e',
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#9b59b6',
    paddingVertical: 16,
    borderRadius: 14,
  },
  recordButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
});
