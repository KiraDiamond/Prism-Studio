import { createWorker, PSM } from 'tesseract.js';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const cachePath = path.join(process.cwd(), 'node_modules', '.cache', 'tesseract', 'eng.traineddata');
mkdirSync(path.dirname(cachePath), { recursive: true });
const worker = await createWorker('eng', 1, { cachePath });
try {
    await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_WORD,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    });
    const results = [];
    for (const filename of process.argv.slice(2)) {
        const { data } = await worker.recognize(filename);
        results.push({ file: filename, text: data.text.trim(), confidence: data.confidence });
    }
    process.stdout.write(JSON.stringify(results));
} finally {
    await worker.terminate();
}
