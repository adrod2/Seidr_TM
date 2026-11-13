export const extractJson = (text: string) => {
  const fence = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/i);
  return JSON.parse(fence ? fence[1] : text.trim());
};
