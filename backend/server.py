import asyncio
import base64
import io
import os
import re
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional

import numpy as np
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI(title="Anchor API", description="Voice de-escalation analysis API")

# Add CORS middleware for frontend
# Configure CORS based on environment
allowed_origins = os.environ.get("CORS_ALLOWED_ORIGINS", "*").split(",")
allow_all = "*" in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if not allow_all else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

api = APIRouter(prefix="/api")

# Try to import librosa for audio analysis
try:
    import librosa
    import soundfile as sf
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False

# Try to import pydub for audio format conversion (m4a/aac -> wav)
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False

# Try to import OpenAI for Whisper transcription
try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

# Try to import anthropic for Claude API (direct SDK)
try:
    import anthropic
    CLAUDE_AVAILABLE = True
except ImportError:
    CLAUDE_AVAILABLE = False


# Escalation patterns - words/phrases that tend to escalate conflicts
ESCALATION_PATTERNS = {
    "profanity": [
        # Full words
        r"\b(fuck|shit|damn|hell|ass|bitch|bastard|crap)\w*\b",
        # Censored versions Whisper often returns: f***, s***, f-word, etc.
        r"\b[fF]\*+\w*",
        r"\b[sS]\*+\w*",
        r"\b[bB]\*+\w*",
        r"\bf[\-\*]+(ing|ed|er|ck)?\b",
        r"\bs[\-\*]+(ing|ed|er|t)?\b",
        # Common Whisper euphemisms
        r"\b(f-word|s-word|freaking|effing|frickin|freakin)\b",
    ],
    "absolutes": [
        r"\b(always|never|every\s*time|constantly)\b",
    ],
    "blame_language": [
        r"\b(you\s+always|you\s+never|your\s+fault|you\s+made\s+me|because\s+of\s+you)\b",
    ],
    "labelling": [
        r"\b(idiot|stupid|dumb|crazy|insane|pathetic|loser|worthless)\b",
    ],
    "threats": [
        r"\b(or\s+else|you(?:'?ll)?\s+regret|watch\s+(out|yourself)|i(?:'?ll)?\s+make\s+you)\b",
    ],
    "dismissive": [
        r"\b(whatever|don't\s+care|shut\s+up|who\s+cares|so\s+what)\b",
    ],
    "interrupting": [
        r"\b(let\s+me\s+finish|stop\s+interrupting|listen\s+to\s+me)\b",
    ],
}

# Positive patterns - words/phrases that indicate excitement, happiness, affection
# Using non-capturing groups (?:...) for inner groups so re.findall returns clean strings
POSITIVE_PATTERNS = {
    "affection": [
        r"\b(?:i\s+love\s+you|love\s+you|i\s+miss\s+you|miss\s+you|you(?:'?re)?\s+amazing|you(?:'?re)?\s+the\s+best)\b",
        r"\b(?:so\s+proud|proud\s+of\s+you|care\s+about\s+you|mean\s+so\s+much)\b",
        r"\b(?:i\s+hope\s+you(?:'?re)?\s+(?:doing\s+)?(?:ok|okay|well|good|alright))\b",
        r"\b(?:thinking\s+(?:of|about)\s+you|be\s+safe|take\s+care|stay\s+safe)\b",
    ],
    "excitement": [
        r"\b(?:i\s+got\s+(?:the|a)|got\s+the\s+job|got\s+accepted|got\s+in|we\s+did\s+it|i\s+did\s+it)\b",
        r"\b(?:so\s+excited|so\s+happy|can'?t\s+believe\s+it|oh\s+my\s+god|amazing|awesome|incredible|fantastic|wonderful)\b",
        r"\b(?:best\s+day|best\s+news|guess\s+what|you\s+won'?t\s+believe)\b",
    ],
    "gratitude": [
        r"\b(?:thank\s+you|thanks\s+so\s+much|so\s+grateful|appreciate|means\s+a\s+lot|couldn'?t\s+have\s+done)\b",
    ],
    "celebration": [
        r"\b(?:congratulations|congrats|well\s+done|good\s+job|great\s+news|finally|we\s+made\s+it|let'?s\s+go)\b",
        r"\b(?:cheers|hooray|woohoo|yay|yes|woo)\b",
    ],
    "apology": [
        r"\b(?:i(?:'?m)?\s+sorry|my\s+bad|i\s+apologize|forgive\s+me|i\s+was\s+wrong|my\s+fault)\b",
        r"\b(?:you(?:'?re|r)?\s+right|i\s+shouldn'?t\s+have|i\s+didn'?t\s+mean|that\s+was\s+wrong\s+of\s+me)\b",
        r"\b(?:i\s+take\s+it\s+back|i\s+regret|i\s+feel\s+bad|i\s+messed\s+up|i\s+screwed\s+up)\b",
    ],
    "reassurance": [
        r"\b(?:it(?:'?s)?\s+okay|it(?:'?s)?\s+alright|don'?t\s+worry|no\s+worries|we(?:'?re)?\s+good|we(?:'?re)?\s+okay)\b",
        r"\b(?:i\s+understand|i\s+hear\s+you|that\s+makes\s+sense|you(?:'?re)?\s+right|fair\s+enough)\b",
        r"\b(?:let(?:'?s)?\s+work\s+(?:this|it)\s+out|let(?:'?s)?\s+talk|i(?:'?m)?\s+here\s+for\s+you|i\s+support\s+you)\b",
        r"\b(?:hope\s+you(?:'?re)?\s+(?:ok|okay|doing\s+ok|doing\s+okay|well|good|alright))\b",
    ],
}


