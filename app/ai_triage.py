"""
Baari — app/ai_triage.py
Rule-based & keyword-enhanced AI triage engine for patient symptom analysis.
Extracts:
1) Patient Name
2) Reason / Symptoms
3) Urgency Level (Emergency, Daily Life Problem, Routine)
4) Suggested Department
Supports English, Hindi, and Marathi with zero external latency or API keys.
"""

import re
from typing import Optional, Dict, Any, Tuple
from app.voice.intent import extract_patient_name, parse_department_intent, DEPARTMENT_KEYWORDS

# ── Urgency Keywords & Rules ──────────────────────────────────────────────

EMERGENCY_KEYWORDS = [
    # English
    "chest pain", "heart attack", "difficulty breathing", "cannot breathe", "can't breathe",
    "shortness of breath", "severe bleeding", "unconscious", "accident", "trauma",
    "head injury", "stroke", "paralysis", "collapsed", "seizure", "convulsion",
    "choking", "severe burn", "poison", "poisoning", "acute", "electric shock",
    "labor pain", "labour pain", "active labor", "amniotic", "water broke",
    # Hindi
    "सीने में दर्द", "छाती में दर्द", "दिल का दौरा", "सांस नहीं आ रही", "सांस फूलना",
    "दम घुटना", "खून बहना", "बेहोश", "एक्सीडेंट", "दुर्घटना", "गंभीर चोट",
    "दौरा", "लकवा", "जल गया", "जहर", "बिजली का झटका", "प्रसव पीड़ा", "डिलीवरी दर्द",
    # Marathi
    "छातीत दुखणे", "श्वास घेण्यास त्रास", "श्वास कोंडणे", "रक्तस्त्राव", "बेशुद्ध",
    "अपघात", "गंभीर दुखापत", "झटका", "पक्षाघात", "भाजणे", "विष", "प्रसूती वेदना",
]

DAILY_LIFE_URGENT_KEYWORDS = [
    # English
    "high fever", "102 fever", "103 fever", "severe fever", "acute pain", "severe pain",
    "stomach ache", "vomiting", "loose motions", "diarrhea", "dehydration",
    "fracture", "broken bone", "sprain", "twisted ankle", "infection",
    "migraine", "severe headache", "kidney stone", "high bp", "bp spike",
    "burning urination", "ear pain", "eye infection", "allergic reaction",
    "distress", "urgent", "daily life problem", "can't walk",
    # Hindi
    "तेज बुखार", "बुखार", "पेट दर्द", "उल्टी", "दस्त", "लूज मोशन", "हड्डी टूट गई",
    "फ्रैक्चर", "मोच", "गंभीर सिरदर्द", "माइग्रेन", "संक्रमण", "पथरी", "पेशाब में जलन",
    "कान में दर्द", "आंख में दर्द", "चक्कर",
    # Marathi
    "तीव्र ताप", "ताप", "पोटदुखी", "उलट्या", "जुलाब", "हाड मोडले", "फ्रॅक्चर",
    "मोच", "डोकेदुखी", "संसर्ग", "खडे", "चक्कर", "अशक्तपणा",
]

ROUTINE_KEYWORDS = [
    # English
    "checkup", "check up", "routine", "regular", "follow up", "follow-up",
    "consultation", "prescription", "refill", "medicine", "sugar check",
    "blood pressure check", "bp check", "mild cold", "mild cough", "general advice",
    "report review", "test results", "dressing", "stitch removal", "normal",
    # Hindi
    "सामान्य जांच", "रूटीन", "चेकअप", "दवा लिखवाना", "पर्चा", "शुगर जांच",
    "बीपी जांच", "हल्का जुकाम", "हल्की खांसी", "रिपोर्ट दिखाना", "दिखाने आया हूँ",
    # Marathi
    "तपासणी", "नेहमीची तपासणी", "फॉलोअप", "औषध घेणे", "रक्तदाब तपासणी",
    "साखर तपासणी", "साधा खोकला", "रिपोर्ट दाखवणे",
]


def clean_symptoms(text: str, name: Optional[str] = None) -> str:
    """Extract clean symptoms by removing pleasantries and intro phrases."""
    clean = text.strip()
    
    # Remove intros like "My name is John Doe and" or "मेरा नाम..."
    if name:
        clean = re.sub(re.escape(name), "", clean, flags=re.IGNORECASE)
    
    clean = re.sub(r"(?:my name is|i am|this is|i'm)\s*[:\-\s]*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"(?:मेरा नाम|मैं|मै|माझे नाव|मी)\s*[:\-\s]*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\b(hello|hi|hey|doctor|dr|please|sir|madam|namaste)\b", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s+", " ", clean).strip(" ,.-")
    
    return clean if clean else text.strip()


def triage_patient(text: str, language: str = "en") -> Dict[str, Any]:
    """
    Main AI Triage classification.
    Returns:
      - detected_name
      - symptoms
      - priority_class: 'emergency' | 'daily_life' | 'routine'
      - priority_label
      - suggested_department_code
      - triage_reason
      - confidence
    """
    lower = text.lower().strip()
    name = extract_patient_name(text)
    symptoms = clean_symptoms(text, name)

    # 1. Check Emergency (Priority 1)
    for kw in EMERGENCY_KEYWORDS:
        if kw in lower:
            dept_code = parse_department_intent(text) or "G"
            return {
                "detected_name": name,
                "symptoms": symptoms,
                "priority_class": "emergency",
                "priority_label": "Emergency / Critical (Level 1)",
                "suggested_department_code": dept_code,
                "triage_reason": f"Critical symptom detected: '{kw}'. Immediate medical attention is prioritized at the top of the queue.",
                "confidence": 0.98,
            }

    # 2. Check Daily Life Urgent Problem (Priority 2)
    for kw in DAILY_LIFE_URGENT_KEYWORDS:
        if kw in lower:
            dept_code = parse_department_intent(text) or "G"
            return {
                "detected_name": name,
                "symptoms": symptoms,
                "priority_class": "daily_life",
                "priority_label": "Daily Life Problem / Urgent (Level 2)",
                "suggested_department_code": dept_code,
                "triage_reason": f"Urgent symptom detected: '{kw}'. Prioritized ahead of routine OPD checkups.",
                "confidence": 0.92,
            }

    # 3. Routine Consultation (Priority 3)
    dept_code = parse_department_intent(text) or "G"
    return {
        "detected_name": name,
        "symptoms": symptoms if symptoms else "General consultation / routine visit",
        "priority_class": "routine",
        "priority_label": "Routine / General Checkup (Level 3)",
        "suggested_department_code": dept_code,
        "triage_reason": "Standard consultation or routine follow-up. Placed in sequential turn.",
        "confidence": 0.88,
    }
