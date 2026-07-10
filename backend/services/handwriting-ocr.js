/**
 * handwriting-ocr.js
 *
 * Converts handwritten ink (a cropped PNG from the Design Board canvas) into
 * plain text using Microsoft's TrOCR handwriting model, run fully locally via
 * transformers.js (ONNX runtime — no Python, no external API, no API key).
 *
 * Model: Xenova/trocr-small-handwritten — an ONNX export of
 * microsoft/trocr-small-handwritten, MIT/Apache licensed. Downloaded once on
 * first use and cached under backend/.cache/ (see env override below).
 */

const path = require('path');

const MODEL_ID = 'Xenova/trocr-small-handwritten';

let modulePromise = null;

function getTransformers() {
  if (!modulePromise) {
    modulePromise = (async () => {
      // transformers.js is ESM-only; dynamic import works from this CJS file.
      const mod = await import('@xenova/transformers');

      // Keep the downloaded model weights inside the project instead of the
      // OS default cache dir, so it's easy to find/clean up.
      mod.env.cacheDir = path.join(__dirname, '..', '.cache', 'transformers');

      console.log(`[handwriting-ocr] Loading ${MODEL_ID} (first run downloads the model, ~100MB)...`);
      const ocrPipeline = await mod.pipeline('image-to-text', MODEL_ID);
      console.log('[handwriting-ocr] Model ready.');
      return { ...mod, ocrPipeline };
    })();
  }
  return modulePromise;
}

/**
 * @param {string} imageDataUrl - a base64 data URL (image/png or image/jpeg) of the cropped ink region
 * @returns {Promise<string>} recognized plain text
 */
async function recognizeHandwriting(imageDataUrl) {
  const match = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(imageDataUrl || '');
  if (!match) {
    throw new Error('imageDataUrl must be a base64 image data URL');
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, 'base64');

  const { RawImage, ocrPipeline } = await getTransformers();
  // transformers.js (Node build) only reads local file paths / http(s) URLs /
  // Blob instances for images — raw data URLs are misread as file paths.
  // Decoding to a Blob ourselves sidesteps that entirely.
  const blob = new Blob([buffer], { type: mimeType });
  const image = await RawImage.fromBlob(blob);

  const output = await ocrPipeline(image);

  // pipeline('image-to-text') returns [{ generated_text: '...' }]
  const text = Array.isArray(output) ? (output[0]?.generated_text || '') : (output?.generated_text || '');
  return text.trim();
}

module.exports = { recognizeHandwriting };
