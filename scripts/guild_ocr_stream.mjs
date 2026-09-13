// Keep one OCR worker alive while the automatic sorter sends one cape at a time.
import { createWorker, PSM } from 'tesseract.js';
import { mkdirSync } from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const cachePath = path.join(process.cwd(), 'node_modules', '.cache', 'tesseract', 'eng.traineddata');
mkdirSync(path.dirname(cachePath), { recursive: true });
const worker = await createWorker('eng', 1, { cachePath });
try {
    await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_WORD,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    });
    for await (const line of readline.createInterface({ input: process.stdin })) {
        const request = JSON.parse(line);
        const readings = [];
        for (const file of request.files) {
            const { data } = await worker.recognize(file);
            readings.push({ text: data.text.trim(), confidence: data.confidence });
        }
        process.stdout.write(JSON.stringify({ sha: request.sha, readings }) + '\n');
    }
} finally {
    await worker.terminate();
}
