// Downloads and caches the local models before the app ever needs them.
//
// Run this with plain `node` (not `tsx`) — downloading a fresh (uncached)
// model while running under tsx intermittently fails with "Unable to get
// model file path or buffer." for reasons specific to tsx's loader hooks.
// Once a model is cached on disk, loading it works fine under tsx too, so
// this pre-warming step only needs to run once per machine.
import { pipeline } from '@huggingface/transformers';

function logProgress(x) {
  if (x.status === 'progress_total' || x.status === 'done' || x.status === 'ready') {
    console.log(`[${x.name}] ${x.status}${x.progress !== undefined ? ' ' + x.progress.toFixed(1) + '%' : ''}`);
  }
}

console.log('Downloading embedding model (Xenova/gte-base)...');
await pipeline('feature-extraction', 'Xenova/gte-base', { dtype: 'q8', progress_callback: logProgress });

console.log('Downloading generation model (onnx-community/Llama-3.2-3B-Instruct-ONNX)...');
await pipeline('text-generation', 'onnx-community/Llama-3.2-3B-Instruct-ONNX', { dtype: 'q4', progress_callback: logProgress });

console.log('Both models cached. You can now run the server with tsx.');
