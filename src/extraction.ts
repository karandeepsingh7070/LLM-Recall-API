import { ExtractionResponseSchema, Fact } from './types';
import { generateLocalText, generateEmbedding as generateLocalEmbedding } from './local-models';

// Local models don't get native structured-output enforcement (no responseSchema
// like Gemini offers), so we prompt for JSON explicitly and parse/validate it
// ourselves against the same Zod schema.
export async function extractFacts(userInput: string, context?: string): Promise<Fact[]> {
  const prompt = `You are an AI memory extraction engine. Extract atomic facts from the user input below.
${context ? `Current Context: ${context}\n` : ''}
User Input: "${userInput}"

Extract each fact as a clear, standalone sentence. Classify each as one of: "Preference", "Task", "Observation".
Set "timeSensitive" to true if the fact is likely to change or expire soon, false if it's permanent.

Respond with ONLY a JSON object in exactly this shape, no other text:
{"facts":[{"content":"...","type":"Preference","timeSensitive":false}]}`;

  const text = await generateLocalText(prompt);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Local model did not return JSON. Raw output: ${text}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse JSON from local model. Raw output: ${text}`);
  }

  const result = ExtractionResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Local model JSON did not match schema: ${result.error.message}. Raw output: ${text}`);
  }

  return result.data.facts;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return generateLocalEmbedding(text);
}
