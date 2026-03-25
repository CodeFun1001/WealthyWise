"""
backend/services/news_service.py
Fetches Economic Times RSS feeds, filters finance/tax headlines,
sends to Gemini for personalised impact analysis.
"""
import os
import logging
import feedparser
from typing import List

import google.generativeai as genai

from models.tax_models import NewsImpactItem

logger = logging.getLogger(__name__)

ET_RSS_FEEDS = [
    "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    "https://economictimes.indiatimes.com/wealth/rssfeeds/44684256.cms",
    "https://economictimes.indiatimes.com/personal-finance/rssfeeds/80062741.cms",
]

TAX_KEYWORDS = [
    "income tax", "tds", "tax slab", "80c", "nps", "epf",
    "budget", "rbi", "repo rate", "mutual fund", "sebi",
    "ltcg", "stcg", "hra", "deduction", "itr", "tax regime"
]

NEWS_SYSTEM = """You are a senior Indian Chartered Accountant.
Given a list of recent finance headlines and a user's tax profile,
analyze the impact on this specific user.
Return JSON array with exactly this structure for up to 5 items:
[
  {
    "headline": "...",
    "impact_on_user": "One sentence explaining how this affects them specifically",
    "action_required": "One concrete action they should take",
    "urgency": "high|medium|low"
  }
]
Only return the JSON array. No preamble."""


def _get_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY not set")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-2.5-flash",
                                  generation_config=genai.GenerationConfig(temperature=0.3))


def _fetch_headlines(max_items: int = 10) -> List[str]:
    headlines = []
    for url in ET_RSS_FEEDS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:5]:
                title = entry.get("title", "")
                # filter relevance
                if any(kw in title.lower() for kw in TAX_KEYWORDS):
                    headlines.append(title)
        except Exception as e:
            logger.warning(f"RSS fetch error {url}: {e}")
    return list(dict.fromkeys(headlines))[:max_items]  # deduplicate


def get_news_impact(
    gross_salary: float,
    better_regime: str,
    sec80C: float = 0,
    nps: float = 0,
) -> List[NewsImpactItem]:
    import json, re

    headlines = _fetch_headlines()

    if not headlines:
        # Fallback: use known Budget 2024 changes
        headlines = [
            "New tax regime now default; standard deduction raised to ₹75,000",
            "LTCG tax on equity raised to 12.5% — threshold ₹1.25 lakh",
            "STCG on equity raised to 20%",
            "NPS Vatsalya launched for minor account holders",
            "TDS threshold on rent raised to ₹6 lakh/year",
        ]

    profile_summary = (
        f"Gross Salary: ₹{gross_salary:,.0f} | "
        f"Recommended Regime: {better_regime.title()} | "
        f"80C invested: ₹{sec80C:,.0f} (limit ₹1,50,000) | "
        f"NPS: ₹{nps:,.0f} (limit ₹50,000)"
    )

    prompt = (
        f"User profile: {profile_summary}\n\n"
        f"Recent headlines:\n" + "\n".join(f"- {h}" for h in headlines)
    )

    try:
        model = _get_gemini()
        response = model.generate_content([NEWS_SYSTEM, prompt])
        raw = response.text.strip()
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        items = json.loads(raw)
        return [NewsImpactItem(**item) for item in items if isinstance(item, dict)]
    except Exception as e:
        logger.error(f"News impact generation failed: {e}")
        return [NewsImpactItem(
            headline="Budget 2024: New regime now default",
            impact_on_user=f"As a ₹{gross_salary/100000:.1f}L earner, new regime's ₹75K standard deduction benefits you if deductions are low.",
            action_required="Compare both regimes carefully before filing ITR.",
            urgency="high",
        )]