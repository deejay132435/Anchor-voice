# Anchor Voice - Beta Tester Guide

## Download & Install

### Android APK (Latest Build)
**Download link:** https://expo.dev/accounts/deejayjustin/projects/anchor-voice/builds/af452e91-1e8b-4a32-a6e8-4075871fd791

1. Open the link above on your Android phone
2. Tap **Install** when prompted
3. If blocked: Settings > Security > Allow installation from unknown sources
4. Open the app and grant microphone permissions

> New builds will be posted here. Check back for updates.

---

## What is Anchor?

Anchor is a voice-first app for de-escalation support during high-conflict conversations. It analyzes tone, detects escalation, and suggests calmer responses — all without storing any data.

**Key features in this build:**
- Voice recording with real-time tone analysis
- Type-to-speech (TTS) message composition with spell check
- Partner pairing via 6-digit code
- End-to-end encrypted voice messaging
- Multi-language support (16 languages)
- Auto-delete after both parties listen
- Screenshot/screen recording protection

---

## Testing Checklist

### 1. Home Screen
- [ ] App loads without errors
- [ ] "Record & Send" button visible
- [ ] "Listen & Respond" button visible
- [ ] "Connect with Partner" button visible (or shows paired status)

### 2. Pairing Flow
- [ ] Tap "Connect with Partner"
- [ ] Consent disclaimer modal appears — must scroll to bottom to enable "I Agree"
- [ ] Tap "I Agree" after reading
- [ ] **Create Code tab:** Generates a 6-character code
- [ ] Code can be copied to clipboard
- [ ] **Enter Code tab:** Can enter partner's code
- [ ] Both devices show "Connected!" after pairing
- [ ] Re-pairing works (unpair first, then pair again)

### 3. Outgoing Message (Record Voice)
- [ ] Tap "Record & Send" > "Record Voice"
- [ ] Recording starts, timer counts up
- [ ] Stop recording — analysis runs automatically
- [ ] Insights appear (tone, emotion, severity)
- [ ] Suggestions appear (3 de-escalation phrases)
- [ ] Can play back recording
- [ ] "Send to Partner" button works (if paired)
- [ ] "Send via..." opens share sheet
- [ ] "Start Over" resets everything

### 4. Outgoing Message (Type Message / TTS)
- [ ] Tap "Record & Send" > "Type Message"
- [ ] Language selector scrolls horizontally
- [ ] Can switch languages (English, Spanish, French, etc.)
- [ ] Type a message in the text box
- [ ] "Fix Spelling" button corrects grammar/spelling
- [ ] Correction shows with Accept/Keep Original options
- [ ] "Generate Voice" creates audio from text
- [ ] Generated voice plays back correctly
- [ ] **Can send TTS message to partner** (this was previously broken)

### 5. Incoming Messages (Listen & Respond)
- [ ] Tap "Listen & Respond"
- [ ] Shows "No new messages" if inbox is empty
- [ ] Refresh button works
- [ ] When partner sends a message, it appears as a card
- [ ] Card shows duration, severity badge, emotion badge
- [ ] Tapping a message downloads and shows analysis first
- [ ] "Listen now" button plays the audio
- [ ] After listening: "Prepare a response" option appears
- [ ] Message auto-deletes after both parties listen
- [ ] Privacy notice shown after listening

### 6. End-to-End Encryption
- [ ] New pairs exchange encryption keys automatically
- [ ] Messages upload as `.enc` files (check Firebase Storage if possible)
- [ ] Receiver can decrypt and play messages normally
- [ ] No plaintext audio on Firebase Storage

### 7. Screen Protection
- [ ] Cannot take screenshots on incoming/outgoing screens
- [ ] Screen recording is blocked on those screens
- [ ] Protection lifts when navigating back to home

### 8. Error Handling
- [ ] Turn off WiFi, try to record & send — error message appears
- [ ] Very short recording (< 1 sec) — still works
- [ ] Analysis failure — can still listen to message
- [ ] TTS with empty text — button is disabled

---

## Test Scenarios

### Scenario A: Full Send & Receive Cycle
1. Device A: Pair with Device B
2. Device A: Record a message > Send to Partner
3. Device B: Open "Listen & Respond" > See message card
4. Device B: View analysis > Listen > Respond
5. Device A: Receive response

**Expected:** Full round-trip works, messages auto-delete after both listen.

### Scenario B: TTS Multi-Language
1. Select Spanish from language picker
2. Type "Necesito un momento para pensar"
3. Tap "Fix Spelling" — should validate in Spanish
4. Tap "Generate Voice" — should speak in Spanish
5. Send to partner

**Expected:** TTS generates correct Spanish audio.

### Scenario C: De-escalation Practice
1. Record yourself speaking angrily
2. Review tone analysis and severity
3. Read the suggested calmer phrases
4. Re-record using a suggestion
5. Compare insights between the two recordings

**Expected:** Second recording shows lower severity.

---

## Known Limitations (Beta)
- iOS build not yet available (Android only)
- Subscription/paywall is disabled for testing
- Push notifications require Expo push token setup
- Very long recordings (>5 min) may be slow to analyze

---

## Reporting Issues

When reporting a bug, include:
1. **What happened** (screenshot if possible)
2. **Steps to reproduce**
3. **Device model & Android version**
4. **Network type** (WiFi/4G/5G)

Report issues at: https://github.com/anthropics/anchor-voice/issues
Or message the developer directly.

---

## Privacy Notice
- No audio stored — encrypted in transit, auto-deleted after listening
- No personal data collected — no names, emails, or accounts
- No transcripts saved — analysis is real-time and discarded
- End-to-end encrypted — only you and your partner can hear messages
- Screenshot/recording blocked on sensitive screens

---

**Thank you for testing Anchor! Your feedback shapes the final product.**
