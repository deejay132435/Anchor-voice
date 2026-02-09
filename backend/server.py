import base64
import io
import os
import re
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional

import numpy as np
from fastapi import FastAPI, APIRouter, HTTPException
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI(title="Anchor API", description="Voice de-escalation analysis API")

# Add CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")

# Try to import librosa for audio analysis
try:
    import librosa
    import soundfile as sf
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False

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
        r"\b(fuck|shit|damn|hell|ass|bitch|bastard|crap)\b",
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
        r"\b(or\s+else|you('ll)?\s+regret|watch\s+(out|yourself)|i('ll)?\s+make\s+you)\b",
    ],
    "dismissive": [
        r"\b(whatever|don't\s+care|shut\s+up|who\s+cares|so\s+what)\b",
    ],
    "interrupting": [
        r"\b(let\s+me\s+finish|stop\s+interrupting|listen\s+to\s+me)\b",
    ],
}


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
        matches = []
        for pattern in patterns:
            found = re.findall(pattern, text_lower, re.IGNORECASE)
            matches.extend(found)
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
        client = openai.OpenAI(api_key=api_key)

        # Write audio to temp file (Whisper API needs a file)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_data)
            temp_path = f.name

        try:
            with open(temp_path, "rb") as audio_file:
                response = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="text"
                )
            return response.strip() if response else None
        finally:
            # Clean up temp file
            os.unlink(temp_path)

    except Exception as e:
        print(f"Transcription error: {e}")
        return None


class AnalyzeAudioRequest(BaseModel):
    audio_base64: str
    duration_seconds: float


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