def _find_matches(text: str, patterns: List[str]) -> List[str]:
    """Find all regex matches in text, returning clean matched strings (no tuples)."""
    matches = []
    for pattern in patterns:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            matches.append(m.group(0))
    return matches


def detect_positive_words(text: str) -> Dict[str, List[str]]:
    """
    Detect positive words/phrases in transcribed text.
    Returns dict of category -> list of matched phrases.
    """
    if not text:
        return {}

    text_lower = text.lower()
    detected = {}

    for category, patterns in POSITIVE_PATTERNS.items():
        matches = _find_matches(text_lower, patterns)
        if matches:
            detected[category] = list(set(matches))

    return detected


def detect_escalation_words(text: str) -> Dict[str, List[str]]:
    """
    Detect escalating words/phrases in transcribed text.
    Returns dict of category -> list of matched phrases.
    """
    if not text:
        return {}

    text_lower = text.lower()
    detected = {}

    for category, patterns in ESCALATION_PATTERNS.items():
        matches = _find_matches(text_lower, patterns)
        if matches:
            detected[category] = list(set(matches))

    return detected


async def transcribe_audio(audio_data: bytes) -> Optional[str]:
    """
    Transcribe audio using OpenAI Whisper API.
    Returns transcription text or None if unavailable.
    """
    if not OPENAI_AVAILABLE:
        return None

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        client = openai.OpenAI(api_key=api_key, timeout=15.0)

        # Convert to WAV for Whisper API compatibility
        wav_data = convert_audio_to_wav(audio_data)

        # Write audio to temp file (Whisper API needs a file)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(wav_data)
            temp_path = f.name

        try:
            with open(temp_path, "rb") as audio_file:
                response = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="text",
                    language="en",  # Skip language detection = faster
                )
            return response.strip() if response else None
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except Exception as cleanup_err:
                print(f"Failed to clean up temp file: {cleanup_err}")

    except openai.APIError as e:
        print(f"OpenAI API error: {e}")
        return None
    except Exception as e:
        print(f"Transcription error: {e}")
        return None


class AnalyzeAudioRequest(BaseModel):
    audio_base64: str
    duration_seconds: float
    message_type: Optional[str] = None  # "outgoing" or "incoming" — if set, includes suggestions in response


class AnalysisResults(BaseModel):
    raised_voice: bool
    fast_pacing: bool
    emotional_charge: bool


class GenerateSuggestionsRequest(BaseModel):
    analysis_results: AnalysisResults
    message_type: str  # "outgoing" or "incoming"


# Default fallback suggestions
DEFAULT_SUGGESTIONS_OUTGOING = [
    "I need some space right now. We can talk later.",
    "I'm not continuing this while it's heated.",
    "I want this to stay calm, so I'm stepping away."
]

DEFAULT_SUGGESTIONS_INCOMING = [
    "I hear you. Let me take a moment before responding.",
    "I understand this is important. Let's discuss when we're both calm.",
    "Thank you for sharing. I need a moment to process this."
]


@api.get("/")
def root():
    return {"message": "Anchor API"}


@api.get("/health")
def health():
    return {"ok": True}


@api.get("/status")
def status():
    """Check which features are available based on installed packages and API keys."""
    return {
        "librosa_available": LIBROSA_AVAILABLE,
        "openai_available": OPENAI_AVAILABLE and bool(os.environ.get("OPENAI_API_KEY")),
        "claude_available": CLAUDE_AVAILABLE and bool(os.environ.get("ANTHROPIC_API_KEY")),
        "features": {
            "audio_analysis": LIBROSA_AVAILABLE,
            "transcription": OPENAI_AVAILABLE and bool(os.environ.get("OPENAI_API_KEY")),
            "ai_suggestions": CLAUDE_AVAILABLE and bool(os.environ.get("ANTHROPIC_API_KEY")),
        }
    }


class AnalyzeTextRequest(BaseModel):
    text: str


