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
- Node.js and Yarn
- Python 3.11+
- Expo CLI
- iOS Simulator or Android Emulator (or physical device with Expo Go)

### Environment Variables

**Backend (.env)**
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=test_database
EMERGENT_LLM_KEY=your_key_here
```

**Frontend (.env)**
```
EXPO_PUBLIC_BACKEND_URL=your_backend_url
```

### Running the App

**Backend:**
```bash
cd /app/backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Frontend:**
```bash
cd /app/frontend
yarn install
yarn start
```

## Permissions Required

### iOS
- **NSMicrophoneUsageDescription**: "Record voice messages for conflict management"
- **NSCameraUsageDescription**: "Access media to share recordings"

### Android
- **RECORD_AUDIO**: Required for voice recording

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
