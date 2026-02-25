import { Stack } from 'expo-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useShareIntent } from 'expo-share-intent';
import Constants from 'expo-constants';

export default function RootLayout() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  // Pre-warm the backend on app launch so analysis is fast when needed
  useEffect(() => {
    const apiUrl = Constants.expoConfig?.extra?.apiUrl;
    if (apiUrl) {
      fetch(`${apiUrl}/api/health`).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (hasShareIntent && shareIntent) {
      // Handle shared audio files from other apps
      const sharedFile = shareIntent.files?.[0];
      if (sharedFile?.path) {
        router.push({
          pathname: '/incoming',
          params: { sharedUri: sharedFile.path }
        });
        resetShareIntent();
      }
    }
  }, [hasShareIntent, shareIntent]);

  return (
    <ErrorBoundary>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#1a0a1f',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Anchor',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="outgoing"
          options={{
            title: 'Record Message',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="incoming"
          options={{
            title: 'Received Message',
            presentation: 'card',
          }}
        />
      </Stack>
    </ErrorBoundary>
  );
}
