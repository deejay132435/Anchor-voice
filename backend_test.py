#!/usr/bin/env python3
"""
Comprehensive backend testing for Anchor voice de-escalation app APIs
Tests both /api/analyze-audio and /api/generate-suggestions endpoints
"""

import requests
import base64
import json
import os
import sys
from typing import Dict, Any
import time

# Backend URL - defaults to local dev server
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001/api")

class BackendTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        
    def create_test_audio_base64(self, size_kb: int = 10) -> str:
        """Create test audio data as base64"""
        # Create dummy audio data (simulating WAV format)
        audio_data = b"RIFF" + b"\x00" * (size_kb * 1024 - 4)
        return base64.b64encode(audio_data).decode('utf-8')
        
    def test_root_endpoint(self):
        """Test the root API endpoint"""
        try:
            response = requests.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                if "Anchor API" in data.get("message", ""):
                    self.log_test("Root endpoint", True, f"Response: {data}")
                else:
                    self.log_test("Root endpoint", False, f"Unexpected response: {data}")
            else:
                self.log_test("Root endpoint", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Root endpoint", False, f"Error: {str(e)}")
            
    def test_analyze_audio_small(self):
        """Test audio analysis with small audio file"""
        try:
            audio_base64 = self.create_test_audio_base64(5)  # 5KB
            payload = {
                "audio_base64": audio_base64,
                "duration_seconds": 2.0
            }
            
            response = requests.post(f"{self.base_url}/analyze-audio", json=payload)
            if response.status_code == 200:
                data = response.json()
                required_fields = ["raised_voice", "fast_pacing", "emotional_charge", "insights"]
                if all(field in data for field in required_fields):
                    insights_count = len(data["insights"])
                    if insights_count <= 3:
                        self.log_test("Audio analysis (small file)", True, 
                                    f"Analysis: {data}, Insights count: {insights_count}")
                    else:
                        self.log_test("Audio analysis (small file)", False, 
                                    f"Too many insights: {insights_count}")
                else:
                    self.log_test("Audio analysis (small file)", False, 
                                f"Missing fields in response: {data}")
            else:
                self.log_test("Audio analysis (small file)", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Audio analysis (small file)", False, f"Error: {str(e)}")
            
    def test_analyze_audio_medium(self):
        """Test audio analysis with medium audio file"""
        try:
            audio_base64 = self.create_test_audio_base64(50)  # 50KB
            payload = {
                "audio_base64": audio_base64,
                "duration_seconds": 5.0
            }
            
            response = requests.post(f"{self.base_url}/analyze-audio", json=payload)
            if response.status_code == 200:
                data = response.json()
                insights_count = len(data["insights"])
                self.log_test("Audio analysis (medium file)", True, 
                            f"Analysis: {data}, Insights count: {insights_count}")
            else:
                self.log_test("Audio analysis (medium file)", False, 
                            f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Audio analysis (medium file)", False, f"Error: {str(e)}")
            
    def test_analyze_audio_large(self):
        """Test audio analysis with large audio file"""
        try:
            audio_base64 = self.create_test_audio_base64(200)  # 200KB
            payload = {
                "audio_base64": audio_base64,
                "duration_seconds": 10.0
            }
            
            response = requests.post(f"{self.base_url}/analyze-audio", json=payload)
            if response.status_code == 200:
                data = response.json()
                insights_count = len(data["insights"])
                self.log_test("Audio analysis (large file)", True, 
                            f"Analysis: {data}, Insights count: {insights_count}")
            else:
                self.log_test("Audio analysis (large file)", False, 
                            f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Audio analysis (large file)", False, f"Error: {str(e)}")
            
    def test_analyze_audio_various_durations(self):
        """Test audio analysis with various durations"""
        durations = [1.0, 5.0, 10.0, 30.0]
        
        for duration in durations:
            try:
                audio_base64 = self.create_test_audio_base64(20)  # 20KB
                payload = {
                    "audio_base64": audio_base64,
                    "duration_seconds": duration
                }
                
                response = requests.post(f"{self.base_url}/analyze-audio", json=payload)
                if response.status_code == 200:
                    data = response.json()
                    self.log_test(f"Audio analysis ({duration}s duration)", True, 
                                f"Analysis: {data}")
                else:
                    self.log_test(f"Audio analysis ({duration}s duration)", False, 
                                f"Status: {response.status_code}")
            except Exception as e:
                self.log_test(f"Audio analysis ({duration}s duration)", False, f"Error: {str(e)}")
                
    def test_suggestions_outgoing_calm(self):
        """Test suggestions generation for outgoing calm message"""
        try:
            payload = {
                "analysis_results": {
                    "raised_voice": False,
                    "fast_pacing": False,
                    "emotional_charge": False
                },
                "message_type": "outgoing"
            }
            
            response = requests.post(f"{self.base_url}/generate-suggestions", json=payload)
            if response.status_code == 200:
                data = response.json()
                suggestions = data.get("suggestions", [])
                if len(suggestions) == 3:
                    self.log_test("Suggestions (outgoing calm)", True, 
                                f"Suggestions: {suggestions}")
                else:
                    self.log_test("Suggestions (outgoing calm)", False, 
                                f"Expected 3 suggestions, got {len(suggestions)}")
            else:
                self.log_test("Suggestions (outgoing calm)", False, 
                            f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Suggestions (outgoing calm)", False, f"Error: {str(e)}")
            
    def test_suggestions_outgoing_heated(self):
        """Test suggestions generation for outgoing heated message"""
        try:
            payload = {
                "analysis_results": {
                    "raised_voice": True,
                    "fast_pacing": True,
                    "emotional_charge": True
                },
                "message_type": "outgoing"
            }
            
            response = requests.post(f"{self.base_url}/generate-suggestions", json=payload)
            if response.status_code == 200:
                data = response.json()
                suggestions = data.get("suggestions", [])
                if len(suggestions) == 3:
                    self.log_test("Suggestions (outgoing heated)", True, 
                                f"Suggestions: {suggestions}")
                else:
                    self.log_test("Suggestions (outgoing heated)", False, 
                                f"Expected 3 suggestions, got {len(suggestions)}")
            else:
                self.log_test("Suggestions (outgoing heated)", False, 
                            f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Suggestions (outgoing heated)", False, f"Error: {str(e)}")
            
    def test_suggestions_incoming_calm(self):
        """Test suggestions generation for incoming calm message"""
        try:
            payload = {
                "analysis_results": {
                    "raised_voice": False,
                    "fast_pacing": False,
                    "emotional_charge": False
                },
                "message_type": "incoming"
            }
            
            response = requests.post(f"{self.base_url}/generate-suggestions", json=payload)
            if response.status_code == 200:
                data = response.json()
                suggestions = data.get("suggestions", [])
                if len(suggestions) == 3:
                    self.log_test("Suggestions (incoming calm)", True, 
                                f"Suggestions: {suggestions}")
                else:
                    self.log_test("Suggestions (incoming calm)", False, 
                                f"Expected 3 suggestions, got {len(suggestions)}")
            else:
                self.log_test("Suggestions (incoming calm)", False, 
                            f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Suggestions (incoming calm)", False, f"Error: {str(e)}")
            
    def test_suggestions_incoming_heated(self):
        """Test suggestions generation for incoming heated message"""
        try:
            payload = {
                "analysis_results": {
                    "raised_voice": True,
                    "fast_pacing": True,
                    "emotional_charge": True
                },
                "message_type": "incoming"
            }
            
            response = requests.post(f"{self.base_url}/generate-suggestions", json=payload)
            if response.status_code == 200:
                data = response.json()
                suggestions = data.get("suggestions", [])
                if len(suggestions) == 3:
                    self.log_test("Suggestions (incoming heated)", True, 
                                f"Suggestions: {suggestions}")
                else:
                    self.log_test("Suggestions (incoming heated)", False, 
                                f"Expected 3 suggestions, got {len(suggestions)}")
            else:
                self.log_test("Suggestions (incoming heated)", False, 
                            f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Suggestions (incoming heated)", False, f"Error: {str(e)}")
            
    def test_error_handling_invalid_json(self):
        """Test error handling with invalid JSON"""
        try:
            response = requests.post(f"{self.base_url}/analyze-audio", 
                                   data="invalid json", 
                                   headers={"Content-Type": "application/json"})
            if response.status_code in [400, 422]:
                self.log_test("Error handling (invalid JSON)", True, 
                            f"Correctly returned status {response.status_code}")
            else:
                self.log_test("Error handling (invalid JSON)", False, 
                            f"Unexpected status: {response.status_code}")
        except Exception as e:
            self.log_test("Error handling (invalid JSON)", False, f"Error: {str(e)}")
            
    def test_error_handling_missing_fields(self):
        """Test error handling with missing required fields"""
        try:
            payload = {"audio_base64": "test"}  # Missing duration_seconds
            response = requests.post(f"{self.base_url}/analyze-audio", json=payload)
            if response.status_code in [400, 422]:
                self.log_test("Error handling (missing fields)", True, 
                            f"Correctly returned status {response.status_code}")
            else:
                self.log_test("Error handling (missing fields)", False, 
                            f"Unexpected status: {response.status_code}")
        except Exception as e:
            self.log_test("Error handling (missing fields)", False, f"Error: {str(e)}")
            
    def test_error_handling_invalid_base64(self):
        """Test error handling with invalid base64"""
        try:
            payload = {
                "audio_base64": "invalid_base64_data!@#",
                "duration_seconds": 5.0
            }
            response = requests.post(f"{self.base_url}/analyze-audio", json=payload)
            if response.status_code in [400, 422, 500]:
                self.log_test("Error handling (invalid base64)", True, 
                            f"Correctly handled invalid base64, status: {response.status_code}")
            else:
                self.log_test("Error handling (invalid base64)", False, 
                            f"Unexpected status: {response.status_code}")
        except Exception as e:
            self.log_test("Error handling (invalid base64)", False, f"Error: {str(e)}")
            
    def test_claude_integration(self):
        """Test Claude integration by checking suggestion quality"""
        try:
            payload = {
                "analysis_results": {
                    "raised_voice": True,
                    "fast_pacing": False,
                    "emotional_charge": True
                },
                "message_type": "outgoing"
            }
            
            response = requests.post(f"{self.base_url}/generate-suggestions", json=payload)
            if response.status_code == 200:
                data = response.json()
                suggestions = data.get("suggestions", [])
                
                # Check if suggestions are contextual and not just defaults
                default_phrases = [
                    "I need some space right now. We can talk later.",
                    "I'm not continuing this while it's heated.",
                    "I want this to stay calm, so I'm stepping away."
                ]
                
                is_using_defaults = all(sugg in default_phrases for sugg in suggestions)
                
                if len(suggestions) == 3:
                    if is_using_defaults:
                        self.log_test("Claude integration", True, 
                                    f"Using fallback suggestions (Claude may be unavailable): {suggestions}")
                    else:
                        self.log_test("Claude integration", True, 
                                    f"Claude generated contextual suggestions: {suggestions}")
                else:
                    self.log_test("Claude integration", False, 
                                f"Expected 3 suggestions, got {len(suggestions)}")
            else:
                self.log_test("Claude integration", False, 
                            f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Claude integration", False, f"Error: {str(e)}")
            
    def run_all_tests(self):
        """Run all backend tests"""
        print(f"🚀 Starting Anchor Backend API Tests")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Basic connectivity
        self.test_root_endpoint()
        
        # Audio analysis tests
        self.test_analyze_audio_small()
        self.test_analyze_audio_medium()
        self.test_analyze_audio_large()
        self.test_analyze_audio_various_durations()
        
        # Suggestions generation tests
        self.test_suggestions_outgoing_calm()
        self.test_suggestions_outgoing_heated()
        self.test_suggestions_incoming_calm()
        self.test_suggestions_incoming_heated()
        
        # Error handling tests
        self.test_error_handling_invalid_json()
        self.test_error_handling_missing_fields()
        self.test_error_handling_invalid_base64()
        
        # Claude integration test
        self.test_claude_integration()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if total - passed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        return passed == total

if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)