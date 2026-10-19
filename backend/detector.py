import re
from urllib.parse import urlparse


MAX_RISK_SCORE = 100

RULES = (
    {
        "id": "urgency",
        "pattern": re.compile(
            r"\b(urgent|immediately|act now|expires today|final notice|within 24 hours|limited time|"
            r"account will be closed|suspended today)\b",
            re.IGNORECASE,
        ),
        "title": "Urgent or pressuring language",
        "explanation": "The message uses a deadline or pressure to encourage a quick response.",
        "safety_advice": "Pause and verify the request using contact details you find independently.",
        "points": 15,
    },
    {
        "id": "account-verification",
        "pattern": re.compile(
            r"\b(verify your account|confirm your identity|reset your password|login details|"
            r"sign in to|account suspended|account locked|account will be locked)\b",
            re.IGNORECASE,
        ),
        "title": "Unexpected account verification request",
        "explanation": "An unexpected request to sign in or verify account details may be attempting to collect credentials.",
        "safety_advice": "Do not use an unexpected sign-in link. Open the official app or enter the known website address yourself.",
        "points": 30,
    },
    {
        "id": "sensitive-information",
        "pattern": re.compile(
            r"\b(share|send|provide|reply with|enter|confirm|verify)\b.{0,60}"
            r"\b(pin|otp|one[- ]time password|password|login details|national id|id number|"
            r"passport number|card number|cvv|bank details)\b"
            r"|\b(pin|otp|one[- ]time password|password|login details|national id|id number|"
            r"passport number|card number|cvv|bank details)\b.{0,60}"
            r"\b(share|send|provide|reply with|enter|confirm|verify)\b",
            re.IGNORECASE,
        ),
        "title": "Request for sensitive information",
        "explanation": "The message appears to ask for information that could be used to access an account or commit identity theft.",
        "safety_advice": "Never share a PIN, one-time password, password, or card security code in response to a message.",
        "points": 35,
    },
    {
        "id": "payment-or-prize",
        "pattern": re.compile(
            r"\b(gift card|wire transfer|crypto(?:currency)?|bitcoin|payment|bank details|"
            r"processing fee|prize|claim your reward|mpesa|m-pesa)\b",
            re.IGNORECASE,
        ),
        "title": "Payment or prize-related language",
        "explanation": "Unexpected payment requests, unusual payment methods, and surprise prizes are common scam tactics.",
        "safety_advice": "Verify the offer independently. Do not pay a fee or share financial details to claim an unexpected prize.",
        "points": 20,
    },
    {
        "id": "unrealistic-offer",
        "pattern": re.compile(
            r"\b(guaranteed (?:income|returns|profit)|risk[- ]free (?:investment|profit)|"
            r"double your money|earn \w+ (?:daily|per day)|you have won|winner selected|free money)\b",
            re.IGNORECASE,
        ),
        "title": "Unrealistic money or prize offer",
        "explanation": "Guaranteed returns, easy-money claims, and unexpected prizes can be used to attract victims.",
        "safety_advice": "Treat guaranteed earnings and surprise prizes cautiously; check the offer with an independent source.",
        "points": 25,
    },
    {
        "id": "job-fee",
        "pattern": re.compile(
            r"\b(remote job|work from home|job offer|hiring immediately|no experience required)\b.{0,70}"
            r"\b(registration fee|training fee|processing fee|pay to apply)\b"
            r"|\b(registration fee|training fee|processing fee|pay to apply)\b.{0,70}"
            r"\b(remote job|work from home|job offer|hiring immediately|no experience required)\b",
            re.IGNORECASE,
        ),
        "title": "Job offer linked to an upfront fee",
        "explanation": "A request for an upfront payment connected to a job offer is a warning sign.",
        "safety_advice": "Research the employer independently and do not pay a recruitment or processing fee to apply.",
        "points": 30,
    },
)

