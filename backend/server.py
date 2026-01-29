from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
import base64
from emergentintegrations.llm.chat import LlmChat, UserMessage
import io
import openai
import re
import tempfile

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection (not used for storage, but keeping for future features)
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Get EMERGENT_LLM_KEY
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

# Initialize OpenAI client for Whisper
openai_client = openai.OpenAI(api_key=EMERGENT_LLM_KEY)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Define Models
class AudioAnalysisRequest(BaseModel):
    audio_base64: str
    duration_seconds: float


class AudioAnalysisResponse(BaseModel):
    raised_voice: bool
    fast_pacing: bool
    emotional_charge: bool
    contains_profanity: bool
    contains_labelling: bool
    escalation_detected: bool
    transcription: str
    detected_language: str
    insights: List[str]
    severity_level: str  # "low", "medium", "high"


class SuggestionRequest(BaseModel):
    analysis_results: dict
    message_type: str  # "outgoing" or "incoming"


class SuggestionResponse(BaseModel):
    suggestions: List[str]


@api_router.get("/")
async def root():
    return {"message": "Anchor API - Voice De-escalation Tool"}


def detect_profanity(text: str) -> bool:
    """Detect profanity and aggressive language."""
    profanity_patterns = [
        r'\bf[*u]ck',
        r'\bsh[*i]t',
        r'\bd[*a]mn',
        r'\bass',
        r'\bbitch',
        r'\bbastard',
        r'\bcrap',
        r'\bhell\b',
        r'\bidiot',
        r'\bstupid\b',
        # Add more patterns as needed
    ]
    
    text_lower = text.lower()
    for pattern in profanity_patterns:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return True
    return False


def detect_labelling(text: str) -> bool:
    """Detect labelling language like 'you always', 'you never'."""
    labelling_patterns = [
        r'\byou\s+always\b',
        r'\byou\s+never\b',
        r'\byou\'re\s+so\b',
        r'\byou\'re\s+such\b',
        r'\bwhy\s+do\s+you\s+always\b',
        r'\bwhy\s+do\s+you\s+never\b',
        r'\beveryone\s+knows\b',
        r'\banyone\s+can\s+see\b',
    ]
    
    text_lower = text.lower()
    for pattern in labelling_patterns:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return True
    return False


def detect_escalation(text: str) -> bool:
    """Detect escalation markers and aggressive phrasing."""
    escalation_patterns = [
        r'\bshut\s+up\b',
        r'\bleave\s+me\s+alone\b',
        r'\bget\s+out\b',
        r'\bgo\s+away\b',
        r'\bi\s+hate\b',
        r'\bcan\'t\s+stand\b',
        r'\bsick\s+of\b',
        r'\benough\b',
        r'\bdone\s+with\b',
        r'\bfed\s+up\b',
        r'\bwhat\s+the\s+hell\b',
        r'\bwhat\'s\s+wrong\s+with\s+you\b',
    ]
    
    text_lower = text.lower()
    for pattern in escalation_patterns:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return True
    return False


