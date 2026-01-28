import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: '#1a1a2e',
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
          <Stack.Screen
            name="suggestions"
            options={{
              title: 'Suggestions',
              presentation: 'modal',
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
