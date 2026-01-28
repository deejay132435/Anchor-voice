import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || '';

export interface AudioAnalysisResponse {
  raised_voice: boolean;
  fast_pacing: boolean;
  emotional_charge: boolean;
  insights: string[];
}

export interface SuggestionResponse {
  suggestions: string[];
}

export const analyzeAudio = async (
  audioBase64: string,
  durationSeconds: number
): Promise<AudioAnalysisResponse> => {
  const response = await fetch(`${API_URL}/api/analyze-audio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_base64: audioBase64,
      duration_seconds: durationSeconds,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to analyze audio');
  }

  return response.json();
};

export const generateSuggestions = async (
  analysisResults: any,
  messageType: 'outgoing' | 'incoming'
): Promise<SuggestionResponse> => {
  const response = await fetch(`${API_URL}/api/generate-suggestions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      analysis_results: analysisResults,
      message_type: messageType,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate suggestions');
  }

  return response.json();
};