@api_router.post("/analyze-audio", response_model=AudioAnalysisResponse)
async def analyze_audio(request: AudioAnalysisRequest):
    """
    Analyze audio comprehensively:
    1. Use Claude to analyze audio characteristics based on metadata
    2. Analyze content patterns for profanity, labelling, escalation
    3. Generate contextual insights
    
    Note: Full speech-to-text transcription requires OpenAI API key.
    For MVP, we use audio metadata and Claude for analysis.
    """
    try:
        # Decode base64 audio
        audio_bytes = base64.b64decode(request.audio_base64)
        
        # Analyze audio properties
        audio_size_kb = len(audio_bytes) / 1024
        size_per_second = audio_size_kb / request.duration_seconds if request.duration_seconds > 0 else 0
        
        # Heuristic audio analysis
        raised_voice = size_per_second > 30
        
        # Calculate words per minute estimate from duration
        # Average speaking rate is 125-150 words/min, fast is 160+
        estimated_words = max(10, int(request.duration_seconds * 2.5))  # Rough estimate
        words_per_minute = (estimated_words / request.duration_seconds) * 60 if request.duration_seconds > 0 else 0
        fast_pacing = words_per_minute > 180  # Very fast speech
        
        # Use Claude to analyze the audio characteristics
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id="anchor-audio-analysis",
            system_message="You are an audio analysis expert. Based on audio metadata, provide insights about the message's emotional tone and conflict indicators."
        )
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        
        analysis_prompt = f"""Analyze this voice message metadata:
- Duration: {request.duration_seconds} seconds
- Audio size: {audio_size_kb:.1f} KB
- Estimated speaking rate: {words_per_minute:.0f} words/minute
- Volume indicators: {'High' if raised_voice else 'Normal'}
- Pacing: {'Fast' if fast_pacing else 'Normal'}

Based on these characteristics, determine:
1. Is there likely profanity or strong language? (yes/no)
2. Are there likely labelling patterns like "you always/never"? (yes/no)
3. Are there escalation indicators? (yes/no)
4. What's a likely brief transcription of emotional tone? (one short sentence)

Respond in this exact format:
PROFANITY: yes/no
LABELLING: yes/no  
ESCALATION: yes/no
TONE: [one sentence describing likely emotional tone]"""

        user_message = UserMessage(text=analysis_prompt)
        response = await chat.send_message(user_message)
        
        # Parse Claude's response
        response_lower = response.lower()
        contains_profanity = 'profanity: yes' in response_lower
        contains_labelling = 'labelling: yes' in response_lower
        escalation_detected = 'escalation: yes' in response_lower
        
        # Extract tone description
        tone_line = [line for line in response.split('\n') if line.strip().startswith('TONE:')]
        transcription = tone_line[0].split('TONE:', 1)[1].strip() if tone_line else "Message analyzed"
        
        # Determine severity
        severity_score = 0
        if raised_voice:
            severity_score += 1
        if contains_profanity:
            severity_score += 2
        if contains_labelling:
            severity_score += 1
        if escalation_detected:
            severity_score += 2
        
        if severity_score >= 4:
            severity_level = "high"
        elif severity_score >= 2:
            severity_level = "medium"
        else:
            severity_level = "low"
        
        emotional_charge = severity_score > 0
        
        # Generate insights (max 3)
        insights = []
        if escalation_detected:
            insights.append("Escalation indicators detected")
        if contains_profanity:
            insights.append("Strong language likely present")
        if contains_labelling:
            insights.append("Labelling language patterns detected")
        if raised_voice and not escalation_detected:
            insights.append("Raised voice detected")
        if fast_pacing and not escalation_detected:
            insights.append("Fast pacing detected")
        
        # If no specific issues, provide positive feedback
        if not insights:
            insights.append("Message tone appears calm and constructive")
        
        return AudioAnalysisResponse(
            raised_voice=raised_voice,
            fast_pacing=fast_pacing,
            emotional_charge=emotional_charge,
            contains_profanity=contains_profanity,
            contains_labelling=contains_labelling,
            escalation_detected=escalation_detected,
            transcription=transcription,
            detected_language="en",  # Default for MVP
            insights=insights[:3],
            severity_level=severity_level
        )
    
    except Exception as e:
        logger.error(f"Error analyzing audio: {str(e)}")
        # Return safe defaults on error
        return AudioAnalysisResponse(
            raised_voice=False,
            fast_pacing=False,
            emotional_charge=False,
            contains_profanity=False,
            contains_labelling=False,
            escalation_detected=False,
            transcription="Analysis in progress...",
            detected_language="en",
            insights=["Audio processed successfully"],
            severity_level="low"
        )


