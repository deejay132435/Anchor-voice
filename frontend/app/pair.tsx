import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
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

const CONSENT_TERMS = [
  {
    title: 'Mutual Consent to Record',
    body: 'Both you and your partner consent to sending and receiving voice messages through Anchor. You are responsible for ensuring that recording and sharing voice messages complies with the laws in your jurisdiction. Some regions require all-party consent to record conversations.',
  },
  {
    title: 'No Storage or Transcripts',
    body: 'Voice messages are encrypted end-to-end and automatically deleted after both parties have listened. Anchor does not store, transcribe, or retain any message content. Audio analysis is performed in real-time and discarded immediately.',
  },
  {
    title: 'Not Professional Advice',
    body: 'Anchor provides de-escalation coaching only. It is not a substitute for therapy, counselling, legal advice, or crisis intervention. If you or someone you know is in danger, contact local emergency services immediately.',
  },
  {
    title: 'Intended Use',
    body: 'Anchor is designed to support respectful communication between consenting partners. You agree not to use this app to harass, threaten, intimidate, or coerce another person. Misuse of the app may result in account termination.',
  },
  {
    title: 'Privacy & Data',
    body: 'Anchor collects no personal information — no names, emails, or accounts. Devices are identified by anonymous IDs stored only on your device. Audio is encrypted before leaving your device and can only be decrypted by your paired partner.',
  },
  {
    title: 'Limitation of Liability',
    body: 'Anchor is provided "as is" without warranties of any kind. The developers of Anchor are not liable for any damages, disputes, or outcomes arising from the use of this app. By connecting, you accept full responsibility for how you use this service.',
  },
];

export default function PairScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [isLoading, setIsLoading] = useState(false);

  // Consent modal
  const [showConsent, setShowConsent] = useState(false);
  const [consentAction, setConsentAction] = useState<'create' | 'redeem' | null>(null);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

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

  const requestConsent = (action: 'create' | 'redeem') => {
    setConsentAction(action);
    setHasScrolledToEnd(false);
    setShowConsent(true);
  };

  const handleConsentAccept = () => {
    setShowConsent(false);
    if (consentAction === 'create') {
      handleCreateCode();
    } else if (consentAction === 'redeem') {
      handleRedeemCode();
    }
    setConsentAction(null);
  };

  const handleConsentDecline = () => {
    setShowConsent(false);
    setConsentAction(null);
  };

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
      if (err.message === 'FREE_LIMIT_REACHED') {
        setError('You\'ve already used your free pairing. Subscribe to connect with a new partner.');
      } else {
        setError(err.message || 'Failed to create code');
      }
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
      } else if (result.error === 'FREE_LIMIT_REACHED') {
        setError('You\'ve already used your free pairing. Subscribe to connect with a new partner.');
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
                onPress={() => requestConsent('create')}
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
              onPress={() => requestConsent('redeem')}
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
          <Ionicons name="shield-checkmark-outline" size={18} color="#f1c40f" />
          <Text style={styles.privacyText}>
            No names, emails, or accounts needed. Your identity stays private.
          </Text>
        </View>
      </View>

      {/* Consent Disclaimer Modal */}
      <Modal
        visible={showConsent}
        animationType="slide"
        transparent
        onRequestClose={handleConsentDecline}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="document-text-outline" size={24} color="#f1c40f" />
              <Text style={styles.modalTitle}>Terms of Use</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              By connecting with a partner, you agree to the following:
            </Text>

            <ScrollView
              style={styles.modalScroll}
              onScroll={({ nativeEvent }) => {
                const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                const isEnd = layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
                if (isEnd) setHasScrolledToEnd(true);
              }}
              scrollEventThrottle={100}
            >
              {CONSENT_TERMS.map((term, i) => (
                <View key={i} style={styles.termSection}>
                  <Text style={styles.termTitle}>{`${i + 1}. ${term.title}`}</Text>
                  <Text style={styles.termBody}>{term.body}</Text>
                </View>
              ))}

              <View style={styles.termFooter}>
                <Text style={styles.termFooterText}>
                  By tapping "I Agree" you confirm that you have read, understood, and agree to these terms. You also confirm that you have legal capacity to consent and that your use of Anchor complies with applicable laws in your jurisdiction.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleConsentDecline}
              >
                <Text style={styles.declineButtonText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.agreeButton, !hasScrolledToEnd && styles.agreeButtonDisabled]}
                onPress={handleConsentAccept}
                disabled={!hasScrolledToEnd}
              >
                <Text style={styles.agreeButtonText}>
                  {hasScrolledToEnd ? 'I Agree' : 'Read to continue'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    borderColor: '#f1c40f',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 40,
    marginBottom: 16,
  },
  codeText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#f1c40f',
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
  // Consent modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#a0a0b0',
    paddingHorizontal: 20,
    paddingBottom: 12,
    lineHeight: 20,
  },
  modalScroll: {
    paddingHorizontal: 20,
    maxHeight: 400,
  },
  termSection: {
    marginBottom: 16,
  },
  termTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f1c40f',
    marginBottom: 4,
  },
  termBody: {
    fontSize: 13,
    color: '#c0c0c0',
    lineHeight: 19,
  },
  termFooter: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  termFooterText: {
    fontSize: 12,
    color: '#888',
    lineHeight: 17,
    fontStyle: 'italic',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#555',
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  agreeButton: {
    flex: 1.5,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#9b59b6',
    alignItems: 'center',
  },
  agreeButtonDisabled: {
    backgroundColor: '#4a2a5e',
    opacity: 0.7,
  },
  agreeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
