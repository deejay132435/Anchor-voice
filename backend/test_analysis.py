#!/usr/bin/env python3
"""
Comprehensive accuracy tests for Anchor's analysis logic.
Tests word detection, emotion classification, severity, and escalation detection.
"""
import sys
sys.path.insert(0, '.')

from server import (
    detect_escalation_words,
    detect_positive_words,
    classify_emotion_from_audio,
)

passed = 0
failed = 0

def test(name, condition, details=""):
    global passed, failed
    if condition:
        print(f"  PASS  {name}")
        passed += 1
    else:
        print(f"  FAIL  {name}  -- {details}")
        failed += 1


def run_full_analysis(text, features=None):
    """Simulate the full analysis pipeline for a given text and audio features."""
    transcription = text
    escalation_words = detect_escalation_words(text) if text else {}
    positive_words = detect_positive_words(text) if text else {}

    has_positive = len(positive_words) > 0
    has_affection = "affection" in positive_words
    has_excitement = "excitement" in positive_words
    has_gratitude = "gratitude" in positive_words
    has_celebration = "celebration" in positive_words

    contains_profanity = "profanity" in escalation_words
    contains_labelling = "labelling" in escalation_words
    contains_blame = "blame_language" in escalation_words
    contains_absolutes = "absolutes" in escalation_words
    contains_threats = "threats" in escalation_words
    contains_dismissive = "dismissive" in escalation_words

    if features:
        raised_voice = features.get("max_rms", 0) > 0.25 and features.get("mean_rms", 0) > 0.14
        fast_pacing = features.get("speech_rate", 0) > 5.5
        high_volume_variance = features.get("rms_variance", 0) > 0.005
        high_spectral_variance = features.get("spectral_variance", 0) > 900000
        high_pitch_variance = features.get("pitch_variance", 0) > 12000
        emotional_charge = sum([high_volume_variance, high_spectral_variance, high_pitch_variance]) >= 2
        emotion_result = classify_emotion_from_audio(features)
    else:
        raised_voice = False
        fast_pacing = False
        emotional_charge = False
        emotion_result = {"primary_emotion": "calm", "confidence": 0.5, "emotions": {"calm": 0.5}}

    word_escalation = any([contains_profanity, contains_labelling, contains_blame, contains_threats])
    has_any_negative = word_escalation or contains_absolutes or contains_dismissive

    # If transcription exists with no negative/positive words, override audio-only anger to calm
    if transcription and not has_any_negative and not has_positive:
        if emotion_result.get("primary_emotion") in ["angry", "frustrated", "anxious"]:
            emotion_result["primary_emotion"] = "calm"
            emotion_result["confidence"] = 0.4

    if has_positive and not word_escalation:
        if has_excitement or has_celebration:
            emotion_result["primary_emotion"] = "excited"
            emotion_result["confidence"] = 0.7
        elif has_affection:
            emotion_result["primary_emotion"] = "affectionate"
            emotion_result["confidence"] = 0.6
        elif has_gratitude:
            emotion_result["primary_emotion"] = "grateful"
            emotion_result["confidence"] = 0.5
        raised_voice = False
        emotional_charge = False
    elif word_escalation and not has_positive:
        if emotion_result.get("primary_emotion") == "calm":
            if contains_threats or contains_labelling:
                emotion_result["primary_emotion"] = "aggressive"
                emotion_result["confidence"] = 0.5
                emotional_charge = True
            elif contains_profanity and (contains_blame or raised_voice):
                emotion_result["primary_emotion"] = "frustrated"
                emotion_result["confidence"] = 0.4
                emotional_charge = True
    elif word_escalation and has_positive:
        emotion_result["primary_emotion"] = "mixed"
        emotion_result["confidence"] = 0.4

    voice_escalation = raised_voice and fast_pacing and emotional_charge
    if has_positive and not word_escalation:
        escalation_detected = False
    else:
        escalation_detected = word_escalation or voice_escalation

    audio_signal_count = sum([raised_voice, fast_pacing, emotional_charge])
    word_signal_count = sum([contains_profanity, contains_labelling, contains_blame, contains_threats])

    if has_positive and not word_escalation:
        severity_level = "none"
    elif word_signal_count == 0 and audio_signal_count == 0:
        severity_level = "low"
    elif word_signal_count >= 2 or (word_signal_count >= 1 and audio_signal_count >= 2):
        severity_level = "high"
    elif word_signal_count >= 1 or audio_signal_count >= 2:
        severity_level = "medium"
    else:
        severity_level = "low"

    return {
        "emotion": emotion_result["primary_emotion"],
        "confidence": emotion_result["confidence"],
        "escalation_detected": escalation_detected,
        "severity_level": severity_level,
        "raised_voice": raised_voice,
        "fast_pacing": fast_pacing,
        "emotional_charge": emotional_charge,
        "escalation_words": escalation_words,
        "positive_words": positive_words,
    }


