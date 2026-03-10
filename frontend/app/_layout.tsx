import { Stack } from 'expo-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useShareIntent } from 'expo-share-intent';
import Constants from 'expo-constants';
import { ensureAuth } from '../services/firebaseConfig';
import { getOrCreateDeviceId, registerDevice } from '../services/deviceService';
import { registerForPushNotifications, savePushToken } from '../services/notificationService';
import * as Notifications from 'expo-notifications';

export default function RootLayout() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  const notificationResponseListener = useRef<Notifications.EventSubscription>();

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
        Notifications.removeNotificationSubscription(notificationResponseListener.current);
      }
    };
  }, []);

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
  }, [hasShareIntent, shareIntent]);

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
