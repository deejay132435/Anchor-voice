import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <View style={styles.line} />
            <Text style={styles.title}>Anchor</Text>
            <Text style={styles.errorText}>Something went wrong</Text>
            <Text style={styles.errorDetail}>
              {this.state.error?.message || 'Unknown error'}
            </Text>
            <Text style={styles.instruction}>
              Please refresh the page
            </Text>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
  },
  line: {
    width: 4,
    height: 48,
    backgroundColor: '#9b59b6',
    borderRadius: 2,
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 24,
  },
  errorText: {
    fontSize: 18,
    color: '#e74c3c',
    marginBottom: 16,
    fontWeight: '600',
  },
  errorDetail: {
    fontSize: 14,
    color: '#a0a0b0',
    textAlign: 'center',
    marginBottom: 24,
  },
  instruction: {
    fontSize: 14,
    color: '#9b59b6',
  },
});