@api.post("/analyze-text")
async def analyze_text(req: AnalyzeTextRequest) -> Dict[str, Any]:
    """
    Analyze text for escalating language patterns.
    Useful for testing word detection without audio.
    """
    escalation_words = detect_escalation_words(req.text)

    contains_profanity = "profanity" in escalation_words
    contains_labelling = "labelling" in escalation_words
    contains_blame = "blame_language" in escalation_words
    contains_absolutes = "absolutes" in escalation_words
    contains_threats = "threats" in escalation_words
    contains_dismissive = "dismissive" in escalation_words

    word_escalation = any([contains_profanity, contains_labelling, contains_blame, contains_threats])

    insights: List[str] = []
    if contains_profanity:
        insights.append("Strong language detected")
    if contains_blame:
        insights.append("Blame language detected")
    if contains_labelling:
        insights.append("Name-calling detected")
    if contains_threats:
        insights.append("Threatening language detected")
    if contains_absolutes and not contains_blame:
        insights.append("Absolute statements detected")
    if contains_dismissive:
        insights.append("Dismissive language detected")

    if not insights:
        insights.append("Text appears neutral")

    return {
        "contains_profanity": contains_profanity,
        "contains_labelling": contains_labelling,
        "contains_blame": contains_blame,
        "contains_absolutes": contains_absolutes,
        "contains_threats": contains_threats,
        "contains_dismissive": contains_dismissive,
        "escalation_detected": word_escalation,
        "escalation_words": escalation_words,
        "insights": insights[:3],
    }


def convert_audio_to_wav(audio_data: bytes) -> bytes:
    """
    Convert any audio format (m4a, aac, ogg, etc.) to WAV using pydub+ffmpeg.
    Mobile devices record in m4a/aac which librosa/soundfile can't read directly.
    """
    if not PYDUB_AVAILABLE:
        print("Warning: pydub not available, returning raw audio. Audio conversion may fail.")
        return audio_data

    try:
        audio_segment = AudioSegment.from_file(io.BytesIO(audio_data))
        wav_buffer = io.BytesIO()
        audio_segment.export(wav_buffer, format="wav")
        wav_buffer.seek(0)
        return wav_buffer.read()
    except Exception as e:
        print(f"Audio conversion error: {e}. Returning raw audio data.")
        return audio_data


def analyze_audio_features(audio_data: bytes) -> Dict[str, Any]:
    """
    Analyze audio using librosa to extract voice features.
    Returns volume level, tempo, pitch variation, and emotion indicators.
    """
    if not LIBROSA_AVAILABLE:
        return None

    try:
        # Convert to WAV first (handles m4a/aac from mobile devices)
        wav_data = convert_audio_to_wav(audio_data)

        # Load audio from bytes
        audio_buffer = io.BytesIO(wav_data)
        y, sr = librosa.load(audio_buffer, sr=None)

        if len(y) == 0:
            return None

        # 1. Volume analysis (RMS energy)
        rms = librosa.feature.rms(y=y)[0]
        mean_rms = float(np.mean(rms))
        max_rms = float(np.max(rms))
        rms_variance = float(np.var(rms))

        # 2. Tempo/pacing - NOT using beat_track (designed for music, not speech)
        # We rely on speech_rate from onset detection instead (see below)

        # 3. Pitch analysis (using zero-crossing rate as proxy for pitch activity)
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        mean_zcr = float(np.mean(zcr))
        zcr_variance = float(np.var(zcr))

        # 4. Spectral features for emotional intensity
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        mean_spectral = float(np.mean(spectral_centroid))
        spectral_variance = float(np.var(spectral_centroid))

        # 5. MFCC for voice emotion characteristics
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc_mean = np.mean(mfcc, axis=1)
        mfcc_var = np.var(mfcc, axis=1)

        # 6. Pitch (F0) estimation for emotion
        pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
        pitch_values = []
        for t in range(pitches.shape[1]):
            index = magnitudes[:, t].argmax()
            pitch = pitches[index, t]
            if pitch > 0:
                pitch_values.append(pitch)

        mean_pitch = float(np.mean(pitch_values)) if pitch_values else 0.0
        pitch_variance = float(np.var(pitch_values)) if pitch_values else 0.0
        pitch_range = float(max(pitch_values) - min(pitch_values)) if len(pitch_values) > 1 else 0.0

        # 7. Speech rate estimation (syllable-like events)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
        duration = len(y) / sr
        speech_rate = len(onset_frames) / duration if duration > 0 else 0.0

        return {
            "mean_rms": mean_rms,
            "max_rms": max_rms,
            "rms_variance": rms_variance,
            "mean_zcr": mean_zcr,
            "zcr_variance": zcr_variance,
            "mean_spectral": mean_spectral,
            "spectral_variance": spectral_variance,
            "mean_pitch": mean_pitch,
            "pitch_variance": pitch_variance,
            "pitch_range": pitch_range,
            "speech_rate": speech_rate,
            "mfcc_energy": float(mfcc_mean[0]),  # First MFCC correlates with energy
            "mfcc_variance": float(np.mean(mfcc_var)),
        }

    except Exception as e:
        print(f"Audio analysis error: {e}")
        return None


