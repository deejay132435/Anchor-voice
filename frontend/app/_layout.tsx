import { Stack, useRouter } from 'expo-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useEffect, useRef } from 'react';
import Constants from 'expo-constants';

// Safe wrapper: expo-share-intent requires a native module that isn't present in Expo Go.
// In Expo Go, appOwnership === 'expo', so we no-op the hook to prevent crashes.
const isExpoGo = Constants.appOwnership === 'expo';
const useShareIntent: () => {
  hasShareIntent: boolean;
  shareIntent: { files?: { path?: string }[] } | null;
  resetShareIntent: () => void;
} = isExpoGo
  // eslint-disable-next-line react-hooks/rules-of-hooks
  ? () => ({ hasShareIntent: false, shareIntent: null, resetShareIntent: () => {} })
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  : require('expo-share-intent').useShareIntent;
import { ensureAuth } from '../services/firebaseConfig';
import { getOrCreateDeviceId, registerDevice } from '../services/deviceService';
import { registerForPushNotifications, savePushToken } from '../services/notificationService';
import * as Notifications from 'expo-notifications';

export default function RootLayout() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  const notificationResponseListener = useRef<Notifications.Subscription>(null);

  // Initialize Firebase auth + device identity + push notifications on app launch
  useEffect(() => {
    const init = async () => {
      try {
        await ensureAuth();
        const deviceId = await getOrCreateDeviceId();
        await registerDevice(deviceId);

        const pushToken = await registerForPushNotifications();
        if (pushToken) {
          await savePushToken(deviceId, pushToken);
          console.log('[Layout] Push token registered');
        }
      } catch (err) {
        console.log('[Layout] Firebase init error:', err);
      }
    };
    init();

    // Handle notification taps — navigate to Listen & Respond
    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        router.push('/incoming');
      });

    return () => {
      if (notificationResponseListener.current) {
        notificationResponseListener.current.remove();
      }
    };
  }, [router]);

  // Pre-warm the backend
  useEffect(() => {
    const apiUrl = Constants.expoConfig?.extra?.apiUrl;
    if (apiUrl) {
      fetch(`${apiUrl}/api/health`).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (hasShareIntent && shareIntent) {
      const sharedFile = shareIntent.files?.[0];
      if (sharedFile?.path) {
        router.push({
          pathname: '/incoming',
          params: { sharedUri: sharedFile.path }
        });
        resetShareIntent();
      }
    }
  }, [hasShareIntent, shareIntent, router, resetShareIntent]);

  return (
    <ErrorBoundary>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#0a0a0a',
          },
          headerTintColor: '#f1c40f',
          headerTitleStyle: {
            fontWeight: '600',
            color: '#fff',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="outgoing"
          options={{
            title: 'Prepare Message',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="incoming"
          options={{
            title: 'Listen & Respond',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="pair"
          options={{
            title: 'Connect with Partner',
            presentation: 'card',
          }}
        />
      </Stack>
    </ErrorBoundary>
  );
}
