# Anchor Voice - QR Code & Sharing

## 📱 QR Code Location

**File Path:** `/workspaces/Anchor-voice/qr-code.png`

**How to access:**
- View directly in repository
- Download and share with testers
- Print for physical distribution

**What it does:**
- Links to: `https://anchor-voice.vercel.app` (download landing page)
- Opens in browser (works on any device)
- Shows app features and download links
- No setup needed - instant access

---

## 🔗 Deep Linking - Open Audio with Anchor

Anchor is now registered to receive audio files from other apps on both iOS and Android.

### Android Integration ✅

**Supported Actions:**
- `SEND` - Single audio file (from share menu)
- `SEND_MULTIPLE` - Multiple audio files (from share menu)
- `VIEW` - Open audio file (from file explorer)

**How it works:**
1. User receives audio message in WhatsApp, Messenger, etc.
2. Long-press or tap "Share" on the audio
3. "Anchor Voice" appears in the share options
4. Select "Anchor Voice"
5. App opens to Incoming Message screen with audio pre-loaded
6. Audio is automatically analyzed

**Test it:**
1. Install app from QR code
2. Build for Android: `eas build --platform android`
3. Get another phone to send audio to tester
4. In WhatsApp: Long-press audio → Share → Anchor Voice
5. Audio should load in Anchor

### iOS Integration ✅

**Supported Actions:**
- Share audio files with Anchor
- Open audio files with Anchor
- Document picker fallback

**How to enable:**
1. Build for iOS: `eas build --platform ios`
2. Install on device
3. Long-press audio in any app
4. Tap "Share"
5. Scroll right in share sheet
6. Tap "Anchor Voice" (may need to tap "More")

**Note:** iOS requires app to be built and installed from TestFlight or via development build. Expo Go doesn't support deep linking from other apps.

---

## 🎯 Use Cases

### Case 1: Analyzing Received Messages
```
WhatsApp → Share Audio → Anchor Voice → Instant Analysis
```

### Case 2: Sharing Voice Messages for Reflection
```
Anchor Voice → Record & Analyze → Share → WhatsApp/Email → Review Later
```

### Case 3: Practicing De-escalation
```
Friend sends heated message → Anchor analyzes tone → 
Get suggestions → Practice response → Share back
```

---

## 🔧 Configuration

### Android App Package
`com.anchor.voice`

### iOS Supported UTTypes
- `public.audio`
- `com.apple.m4a-audio`
- `org.3gpp.adaptive-multi-rate-audio`

### Schemes
- `frontend://` - For custom deep linking
- `mailto:` - Not used
- `tel:` - Not used

---

## 📤 How to Share QR Code with Testers

### Option 1: Email
```
Subject: Test Anchor Voice App - Scan QR Code!

Attachment: qr-code.png

Body:
Hi [Tester],

Please scan the attached QR code with your phone camera to test 
Anchor Voice.

Steps:
1. Install Expo Go app first
2. Scan QR code
3. Follow TESTER_GUIDE.md for testing checklist

Thanks!
```

### Option 2: Slack/Teams
```
Paste image directly in message

"Hey team, here's the QR code for Anchor Voice testing. 
Scan with your phone to load the app in Expo Go.

Make sure backend is running before testing!
Backend URL: [backend-url]"
```

### Option 3: WhatsApp/Messenger
```
Send qr-code.png image directly

"Scan this QR code to test Anchor Voice!
Let me know if you find any issues.
Use TESTER_GUIDE.md for what to test."
```

### Option 4: Print & Share
```
Print qr-code.png
Post around office or training room
Include this card:

┌─────────────────────────────────┐
│   ANCHOR VOICE - TEST DRIVE      │
│                                 │
│   Scan QR code with your phone  │
│                                 │
│   [QR CODE HERE]                │
│                                 │
│   1. Install Expo Go app        │
│   2. Scan QR code               │
│   3. See TESTER_GUIDE.md        │
└─────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### QR Code Won't Scan
- Ensure good lighting
- Clean camera lens
- Try from different angle
- Increase QR code size if printed

### App Won't Open After Scan
- Make sure Expo Go is installed
- Check internet connection
- Backend must be running
- Try regenerating QR code

### Audio Not Shared from Other App
- Build and install production APK (not Expo Go)
- Make sure Anchor is in share menu
- Try different app (WhatsApp, Messenger, etc.)
- Long-press audio file for share options

---

## 🚀 Next Steps After Testing

### For Development
- Get feedback from testers
- Use TESTER_GUIDE.md checklist
- Fix bugs as reported
- Regenerate QR code if code changes

### For Production
1. Build with `eas build --profile production`
2. Create new QR code for production build
3. Request TestFlight beta testers (iOS)
4. Create Google Play beta link (Android)
5. Update app store listings

### For EAS Build

Current EAS Project ID: `d6e86a9a-ab9f-41af-8030-c5c5a2e9d751`

**Build commands:**
```bash
# Development build (supports Expo Go)
eas build --profile development --platform android

# Preview (standalone app for testing)
eas build --profile preview --platform android

# Production
eas build --profile production --platform android
```

---

## 📊 Tracking

**QR Code Generated:** 2026-02-14 08:58:23 UTC  
**Target:** Landing Page with Downloads  
**URL:** https://anchor-voice.vercel.app  
**Status:** Ready for tester distribution ✅

---

## Support

For questions about QR code or sharing:
1. Check this file (QR_CODE_INFO.md)
2. See TESTER_GUIDE.md for testing help
3. See README_ANCHOR.md for technical details
4. Report issues with reproduction steps