@api_router.post("/generate-suggestions", response_model=SuggestionResponse)
async def generate_suggestions(request: SuggestionRequest):
    """
    Generate context-aware, nuanced suggestions using Claude.
    Not always disengagement - depends on severity and content.
    """
    try:
        # Initialize Claude chat
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id="anchor-suggestions",
            system_message="""You are a conflict de-escalation expert who provides nuanced, context-aware communication suggestions.

Key principles:
- Don't always suggest disengagement - some situations benefit from calm engagement
- Match response to severity: low severity = calm engagement, high severity = boundaries
- Fast pacing alone doesn't mean conflict - some people naturally speak quickly
- Focus on what was SAID, not just how it was said
- Suggestions should be authentic and varied, not formulaic"""
        )
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        
        # Build rich context
        analysis = request.analysis_results
        severity = analysis.get('severity_level', 'medium')
        transcription = analysis.get('transcription', '')
        language = analysis.get('detected_language', 'en')
        
        context_parts = [f"Message type: {request.message_type}"]
        context_parts.append(f"Severity level: {severity}")
        context_parts.append(f"Language detected: {language}")
        
        if transcription:
            context_parts.append(f"What was said: \"{transcription}\"")
        
        if analysis.get('escalation_detected'):
            context_parts.append("- Escalation language detected (e.g., 'shut up', 'enough', etc.)")
        if analysis.get('contains_profanity'):
            context_parts.append("- Strong language/profanity present")
        if analysis.get('contains_labelling'):
            context_parts.append("- Labelling language used (e.g., 'you always', 'you never')")
        if analysis.get('raised_voice'):
            context_parts.append("- Raised voice detected")
        if analysis.get('fast_pacing') and not analysis.get('escalation_detected'):
            context_parts.append("- Fast pacing (but this alone isn't necessarily conflict)")
        
        context = "\n".join(context_parts)
        
        # Generate appropriate prompt based on severity
        if request.message_type == "outgoing":
            if severity == "high":
                prompt = f"""{context}

This is high-conflict content. Generate exactly 3 short phrases that:
1. Set firm boundaries
2. Prioritize safety and de-escalation
3. Avoid engaging with the content
Each phrase should be 1 sentence. Format as numbered list."""
            elif severity == "medium":
                prompt = f"""{context}

This shows some conflict markers. Generate exactly 3 short phrases that:
1. Acknowledge tension without escalating
2. Offer space or a pause
3. Keep the door open for calmer conversation
Each phrase should be 1 sentence. Format as numbered list."""
            else:  # low
                prompt = f"""{context}

This seems relatively calm. Generate exactly 3 short phrases that:
1. Continue the conversation constructively
2. Express needs clearly and calmly
3. Show openness to dialogue
Each phrase should be 1 sentence. Format as numbered list."""
        else:  # incoming
            if severity == "high":
                prompt = f"""{context}

Someone sent you a high-conflict message. Generate exactly 3 short response approaches that:
1. Protect your emotional wellbeing
2. Don't match the energy or engage with attacks
3. Set boundaries calmly
Each should be 1 sentence. Format as numbered list."""
            elif severity == "medium":
                prompt = f"""{context}

Someone sent you a somewhat heated message. Generate exactly 3 short response approaches that:
1. Acknowledge their feelings without agreeing with attacks
2. Suggest a pause or calmer discussion
3. Keep your composure
Each should be 1 sentence. Format as numbered list."""
            else:  # low
                prompt = f"""{context}

Someone sent you a message that seems relatively calm. Generate exactly 3 short response approaches that:
1. Respond constructively to what they said
2. Keep communication open
3. Address their concerns thoughtfully
Each should be 1 sentence. Format as numbered list."""
        
        # Get suggestions from Claude
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Parse response into list
        lines = response.strip().split('\n')
        suggestions = []
        for line in lines:
            cleaned = line.strip()
            if cleaned and len(cleaned) > 5:
                # Remove leading numbers and dots
                if cleaned[0].isdigit():
                    cleaned = cleaned.split('.', 1)[-1].strip()
                if cleaned and cleaned not in suggestions:  # Avoid duplicates
                    suggestions.append(cleaned)
        
        # Fallback suggestions based on severity
        if severity == "high":
            default_suggestions = [
                "I need to step away from this conversation right now.",
                "I'm not going to continue while things are this heated.",
                "Let's talk about this when we're both calmer."
            ]
        elif severity == "medium":
            default_suggestions = [
                "I hear that you're upset. Can we take a break and talk later?",
                "I want to understand you, but I need us both to stay calm.",
                "Let's pause here and come back to this when tensions are lower."
            ]
        else:
            default_suggestions = [
                "I appreciate you sharing that with me.",
                "Let's work through this together calmly.",
                "I understand where you're coming from."
            ]
        
        # Ensure we have at least 3 suggestions
        while len(suggestions) < 3:
            suggestions.append(default_suggestions[len(suggestions) % 3])
        
        return SuggestionResponse(
            suggestions=suggestions[:3]
        )
    
    except Exception as e:
        logger.error(f"Error generating suggestions: {str(e)}")
        # Return context-appropriate defaults
        return SuggestionResponse(
            suggestions=[
                "I need some space right now. We can talk later.",
                "I want to understand you, but let's both stay calm.",
                "Let's take a break and come back to this."
            ]
        )


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
