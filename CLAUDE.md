claude
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anchor is a voice-first mobile app for de-escalation support during high-conflict conversations. It provides real-time audio analysis and AI-powered suggestions without storing any data.

**Core principles:** User control, privacy-first (no storage), neutral/non-judgmental, voice-only (no transcripts), simple (max 2-3 insights).

## Architecture

```
frontend/          # React Native/Expo mobile app (TypeScript)
├── app/           # File-based routing (Expo Router)
│   ├── index.tsx      # Home screen
│   ├── outgoing.tsx   # Voice recording & analysis flow
│   └── incoming.tsx   # Received message processing flow
├── components/    # Reusable UI components
└── services/      # API service layer

backend/           # FastAPI Python server
└── server.py      # API endpoints
```

## Common Commands

### Frontend (run from `frontend/` directory)
```bash
yarn install              # Install dependencies
yarn start                # Start Expo dev server
yarn android              # Run on Android emulator
yarn ios                  # Run on iOS simulator
yarn lint                 # Run ESLint
```

### Backend (run from `backend/` directory)
```bash
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
pytest                    # Run backend tests
```

### Building (EAS)
```bash
eas build --profile development --platform android   # Dev build
eas build --profile preview --platform android       # Preview APK
eas build --profile production --platform android    # Production build
```

## API Endpoints

- **POST `/api/analyze-audio`**: Analyzes base64 audio data, returns `raised_voice`, `fast_pacing`, `emotional_charge`, `insights` (max 3)
- **POST `/api/generate-suggestions`**: Takes analysis results + message type (outgoing/incoming), returns 3 de-escalation suggestions via Claude Sonnet

## Key Dependencies

**Frontend:** React Native 0.81.5, Expo SDK 54, expo-av (audio), expo-router (navigation), expo-sharing
**Backend:** FastAPI 0.110.1, anthropic (Claude API), librosa (audio analysis), openai (Whisper transcription)

## Environment Variables

**Backend:**
- `ANTHROPIC_API_KEY`: Claude API key for generating suggestions
- `OPENAI_API_KEY` (optional): OpenAI key for Whisper transcription

**Frontend:**
- API URL configured in `frontend/app.json` under `expo.extra.apiUrl`

## Testing

Backend test suite in `backend_test.py` covers `/api/analyze-audio` and `/api/generate-suggestions` endpoints. Run with `pytest` from project root.
