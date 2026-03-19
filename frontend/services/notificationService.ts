import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ref, set, get } from 'firebase/database';
import { database } from './firebaseConfig';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Register for push notifications and return the Expo push token */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Notifications] Push notifications only work on physical devices');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission not granted');
    return null;
  }

  // Set up Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#9b59b6',
      sound: 'default',
    });
  }

  // Get the Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    });
    return tokenData.data;
  } catch (err) {
    console.log('[Notifications] Token error:', err);
    return null;
  }
}

/** Save push token to Firebase so partner can send notifications */
export async function savePushToken(deviceId: string, token: string): Promise<void> {
  const tokenRef = ref(database, `devices/${deviceId}/push_token`);
  await set(tokenRef, token);
}

/** Get partner's push token from Firebase */
export async function getPartnerPushToken(partnerDeviceId: string): Promise<string | null> {
  const tokenRef = ref(database, `devices/${partnerDeviceId}/push_token`);
  const snapshot = await get(tokenRef);
  return snapshot.exists() ? snapshot.val() : null;
}

/** Send a push notification to a partner via Expo's push service */
export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: expoPushToken,
        sound: 'default',
        title,
        body,
        data: data || {},
        channelId: 'messages',
      }),
    });
  } catch (err) {
    console.log('[Notifications] Send error:', err);
  }
}