def classify_emotion_from_audio(features: Dict[str, Any]) -> Dict[str, Any]:
    """
    Classify emotional state from audio features.
    Default is calm — requires strong, multi-signal evidence to classify otherwise.
    """
    if not features:
        return {"primary_emotion": "neutral", "confidence": 0.0, "emotions": {}}

    # Count indicators per emotion — require multiple signals, not just one
    angry_signals = sum([
        features["max_rms"] > 0.25 and features["mean_rms"] > 0.14,  # Loud AND sustained
        features["pitch_variance"] > 12000,       # Unstable pitch
        features["speech_rate"] > 5.5,             # Genuinely fast
        features["spectral_variance"] > 900000,    # High spectral energy
    ])

    anxious_signals = sum([
        features["mean_pitch"] > 280,              # High pitched
        features["speech_rate"] > 5.5,             # Fast speech
        features["rms_variance"] > 0.005,          # Volume jumps around
    ])

    frustrated_signals = sum([
        0.12 < features["mean_rms"] < 0.22,       # Moderately loud
        features["pitch_range"] > 200,             # Voice going up and down
        features["rms_variance"] > 0.004,          # Some volume variation
    ])

    sad_signals = sum([
        features["mean_rms"] < 0.02,              # Very quiet
        features["speech_rate"] < 1.5,             # Very slow
        features["mean_pitch"] < 120,              # Low pitched
    ])

    # Calm is the default — gets a head start
    calm_signals = sum([
        features["rms_variance"] < 0.003,          # Steady volume
        features["pitch_variance"] < 6000,         # Stable pitch
        features["spectral_variance"] < 500000,    # Low spectral activity
    ])

    emotions = {
        "angry": 0.0,
        "anxious": 0.0,
        "frustrated": 0.0,
        "calm": 0.0,
        "sad": 0.0,
    }

    # Require at least 2 signals to register an emotion (except calm)
    if angry_signals >= 2:
        emotions["angry"] = 0.3 + (angry_signals - 2) * 0.15
    if anxious_signals >= 2:
        emotions["anxious"] = 0.25 + (anxious_signals - 2) * 0.15
    if frustrated_signals >= 2:
        emotions["frustrated"] = 0.2 + (frustrated_signals - 2) * 0.1
    if sad_signals >= 2:
        emotions["sad"] = 0.25 + (sad_signals - 2) * 0.15

    # Calm gets credit from just 1 signal — it's the default assumption
    if calm_signals >= 1:
        emotions["calm"] = 0.2 + calm_signals * 0.1

    # Normalize
    total = sum(emotions.values())
    if total > 0:
        emotions = {k: round(v / total, 2) for k, v in emotions.items()}

    primary_emotion = max(emotions, key=emotions.get)
    confidence = emotions[primary_emotion]

    return {
        "primary_emotion": primary_emotion,
        "confidence": confidence,
        "emotions": emotions,
    }