# --- CALM AUDIO FEATURES (normal conversation) ---
CALM_FEATURES = {
    "mean_rms": 0.06, "max_rms": 0.15, "rms_variance": 0.001,
    "mean_zcr": 0.05, "zcr_variance": 0.005,
    "mean_spectral": 2000, "spectral_variance": 200000,
    "mean_pitch": 180, "pitch_variance": 3000, "pitch_range": 80,
    "speech_rate": 3.5, "mfcc_energy": -5.0, "mfcc_variance": 30,
}

# --- LOUD/ANGRY AUDIO FEATURES ---
ANGRY_FEATURES = {
    "mean_rms": 0.22, "max_rms": 0.40, "rms_variance": 0.008,
    "mean_zcr": 0.12, "zcr_variance": 0.02,
    "mean_spectral": 4000, "spectral_variance": 1200000,
    "mean_pitch": 260, "pitch_variance": 18000, "pitch_range": 300,
    "speech_rate": 6.0, "mfcc_energy": -2.0, "mfcc_variance": 90,
}

# --- MODERATE FEATURES (slightly animated but not angry) ---
MODERATE_FEATURES = {
    "mean_rms": 0.10, "max_rms": 0.22, "rms_variance": 0.003,
    "mean_zcr": 0.07, "zcr_variance": 0.008,
    "mean_spectral": 2500, "spectral_variance": 400000,
    "mean_pitch": 200, "pitch_variance": 5000, "pitch_range": 120,
    "speech_rate": 4.5, "mfcc_energy": -4.0, "mfcc_variance": 45,
}

# --- EXCITED FEATURES (loud + fast but positive) ---
EXCITED_FEATURES = {
    "mean_rms": 0.18, "max_rms": 0.35, "rms_variance": 0.006,
    "mean_zcr": 0.10, "zcr_variance": 0.015,
    "mean_spectral": 3500, "spectral_variance": 800000,
    "mean_pitch": 240, "pitch_variance": 10000, "pitch_range": 200,
    "speech_rate": 5.8, "mfcc_energy": -3.0, "mfcc_variance": 60,
}

# ============================================================
print("\n=== 1. WORD DETECTION: Escalation Patterns ===")
# ============================================================

r = detect_escalation_words("you always do this and you never listen")
test("Detects 'you always'", "blame_language" in r)
test("Detects 'always' absolute", "absolutes" in r)

r = detect_escalation_words("shut up you idiot, I don't care")
test("Detects labelling (idiot)", "labelling" in r)
test("Detects dismissive (shut up)", "dismissive" in r)

r = detect_escalation_words("f*** you, you piece of s***")
test("Detects censored profanity (f***)", "profanity" in r)

r = detect_escalation_words("watch out or else you'll regret this")
test("Detects threats", "threats" in r)

r = detect_escalation_words("I'd like to discuss this when you're free")
test("No escalation in calm text", len(r) == 0, f"Got: {r}")

r = detect_escalation_words("Can we talk about what happened?")
test("No escalation in neutral question", len(r) == 0, f"Got: {r}")

r = detect_escalation_words("I feel hurt when plans change last minute")
test("No escalation in I-statement", len(r) == 0, f"Got: {r}")


# ============================================================
print("\n=== 2. WORD DETECTION: Positive Patterns ===")
# ============================================================

r = detect_positive_words("I got the job! I'm so excited!")
test("Detects excitement", "excitement" in r)

r = detect_positive_words("I love you, you're amazing")
test("Detects affection", "affection" in r)

r = detect_positive_words("Thank you so much, I really appreciate it")
test("Detects gratitude", "gratitude" in r)

r = detect_positive_words("Congratulations! Well done!")
test("Detects celebration", "celebration" in r)

r = detect_positive_words("I got the job! I love you!")
test("Detects both excitement + affection", "excitement" in r and "affection" in r)

