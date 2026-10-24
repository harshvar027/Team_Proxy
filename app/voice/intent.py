"""
Baari — app/voice/intent.py
Deterministic rule-based intent and entity parser for patient voice & text requests.
Supports Hindi, Marathi, and English. No external LLM or cloud API required.
"""

import re
from typing import Optional, Tuple


# Keyword dictionaries mapping natural language words to department codes
DEPARTMENT_KEYWORDS = {
    # General Medicine ("G")
    "G": [
        # English
        "general", "medicine", "fever", "cough", "cold", "headache", "stomach",
        "weakness", "body pain", "checkup", "flu", "vomiting", "nausea", "sugar",
        "bp", "blood pressure", "diabetes", "physician", "doctor",
        # Hindi
        "जनरल", "सामान्य", "बुखार", "खांसी", "जुकाम", "सिरदर्द", "पेट दर्द", "उल्टी",
        "कमजोरी", "दवा", "दवाई", "डॉक्टर", "जांच", "बीपी", "शुगर", "चक्कर",
        # Marathi
        "ताप", "खोकला", "सर्दी", "डोकेदुखी", "पोटदुखी", "औषध", "तपासणी",
        "उलटी", "अशक्तपणा", "चक्कर येणे", "सामान्य",
    ],
    # Orthopedics ("O")
    "O": [
        # English
        "ortho", "orthopedic", "orthopaedics", "bone", "fracture", "joint",
        "knee", "leg", "arm", "hand", "back", "spine", "arthritis", "sprain",
        "shoulder", "waist", "plaster",
        # Hindi
        "हड्डी", "जोड़", "फ्रैक्चर", "टूटी", "प्लास्टर", "घुटना", "कमर", "दर्द",
        "पीठ", "कंधा", "पैर", "हाथ", "मोच", "गठिया", "ऑर्थो",
        # Marathi
        "हाड", "हाडे", "सांधे", "सांधेदुखी", "फ्रॅक्चर", "कंबर", "गुडघा",
        "पाठीचे", "खांदा", "पाय", "हात", "प्लास्टर", "मोच",
    ],
    # Gynecology ("Y")
    "Y": [
        # English
        "gynecology", "gyno", "gynaecology", "women", "pregnancy", "pregnant",
        "delivery", "period", "periods", "maternity", "ultrasound", "baby",
        # Hindi
        "स्त्री रोग", "महिला", "औरत", "गर्भवती", "गर्भ", "डिलीवरी", "बच्चादानी",
        "मासिक धर्म", "पीरियड्स", "प्रसूति", "गाइनी",
        # Marathi
        "स्त्रीरोग", "महिला", "गरोदर", "गरोदरपण", "बाळंतपण", "मासिक पाळी",
        "प्रसूती", "स्त्री",
    ],
    # Pediatrics ("P")
    "P": [
        # English
        "pediatric", "pediatrics", "paediatrics", "child", "children", "baby",
        "infant", "vaccine", "vaccination", "kid", "kids",
        # Hindi
        "बच्चा", "बच्चे", "शिशु", "बाल रोग", "छोटा बच्चा", "टीका", "टीकाकरण",
        "बालरोग", "बाल",
        # Marathi
        "बाळ", "लहान मूल", "लहान मुले", "बालरोग", "बालक", "लस", "लसीकरण",
    ],
}


def parse_department_intent(text: str) -> Optional[str]:
    """
    Extract the most likely department code ('G', 'O', 'Y', 'P') from spoken or typed text.
    Returns None if no clear match.
    """
    clean_text = text.lower().strip()
    scores = {"G": 0, "O": 0, "Y": 0, "P": 0}

    for code, keywords in DEPARTMENT_KEYWORDS.items():
        for kw in keywords:
            # Check for whole word match or phrase inclusion
            if kw in clean_text:
                # Longer phrases get higher weight
                weight = 2 if len(kw) > 4 else 1
                scores[code] += weight

    best_code = max(scores, key=lambda k: scores[k])
    if scores[best_code] > 0:
        return best_code
    return None


def extract_patient_name(text: str) -> Optional[str]:
    """
    Extract patient name from Hindi, Marathi, or English introduction phrases.
    Examples:
    - "मेरा नाम राहुल शर्मा है" -> "राहुल शर्मा"
    - "माझे नाव सचिन पाटील आहे" -> "सचिन पाटील"
    - "My name is John Doe" -> "John Doe"
    - "I am Amit Kumar" -> "Amit Kumar"
    """
    patterns = [
        # Hindi: मेरा नाम <NAME> है / मैं <NAME> हूँ
        r"(?:मेरा नाम|नाम)\s+([A-Za-z\u0900-\u097F\s]{2,30}?)(?:\s+है|\s+हूँ|$)",
        r"(?:मैं|मै)\s+([A-Za-z\u0900-\u097F\s]{2,30}?)(?:\s+हूँ|\s+बोल रहा|\s+बोल रही|$)",

        # Marathi: माझे नाव <NAME> आहे / मी <NAME> आहे
        r"(?:माझे नाव|नाव)\s+([A-Za-z\u0900-\u097F\s]{2,30}?)(?:\s+आहे|$)",
        r"(?:मी)\s+([A-Za-z\u0900-\u097F\s]{2,30}?)(?:\s+आहे|\s+बोलत|$)",

        # English: My name is <NAME> / I am <NAME> / This is <NAME>
        r"(?:my name is|name is|i am|this is)\s+([A-Za-z\s]{2,30}?)(?:\.|\,|$|\sand\b)",
    ]

    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            name = m.group(1).strip()
            # Clean up common trailing punctuation or conjunctions
            name = re.sub(r"\b(and|aur|आणि|आहे|है)\b", "", name, flags=re.IGNORECASE).strip()
            if len(name) >= 2:
                # Format properly if latin characters
                return name.title() if name.isascii() else name

    return None


def parse_patient_request(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Convenience method returning (detected_name, detected_department_code).
    """
    name = extract_patient_name(text)
    dept_code = parse_department_intent(text)
    return name, dept_code