@api.post("/analyze-audio")
async def analyze_audio(req: AnalyzeAudioRequest) -> Dict[str, Any]:
    """
    Analyze audio for volume, pacing, emotional indicators, and escalating language.
    Returns comprehensive analysis including emotion detection and word analysis.
    """
    # Validate base64
    try:
        audio_data = base64.b64decode(req.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")

    if not audio_data:
        raise HTTPException(status_code=400, detail="Empty audio data")

    # Run librosa analysis and Whisper transcription IN PARALLEL
    # librosa is CPU-bound, Whisper is network I/O — no reason to wait for one before the other
    loop = asyncio.get_event_loop()
    features_task = loop.run_in_executor(None, analyze_audio_features, audio_data)
    transcription_task = transcribe_audio(audio_data)
    features, transcription = await asyncio.gather(features_task, transcription_task)
    print(f"[analyze-audio] Audio features: {features}")
    print(f"[analyze-audio] Transcription: {transcription}")
    escalation_words = detect_escalation_words(transcription) if transcription else {}
    positive_words = detect_positive_words(transcription) if transcription else {}
    print(f"[analyze-audio] Escalation words: {escalation_words}")
    print(f"[analyze-audio] Positive words: {positive_words}")

    # Detect positive sentiment
    has_positive = len(positive_words) > 0
    has_affection = "affection" in positive_words
    has_excitement = "excitement" in positive_words
    has_gratitude = "gratitude" in positive_words
    has_celebration = "celebration" in positive_words
    has_apology = "apology" in positive_words
    has_reassurance = "reassurance" in positive_words

    # Detect escalating language from transcription
    contains_profanity = "profanity" in escalation_words
    contains_labelling = "labelling" in escalation_words
    contains_blame = "blame_language" in escalation_words
    contains_absolutes = "absolutes" in escalation_words
    contains_threats = "threats" in escalation_words
    contains_dismissive = "dismissive" in escalation_words

    if features and isinstance(features, dict):
        # Thresholds calibrated for mobile phone voice messages
        # Raised voice: loud peak AND sustained high average (not just a brief emphasis)
        raised_voice = features.get("max_rms", 0) > 0.25 and features.get("mean_rms", 0) > 0.14
        fast_pacing = features.get("speech_rate", 0) > 5.5

        # Emotional charge: need at least 2 of 3 variance indicators (1 alone is normal speech)
        high_volume_variance = features.get("rms_variance", 0) > 0.005
        high_spectral_variance = features.get("spectral_variance", 0) > 900000
        high_pitch_variance = features.get("pitch_variance", 0) > 12000
        emotional_charge = sum([high_volume_variance, high_spectral_variance, high_pitch_variance]) >= 2

        # Get emotion classification
        emotion_result = classify_emotion_from_audio(features)
    else:
        # Fallback heuristics if librosa unavailable
        duration = req.duration_seconds
        audio_size = len(audio_data)
        bytes_per_second = audio_size / max(duration, 0.1)

        raised_voice = bytes_per_second > 15000
        fast_pacing = bytes_per_second > 10000
        emotional_charge = raised_voice
        emotion_result = {"primary_emotion": "unknown", "confidence": 0.0, "emotions": {}}

    # Words are more reliable than audio features for determining intent
    # When we have a transcription, words should override audio-only classification
    word_escalation = any([contains_profanity, contains_labelling, contains_blame, contains_threats])
    has_any_negative = word_escalation or contains_absolutes or contains_dismissive

    # CRITICAL: When transcription is NOT available, audio alone is unreliable
    # Warm/excited speech sounds similar to angry speech (high energy, pitch variation)
    # Default to calm unless audio signals are extremely strong (3+ of 4 angry indicators)
    if not transcription:
        print("[analyze-audio] No transcription available — using conservative audio-only mode")
        if emotion_result.get("primary_emotion") in ["angry", "frustrated", "anxious"]:
            # Only keep non-calm classification if ALL voice indicators are firing
            all_voice_firing = raised_voice and fast_pacing and emotional_charge
            if not all_voice_firing:
                emotion_result["primary_emotion"] = "calm"
                emotion_result["confidence"] = 0.3
                raised_voice = False
                emotional_charge = False

    # If we have a transcription with no negative OR positive words, trust the words = calm
    # This prevents loud but calm-worded speech from being classified as angry
    if transcription and not has_any_negative and not has_positive:
        if emotion_result.get("primary_emotion") in ["angry", "frustrated", "anxious"]:
            emotion_result["primary_emotion"] = "calm"
            emotion_result["confidence"] = 0.4

    if has_positive and not word_escalation:
        # Positive content with high energy = excitement/happiness, not anger
        if has_apology:
            emotion_result["primary_emotion"] = "apologetic"
            emotion_result["confidence"] = 0.7
        elif has_reassurance:
            emotion_result["primary_emotion"] = "supportive"
            emotion_result["confidence"] = 0.6
        elif has_excitement or has_celebration:
            emotion_result["primary_emotion"] = "excited"
            emotion_result["confidence"] = 0.7
        elif has_affection:
            emotion_result["primary_emotion"] = "affectionate"
            emotion_result["confidence"] = 0.6
        elif has_gratitude:
            emotion_result["primary_emotion"] = "grateful"
            emotion_result["confidence"] = 0.5
        # Positive messages are not escalating even if loud/fast
        raised_voice = False
        emotional_charge = False
    elif word_escalation and not has_positive:
        # Negative words with no positive context — adjust tone if audio says "calm"
        # Only override for strong word signals (threats, labelling, profanity)
        if emotion_result.get("primary_emotion") == "calm":
            if contains_threats or contains_labelling:
                emotion_result["primary_emotion"] = "aggressive"
                emotion_result["confidence"] = 0.5
                emotional_charge = True
            elif contains_profanity and (contains_blame or raised_voice):
                # Profanity alone in calm tone = venting, not necessarily escalating
                # But profanity + blame or raised voice = frustrated
                emotion_result["primary_emotion"] = "frustrated"
                emotion_result["confidence"] = 0.4
                emotional_charge = True
    elif word_escalation and has_positive:
        # Mixed signals — both positive and negative words. Stay cautious but note it
        emotion_result["primary_emotion"] = "mixed"
        emotion_result["confidence"] = 0.4

    # Escalation detection: words are the primary signal
    # Voice alone only triggers escalation if ALL three voice indicators fire
    # This prevents normal emphatic speech from being flagged
    voice_escalation = raised_voice and fast_pacing and emotional_charge
    if has_positive and not word_escalation:
        escalation_detected = False
    else:
        escalation_detected = word_escalation or voice_escalation

    # Calculate severity level
    # Word signals are more reliable than audio, so they count more
    audio_signal_count = sum([raised_voice, fast_pacing, emotional_charge])
    word_signal_count = sum([
        contains_profanity,
        contains_labelling,
        contains_blame,
        contains_threats,
    ])

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

    # Generate insights (max 3)
    insights: List[str] = []

    if has_positive and not word_escalation:
        # Positive message insights
        if has_apology:
            insights.append("Apology detected - taking accountability")
        if has_reassurance:
            insights.append("Reassurance detected - supportive tone")
        if has_excitement or has_celebration:
            insights.append("Excitement detected - positive energy!")
        if has_affection:
            insights.append("Affection detected - warm message")
        if has_gratitude:
            insights.append("Gratitude detected - appreciative tone")
        if has_celebration and has_excitement:
            pass  # Already covered by excitement
        elif has_celebration:
            insights.append("Celebratory message detected")
        if fast_pacing:
            insights.append("Fast pacing - likely enthusiastic")
    else:
        # Voice-based insights
        if raised_voice:
            insights.append("Raised voice detected")
        if fast_pacing:
            insights.append("Fast pacing detected")
        if emotion_result["primary_emotion"] in ["angry", "frustrated"] and emotion_result["confidence"] > 0.3:
            insights.append(f"{emotion_result['primary_emotion'].capitalize()} tone detected")
        elif emotion_result["primary_emotion"] == "anxious" and emotion_result["confidence"] > 0.3:
            insights.append("Anxious tone detected")

        # Word-based insights
        if contains_profanity:
            insights.append("Strong language detected")
        if contains_blame:
            insights.append("Blame language detected (e.g., 'you always...')")
        if contains_labelling:
            insights.append("Name-calling detected")
        if contains_threats:
            insights.append("Threatening language detected")
        if contains_absolutes and not contains_blame:
            insights.append("Absolute statements detected (always/never)")
        if contains_dismissive:
            insights.append("Dismissive language detected")

        # Escalation pattern insight
        if escalation_detected and len(insights) < 3:
            insights.append("Escalation pattern detected")

    # Default for calm messages
    if not insights:
        insights.append("Message tone appears calm")

    # Ensure max 3 insights
    insights = insights[:3]

    # Build safe detection summary — categories and counts only, never the actual words
    # This avoids displaying profanity/slurs in the app (legal + UX safety)
    category_labels = {
        "profanity": "Strong language",
        "absolutes": "Absolute statements",
        "blame_language": "Blame language",
        "labelling": "Name-calling",
        "threats": "Threatening language",
        "dismissive": "Dismissive language",
        "interrupting": "Interrupting language",
    }
    positive_category_labels = {
        "affection": "Affection",
        "excitement": "Excitement",
        "gratitude": "Gratitude",
        "celebration": "Celebration",
        "apology": "Apology",
        "reassurance": "Reassurance",
    }
    detection_summary = {}
    for category, words in escalation_words.items():
        label = category_labels.get(category, category.replace("_", " ").title())
        detection_summary[label] = len(words) if isinstance(words, list) else 1
    for category, words in positive_words.items():
        label = positive_category_labels.get(category, category.replace("_", " ").title())
        detection_summary[label] = len(words) if isinstance(words, list) else 1

    result = {
        "raised_voice": raised_voice,
        "fast_pacing": fast_pacing,
        "emotional_charge": emotional_charge,
        "contains_profanity": contains_profanity,
        "contains_labelling": contains_labelling,
        "contains_blame": contains_blame,
        "contains_absolutes": contains_absolutes,
        "contains_threats": contains_threats,
        "contains_dismissive": contains_dismissive,
        "escalation_detected": escalation_detected,
        "escalation_words": detection_summary,
        "emotion": emotion_result,
        "insights": insights,
        "severity_level": severity_level,
        # Note: transcription is processed but not returned to client for privacy
        # Only the analysis results are returned
    }

    # If message_type is provided, generate suggestions in the same request
    # This saves a full network round trip (2-5 seconds)
    if req.message_type:
        suggestions = await _generate_suggestions_internal(
            raised_voice, fast_pacing, emotional_charge, req.message_type,
            emotion=emotion_result.get("primary_emotion", "calm"),
            has_positive=has_positive,
            has_apology=has_apology,
        )
        result["suggestions"] = suggestions

    return result


async def _generate_suggestions_internal(
    raised_voice: bool, fast_pacing: bool, emotional_charge: bool, message_type: str,
    emotion: str = "calm", has_positive: bool = False, has_apology: bool = False,
) -> List[str]:
    """
    Internal: generate 3 suggestions using Claude AI.
    For heated messages: de-escalation suggestions.
    For positive/calm messages: affirming suggestions.
    Returns list of suggestion strings.
    """
    message_type = message_type.lower()
    signals = []
    if raised_voice:
        signals.append("raised voice")
    if fast_pacing:
        signals.append("fast pacing")
    if emotional_charge:
        signals.append("emotional charge")

    is_heated = any([raised_voice, fast_pacing, emotional_charge])
    is_positive = has_positive or emotion in ["apologetic", "supportive", "excited", "affectionate", "grateful", "calm"]

    # SPEED OPTIMIZATION: For calm/positive messages, return instant suggestions
    # instead of calling Claude API (saves 3-5 seconds)
    if is_positive and not is_heated:
        if has_apology:
            if message_type == "outgoing":
                return [
                    "I want you to know I mean this sincerely.",
                    "I take responsibility, and I'm working on it.",
                    "I hope we can move forward together.",
                ]
            else:
                return [
                    "Thank you for saying that. It means a lot.",
                    "I appreciate you taking responsibility.",
                    "I'm glad we can talk about this openly.",
                ]
        elif emotion in ["affectionate", "grateful", "supportive"]:
            if message_type == "outgoing":
                return [
                    "Your message sounds warm and sincere. Send it as is.",
                    "This is a great way to express how you feel.",
                    "Simple and genuine — your partner will appreciate this.",
                ]
            else:
                return [
                    "This sounds like a caring message. Take it in.",
                    "A warm message — enjoy the moment.",
                    "Your partner is reaching out with love.",
                ]
        elif emotion == "calm":
            if message_type == "outgoing":
                return [
                    "Your tone sounds calm and measured.",
                    "This comes across as thoughtful and clear.",
                    "You're communicating well — send when ready.",
                ]
            else:
                return [
                    "This message sounds calm and collected.",
                    "Take your time processing what was said.",
                    "A measured message — respond when you're ready.",
                ]
        else:
            # excited, celebration, etc.
            if message_type == "outgoing":
                return [
                    "Your positive energy comes through clearly!",
                    "This is a great message to share.",
                    "Send it — your enthusiasm is infectious.",
                ]
            else:
                return [
                    "Sounds like great news — take it in!",
                    "What a positive message to receive.",
                    "Share in the excitement — respond when ready.",
                ]

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if CLAUDE_AVAILABLE and api_key:
        try:
            if is_positive and not is_heated:
                # Positive/calm message — give affirming suggestions
                if message_type == "outgoing":
                    if has_apology:
                        prompt = """You are helping someone send a sincere apology voice message.
Their message contains an apology and sounds genuine.

Generate exactly 3 short, warm ways they could phrase their apology effectively.
Each phrase should be 1-2 sentences max. Focus on sincerity and taking accountability.
Return only the 3 phrases, one per line, no numbering or bullets."""
                    else:
                        prompt = f"""You are helping someone send a positive voice message. The tone is {emotion}.

Generate exactly 3 short, warm phrases they could say that match this positive tone.
Each phrase should be 1-2 sentences max. Keep them natural and authentic.
Return only the 3 phrases, one per line, no numbering or bullets."""
                else:
                    if has_apology:
                        prompt = """You are helping someone respond to a sincere apology they received.

Generate exactly 3 short, gracious response phrases they could use to accept the apology.
Each phrase should be 1-2 sentences max. Focus on acceptance and moving forward.
Return only the 3 phrases, one per line, no numbering or bullets."""
                    else:
                        prompt = f"""You are helping someone respond to a positive voice message. The tone is {emotion}.

Generate exactly 3 short, warm response phrases that match the positive energy.
Each phrase should be 1-2 sentences max. Keep them natural and authentic.
Return only the 3 phrases, one per line, no numbering or bullets."""
            elif message_type == "outgoing":
                prompt = f"""You are helping someone de-escalate a conflict. They are about to send a voice message.
Analysis shows: {', '.join(signals) if signals else 'calm tone'}.
{'The message seems heated.' if is_heated else 'The message seems calm.'}

Generate exactly 3 short, calm, neutral phrases they could say instead to de-escalate.
Each phrase should be 1-2 sentences max. Focus on self-regulation, not blaming others.
Return only the 3 phrases, one per line, no numbering or bullets."""
            else:
                prompt = f"""You are helping someone respond calmly to a voice message they received.
Analysis of the received message shows: {', '.join(signals) if signals else 'calm tone'}.
{'The message seems heated.' if is_heated else 'The message seems calm.'}

Generate exactly 3 short, calm, neutral response phrases they could use.
Each phrase should be 1-2 sentences max. Focus on staying calm and not escalating.
Return only the 3 phrases, one per line, no numbering or bullets."""

            client = anthropic.Anthropic(api_key=api_key)
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=256,
                messages=[{"role": "user", "content": prompt}]
            )

            response_text = response.content[0].text
            lines = [line.strip() for line in response_text.strip().split('\n') if line.strip()]
            suggestions = lines[:3]

            if len(suggestions) >= 3:
                return suggestions

        except Exception as e:
            print(f"Claude API error: {e}")

    # Fallback defaults
    if message_type == "outgoing":
        return DEFAULT_SUGGESTIONS_OUTGOING
    else:
        return DEFAULT_SUGGESTIONS_INCOMING