def analyze_audio_features(audio_data: bytes) -> Dict[str, Any]:
    """
    Analyze audio using librosa to extract voice features.
    Returns volume level, tempo, pitch variation, and emotion indicators.
    """
    if not LIBROSA_AVAILABLE:
        return None

    try:
        # Load audio from bytes
        audio_buffer = io.BytesIO(audio_data)
        y, sr = librosa.load(audio_buffer, sr=None)

        if len(y) == 0:
            return None

        # 1. Volume analysis (RMS energy)
        rms = librosa.feature.rms(y=y)[0]
        mean_rms = float(np.mean(rms))
        max_rms = float(np.max(rms))
        rms_variance = float(np.var(rms))

        # 2. Tempo/pacing analysis
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        tempo = float(tempo) if not isinstance(tempo, np.ndarray) else float(tempo[0]) if len(tempo) > 0 else 0.0

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
            "tempo": tempo,
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
    Returns detected emotions and confidence levels.
    """
    if not features:
        return {"primary_emotion": "neutral", "confidence": 0.0, "emotions": {}}

    emotions = {
        "angry": 0.0,
        "anxious": 0.0,
        "stressed": 0.0,
        "frustrated": 0.0,
        "calm": 0.0,
        "sad": 0.0,
    }

    # Anger indicators: high volume, high pitch variance, fast speech
    if features["max_rms"] > 0.15:
        emotions["angry"] += 0.3
    if features["pitch_variance"] > 5000:
        emotions["angry"] += 0.2
    if features["speech_rate"] > 4.0:
        emotions["angry"] += 0.2
    if features["spectral_variance"] > 500000:
        emotions["angry"] += 0.1

    # Anxiety indicators: high pitch, fast speech, high variance
    if features["mean_pitch"] > 200:
        emotions["anxious"] += 0.3
    if features["speech_rate"] > 3.5:
        emotions["anxious"] += 0.2
    if features["rms_variance"] > 0.002:
        emotions["anxious"] += 0.2

    # Stress indicators: high energy variance, irregular tempo
    if features["rms_variance"] > 0.003:
        emotions["stressed"] += 0.3
    if features["zcr_variance"] > 0.01:
        emotions["stressed"] += 0.2
    if features["mfcc_variance"] > 50:
        emotions["stressed"] += 0.2

    # Frustration: moderate volume increase, pitch instability
    if 0.08 < features["mean_rms"] < 0.15:
        emotions["frustrated"] += 0.3
    if features["pitch_range"] > 100:
        emotions["frustrated"] += 0.2

    # Sadness: low energy, slow speech, lower pitch
    if features["mean_rms"] < 0.03:
        emotions["sad"] += 0.3
    if features["speech_rate"] < 2.0:
        emotions["sad"] += 0.2
    if features["mean_pitch"] < 150:
        emotions["sad"] += 0.2

    # Calm: low variance, moderate values
    if features["rms_variance"] < 0.001:
        emotions["calm"] += 0.3
    if features["pitch_variance"] < 2000:
        emotions["calm"] += 0.2
    if features["spectral_variance"] < 200000:
        emotions["calm"] += 0.2

    # Normalize and find primary emotion
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

    # Try real audio analysis with librosa
    features = analyze_audio_features(audio_data)

    # Transcribe audio for word analysis
    transcription = await transcribe_audio(audio_data)
    escalation_words = detect_escalation_words(transcription) if transcription else {}

    # Detect escalating language from transcription
    contains_profanity = "profanity" in escalation_words
    contains_labelling = "labelling" in escalation_words
    contains_blame = "blame_language" in escalation_words
    contains_absolutes = "absolutes" in escalation_words
    contains_threats = "threats" in escalation_words
    contains_dismissive = "dismissive" in escalation_words

    if features:
        # Thresholds calibrated for voice messages
        raised_voice = features["max_rms"] > 0.15 or features["mean_rms"] > 0.08
        fast_pacing = features["tempo"] > 160 or features.get("speech_rate", 0) > 4.0

        # Emotional charge from audio features
        emotional_charge = (
            features["rms_variance"] > 0.002 or
            features["spectral_variance"] > 500000 or
            (raised_voice and features["zcr_variance"] > 0.01)
        )

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

    # Escalation detection combines voice tone AND word content
    voice_escalation = raised_voice and (fast_pacing or emotional_charge)
    word_escalation = any([contains_profanity, contains_labelling, contains_blame, contains_threats])
    escalation_detected = voice_escalation or word_escalation

    # Calculate severity level
    signal_count = sum([
        raised_voice,
        fast_pacing,
        emotional_charge,
        contains_profanity,
        contains_labelling,
        contains_blame,
        contains_threats,
    ])

    if signal_count == 0:
        severity_level = "low"
    elif signal_count <= 2:
        severity_level = "medium"
    else:
        severity_level = "high"

    # Generate insights (max 3)
    insights: List[str] = []

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

    return {
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
        "escalation_words": escalation_words,
        "emotion": emotion_result,
        "insights": insights,
        "severity_level": severity_level,
        # Note: transcription is processed but not returned to client for privacy
        # Only the analysis results are returned
    }


@api.post("/generate-suggestions")
async def generate_suggestions(req: GenerateSuggestionsRequest) -> Dict[str, Any]:
    """
    Generate 3 de-escalation suggestions using Claude AI.
    Falls back to default suggestions if Claude is unavailable.
    """
    analysis = req.analysis_results
    message_type = req.message_type.lower()

    # Determine context for AI prompt
    signals = []
    if analysis.raised_voice:
        signals.append("raised voice")
    if analysis.fast_pacing:
        signals.append("fast pacing")
    if analysis.emotional_charge:
        signals.append("emotional charge")

    is_heated = any([analysis.raised_voice, analysis.fast_pacing, analysis.emotional_charge])

    # Try Claude API if available
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if CLAUDE_AVAILABLE and api_key:
        try:
            if message_type == "outgoing":
                prompt = f"""You are helping someone de-escalate a conflict. They are about to send a voice message.
Analysis shows: {', '.join(signals) if signals else 'calm tone'}.
{'The message seems heated.' if is_heated else 'The message seems calm.'}

Generate exactly 3 short, calm, neutral phrases they could say instead to de-escalate.
Each phrase should be 1-2 sentences max. Focus on self-regulation, not blaming others.
Return only the 3 phrases, one per line, no numbering or bullets."""
            else:  # incoming
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

            # Parse response into suggestions
            response_text = response.content[0].text
            lines = [line.strip() for line in response_text.strip().split('\n') if line.strip()]
            suggestions = lines[:3]

            # Ensure we have exactly 3 suggestions
            if len(suggestions) == 3:
                return {"suggestions": suggestions}

        except Exception as e:
            # Log error but fall through to defaults
            print(f"Claude API error: {e}")

    # Fallback to default suggestions
    if message_type == "outgoing":
        return {"suggestions": DEFAULT_SUGGESTIONS_OUTGOING}
    else:
        return {"suggestions": DEFAULT_SUGGESTIONS_INCOMING}


app.include_router(api)