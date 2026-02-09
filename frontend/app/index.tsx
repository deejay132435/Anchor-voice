import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const router = useRouter();

  useEffect(() => {
    console.log('[HomeScreen] Component mounted');
    return () => {
      console.log('[HomeScreen] Component unmounted');
    };
  }, []);

  console.log('[HomeScreen] Rendering');

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
        </View>

        {/* Main Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => {
              console.log('[HomeScreen] Navigate to outgoing');
              router.push('/outgoing');
            }}
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
            onPress={() => {
              console.log('[HomeScreen] Navigate to incoming');
              router.push('/incoming');
            }}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="download" size={32} color="#fff" />
              <Text style={styles.buttonTitle}>Listen to a Voice Message</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Footer Info */}
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
    marginTop: 32,
    marginBottom: 48,
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
  actionsContainer: {
    flex: 1,
    gap: 16,
  },
  actionButton: {
    borderRadius: 16,
    padding: 24,
    minHeight: 160,
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#9b59b6',
  },
  secondaryButton: {
    backgroundColor: '#6c3483',
  },
  buttonContent: {
    alignItems: 'center',
  },
  buttonTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    marginTop: 12,
  },
  buttonDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
});
