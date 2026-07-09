import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const libDir = path.join(rootDir, 'admin-ui', 'lib');
const stateFile = path.join(libDir, 'build-state.json');
const args = new Set(process.argv.slice(2));
const full = args.has('--full');
const skipKb = args.has('--skip-kb') || !args.has('--rebuild-kb');  // KB step is opt-in only
const help = args.has('--help') || args.has('-h');
const LM_URL = 'http://localhost:1234/v1/models';

function usage() {
  console.log(`Usage: node scripts/refresh-knowledge.mjs [--full] [--skip-kb]

Runs the WhatsApp knowledge refresh pipeline.
  --full        Force a full refresh and mark build mode in build-state.json.
  --rebuild-kb  Also rebuild the property KB via gpt-4o (expensive — off by default).
  --skip-kb     (legacy alias, same as default) Skip KB rebuild.`);
}

function toPosixRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function runStep(label, script) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(process.execPath, [script], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status}`);
  }
}

async function ensureLocalModel() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(LM_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`LM Studio returned HTTP ${res.status}`);
  } catch (err) {
    throw new Error(`LM Studio is not ready at ${LM_URL}: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function writeState({ mode, kbRefreshed }) {
  const chatData = readJson('src/knowledge/wa-chat-data.json');
  const corpus = readJson('src/knowledge/wa-knowledge-corpus.json');
  const qa = readJson('src/knowledge/qa-examples.json');
  const kbPath = path.join(libDir, 'knowledge-base.json');
  const kb = fs.existsSync(kbPath) ? readJson('src/knowledge/knowledge-base.json') : null;
  const state = {
    version: 1,
    lastBuiltAt: new Date().toISOString(),
    mode,
    processedChatIds: [...new Set((chatData.chats ?? []).map((chat) => chat.id))].sort(),
    chatCount: chatData.chatCount ?? chatData.chats?.length ?? 0,
    archiveMessageCount: chatData.messageCount ?? 0,
    corpusMessageCount: corpus.stats?.keptUniqueMessages ?? corpus.messages?.length ?? 0,
    qaExampleCount: qa.stats?.exampleCount ?? qa.examples?.length ?? 0,
    kbEntryCount: kb?.entryCount ?? kb?.entries?.length ?? null,
    kbRefreshed,
    sources: {
      archive: 'src/knowledge/wa-chat-data.json',
      corpus: 'src/knowledge/wa-knowledge-corpus.json',
      qaExamples: 'src/knowledge/qa-examples.json',
      knowledgeBase: 'src/knowledge/knowledge-base.json',
    },
  };
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${toPosixRelative(stateFile)}`);
  console.log(`Chats: ${state.chatCount}`);
  console.log(`Corpus messages: ${state.corpusMessageCount}`);
  console.log(`Q&A examples: ${state.qaExampleCount}`);
  console.log(`KB entries: ${state.kbEntryCount ?? 'not refreshed'}`);
}

if (help) {
  usage();
  process.exit(0);
}

try {
  console.log(`Knowledge refresh mode: ${full ? 'full' : 'delta'}`);
  runStep('Parse WhatsApp exports', 'scripts/build-wa-chat-data.mjs');
  runStep('Build clean corpus', 'scripts/build-knowledge-corpus.mjs');
  runStep('Build Q&A examples', 'scripts/build-qa-examples.mjs');

  if (skipKb) {
    console.log('\n== Build property KB ==');
    console.log('Skipped by --skip-kb');
  } else {
    await ensureLocalModel();
    runStep('Build property KB from clean corpus', 'scripts/build-property-knowledge.mjs');
    runStep('Sanitize property KB', 'scripts/sanitize-knowledge.mjs');
  }

  writeState({ mode: full ? 'full' : 'delta', kbRefreshed: !skipKb });
} catch (err) {
  console.error(`\nRefresh failed: ${err.message}`);
  process.exit(1);
}
