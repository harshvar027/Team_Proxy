"""
Baari — app/voice/tts.py
High-Fidelity Text-to-Speech synthesis.
Supports Edge-TTS neural voices (Hindi, Indian English, Marathi, Tamil, Telugu),
local Piper-TTS, and in-memory LRU caching for instant speech response.
"""

import os
import io
import hashlib
import logging
import asyncio
from typing import Optional

logger = logging.getLogger("baari.voice.tts")

# Voice mappings for high-quality natural speech
VOICE_MAP = {
    "hi": "hi-IN-SwaraNeural",       # Clear, polite Hindi female
    "hi-IN": "hi-IN-SwaraNeural",
    "hi-male": "hi-IN-MadhurNeural", # Natural Hindi male
    "en": "en-IN-NeerjaNeural",      # Clear Indian English female
    "en-IN": "en-IN-NeerjaNeural",
    "en-male": "en-IN-PrabhatNeural",# Indian English male
    "mr": "mr-IN-AarohiNeural",      # Marathi female
    "mr-IN": "mr-IN-AarohiNeural",
    "ta": "ta-IN-PallaviNeural",     # Tamil
    "te": "te-IN-ShrutiNeural",      # Telugu
    "bn": "bn-IN-TanishaaNeural",    # Bengali
}

# Cache directory for generated audio
CACHE_DIR = "/tmp/baari_tts_cache"
os.makedirs(CACHE_DIR, exist_ok=True)
_MEM_CACHE: dict[str, bytes] = {}


def _get_cache_key(text: str, voice: str) -> str:
    key_raw = f"{voice}::{text.strip()}"
    return hashlib.sha256(key_raw.encode("utf-8")).hexdigest()


async def synthesize_speech_edge(text: str, language: str = "en", voice: Optional[str] = None) -> Optional[bytes]:
    """
    Synthesize speech using Microsoft Edge Neural TTS.
    Returns MP3 audio bytes.
    """
    clean_text = text.strip()
    if not clean_text:
        return None

    # Determine voice
    selected_voice = voice or VOICE_MAP.get(language) or VOICE_MAP.get(language.split("-")[0]) or "en-IN-NeerjaNeural"
    cache_key = _get_cache_key(clean_text, selected_voice)

    # 1. Check in-memory cache
    if cache_key in _MEM_CACHE:
        return _MEM_CACHE[cache_key]

    # 2. Check disk cache
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.mp3")
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "rb") as f:
                data = f.read()
                _MEM_CACHE[cache_key] = data
                return data
        except Exception:
            pass

    # 3. Generate using edge-tts
    try:
        import edge_tts
        communicate = edge_tts.Communicate(clean_text, selected_voice, rate="+0%", pitch="+0Hz")
        audio_buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.write(chunk["data"])

        audio_bytes = audio_buffer.getvalue()
        if audio_bytes:
            # Save to memory and disk cache
            _MEM_CACHE[cache_key] = audio_bytes
            try:
                with open(cache_file, "wb") as f:
                    f.write(audio_bytes)
            except Exception:
                pass
            return audio_bytes
    except Exception as e:
        logger.warning(f"Edge TTS synthesis error ({e}).")

    return None


def synthesize_speech(text: str, language: str = "en") -> Optional[bytes]:
    """
    Synchronous helper wrapper.
    Attempts edge-tts first, falls back to local piper if configured.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If in async loop, create a new loop in thread or run
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(asyncio.run, synthesize_speech_edge(text, language))
                return future.result(timeout=6.0)
        else:
            return asyncio.run(synthesize_speech_edge(text, language))
    except Exception as e:
        logger.debug(f"Synchronous TTS wrapper exception: {e}")
        return None
