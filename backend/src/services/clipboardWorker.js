import { parentPort, workerData } from 'node:worker_threads';
import { decodeClipboard } from './clipboardDecoder.js';
import { clipboardLayers } from './clipboardLayers.js';

try { parentPort.postMessage({ design: clipboardLayers(decodeClipboard(workerData)) }); }
catch (error) { parentPort.postMessage({ error: error.message }); }
