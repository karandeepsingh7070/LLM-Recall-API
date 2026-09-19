import { pipeline, type FeatureExtractionPipeline, type TextGenerationPipeline } from '@huggingface/transformers';

// Lazy-loaded singletons: each pipeline downloads its weights on first use
// (cached under the OS Hugging Face cache dir afterwards) and is reused for
// every subsequent call so we don't reload the model per-request.

let embedder: FeatureExtractionPipeline | null = null;
let embedderLoading: Promise<FeatureExtractionPipeline> | null = null;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (embedder) return embedder;
  if (!embedderLoading) {
    embedderLoading = pipeline('feature-extraction', 'Xenova/gte-base', { dtype: 'q8' }) as Promise<FeatureExtractionPipeline>;
  }
  embedder = await embedderLoading;
  return embedder;
}

let generator: TextGenerationPipeline | null = null;
let generatorLoading: Promise<TextGenerationPipeline> | null = null;

async function getGenerator(): Promise<TextGenerationPipeline> {
  if (generator) return generator;
  if (!generatorLoading) {
    // Larger/higher-precision alternatives (Llama-3.2-3B, Qwen2.5-3B, and
    // Qwen2.5-1.5B at fp16) were all benchmarked against this model on the
    // contradiction-check task and scored equal or worse — this 1.5B q8
    // model was empirically the most reliable choice, not just the cheapest.
    generatorLoading = pipeline('text-generation', 'onnx-community/Qwen2.5-1.5B-Instruct', { dtype: 'q8' }) as Promise<TextGenerationPipeline>;
  }
  generator = await generatorLoading;
  return generator;
}

// gte-base produces 768-dim embeddings, matching the pgvector column.
export async function generateEmbedding(text: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const output: any = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

export async function generateLocalText(prompt: string, system?: string): Promise<string> {
  const gen = await getGenerator();
  const messages = system
    ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
    : [{ role: 'user', content: prompt }];
  const output: any = await gen(messages, { max_new_tokens: 512, do_sample: false });
  const generatedText = output[0].generated_text;
  const last = Array.isArray(generatedText) ? generatedText[generatedText.length - 1] : generatedText;
  return typeof last === 'string' ? last : last.content;
}
