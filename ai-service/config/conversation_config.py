"""
Conversation screening configuration: required fields, question order, and prompts.

PROJECT / DEVELOPMENT assumptions — not clinical guidelines.
"""

from __future__ import annotations

# Ordered fields for preliminary eligibility collection
REQUIRED_FIELD_ORDER: list[str] = [
    "age",
    "weight_kg",
    "days_since_last_donation",
    "recent_illness",
    "fever",
    "current_medication",
    "antibiotics",
    "recent_surgery",
    "recent_dental_procedure",
    "recent_tattoo_or_piercing",
    "pregnancy_status",
    "chronic_condition_reported",
    "recent_blood_transfusion",
    "hemoglobin_known",
]

SCREENING_QUESTIONS: dict[str, str] = {
    "age": "How old are you?",
    "weight_kg": "What is your approximate weight in kilograms?",
    "days_since_last_donation": (
        "Have you donated blood before? If yes, approximately when was your last donation?"
    ),
    "recent_illness": "Have you been sick or had an infection recently?",
    "fever": "Do you currently have a fever or unusually high temperature?",
    "current_medication": "Are you currently taking any medication?",
    "antibiotics": "Are you currently taking antibiotics?",
    "recent_surgery": "Have you had surgery recently?",
    "recent_dental_procedure": "Have you had a dental procedure recently?",
    "recent_tattoo_or_piercing": "Have you had a tattoo or piercing recently?",
    "pregnancy_status": (
        "For the pregnancy-related screening question, are you currently pregnant?"
    ),
    "chronic_condition_reported": (
        "Do you have any chronic medical condition you think is relevant "
        "to your donation eligibility?"
    ),
    "recent_blood_transfusion": "Have you received a blood transfusion recently?",
    "hemoglobin_known": "Do you know your recent hemoglobin level?",
    "hemoglobin_value": "What is your recent hemoglobin level (for example, 12.5 g/dL)?",
}

CLARIFICATION_RESPONSES: dict[str, str] = {
    "recent_illness": (
        "By 'recent illness' I mean any infection, cold, flu, or sickness you have "
        "had in the past few weeks that may affect donation safety. "
        "This is a preliminary screening question only."
    ),
    "fever": (
        "A fever means an elevated body temperature or feeling feverish recently. "
        "Even a mild fever may require temporary deferral under blood-service policy."
    ),
    "current_medication": (
        "This includes prescription and over-the-counter medicines you take regularly "
        "or recently started."
    ),
    "antibiotics": (
        "Antibiotics are medicines prescribed for bacterial infections. "
        "Recent antibiotic use often requires a waiting period before donation."
    ),
    "recent_surgery": (
        "This includes any surgical operation or hospital procedure, "
        "even if it was minor."
    ),
    "recent_dental_procedure": (
        "This includes extractions, root canals, or other dental work "
        "done recently."
    ),
    "recent_tattoo_or_piercing": (
        "Recent tattoos or piercings may require a waiting period depending on "
        "local blood-service policy."
    ),
    "pregnancy_status": (
        "Pregnancy-related screening helps identify temporary deferrals. "
        "Answer based on your current situation."
    ),
    "chronic_condition_reported": (
        "A chronic condition is an ongoing medical issue such as diabetes, "
        "heart disease, or similar long-term conditions."
    ),
    "recent_blood_transfusion": (
        "A recent transfusion means you received blood or blood products recently."
    ),
    "hemoglobin_value": (
        "Hemoglobin is a blood test value often measured before donation. "
        "If you know the result from a recent test, you can share it."
    ),
    "weight_kg": (
        "Weight is used in preliminary screening. Please share your approximate "
        "weight in kilograms (kg)."
    ),
    "days_since_last_donation": (
        "Blood centers typically require a minimum interval between donations. "
        "If you have never donated, say so. Otherwise share when you last donated."
    ),
    "age": (
        "Age is used for preliminary eligibility screening in this prototype. "
        "Real blood-service age limits must be confirmed with official policy."
    ),
}

GREETING_MESSAGE = (
    "Hi! I can help you with a preliminary blood-donation eligibility assessment. "
    "I'll ask you a few questions and you can answer naturally in your own words. "
    "This is decision support only — please confirm any result with the blood "
    "donation center or medical staff."
)

REQUIREMENTS_MESSAGE = (
    "To provide a preliminary assessment, I need to collect a few screening details: "
    "age, weight, donation history, recent health information, medications, and a few "
    "other safety-related questions. You can answer them one at a time or together — "
    "whatever is easiest for you."
)

UNKNOWN_HEMOGLOBIN_PHRASES = (
    "don't know",
    "do not know",
    "not sure",
    "no idea",
    "unknown",
    "i dont know",
    "don't know my hemoglobin",
    "do not know my hemoglobin",
    "not sure about my hemoglobin",
)

BOOLEAN_SCREENING_FIELDS = {
    "recent_illness",
    "fever",
    "current_medication",
    "antibiotics",
    "recent_surgery",
    "recent_dental_procedure",
    "recent_tattoo_or_piercing",
    "chronic_condition_reported",
    "recent_blood_transfusion",
}

# Boolean fields where relative time phrases describe the event, not donation history.
RECENCY_BOOLEAN_FIELDS = {
    "recent_illness",
    "recent_surgery",
    "recent_dental_procedure",
    "recent_tattoo_or_piercing",
    "recent_blood_transfusion",
}

PREGNANCY_NOT_APPLICABLE_PHRASES = (
    "not applicable",
    "n/a",
    "does not apply",
    "doesn't apply",
)
