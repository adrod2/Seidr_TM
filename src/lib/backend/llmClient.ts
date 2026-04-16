import { db } from '../db';

const extractJson = (text: string) => {
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
  const rawJson = jsonMatch ? jsonMatch[1] : text;
  return JSON.parse(rawJson);
};

export const callLLM = async (systemPrompt: string, userPrompt: string) => {
  const config = await db.aiConfig.get('default');
  
  if (!config) throw new Error("AI Configuration is missing.");
  if (config.provider !== 'ollama' && !config.apiKey) {
    throw new Error(`API Key for ${config.provider} is missing. Please configure it in the Admin tab.`);
  }

  try {
    if (config.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: "json_object" },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return JSON.parse(data.choices[0].message.content);
    }

    if (config.provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return extractJson(data.candidates[0].content.parts[0].text);
    }

    if (config.provider === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return extractJson(data.content[0].text);
    }

    if (config.provider === 'ollama') {
      const endpoint = config.endpoint.replace(/\/$/, '');
      const res = await fetch(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3.5',
          system: systemPrompt,
          prompt: userPrompt,
          format: 'json',
          stream: false
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return extractJson(data.response);
    }
  } catch (error: any) {
    console.error(`[LLM Error - ${config.provider}]:`, error);
    throw new Error(`Failed to generate via ${config.provider}. Check your API keys and connection. Error: ${error.message}`);
  }
};

export const callVisionLLM = async (systemPrompt: string, userPrompt: string, base64DataUrl: string) => {
  const config = await db.aiConfig.get('default');
  
  if (!config) throw new Error("AI Configuration is missing.");
  if (config.provider !== 'ollama' && !config.apiKey) {
    throw new Error(`API Key for ${config.provider} is missing. Please configure it in the Admin tab.`);
  }

  try {
    if (config.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: [
                { type: 'text', text: userPrompt },
                { type: 'image_url', image_url: { url: base64DataUrl } }
              ] 
            }
          ]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.choices[0].message.content; // Returning raw text description, not JSON
    }

    if (config.provider === 'gemini') {
      const mimeType = base64DataUrl.split(':')[1].split(';')[0];
      const base64Data = base64DataUrl.split(',')[1];
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [
              { text: `${systemPrompt}\n\n${userPrompt}` },
              { inlineData: { mimeType, data: base64Data } }
            ] 
          }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.candidates[0].content.parts[0].text;
    }

    if (config.provider === 'claude') {
      const mimeType = base64DataUrl.split(':')[1].split(';')[0];
      const base64Data = base64DataUrl.split(',')[1];
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ 
            role: 'user', 
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
              { type: 'text', text: userPrompt }
            ] 
          }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.content[0].text;
    }

    throw new Error(`Vision analysis is not natively supported for ${config.provider} yet in this configuration.`);
  } catch (error: any) {
    console.error(`[Vision LLM Error - ${config.provider}]:`, error);
    throw new Error(`Failed to process image via ${config.provider}. Error: ${error.message}`);
  }
};