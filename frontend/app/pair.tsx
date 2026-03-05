import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ExpoClipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getOrCreateDeviceId } from '../services/deviceService';
import {
  createPairingCode,
  redeemPairingCode,
  onCodeRedeemed,
} from '../services/pairingService';

type Tab = 'create' | 'enter';

export default function PairScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [isLoading, setIsLoading] = useState(false);

  // Create code state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [waitingForPartner, setWaitingForPartner] = useState(false);
  const [expirySeconds, setExpirySeconds] = useState(0);

  // Enter code state
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleCreateCode = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const code = await createPairingCode(deviceId);
      setGeneratedCode(code);
      setWaitingForPartner(true);
      setExpirySeconds(3600);

      // Start countdown timer
      timerRef.current = setInterval(() => {
        setExpirySeconds((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setGeneratedCode(null);
            setWaitingForPartner(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Listen for code redemption
      unsubscribeRef.current = onCodeRedeemed(code, (pairId) => {
        if (timerRef.current) clearInterval(timerRef.current);
        setWaitingForPartner(false);
        Alert.alert('Connected!', 'Your partner has joined.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRedeemCode = async () => {
    if (inputCode.length !== 6) {
      setError('Enter a 6-character code');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const result = await redeemPairingCode(inputCode, deviceId);

      if (result.success) {
        Alert.alert('Connected!', 'You are now paired with your partner.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        setError(result.error || 'Failed to connect');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const copyCode = async () => {
    if (generatedCode) {
      await ExpoClipboard.setStringAsync(generatedCode);
      Alert.alert('Copied', 'Code copied to clipboard');
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.header}>Connect with Partner</Text>
        <Text style={styles.subtitle}>
          Pair with your partner to send and receive voice messages in the app.
        </Text>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'create' && styles.activeTab]}
            onPress={() => { setActiveTab('create'); setError(null); }}
          >
            <Text style={[styles.tabText, activeTab === 'create' && styles.activeTabText]}>
              Create Code
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'enter' && styles.activeTab]}
            onPress={() => { setActiveTab('enter'); setError(null); }}
          >
            <Text style={[styles.tabText, activeTab === 'enter' && styles.activeTabText]}>
              Enter Code
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'create' ? (
          <View style={styles.tabContent}>
            {!generatedCode ? (
              <TouchableOpacity
                style={styles.generateButton}
                onPress={handleCreateCode}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="key-outline" size={28} color="#fff" />
                    <Text style={styles.generateButtonText}>Generate Code</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.codeDisplay}>
                <Text style={styles.codeLabel}>Share this code with your partner</Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText}>{generatedCode}</Text>
                </View>
                <TouchableOpacity style={styles.copyButton} onPress={copyCode}>
                  <Ionicons name="copy-outline" size={20} color="#9b59b6" />
                  <Text style={styles.copyButtonText}>Copy Code</Text>
                </TouchableOpacity>

                {waitingForPartner && (
                  <View style={styles.waitingContainer}>
                    <ActivityIndicator color="#9b59b6" size="small" />
                    <Text style={styles.waitingText}>Waiting for partner...</Text>
                    <Text style={styles.expiryText}>
                      Expires in {formatTime(expirySeconds)}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.tabContent}>
            <Text style={styles.enterLabel}>Enter the code from your partner</Text>
            <TextInput
              style={styles.codeInput}
              value={inputCode}
              onChangeText={(text) => {
                setInputCode(text.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6));
                setError(null);
              }}
              placeholder="ABC123"
              placeholderTextColor="#555"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.connectButton, inputCode.length !== 6 && styles.disabledButton]}
              onPress={handleRedeemCode}
              disabled={isLoading || inputCode.length !== 6}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.connectButtonText}>Connect</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={18} color="#e74c3c" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#666" />
          <Text style={styles.privacyText}>
            No names, emails, or accounts needed. Your identity stays private.
          </Text>
        </View>
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
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 15,
    color: '#a0a0b0',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 32,
    lineHeight: 22,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 4,
    marginBottom: 32,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#9b59b6',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888',
  },
  activeTabText: {
    color: '#fff',
  },
  tabContent: {
    alignItems: 'center',
  },
  generateButton: {
    backgroundColor: '#9b59b6',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  generateButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  codeDisplay: {
    alignItems: 'center',
    width: '100%',
  },
  codeLabel: {
    fontSize: 15,
    color: '#a0a0b0',
    marginBottom: 16,
  },
  codeBox: {
    backgroundColor: '#1a0a2e',
    borderWidth: 2,
    borderColor: '#9b59b6',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 40,
    marginBottom: 16,
  },
  codeText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 8,
    fontFamily: 'monospace',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  copyButtonText: {
    color: '#9b59b6',
    fontSize: 15,
    fontWeight: '500',
  },
  waitingContainer: {
    alignItems: 'center',
    marginTop: 32,
    gap: 8,
  },
  waitingText: {
    color: '#a0a0b0',
    fontSize: 15,
  },
  expiryText: {
    color: '#666',
    fontSize: 13,
  },
  enterLabel: {
    fontSize: 15,
    color: '#a0a0b0',
    marginBottom: 16,
  },
  codeInput: {
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 8,
    fontFamily: 'monospace',
    width: '100%',
    marginBottom: 24,
  },
  connectButton: {
    backgroundColor: '#9b59b6',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  connectButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  disabledButton: {
    opacity: 0.5,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: 8,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 14,
    flex: 1,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 'auto',
    paddingVertical: 16,
  },
  privacyText: {
    color: '#666',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
