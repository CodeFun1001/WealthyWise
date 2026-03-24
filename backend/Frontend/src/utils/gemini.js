const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export async function callGemini(prompt, systemInstruction = '') {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40
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

  const parts = data.candidates?.[0]?.content?.parts || [];
  console.log(data);
  return parts.map(p => p.text).join('');
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

export const COUPLES_SYSTEM = `
You are a friendly Indian financial planner helping couples optimize money.

IMPORTANT RULES:
• Use very simple language
• Use bullet points only
• No paragraphs
• Maximum 5 sections
• Maximum 3 bullet points per section
• Each bullet must be under 15 words
• Total response must be under 180 words
• Give practical advice only

Structure response exactly like this:

### Tax Strategy
• Recommended tax regime for each partner
• Estimated yearly tax saving

### Investments
• Suggested monthly SIP amount
• Best fund types (index, flexi cap, debt)

### Insurance
• Term insurance cover needed
• Health insurance suggestion

### Money Optimization
• How to split investments between partners
• Important deduction opportunities

### Top 3 Actions
• Most important step to take now
• Second priority action
• Third priority action

Use ₹ symbol and Indian number format (lakhs).
Avoid long explanations.
Be concise but insightful.
`;