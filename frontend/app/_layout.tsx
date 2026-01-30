import { Stack } from 'expo-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

export default function RootLayout() {
  const router = useRouter();
  
  console.log('[_layout] RootLayout rendering');
  
  useEffect(() => {
    // Handle incoming shared content
    const handleDeepLink = async (event: { url: string }) => {
      console.log('[DeepLink] Received:', event.url);
      
      // Check if it's a shared audio file
      if (event.url.includes('content://') || event.url.includes('file://')) {
        // Navigate to incoming screen with the shared audio URI
        router.push({
          pathname: '/incoming',
          params: { sharedUri: event.url }
        });
      }
    };

    // Listen for incoming links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened with a shared file
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
  
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