URL_PATTERN = re.compile(
    r"(?<![@\w])(?:https?://|www\.)[^\s<>\"']+"
    r"|(?<![@\w])(?:\b[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?:/[^\s<>\"']*)?",
    re.IGNORECASE,
)
SHORTENED_HOSTS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly"}
TRAILING_URL_PUNCTUATION = ")]},.!?;:'\""


def _url_indicators(text):
    indicators = []
    for index, match in enumerate(URL_PATTERN.finditer(text)):
        raw_url = match.group(0).rstrip(TRAILING_URL_PUNCTUATION)
        candidate = f"https://{raw_url}" if raw_url.startswith("www.") or "://" not in raw_url else raw_url
        try:
            parsed_url = urlparse(candidate)
            hostname = (parsed_url.hostname or "").lower()
        except ValueError:
            continue

        if parsed_url.scheme == "http":
            indicators.append(
                {
                    "id": f"http-link-{index}",
                    "title": "Link does not use an encrypted connection",
                    "explanation": "The link uses HTTP, which does not provide the same transport encryption as HTTPS. This alone does not prove it is fraudulent.",
                    "safety_advice": "Avoid entering sensitive information on this page. Find the organization's official site independently.",
                    "points": 15,
                }
            )

        if hostname in SHORTENED_HOSTS:
            indicators.append(
                {
                    "id": f"short-link-{index}",
                    "title": "Shortened link hides its destination",
                    "explanation": "A shortened URL makes it harder to see where a link leads. This check does not resolve its destination.",
                    "safety_advice": "Confirm the full destination through a separate, trusted channel before opening it.",
                    "points": 20,
                }
            )

        if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", hostname):
            indicators.append(
                {
                    "id": f"numeric-host-{index}",
                    "title": "Link uses a numeric network address",
                    "explanation": "A link using a raw IP address instead of a recognizable domain can be unusual, but is not proof of a threat.",
                    "safety_advice": "Do not sign in or provide personal details. Find the service's official website independently.",
                    "points": 30,
                }
            )

        if hostname.startswith("xn--") or ".xn--" in hostname:
            indicators.append(
                {
                    "id": f"punycode-host-{index}",
                    "title": "Link contains an encoded domain name",
                    "explanation": "Internationalized domains can be represented in an encoded form that is difficult to recognize.",
                    "safety_advice": "Check the domain carefully and navigate to the organization's website independently.",
                    "points": 20,
                }
            )

    return indicators


def analyze_content(content):
    """Return heuristic indicators and advice; the score is not a probability."""
    matched_indicators = []

    for rule in RULES:
        if rule["pattern"].search(content):
            matched_indicators.append(
                {
                    "id": rule["id"],
                    "title": rule["title"],
                    "explanation": rule["explanation"],
                    "safety_advice": rule["safety_advice"],
                    "points": rule["points"],
                }
            )

    matched_indicators.extend(_url_indicators(content))
    risk_score = min(sum(item["points"] for item in matched_indicators), MAX_RISK_SCORE)
    risk_category = "high" if risk_score >= 50 else "suspicious" if risk_score >= 20 else "low"

    if matched_indicators:
        explanation = (
            f"Found {len(matched_indicators)} rule-based warning "
            f"{'indicator' if len(matched_indicators) == 1 else 'indicators'}. "
            "These are clues to review, not proof that the content is fraudulent."
        )
    else:
        explanation = "No warning patterns in this rule set were found. This does not guarantee that the content is safe."

    safety_advice = [
        "Do not click unexpected links or share personal information until you have verified the request.",
        "Contact the person or organization using details you find independently.",
    ]
    safety_advice.extend(item["safety_advice"] for item in matched_indicators)

    return {
        "risk_score": risk_score,
        "risk_category": risk_category,
        "matched_indicators": matched_indicators,
        "explanation": explanation,
        "safety_advice": list(dict.fromkeys(safety_advice)),
    }
