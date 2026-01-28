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
    insights: List[str]


class SuggestionRequest(BaseModel):
    analysis_results: dict
    message_type: str  # "outgoing" or "incoming"


class SuggestionResponse(BaseModel):
    suggestions: List[str]


@api_router.get("/")
async def root():
    return {"message": "Anchor API - Voice De-escalation Tool"}


@api_router.post("/analyze-audio", response_model=AudioAnalysisResponse)
async def analyze_audio(request: AudioAnalysisRequest):
    """
    Analyze audio for volume, pacing, and emotional indicators.
    Note: This is a simplified analysis based on audio properties.
    Real implementation would use audio processing libraries.
    """
    try:
        # Decode base64 audio
        audio_bytes = base64.b64decode(request.audio_base64)
        
        # Simple heuristic analysis based on audio size and duration
        # In production, you'd use librosa or similar for actual audio analysis
        audio_size_kb = len(audio_bytes) / 1024
        
        # Heuristics (these are simplified for MVP)
        # Larger file size relative to duration suggests higher volume/bitrate
        size_per_second = audio_size_kb / request.duration_seconds if request.duration_seconds > 0 else 0
        
        raised_voice = size_per_second > 30  # Simplified threshold
        fast_pacing = request.duration_seconds > 0 and (len(audio_bytes) / request.duration_seconds) > 15000  # Simplified
        emotional_charge = raised_voice or fast_pacing
        
        # Generate insights (max 2-3)
        insights = []
        if raised_voice:
            insights.append("Raised voice detected")
        if fast_pacing:
            insights.append("Fast pacing detected")
        if emotional_charge and not raised_voice and not fast_pacing:
            insights.append("Emotional charge likely")
        
        # If no specific insights, provide neutral feedback
        if not insights:
            insights.append("Message tone appears calm")
        
        return AudioAnalysisResponse(
            raised_voice=raised_voice,
            fast_pacing=fast_pacing,
            emotional_charge=emotional_charge,
            insights=insights[:3]  # Max 3 insights
        )
    
    except Exception as e:
        logger.error(f"Error analyzing audio: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error analyzing audio: {str(e)}")


@api_router.post("/generate-suggestions", response_model=SuggestionResponse)
async def generate_suggestions(request: SuggestionRequest):
    """
    Generate neutral de-escalation suggestions using Claude.
    """
    try:
        # Initialize Claude chat
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id="anchor-suggestions",
            system_message="You are a conflict de-escalation expert. Generate short, neutral boundary-setting phrases that help users avoid reactive behavior. Focus on disengagement and self-control, not winning arguments. Each suggestion should be 1-2 sentences maximum."
        )
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        
        # Build context based on analysis
        analysis = request.analysis_results
        context = f"Message type: {request.message_type}\n"
        
        if analysis.get('raised_voice'):
            context += "- Raised voice detected\n"
        if analysis.get('fast_pacing'):
            context += "- Fast pacing detected\n"
        if analysis.get('emotional_charge'):
            context += "- Emotional charge present\n"
        
        if request.message_type == "outgoing":
            prompt = f"{context}\nGenerate exactly 3 short, neutral phrases the user could say instead to de-escalate. Focus on setting boundaries and taking space. Each phrase should be one sentence. Format as numbered list."
        else:  # incoming
            prompt = f"{context}\nGenerate exactly 3 short, calm response approaches for someone who just received this message. Focus on disengagement strategies. Each should be one sentence. Format as numbered list."
        
        # Get suggestions from Claude
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Parse response into list (simple parsing)
        lines = response.strip().split('\n')
        suggestions = []
        for line in lines:
            # Remove numbering and clean up
            cleaned = line.strip()
            if cleaned and len(cleaned) > 5:  # Basic validation
                # Remove leading numbers and dots
                if cleaned[0].isdigit():
                    cleaned = cleaned.split('.', 1)[-1].strip()
                suggestions.append(cleaned)
        
        # Ensure we have at least 3 suggestions, add defaults if needed
        default_suggestions = [
            "I need some space right now. We can talk later.",
            "I'm not continuing this while it's heated.",
            "I want this to stay calm, so I'm stepping away."
        ]
        
        while len(suggestions) < 3:
            suggestions.append(default_suggestions[len(suggestions) % 3])
        
        return SuggestionResponse(
            suggestions=suggestions[:3]  # Return exactly 3
        )
    
    except Exception as e:
        logger.error(f"Error generating suggestions: {str(e)}")
        # Return default suggestions on error
        return SuggestionResponse(
            suggestions=[
                "I need some space right now. We can talk later.",
                "I'm not continuing this while it's heated.",
                "I want this to stay calm, so I'm stepping away."
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
