import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';

export default function RootLayout() {
  return (
    <View style={styles.container}>
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
        </Stack>
      </SafeAreaProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