r = detect_positive_words("We need to talk about the budget")
test("No positives in neutral text", len(r) == 0, f"Got: {r}")

r = detect_positive_words("I'm angry and frustrated with you")
test("No positives in negative text", len(r) == 0, f"Got: {r}")


# ============================================================
print("\n=== 3. EMOTION CLASSIFIER (audio features only) ===")
# ============================================================

r = classify_emotion_from_audio(CALM_FEATURES)
test("Calm audio -> calm emotion", r["primary_emotion"] == "calm", f"Got: {r['primary_emotion']}")

r = classify_emotion_from_audio(ANGRY_FEATURES)
test("Angry audio -> angry emotion", r["primary_emotion"] == "angry", f"Got: {r['primary_emotion']}")

r = classify_emotion_from_audio(MODERATE_FEATURES)
test("Moderate audio -> calm or frustrated (not angry)", r["primary_emotion"] in ["calm", "frustrated"], f"Got: {r['primary_emotion']}")

r = classify_emotion_from_audio(None)
test("None features -> neutral", r["primary_emotion"] == "neutral")


# ============================================================
print("\n=== 4. FULL ANALYSIS: Calm Scenarios ===")
# ============================================================

r = run_full_analysis("I'd like to talk about this calmly", CALM_FEATURES)
test("Calm text + calm audio = calm/low", r["emotion"] == "calm" and r["severity_level"] == "low", f"Got: {r['emotion']}/{r['severity_level']}")
test("Calm text + calm audio = no escalation", not r["escalation_detected"])

r = run_full_analysis("Can we find a time to discuss?", CALM_FEATURES)
test("Neutral question = calm/low", r["emotion"] == "calm" and r["severity_level"] == "low", f"Got: {r['emotion']}/{r['severity_level']}")

r = run_full_analysis("I understand how you feel", CALM_FEATURES)
test("Empathetic text = calm/low", r["severity_level"] == "low")

r = run_full_analysis("", CALM_FEATURES)
test("No transcription + calm audio = calm/low", r["emotion"] == "calm" and r["severity_level"] == "low")


# ============================================================
print("\n=== 5. FULL ANALYSIS: Excited/Positive Scenarios ===")
# ============================================================

r = run_full_analysis("I got the job! I'm so excited! I love you!", EXCITED_FEATURES)
test("Excited text + loud audio = excited (NOT angry)", r["emotion"] == "excited", f"Got: {r['emotion']}")
test("Excited text = no escalation", not r["escalation_detected"])
test("Excited text = severity none", r["severity_level"] == "none", f"Got: {r['severity_level']}")

r = run_full_analysis("Thank you so much, I really appreciate everything", CALM_FEATURES)
test("Grateful text = grateful", r["emotion"] == "grateful", f"Got: {r['emotion']}")
test("Grateful text = no escalation", not r["escalation_detected"])

r = run_full_analysis("Congratulations! You did it! So proud of you!", EXCITED_FEATURES)
test("Celebratory text = excited", r["emotion"] == "excited", f"Got: {r['emotion']}")
test("Celebratory text = severity none", r["severity_level"] == "none")

r = run_full_analysis("I love you, you're the best", CALM_FEATURES)
test("Affection text = affectionate", r["emotion"] == "affectionate", f"Got: {r['emotion']}")


# ============================================================
print("\n=== 6. FULL ANALYSIS: Angry/Escalating Scenarios ===")
# ============================================================

r = run_full_analysis("you always do this, you never listen, it's your fault", ANGRY_FEATURES)
test("Blame + angry audio = escalation detected", r["escalation_detected"])
test("Blame + angry audio = severity high or medium", r["severity_level"] in ["high", "medium"], f"Got: {r['severity_level']}")

r = run_full_analysis("shut up you idiot, or else you'll regret it", ANGRY_FEATURES)
test("Threats + labelling = escalation", r["escalation_detected"])
test("Threats + labelling = high severity", r["severity_level"] == "high", f"Got: {r['severity_level']}")
test("Threats + labelling = aggressive tone", r["emotion"] == "aggressive" or r["emotion"] == "angry", f"Got: {r['emotion']}")

r = run_full_analysis("you're such a stupid idiot loser", MODERATE_FEATURES)
test("Name-calling = escalation", r["escalation_detected"])
test("Name-calling = aggressive", r["emotion"] == "aggressive", f"Got: {r['emotion']}")


