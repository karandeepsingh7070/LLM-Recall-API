import { z } from 'zod';

export const FactSchema = z.object({
  content: z.string().describe('The core atomic fact extracted from the input.'),
  type: z.enum(['Preference', 'Task', 'Observation']).describe('The category of the fact.'),
  timeSensitive: z.boolean().describe('True if this fact is likely to change or expire soon, false if permanent.'),
});

export const ExtractionResponseSchema = z.object({
  facts: z.array(FactSchema).describe('A list of atomic facts extracted from the user input.'),
});

export type Fact = z.infer<typeof FactSchema>;
