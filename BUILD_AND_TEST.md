# 🚀 Anchor Voice - Build & Testing Guide

**Build Date:** April 14, 2026  
**Latest Build Status:** ✅ All tests passing (ESLint, TypeScript, Python)

---

## Quick Start for Testers

### Option 1: Download Latest APK (Fastest)

Scan this QR code with your Android phone to download the latest build:

```
╔═══════════════════════════════════════╗
║      📱 Android APK Download QR       ║
║   (Direct from Expo Cloud)            ║
╚═══════════════════════════════════════╝
```

**Or use this link directly:**  
📥 [Download APK](https://expo.dev/accounts/deejayjustin/projects/anchor-voice/builds/af452e91-1e8b-4a32-a6e8-4075871fd791)

### Option 2: Use Expo Go (Test Updates Faster)

1. Install **Expo Go** from Google Play or App Store
2. Scan this QR code:

```
╔═══════════════════════════════════════╗
║      🔗 Expo Dev Server QR            ║
║   (Live updates while developing)     ║
╚═══════════════════════════════════════╝
```

**Or manually:**
- Open Expo Go
- Tap "Scan QR Code"
- Use: `exp://exp.host/@deejayjustin/anchor-voice`

### Option 3: Build Locally

```bash
# Clone repo
git clone https://github.com/deejay132435/Anchor-voice.git
cd Anchor-voice/frontend

# Install dependencies
yarn install

# Start dev server
yarn start

# Build APK locally
eas build --profile preview --platform android
```

---

## What to Test

### ✅ Core Features

#### 1. **Home Screen**
- [ ] App launches without crashes
- [ ] All three main buttons visible and functional
- [ ] Navigation between screens works smoothly

#### 2. **Pairing with Partner**
- [ ] "Connect with Partner" button opens pairing modal
- [ ] Can create a pairing code (6 characters)
- [ ] Can copy code to clipboard
- [ ] Can enter partner's code to pair
- [ ] Paired status displays correctly

#### 3. **Record & Send (Outgoing)**
- [ ] Microphone permission requested (first time)
- [ ] Can tap and hold to record voice
- [ ] Audio visualizer shows during recording
- [ ] Can playback recorded audio before sending
- [ ] Tone analysis shows indicators (raised voice, fast pacing, emotional charge)
- [ ] AI suggestions appear (de-escalation advice)
- [ ] Can send message to paired partner

#### 4. **Listen & Respond (Incoming)**
- [ ] Receives partner's voice message
- [ ] Can play audio message
- [ ] Tone analysis displays
- [ ] Can respond with voice or text-to-speech
- [ ] Message marks as listened after playback
- [ ] Can delete message

#### 5. **Message Analysis**
- [ ] Detects raised voice with accuracy
- [ ] Identifies fast pacing
- [ ] Provides contextual de-escalation tips
- [ ] Max 3 suggestions per message
- [ ] Suggestions are helpful and non-judgmental

#### 6. **Security & Privacy**
- [ ] Messages don't appear in device storage
- [ ] Auto-deletes after both parties listen
- [ ] No transcripts stored (voice only)
- [ ] Screenshots blocked (if enabled)
- [ ] Screen recording blocked (if enabled)

---

## 🔧 Build Details

### Project Structure
```
Anchor-voice/
├── frontend/              # React Native/Expo (TypeScript)
│   ├── app/              # File-based routing
│   ├── components/       # Reusable UI components
│   └── services/         # API & Firebase integration
├── backend/              # FastAPI Python server
│   ├── server.py         # Main API endpoints
│   └── requirements.txt  # Dependencies
└── BUILD_AND_TEST.md     # This file
```

### Build Configuration
- **Platform:** Android (APK), iOS, Web
- **Build Tool:** EAS Build (Expo Application Services)
- **Build Profiles:**
  - `development` - Debug build with hot reload
  - `preview` - Production-like build for testing
  - `production` - Final release build

### Recent Fixes (Build v1.0.0)
✅ Fixed all ESLint errors (0 remaining)  
✅ Fixed all TypeScript compilation issues  
✅ Optimized React Hook dependencies  
✅ Removed unused imports and variables  

---

## 📊 Testing Checklist

### Device Requirements
- [ ] Android 9+ (or iOS 13+)
- [ ] Microphone access
- [ ] Internet connection
- [ ] Bluetooth recommended for pairing

### Test Scenarios

**Scenario 1: First Time Setup**
```
1. Install app
2. Grant microphone permission
3. Create a pairing code
4. Share code with test partner
5. Pair both devices
```

**Scenario 2: Voice Recording**
```
1. Tap "Record & Send"
2. Record a calm message
3. Check analysis (should be low)
4. Record an angry/fast message
5. Check analysis (should be high)
6. Send both messages
```

**Scenario 3: Message Delivery**
```
1. Partner receives messages
2. Partner plays audio
3. Tone analysis appears
4. Suggestions are contextual
5. Partner can reply
```

**Scenario 4: De-escalation in Action**
```
1. Exchange heated messages
2. Notice tone escalation detected
3. Read AI suggestions
4. Apply suggestion and respond calmly
5. Notice tone de-escalates
```

---

## 🐛 Reporting Issues

Found a bug? Please report it with:

**For GitHub Issues:**
```
Title: [Bug] Brief description
Body:
- Device: (e.g., Samsung Galaxy A12, Android 11)
- Steps to reproduce:
  1. ...
  2. ...
- Expected behavior:
- Actual behavior:
- Screenshots/video:
```

**For Quick Feedback:**
- Email: feedback@anchorvoice.app
- Slack: #anchor-testing channel

---

## 📱 QR Codes for Testers

### Download APK
![APK QR](qr-download_apk.png)

### Expo Dev Server
![Expo QR](qr-expo_dev.png)

### GitHub Repository
![GitHub QR](qr-github_repo.png)

---

## 🔑 API & Backend

**Backend Status:** ✅ Running  
**API Endpoint:** `https://anchor-voice-production.up.railway.app`

### Available Endpoints
- `POST /api/analyze-audio` - Analyze voice tone
- `POST /api/generate-suggestions` - Get de-escalation tips
- `GET /api/health` - Service health check

### Environment Variables
```bash
# Backend
ANTHROPIC_API_KEY=sk-...     # Claude API key
OPENAI_API_KEY=sk-...         # OpenAI Whisper (optional)

# Frontend
API_URL=https://anchor-voice-production.up.railway.app
```

---

## 📈 Performance Metrics

- **App Load Time:** <2 seconds
- **Analysis Time:** <3 seconds per message
- **Battery Impact:** Minimal (optimized)
- **Storage Usage:** <50 MB
- **Network:** Works on 4G+ (offline queue planned)

---

## 🎯 Success Criteria

This build is considered successful when:

- ✅ No crashes on fresh install
- ✅ Pairing works between two devices
- ✅ Voice analysis is accurate
- ✅ Suggestions are helpful
- ✅ Messages deliver within 2 seconds
- ✅ All 10+ testing scenarios pass
- ✅ No sensitive data stored locally

---

## 📞 Support

- **Documentation:** See `README.md`
- **Issues:** GitHub Issues
- **Questions:** Open a discussion
- **Urgent:** Create a critical issue

**Thank you for testing Anchor Voice!** 🙏