@api.post("/generate-suggestions")
async def generate_suggestions(req: GenerateSuggestionsRequest) -> Dict[str, Any]:
    """
    Generate 3 de-escalation suggestions using Claude AI.
    Falls back to default suggestions if Claude is unavailable.
    Note: prefer using message_type in /api/analyze-audio to get suggestions in one call.
    """
    suggestions = await _generate_suggestions_internal(
        req.analysis_results.raised_voice,
        req.analysis_results.fast_pacing,
        req.analysis_results.emotional_charge,
        req.message_type,
    )
    return {"suggestions": suggestions}


@api.post("/debug-audio")
async def debug_audio(req: AnalyzeAudioRequest) -> Dict[str, Any]:
    """
    Debug endpoint: returns raw audio feature values so you can calibrate thresholds.
    Send the same audio data as analyze-audio and see the actual numbers.
    """
    try:
        audio_data = base64.b64decode(req.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")

    features = analyze_audio_features(audio_data)

    if not features:
        return {"error": "Could not analyze audio", "librosa_available": LIBROSA_AVAILABLE}

    # Show raw features alongside the thresholds they're compared against
    return {
        "raw_features": features,
        "threshold_comparison": {
            "raised_voice": {
                "max_rms": {"value": features.get("max_rms", 0), "threshold": 0.25, "triggered": features.get("max_rms", 0) > 0.25},
                "mean_rms": {"value": features.get("mean_rms", 0), "threshold": 0.14, "triggered": features.get("mean_rms", 0) > 0.14},
                "result": features.get("max_rms", 0) > 0.25 and features.get("mean_rms", 0) > 0.14,
                "note": "Both must be true (AND) — brief loud moments alone do not trigger",
            },
            "fast_pacing": {
                "speech_rate": {"value": features.get("speech_rate", 0), "threshold": 5.5, "triggered": features.get("speech_rate", 0) > 5.5},
                "result": features.get("speech_rate", 0) > 5.5,
            },
            "emotional_charge": {
                "rms_variance": {"value": features.get("rms_variance", 0), "threshold": 0.005, "triggered": features.get("rms_variance", 0) > 0.005},
                "spectral_variance": {"value": features.get("spectral_variance", 0), "threshold": 900000, "triggered": features.get("spectral_variance", 0) > 900000},
                "pitch_variance": {"value": features.get("pitch_variance", 0), "threshold": 12000, "triggered": features.get("pitch_variance", 0) > 12000},
                "note": "At least 2 of 3 must be true",
            },
        },
    }


class FixGrammarRequest(BaseModel):
    text: str


@api.post("/fix-grammar")
async def fix_grammar(req: FixGrammarRequest) -> Dict[str, Any]:
    """
    Fix grammar and spelling in text while preserving the speaker's voice and intent.
    Uses Claude to correct grammar without changing tone or meaning.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if len(req.text) > 500:
        raise HTTPException(status_code=400, detail="Text must be 500 characters or less")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not CLAUDE_AVAILABLE or not api_key:
        # Fallback: return original text if Claude unavailable
        return {"original": req.text, "corrected": req.text, "changed": False}

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=600,
            messages=[{"role": "user", "content": f"""Fix the grammar and spelling in this text. Keep the same tone, meaning, and personality. Only fix errors - do not rewrite or rephrase. If the text is already correct, return it unchanged.

Return ONLY the corrected text, nothing else.

Text: {req.text.strip()}"""}]
        )

        corrected = response.content[0].text.strip()
        # Remove quotes if Claude wrapped the response
        if corrected.startswith('"') and corrected.endswith('"'):
            corrected = corrected[1:-1]

        return {
            "original": req.text.strip(),
            "corrected": corrected,
            "changed": corrected.lower() != req.text.strip().lower(),
        }
    except Exception as e:
        print(f"Grammar fix error: {e}")
        return {"original": req.text, "corrected": req.text, "changed": False}


class TtsRequest(BaseModel):
    text: str
    voice: Optional[str] = "nova"  # OpenAI TTS voices: alloy, echo, fable, onyx, nova, shimmer
    format: Optional[str] = "base64"  # "base64" (JSON) or "binary" (raw audio)


@api.post("/tts")
async def text_to_speech(req: TtsRequest):
    """
    Convert text to speech using OpenAI TTS API.
    Returns base64-encoded MP3 in JSON (default) or raw binary audio.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if len(req.text) > 500:
        raise HTTPException(status_code=400, detail="Text must be 500 characters or less")

    if not OPENAI_AVAILABLE:
        raise HTTPException(status_code=503, detail="TTS service not available")

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="TTS service not configured")

    try:
        client = openai.OpenAI(api_key=api_key)
        response = client.audio.speech.create(
            model="tts-1",
            voice=req.voice,
            input=req.text.strip(),
            response_format="mp3",
        )

        audio_data = response.content

        if req.format == "binary":
            return Response(
                content=audio_data,
                media_type="audio/mpeg",
                headers={"Content-Disposition": "attachment; filename=tts.mp3"},
            )

        # Default: return base64 JSON (works reliably with React Native)
        audio_base64 = base64.b64encode(audio_data).decode("utf-8")
        return {
            "audio_base64": audio_base64,
            "format": "mp3",
            "size_bytes": len(audio_data),
        }

    except openai.APIError as e:
        print(f"OpenAI TTS API error: {e}")
        raise HTTPException(status_code=502, detail="TTS generation failed")
    except Exception as e:
        print(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail="TTS generation failed")


app.include_router(api)