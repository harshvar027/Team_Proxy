"""
Baari — app/voice module
Voice processing, STT, TTS, and multi-lingual intent parsing.
"""

from app.voice.intent import (
    parse_department_intent,
    extract_patient_name,
    parse_patient_request,
    DEPARTMENT_KEYWORDS,
)
from app.voice.stt import transcribe_audio_file, get_stt_model
from app.voice.tts import synthesize_speech

__all__ = [
    "parse_department_intent",
    "extract_patient_name",
    "parse_patient_request",
    "DEPARTMENT_KEYWORDS",
    "transcribe_audio_file",
    "get_stt_model",
    "synthesize_speech",
]
