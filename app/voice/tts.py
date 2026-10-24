"""
Baari — app/voice/tts.py
Text-to-Speech synthesis with local piper-tts support and browser SpeechSynthesis fallback.
"""

import os
import io
import logging
from typing import Optional
from app.config import settings

logger = logging.getLogger("baari.voice.tts")


def synthesize_speech(text: str, language: str = "en") -> Optional[bytes]:
    """
    Synthesize speech audio from text using local Piper TTS if available.
    Returns audio WAV bytes or None (falling back to browser Web Speech API).
    """
    try:
        # Check if piper-tts is installed and models are present
        import piper
        model_path = os.path.join(settings.piper_model_dir, f"{language}.onnx")
        if not os.path.exists(model_path):
            return None

        # Piper synthesis logic if model weights exist
        voice = piper.PiperVoice.load(model_path)
        out_wav = io.BytesIO()
        voice.synthesize(text, out_wav)
        return out_wav.getvalue()
    except Exception as e:
        logger.debug(f"Piper TTS not available ({e}), using in-browser TTS.")
        return None
