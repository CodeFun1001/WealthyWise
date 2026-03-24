const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export async function callGemini(prompt, systemInstruction = '') {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || 'Gemini API error');
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export const PORTFOLIO_SYSTEM = `You are an expert Indian mutual fund portfolio analyst. 
Analyze portfolios and provide insights in clear, structured HTML-like markdown format with:
- Use **bold** for key numbers
- Use ### for section headers
- Be specific to Indian market context (NSE/BSE, SEBI regulations)
- Give actionable recommendations
- Always mention tax implications under Indian tax law
- Format numbers in Indian system (lakhs, crores)
Keep responses concise but insightful. Use ₹ for rupees.`;

export const COUPLES_SYSTEM = `You are an expert Indian financial planner specializing in couple's financial planning.
Provide advice covering:
- Income tax optimization for both partners
- HRA claims, 80C deductions, NPS contributions
- SIP allocation strategies
- Joint vs individual investments
- Insurance needs
- Home loan eligibility
Format: Use **bold** for key figures, ### for sections, bullet points for action items.
Always be specific to Indian tax laws, SEBI regulations, and RBI guidelines.
Use ₹ and Indian number system (lakhs, crores).`;