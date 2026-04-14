# Anchor - Voice De-escalation Mobile App

## Overview
Anchor is a voice-first mobile app designed to help users maintain self-control and de-escalation during high-conflict conversations. The app focuses exclusively on the user's own regulation—no judging, diagnosing, or monitoring of others.

## Key Features

### ✅ Outgoing Voice Flow
1. **Record Message**: Tap to start/stop recording with visual timer
2. **Automatic Analysis**: AI analyzes volume, pacing, and pauses
3. **Neutral Insights**: Shows max 2-3 insights (e.g., "Raised voice detected")
4. **Optional Suggestions**: Get AI-generated de-escalation phrases
5. **Share Control**: Send via system share sheet to WhatsApp, SMS, etc.

### ✅ Incoming Voice Flow
1. **Import Audio**: Select received voice message
2. **Preparation Cue**: Single calming message (e.g., "You've got this")
3. **Response Approach**: Recommended strategy based on analysis
4. **Response Examples**: 3 calm, neutral response options

## Technology Stack

### Frontend (Mobile)
- **Framework**: Expo / React Native
- **Navigation**: expo-router (file-based routing)
- **Audio**: expo-av (recording/playback)
- **Sharing**: expo-sharing (system share sheet)
- **Styling**: React Native StyleSheet

### Backend (API)
- **Framework**: FastAPI (Python)
- **AI Integration**: Claude Sonnet 4.5 (via emergentintegrations)
- **Database**: MongoDB (configured but not used - no storage per requirements)

## Architecture

### No Storage Policy
- ✅ All audio processed in-memory
- ✅ No recordings saved to database
- ✅ Analysis results discarded after display
- ✅ Maximum privacy and user control

### AI Analysis
- **Speech Analysis**: Heuristic analysis of audio properties (volume, pacing, pauses)
- **Suggestions**: Claude AI generates 3 contextual, neutral de-escalation phrases
- **Fallback**: Default suggestions if AI unavailable

## API Endpoints

### POST /api/analyze-audio
Analyzes audio for volume, pacing, and emotional indicators.

**Request:**
```json
{
  "audio_base64": "base64_encoded_audio_data",
  "duration_seconds": 5.0
}
```

**Response:**
```json
{
  "raised_voice": false,
  "fast_pacing": false,
  "emotional_charge": false,
  "insights": ["Message tone appears calm"]
}
```

### POST /api/generate-suggestions
Generates 3 de-escalation suggestions using Claude AI.

**Request:**
```json
{
  "analysis_results": {
    "raised_voice": true,
    "fast_pacing": true,
    "emotional_charge": true
  },
  "message_type": "outgoing"
}
```

**Response:**
```json
{
  "suggestions": [
    "I need to take a break from this conversation right now.",
    "I'm going to step away for a few minutes so we can both cool down.",
    "Let's pause this discussion and come back to it when we're both calmer."
  ]
}
```

## Setup & Installation

### Prerequisites
- Node.js 18+ and Yarn
- Python 3.11+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Xcode) or Android Emulator, or physical device with Expo Go

### Backend Setup

**1. Install dependencies:**
```bash
cd backend
pip install -r requirements.txt
```

**2. Configure environment variables:**
Create a `.env` file in the `backend/` directory:
```bash
# Required for Claude AI suggestions
ANTHROPIC_API_KEY=your_anthropic_key_here

# Optional for transcription
OPENAI_API_KEY=your_openai_key_here

# Optional: Configure CORS (defaults to allow all)
# CORS_ALLOWED_ORIGINS=https://yourfrontend.com,https://otherapp.com
```

**3. Run the backend:**
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Backend will be available at `http://localhost:8001`

### Frontend Setup

**1. Install dependencies:**
```bash
cd frontend
yarn install
```

**2. Configure backend URL:**

**Option A: Via environment variable (recommended for production):**
```bash
export EXPO_PUBLIC_BACKEND_URL=https://your-backend-url.com
yarn start
```

**Option B: Via app.json (for development):**
Edit `frontend/app.json` and set `expo.extra.apiUrl`:
```json
{
  "expo": {
    "extra": {
      "apiUrl": "http://192.168.1.100:8001"
    }
  }
}
```

**3. Run the frontend:**
```bash
yarn start
```

Choose platform:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Press `w` for web

### Running Tests

**Backend tests:**
```bash
cd backend
python -m pytest ../backend_test.py -v
```

Or without pytest (uses requests directly):
```bash
cd backend
python ../backend_test.py
```

## Known Limitations & Issues

### Audio Analysis
- **Librosa dependency**: Large audio files (>50MB) may exceed memory limits
- **Transcription**: Requires OpenAI API key; falls back to heuristic analysis if unavailable
- **Mobile formats**: m4a/aac audio requires ffmpeg for proper conversion (installed with pydub)

### Suggestions
- **Claude fallback**: If Claude API is unavailable or rate-limited, the app returns default suggestions
- **Exactly 3 suggestions**: Always returns 3 de-escalation phrases for consistency
- **No personalization**: Suggestions are context-aware but not personalized to user history

### Privacy & Data
- ✅ **No storage**: All audio is processed in-memory and discarded immediately
- ✅ **No transcripts**: Audio is transcribed only for escalation detection, transcripts are not returned to client
- ⚠️ **CORS in development**: Backend allows all origins by default for development; restrict `CORS_ALLOWED_ORIGINS` in production

### Performance
- **Network timeout**: 30 seconds with automatic retry (up to 2 retries)
- **Audio size limit**: Frontend validates max 5MB audio files
- **Emotional detection**: Accuracy varies by audio quality and microphone

