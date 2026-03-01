import Constants from 'expo-constants';

// Get API URL from environment or app config
const getApiUrl = (): string => {
  // First try environment variable (set during build)
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl) return envUrl;

  // Then try app.json extra config
  const configUrl = Constants.expoConfig?.extra?.apiUrl;
  if (configUrl) return configUrl;

  // Fallback to localhost for development only
  if (__DEV__) {
    console.warn('API_URL not configured. Using development default.');
    return 'http://localhost:8001';
  }

  // In production, use the hardcoded production URL as safety net
  return 'https://anchor-voice-production.up.railway.app';
};

const API_URL = getApiUrl();

export interface AudioAnalysisResponse {
  raised_voice: boolean;
  fast_pacing: boolean;
  emotional_charge: boolean;
  contains_profanity: boolean;
  contains_labelling: boolean;
  contains_blame: boolean;
  contains_absolutes: boolean;
  contains_threats: boolean;
  contains_dismissive: boolean;
  escalation_detected: boolean;
  escalation_words: Record<string, string[]>;
  emotion: {
    primary_emotion: string;
    confidence: number;
    emotions: Record<string, number>;
  };
  insights: string[];
  severity_level: string;
  suggestions?: string[];  // Included when message_type is provided
}

export interface SuggestionResponse {
  suggestions: string[];
}

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs = 30000,
  maxRetries = 2
): Promise<Response> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        return response;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error: any) {
      lastError = error;
      if (error.name === 'AbortError') {
        lastError = new Error('Request timed out. Check your connection.');
      } else {
        lastError = new Error('Cannot reach server. Check your connection.');
      }

      // Retry on network errors (but not on abort/timeout after last attempt)
      if (attempt < maxRetries && error.name !== 'AbortError') {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('Request failed');
};

export const analyzeAudio = async (
  audioBase64: string,
  durationSeconds: number,
  messageType?: 'outgoing' | 'incoming'
): Promise<AudioAnalysisResponse> => {
  // Validate input
  if (!audioBase64 || audioBase64.length === 0) {
    throw new Error('Audio data is empty');
  }
  if (audioBase64.length > 5242880) { // 5MB limit
    throw new Error('Audio file too large (max 5MB)');
  }

  const body: Record<string, any> = {
    audio_base64: audioBase64,
    duration_seconds: Math.max(1, durationSeconds),
  };
  // Include message_type to get suggestions in the same response (saves a round trip)
  if (messageType) {
    body.message_type = messageType;
  }

  const response = await fetchWithTimeout(`${API_URL}/api/analyze-audio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Analysis failed (${response.status})`);
  }

  return response.json();
};

export const generateSuggestions = async (
  analysisResults: AudioAnalysisResponse,
  messageType: 'outgoing' | 'incoming'
): Promise<SuggestionResponse> => {
  const response = await fetchWithTimeout(`${API_URL}/api/generate-suggestions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      analysis_results: {
        raised_voice: analysisResults.raised_voice,
        fast_pacing: analysisResults.fast_pacing,
        emotional_charge: analysisResults.emotional_charge,
      },
      message_type: messageType,
    }),
  });

  if (!response.ok) {
    throw new Error(`Suggestions failed (${response.status})`);
  }

  return response.json();
};
