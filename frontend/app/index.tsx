import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getOrCreateDeviceId } from '../services/deviceService';
import { getPairInfo } from '../services/pairingService';
import { ref, onValue, off } from 'firebase/database';
import { database } from '../services/firebaseConfig';

export default function HomeScreen() {
  const router = useRouter();
  const [isPaired, setIsPaired] = useState(false);
  const [pairId, setPairId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Check pairing status whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      let messageUnsub: (() => void) | null = null;

      const checkPairing = async () => {
        try {
          const deviceId = await getOrCreateDeviceId();
          const pair = await getPairInfo(deviceId);
          setIsPaired(!!pair);
          setPairId(pair?.pairId || null);

          // Subscribe to unread messages if paired
          if (pair?.pairId) {
            const messagesRef = ref(database, `messages/${pair.pairId}`);
            messageUnsub = onValue(messagesRef, (snapshot) => {
              if (!snapshot.exists()) {
                setUnreadCount(0);
                return;
              }
              let count = 0;
              snapshot.forEach((child) => {
                const msg = child.val();
                if (
                  msg.sender !== deviceId &&
                  !msg.listened_by_receiver &&
                  !msg.deleted
                ) {
                  count++;
                }
              });
              setUnreadCount(count);
            }) as any;
          }
        } catch (err) {
          console.log('[HomeScreen] Pairing check error:', err);
        }
      };

      checkPairing();

      return () => {
        if (messageUnsub) {
          // Clean up listener
        }
      };
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <View style={styles.verticalLine} />
          </View>
          <Text style={styles.title}>Anchor</Text>
          <Text style={styles.subtitle}>
            Stay steady.{'\n'}You{"'"}re in control.
          </Text>
          {/* Pairing Status */}
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, isPaired ? styles.statusConnected : styles.statusDisconnected]} />
            <Text style={styles.statusText}>
              {isPaired ? 'Connected' : 'Not connected'}
            </Text>
          </View>
        </View>

        {/* Main Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => router.push('/outgoing')}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="mic" size={32} color="#fff" />
              <Text style={styles.buttonTitle}>Prepare a Voice Message</Text>
              <Text style={styles.buttonDescription}>
                Record and review before sending
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => router.push('/incoming')}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="download" size={32} color="#fff" />
              <Text style={styles.buttonTitle}>Listen to a Voice Message</Text>
            </View>
          </TouchableOpacity>

          {/* Pairing / Messages Button */}
          {isPaired ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.messagesButton]}
              onPress={() => router.push('/messages')}
              activeOpacity={0.8}
            >
              <View style={styles.buttonContent}>
                <View style={styles.messagesIconContainer}>
                  <Ionicons name="chatbubbles" size={28} color="#fff" />
                  {unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{unreadCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.buttonTitle}>Messages</Text>
                <Text style={styles.buttonDescription}>
                  Voice messages with your partner
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, styles.pairButton]}
              onPress={() => router.push('/pair')}
              activeOpacity={0.8}
            >
              <View style={styles.buttonContent}>
                <Ionicons name="people" size={28} color="#fff" />
                <Text style={styles.buttonTitle}>Connect with Partner</Text>
                <Text style={styles.buttonDescription}>
                  Pair to send in-app voice messages
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  iconContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verticalLine: {
    width: 4,
    height: 48,
    backgroundColor: '#9b59b6',
    borderRadius: 2,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#a0a0b0',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 32,
    lineHeight: 24,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusConnected: {
    backgroundColor: '#27ae60',
  },
  statusDisconnected: {
    backgroundColor: '#666',
  },
  statusText: {
    fontSize: 13,
    color: '#a0a0b0',
  },
  actionsContainer: {
    flex: 1,
    gap: 12,
  },
  actionButton: {
    borderRadius: 16,
    padding: 20,
    minHeight: 100,
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#9b59b6',
  },
  secondaryButton: {
    backgroundColor: '#6c3483',
  },
  messagesButton: {
    backgroundColor: '#1a0a2e',
    borderWidth: 1.5,
    borderColor: '#9b59b6',
  },
  pairButton: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1.5,
    borderColor: '#333',
  },
  buttonContent: {
    alignItems: 'center',
  },
  buttonTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  buttonDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
    textAlign: 'center',
  },
  messagesIconContainer: {
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#e74c3c',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
