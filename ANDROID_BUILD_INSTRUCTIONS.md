# Anchor - Android Build Instructions

## Prerequisites
- Node.js and npm/yarn installed
- Expo CLI installed: `npm install -g expo-cli eas-cli`
- Expo account (free): https://expo.dev/signup

## Option 1: EAS Build (Recommended - Cloud Build)

### Initial Setup
```bash
cd /app/frontend

# Login to Expo
eas login

# Configure the project
eas build:configure
```

### Build Development APK
```bash
# Development build (for testing with dev tools)
eas build --profile development --platform android

# This will:
# - Build an APK with Share Target functionality
# - Include dev tools for debugging
# - Take ~10-15 minutes
# - Provide download link when complete
```

### Build Preview APK (Recommended for Testing)
```bash
# Preview build (production-like, but not signed for Play Store)
eas build --profile preview --platform android

# This will:
# - Build a production-like APK
# - Include Share Target configuration
# - Be installable directly on Android devices
# - Take ~10-15 minutes
```

### Build Production APK/AAB
```bash
# For Play Store submission (AAB)
eas build --profile production --platform android

# For direct install (APK)
eas build --profile production --platform android --build-type apk
```

## Option 2: Local Build (Requires Android Studio)

### Prerequisites
- Android Studio installed
- Android SDK configured
- Java JDK 17+

### Steps
```bash
cd /app/frontend

# Generate native Android project
npx expo prebuild --platform android

# Build debug APK
cd android
./gradlew assembleDebug

# APK location:
# android/app/build/outputs/apk/debug/app-debug.apk
```

## Testing Share Target

1. **Install the APK** on your Android device
2. **Open WhatsApp/Messenger** and play a voice message
3. **Tap Share button** on the voice message
4. **Select "Anchor"** from the share sheet
5. **Anchor should open** to "Received Message" screen
6. **Verify**: Analysis runs without auto-play

## Share Target Configuration

Already configured in `/app/frontend/app.json`:

```json
"android": {
  "package": "com.anchor.voice",
  "intentFilters": [
    {
      "action": "android.intent.action.SEND",
      "category": ["android.intent.category.DEFAULT"],
      "data": [{ "mimeType": "audio/*" }]
    }
  ]
}
```

## Troubleshooting

### Share Target not appearing
- Ensure the APK is a proper build (not Expo Go)
- Check `AndroidManifest.xml` includes intent filter
- Restart device after install

### Deep link not working
- Check logs: `adb logcat | grep Anchor`
- Verify expo-linking is installed
- Test with: `adb shell am start -a android.intent.action.VIEW -d "content://..." com.anchor.voice`

## Download Builds

After EAS build completes:
1. Visit https://expo.dev/accounts/[your-account]/projects/anchor-voice/builds
2. Download the APK
3. Transfer to phone via email/USB/cloud
4. Install (enable "Install from Unknown Sources" if needed)

## Next Steps

1. Run `eas build --profile preview --platform android`
2. Wait for build to complete (~10-15 min)
3. Download and install APK
4. Test Share Target from WhatsApp
5. Report any issues

## Support

- Expo Build Docs: https://docs.expo.dev/build/introduction/
- EAS Build: https://docs.expo.dev/build/setup/
- Share Intent: https://docs.expo.dev/guides/deep-linking/
