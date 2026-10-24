"""
Baari — app/voice/stt.py
Local Speech-to-Text service using faster-whisper on CPU with fallback.
Audio files are transcribed and deleted immediately after processing to protect patient privacy.
"""

import os
import tempfile
import logging
from typing import Optional
from app.config import settings

logger = logging.getLogger("baari.voice.stt")

# Global whisper model instance (loaded lazily on first request if available)
_whisper_model = None
_model_failed = False


def get_stt_model():
    """Lazily load the faster-whisper model."""
    global _whisper_model, _model_failed
    if _model_failed:
        return None
    if _whisper_model is not None:
        return _whisper_model

    try:
        from faster_whisper import WhisperModel
        model_size = settings.whisper_model_size
        model_dir = settings.whisper_model_dir
        logger.info(f"Loading faster-whisper ({model_size}) from {model_dir}...")
        _whisper_model = WhisperModel(
            model_size,
            device="cpu",
            compute_type="int8",
            download_root=model_dir if os.path.exists(model_dir) else None,
        )
        logger.info("faster-whisper model loaded successfully.")
        return _whisper_model
    except Exception as e:
        logger.warning(f"Could not load faster-whisper ({e}). Browser Web Speech API fallback will be used.")
        _model_failed = True
        return None


def transcribe_audio_file(audio_bytes: bytes, filename: str = "audio.wav", language: Optional[str] = None) -> dict:
    """
    Transcribes audio bytes to text.
    Immediately deletes the temporary file afterwards.
    Returns: {"text": str, "language": str, "used_local_model": bool}
    """
    # Write bytes to temporary file
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"baari_stt_{os.getpid()}_{filename}")

    try:
        with open(temp_path, "wb") as f:
            f.write(audio_bytes)

        model = get_stt_model()
        if model is None:
            return {
                "text": "",
                "language": language or "en",
                "used_local_model": False,
                "message": "Local STT model not loaded. Please use browser voice input (Web Speech API).",
            }

        # Transcribe with language hint if provided
        whisper_lang = "hi" if language == "hi" else ("mr" if language == "mr" else "en")
        segments, info = model.transcribe(
            temp_path,
            language=whisper_lang,
            beam_size=3,
            vad_filter=True,
        )

        full_text = " ".join(seg.text for seg in segments).strip()
        return {
            "text": full_text,
            "language": info.language,
            "used_local_model": True,
            "message": "Transcribed successfully with local faster-whisper.",
        }

    except Exception as e:
        logger.error(f"Error during audio transcription: {e}")
        return {
            "text": "",
            "language": language or "en",
            "used_local_model": False,
            "message": f"Transcription error: {str(e)}",
        }
    finally:
        # Strictly delete the temporary audio file
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
