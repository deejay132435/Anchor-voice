import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getOrCreateDeviceId } from '../services/deviceService';
import { getPairInfo, unpair } from '../services/pairingService';
import { ref, onValue } from 'firebase/database';
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
            });
          }
        } catch (err) {
          console.log('[HomeScreen] Pairing check error:', err);
        }
      };

      checkPairing();

      return () => {
        if (messageUnsub) {
          messageUnsub();
        }
      };
    }, [])
  );

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Partner',
      'This will remove the pairing. You won\'t be able to send or receive in-app messages until you pair again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              const deviceId = await getOrCreateDeviceId();
              await unpair(deviceId);
              setIsPaired(false);
              setPairId(null);
              setUnreadCount(0);
            } catch (err) {
              Alert.alert('Error', 'Failed to disconnect. Try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <View style={styles.verticalLine} />
          </View>
          <Text style={styles.title}>Anchor</Text>
          <Text style={styles.subtitle}>
            Stay steady. You{"'"}re in control.
          </Text>
          {/* Pairing Status — tap to disconnect when paired */}
          <TouchableOpacity
            onPress={isPaired ? handleDisconnect : undefined}
            activeOpacity={isPaired ? 0.7 : 1}
          >
            <View style={[styles.statusContainer, isPaired && styles.statusContainerConnected]}>
              <View style={[styles.statusDot, isPaired ? styles.statusConnected : styles.statusDisconnected]} />
              <Text style={[styles.statusText, isPaired && styles.statusTextConnected]}>
                {isPaired ? 'Connected' : 'Not connected'}
              </Text>
              {isPaired && (
                <Ionicons name="close-circle-outline" size={16} color="#27ae60" style={{ marginLeft: 2 }} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Main Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => router.push('/outgoing')}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="mic" size={28} color="#fff" />
              <Text style={styles.buttonTitle}>Prepare a Voice Message</Text>
              <Text style={styles.buttonDescription}>
                Record, review, send to partner or via...
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => router.push('/incoming')}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="download" size={28} color="#fff" />
              <Text style={styles.buttonTitle}>Listen to a Voice Message</Text>
              <Text style={styles.buttonDescription}>
                Received messages or select a file
              </Text>
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
                  <Ionicons name="chatbubbles" size={24} color="#f1c40f" />
                  {unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{unreadCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.buttonTitle}>Messages</Text>
                <Text style={styles.buttonDescription}>
                  Voice &amp; text-to-speech with partner
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
                <Ionicons name="people" size={24} color="#f1c40f" />
                <Text style={styles.buttonTitle}>Connect with Partner</Text>
                <Text style={styles.buttonDescription}>
                  Pair to send in-app voice messages
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Footer tagline */}
        <Text style={styles.footerText}>Your voice. Your pace.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  iconContainer: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verticalLine: {
    width: 4,
    height: 36,
    backgroundColor: '#f1c40f',
    borderRadius: 2,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 15,
    color: '#a0a0b0',
    textAlign: 'center',
    marginTop: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 5,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
  },
  statusContainerConnected: {
    backgroundColor: '#0a1f0a',
    borderWidth: 1,
    borderColor: '#27ae6040',
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
  statusTextConnected: {
    color: '#27ae60',
  },
  actionsContainer: {
    gap: 12,
  },
  actionButton: {
    borderRadius: 16,
    padding: 18,
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
    borderColor: '#f1c40f50',
  },
  pairButton: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1.5,
    borderColor: '#f1c40f50',
  },
  buttonContent: {
    alignItems: 'center',
  },
  buttonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 6,
  },
  buttonDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 3,
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
  footerText: {
    textAlign: 'center',
    color: '#f1c40f60',
    fontSize: 12,
    marginTop: 20,
    paddingBottom: 8,
  },
});
