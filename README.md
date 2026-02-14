# 🎤 Anchor Voice - Quick Start

> De-escalation support for heated conversations. Real-time audio analysis + AI-powered suggestions.

## 🚀 Quick Setup (5 minutes)

### Prerequisites
- **Node.js** 16+ and **Python** 3.9+
- **Git** installed
- API keys: `ANTHROPIC_API_KEY` (get free from [Claude](https://console.anthropic.com))

### 1️⃣ Clone & Install

```bash
git clone https://github.com/deejay132435/Anchor-voice.git
cd Anchor-voice

# Backend setup
cd backend
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install
```

### 2️⃣ Configure Environment

**Backend** (create `backend/.env`):
```
ANTHROPIC_API_KEY=your_claude_api_key_here
```

**Frontend** (create `frontend/.env`):
```
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

### 3️⃣ Run the App

**Terminal 1 - Backend:**
```bash
cd backend
uvicorn server:app --reload
# Backend runs on http://localhost:8001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
# Scan QR code with Expo Go app (iOS/Android)
```

### 4️⃣ Test It
- **Outgoing**: Tap microphone → Record voice → Get analysis + suggestions
- **Incoming**: Select audio file → Get calming message + response ideas
- **Share**: Use system share sheet to send to WhatsApp, email, etc.

---

## 📖 Full Documentation

- **[README_ANCHOR.md](README_ANCHOR.md)** - Complete technical guide
- **[TESTER_GUIDE.md](TESTER_GUIDE.md)** - Testing checklist
- **[QR_CODE_INFO.md](QR_CODE_INFO.md)** - QR code & deep linking info

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend won't start | Check `ANTHROPIC_API_KEY` is set |
| App won't load | Make sure backend is running on port 8001 |
| No suggestions | Verify API key has access to Claude |
| Audio not recording | Grant microphone permissions on device |

## 🎯 Features

✅ Record & analyze your voice (raised voice, fast pacing, emotion)  
✅ Get AI-powered de-escalation suggestions  
✅ Analyze received audio messages  
✅ Zero data storage - complete privacy  
✅ Share recordings via WhatsApp, email, etc.  

---

## 📋 For Developers

See [README_ANCHOR.md](README_ANCHOR.md) for:
- Detailed architecture
- API endpoint documentation
- Advanced configuration
- Performance optimization
- Known limitations

---