## Configuration

### Backend Environment Variables
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | - | Claude API key for generating suggestions |
| `OPENAI_API_KEY` | No | - | OpenAI API key for Whisper transcription |
| `CORS_ALLOWED_ORIGINS` | No | * | Comma-separated list of allowed origins (set to specific domain in production) |
| `MONGO_URL` | No | - | MongoDB URL (not used in MVP, reserved for future) |

### Frontend Environment Variables
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EXPO_PUBLIC_BACKEND_URL` | No | app.json/localhost:8001 | Backend API URL |

## API Endpoints

All endpoints are prefixed with `/api`

## Troubleshooting

### "Cannot reach server" error on frontend
- Verify backend is running: `curl http://localhost:8001/api/health`
- Check `EXPO_PUBLIC_BACKEND_URL` is set correctly
- For physical device: use LAN IP instead of localhost (e.g., `http://192.168.1.100:8001`)
- Check firewall allows port 8001

### Audio analysis returns "Message tone appears calm" for all files
- Ensure librosa is installed: `pip show librosa`
- Check audio file format (mobile m4a/aac formats require pydub)
- Verify file is not corrupted

### Suggestions are always default phrases
- Check `ANTHROPIC_API_KEY` is set and valid
- Check API rate limits (Claude has usage limits)
- Verify internet connection for API calls

### Frontend won't compile
- Clear cache: `rm -rf node_modules && yarn install`
- Clear Expo cache: `expo start --clear`
- Check Node version: `node --version` (should be 18+)

### Backend won't start
- Check Python version: `python --version` (should be 3.11+)
- Install dependencies: `pip install -r requirements.txt`
- Check port 8001 is not in use: `lsof -i :8001`

## Performance Optimization

### For Production
1. **Backend**: Set `CORS_ALLOWED_ORIGINS` to specific frontend domains
2. **Frontend**: Set `EXPO_PUBLIC_BACKEND_URL` to production backend
3. **Build**: Use `eas build --profile production` for optimized build
4. **Scaling**: Consider Docker containerization for backend deployment

### For Development
1. Use `--reload` flag on uvicorn for auto-restart on changes
2. Use `yarn start --clear` to clear Expo cache between builds
3. Monitor network requests: Use Chrome DevTools on web, or React Native Debugger for mobile

## Testing Results

### Backend Testing ✅
- **Audio Analysis API**: 100% working - tested with various file sizes and durations
- **Suggestions API**: 100% working - Claude integration generates contextual suggestions
- **Error Handling**: Proper validation and fallback mechanisms
- **Overall Pass Rate**: 93.8% (15/16 tests passed)

### Key Features Status
✅ Voice recording with visual feedback
✅ Audio analysis (volume, pacing, pauses)
✅ AI-powered suggestions (Claude Sonnet 4.5)
✅ System share integration
✅ Document picker for incoming audio
✅ Playback functionality
✅ Cross-platform support (iOS + Android)
✅ Professional mobile UI
✅ No storage - complete privacy
✅ Deep linking from other apps (WhatsApp, Messenger, etc.)

## Testing the App

### Option 1: Scan QR Code (Easiest for Testers) 📱

**QR Code:** `qr-code.png` (in project root)

**Steps:**
1. Install Expo Go app:
   - iOS: https://apps.apple.com/app/expo-go/id982107779
   - Android: https://play.google.com/store/apps/details?id=host.exp.exponent
2. Scan QR code with phone camera
3. Tap notification to open in Expo Go
4. Follow [TESTER_GUIDE.md](TESTER_GUIDE.md) for testing checklist

**Important:** Make sure backend is running before testing!

### Option 2: Manual Expo Start (Development)

**Frontend:**
```bash
cd frontend
yarn install
yarn start
```

Then select platform:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Press `w` for web

### Option 3: Build Standalone APK/IPA

**Android:**
```bash
cd frontend
eas build --profile preview --platform android
```

**iOS:**
```bash
cd frontend
eas build --profile preview --platform ios
```

## Deep Linking from Other Apps

Anchor Voice is registered to receive audio files from other platforms:

**Android:** 
- Share audio from WhatsApp, Messenger, Gmail, etc.
- Tap "Share" → Select "Anchor Voice"
- Audio loads automatically in Incoming Message flow

**iOS:**
- Build standalone app first (Expo Go doesn't support deep linking)
- Share audio from any app
- Select "Anchor Voice" from share sheet
- Audio loads and analyzes

**Use Cases:**
- Analyze voice messages from conflict situations
- Get response suggestions before replying
- Reflect on received communication
- Practice de-escalation responses

## QR Code & Distribution

See [QR_CODE_INFO.md](QR_CODE_INFO.md) for:
- ✅ QR code location and generation
- ✅ How to share with testers (email, Slack, print)
- ✅ Deep linking configuration details
- ✅ Testing troubleshooting guide

## Design Principles

1. **User Always in Control**: No forced actions, no lockouts
2. **Privacy First**: No storage, no monitoring, no surveillance
3. **Neutral & Non-Judgmental**: Focus on self-control, not fixing others
4. **Voice-Only**: No text transcripts or written summaries
5. **Simple & Clear**: Maximum 2-3 insights at a time
6. **Accessible**: Fully usable by one person alone

## Future Enhancements (Not in MVP)
- Shared Mode (optional partner invite)
- Pattern tracking over time
- Enhanced audio analysis with librosa
- Additional AI model options

## Support

For issues or questions, please refer to the test_result.md file for detailed testing logs and known issues.

---

**Built with privacy, control, and de-escalation in mind.**
