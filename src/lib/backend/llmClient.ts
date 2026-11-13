import { db, type AiConfig } from '../db';
import { generateWithCopilot } from './copilotClient';
import { extractJson } from './llmResponse';

export const callLLM = async (
  systemPrompt: string,
  userPrompt: string,
  format: 'json' | 'text' = 'json',
  configOverride?: AiConfig,
) => {
  const config = configOverride ?? await db.aiConfig.get('default');
  
  if (!config) throw new Error("AI Configuration is missing.");
  if (!['copilot', 'ollama'].includes(config.provider) && !config.apiKey) {
    throw new Error(`API Key for ${config.provider} is missing. Please configure it in the Admin tab.`);
  }

  try {
    if (config.provider === 'copilot') {
      const content = await generateWithCopilot(systemPrompt, userPrompt, format, config.copilotModel);
      return format === 'json' ? extractJson(content) : content;
    }

    if (config.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          ...(format === 'json' ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return format === 'json' ? extractJson(data.choices[0].message.content) : data.choices[0].message.content;
    }

    if (config.provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          ...(format === 'json' ? { generationConfig: { responseMimeType: "application/json" } } : {})
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const content = data.candidates[0].content.parts[0].text;
      return format === 'json' ? extractJson(content) : content;
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
      return format === 'json' ? extractJson(data.content[0].text) : data.content[0].text;
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
          ...(format === 'json' ? { format: 'json' } : {}),
          stream: false
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return format === 'json' ? extractJson(data.response) : data.response;
    }
    throw new Error(`Unsupported AI provider: ${config.provider}`);
  } catch (error: unknown) {
    console.error(`[LLM Error - ${config.provider}]:`, error);
    throw new Error(`Failed to generate via ${config.provider}. ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const callVisionLLM = async (systemPrompt: string, userPrompt: string, base64DataUrl: string) => {
  const config = await db.aiConfig.get('default');
  
  if (!config) throw new Error("AI Configuration is missing.");
  if (!['copilot', 'ollama'].includes(config.provider) && !config.apiKey) {
    throw new Error(`API Key for ${config.provider} is missing. Please configure it in the Admin tab.`);
  }

  try {
    if (config.provider === 'copilot') {
      return await generateWithCopilot(systemPrompt, userPrompt, 'text', config.copilotModel, base64DataUrl);
    }

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
  } catch (error: unknown) {
    console.error(`[Vision LLM Error - ${config.provider}]:`, error);
    throw new Error(`Failed to process image via ${config.provider}. ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};