# ============================================================
print("\n=== 7. FULL ANALYSIS: Tricky Edge Cases ===")
# ============================================================

# Profanity in calm voice (venting, not necessarily escalating)
r = run_full_analysis("fuck, this is ridiculous", CALM_FEATURES)
test("Profanity only + calm audio = escalation (word signal)", r["escalation_detected"])
test("Profanity only + calm audio = stays calm (no override without blame)", r["emotion"] == "calm", f"Got: {r['emotion']}")
test("Profanity only + calm audio = medium severity", r["severity_level"] == "medium", f"Got: {r['severity_level']}")

# Profanity + blame in calm voice = should escalate
r = run_full_analysis("fuck you, you always ruin everything, it's your fault", CALM_FEATURES)
test("Profanity + blame + calm audio = frustrated", r["emotion"] == "frustrated", f"Got: {r['emotion']}")
test("Profanity + blame = high severity", r["severity_level"] == "high", f"Got: {r['severity_level']}")

# Just absolutes (weaker signal — no "you always" which is blame)
r = run_full_analysis("it always happens, every time", CALM_FEATURES)
test("Absolutes only = no escalation (weak signal)", not r["escalation_detected"], f"Got: escalation={r['escalation_detected']}, words={r['escalation_words']}")
test("Absolutes only = low severity", r["severity_level"] == "low", f"Got: {r['severity_level']}")

# Dismissive only
r = run_full_analysis("whatever, who cares", CALM_FEATURES)
test("Dismissive only = no escalation (weak signal)", not r["escalation_detected"])
test("Dismissive only = low severity", r["severity_level"] == "low")

# Mixed: positive + negative
r = run_full_analysis("I love you but you're such an idiot sometimes", CALM_FEATURES)
test("Positive + labelling = mixed", r["emotion"] == "mixed", f"Got: {r['emotion']}")
test("Mixed signals = escalation detected (has word escalation)", r["escalation_detected"])

# Loud audio but calm words (emphatic but not angry)
r = run_full_analysis("I really want us to work this out together", ANGRY_FEATURES)
test("Calm text + loud audio = calm (words override audio)", r["emotion"] == "calm", f"Got: {r['emotion']}")
test("Calm text + loud audio = medium severity (intensity still notable)", r["severity_level"] == "medium", f"Got: {r['severity_level']}")

# No transcription, just angry audio
r = run_full_analysis(None, ANGRY_FEATURES)
test("No text + angry audio = angry emotion from classifier", r["emotion"] == "angry", f"Got: {r['emotion']}")
test("No text + angry audio = escalation only if all 3 voice signals", r["escalation_detected"] == (r["raised_voice"] and r["fast_pacing"] and r["emotional_charge"]))

# Whisper-censored profanity
r = detect_escalation_words("What the f*** is wrong with you")
test("Whisper f*** detected", "profanity" in r, f"Got: {r}")

r = detect_escalation_words("That's such bull s***")
test("Whisper s*** detected", "profanity" in r, f"Got: {r}")


# ============================================================
print("\n=== 8. THRESHOLD SANITY: Audio Signal Detection ===")
# ============================================================

# Calm audio should trigger NOTHING
r = run_full_analysis("", CALM_FEATURES)
test("Calm audio: no raised voice", not r["raised_voice"])
test("Calm audio: no fast pacing", not r["fast_pacing"])
test("Calm audio: no emotional charge", not r["emotional_charge"])

# Moderate audio should trigger NOTHING (the whole point of the fix)
r = run_full_analysis("", MODERATE_FEATURES)
test("Moderate audio: no raised voice", not r["raised_voice"], f"max_rms={MODERATE_FEATURES['max_rms']}, mean_rms={MODERATE_FEATURES['mean_rms']}")
test("Moderate audio: no fast pacing", not r["fast_pacing"])
test("Moderate audio: no emotional charge", not r["emotional_charge"])

# Angry audio should trigger signals
r = run_full_analysis("", ANGRY_FEATURES)
test("Angry audio: raised voice", r["raised_voice"])
test("Angry audio: fast pacing", r["fast_pacing"])
test("Angry audio: emotional charge", r["emotional_charge"])


# ============================================================
print(f"\n{'='*50}")
print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed} tests")
print(f"{'='*50}")
if failed > 0:
    sys.exit(1)
