import toast from 'react-hot-toast';

const fetchWithTimeout = (url, options, timeout = 15000) => Promise.race([
  fetch(url, options),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), timeout))
]);

export async function askGemini(
  prompt,
  systemInstruction = "",
  maxTokens = 1024,
) {
  try {
    const response = await fetchWithTimeout("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, systemInstruction, maxTokens }),
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Too many requests, please wait a moment.");
      }
      throw new Error(data.error || "Failed to fetch from Gemini API");
    }

    return data.text;
  } catch (error) {
    if (error.message === 'Request timeout') {
      toast.error("AI is taking too long, try again.");
      throw error;
    }
    if (error.message.includes('GEMINI_API_KEY')) {
      toast.error("AI features unavailable — check configuration.");
      throw error;
    }
    console.error(error);
    throw error;
  }
}

export async function askGeminiChat(
  contents,
  systemInstruction = "",
  maxTokens = 512,
) {
  try {
    const response = await fetchWithTimeout("/api/gemini-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, systemInstruction, maxTokens }),
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Too many requests, please wait a moment.");
      }
      throw new Error(data.error || "Failed to fetch from Gemini Chat API");
    }

    return data.text;
  } catch (error) {
    if (error.message === 'Request timeout') {
      toast.error("AI is taking too long, try again.");
      throw error;
    }
    if (error.message.includes('GEMINI_API_KEY')) {
      toast.error("AI features unavailable — check configuration.");
      throw error;
    }
    console.error(error);
    throw error;
  }
}

export async function askGeminiJSON(prompt, systemInstruction = "") {
  try {
    const fullPrompt = systemInstruction
      ? `${systemInstruction}\n\nIMPORTANT: Respond with valid JSON only. No markdown formatting, no backticks, no explanation.\n\n${prompt}`
      : `IMPORTANT: Respond with valid JSON only. No markdown formatting, no backticks, no explanation.\n\n${prompt}`;
    const text = await askGemini(fullPrompt);
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (error) {
    toast.error("Failed to parse AI response. Please try again.");
    throw error;
  }
}
