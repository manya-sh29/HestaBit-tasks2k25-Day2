const fs = require("fs");
const path = require("path");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const os = require("os");

// Utility: measure time in ms
function now() {
  return new Date().getTime();
}

// ========== WORKER THREAD CODE ==========
if (!isMainThread) {
  const { text, minLen } = workerData;

  // Split into words (keep only a-z letters)
  const words = text
    .toLowerCase()
    .split(/[^a-zA-Z]+/)
    .filter(w => w.length >= minLen);

  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  const uniqueWords = Object.keys(freq);
  const longest = uniqueWords.reduce((a, b) => (b.length > a.length ? b : a), "");
  const shortest = uniqueWords.reduce(
    (a, b) => (!a || b.length < a.length ? b : a),
    null
  );

  parentPort.postMessage({
    totalWords: words.length,
    freq,
    longest,
    shortest,
  });
  process.exit(0);
}

// ========== MAIN THREAD CODE ==========

// 1️Parse CLI Arguments
const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    argMap[args[i].replace("--", "")] = args[i + 1] || true;
  }
}

const filePath = argMap.file;
const topN = parseInt(argMap.top) || 10;
const minLen = parseInt(argMap.minLen) || 1;
const uniqueFlag = argMap.unique ? true : false;

if (!filePath || !fs.existsSync(filePath)) {
  console.error("Please provide a valid --file path.");
  process.exit(1);
}

// 2️Read file
const fileContent = fs.readFileSync(filePath, "utf-8");

// Helper: Split text into chunks
function splitText(text, parts) {
  const size = Math.ceil(text.length / parts);
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

// Process file with concurrency
async function processFile(concurrency) {
  const chunks = splitText(fileContent, concurrency);
  const promises = chunks.map(
    (chunk) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: { text: chunk, minLen },
        });
        worker.on("message", resolve);
        worker.on("error", reject);
      })
  );

  const results = await Promise.all(promises);

  // Merge results
  let totalWords = 0;
  const globalFreq = {};
  let longest = "";
  let shortest = null;

  for (const r of results) {
    totalWords += r.totalWords;
    if (r.longest.length > longest.length) longest = r.longest;
    if (!shortest || r.shortest.length < shortest.length) shortest = r.shortest;
    for (const [word, count] of Object.entries(r.freq)) {
      globalFreq[word] = (globalFreq[word] || 0) + count;
    }
  }

  let words = Object.keys(globalFreq);
  if (uniqueFlag) {
    words = [...new Set(words)];
  }

  const uniqueCount = words.length;

  // Top N
  const topWords = Object.entries(globalFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));

  const stats = {
    totalWords,
    uniqueWords: uniqueCount,
    longestWord: longest,
    shortestWord: shortest,
    topWords,
  };

  return stats;
}

// 3️ Benchmarking
async function benchmark() {
  const levels = [1, 4, 8];
  const summary = [];
  let finalStats = null;

  for (const level of levels) {
    const start = now();
    const stats = await processFile(level);
    const end = now();
    const duration = end - start;

    console.log(`  Concurrency ${level} done in ${duration} ms`);
    summary.push({ concurrency: level, durationMs: duration });
    if (level === Math.max(...levels)) {
      finalStats = stats;
    }
  }

  // Save outputs
  if (!fs.existsSync("output")) fs.mkdirSync("output", { recursive: true });
  if (!fs.existsSync("logs")) fs.mkdirSync("logs", { recursive: true });

  fs.writeFileSync("output/stats.json", JSON.stringify(finalStats, null, 2));
  fs.writeFileSync("logs/perf-summary.json", JSON.stringify(summary, null, 2));

  console.log("\nFinal Stats Saved to output/stats.json");
  console.log("Benchmark Logs Saved to logs/perf-summary.json\n");
  console.table(finalStats.topWords);
}

benchmark();
