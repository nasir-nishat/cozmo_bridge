import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, 'wa_msgs');
const outputFile = path.join(rootDir, 'admin-ui', 'lib', 'wa-chat-data.json');

const messageStartPattern = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(.+?)\s+-\s+(.*)$/u;
const titlePattern = /^(?:COZE )?([A-Za-z0-9]+)\s+(\d{1,2}(?:st|nd|rd|th)\s*[A-Za-z]+|[A-Za-z]{3,}\d{1,2}(?:st|nd|rd|th)?)\s+(.+?)\s+(\d+A(?:\d+K)?(?:\d+B)?(?:\d+P)?(?:\d+I?)?)(?:\s+(?:\d+|copy))?$/u;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function toPosixRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function chatTitleFromTextFile(filePath) {
  const basename = path.basename(filePath, '.txt');
  return basename.replace(/^WhatsApp Chat with\s+/u, '');
}

function parseTitle(title) {
  const match = title.match(titlePattern);
  if (!match) {
    return {
      propertyCode: null,
      checkInLabel: null,
      guestName: null,
      occupancy: null,
    };
  }

  return {
    propertyCode: match[1].toUpperCase(),
    checkInLabel: match[2],
    guestName: match[3],
    occupancy: match[4],
  };
}

function parseTimestamp(datePart, timePart) {
  const cleanTime = timePart
    .replace(/\u202f/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
  const dateMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/u);
  const timeMatch = cleanTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/iu);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const month = Number(dateMatch[1]);
  const day = Number(dateMatch[2]);
  const yearValue = Number(dateMatch[3]);
  const year = yearValue < 100 ? 2000 + yearValue : yearValue;
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem = timeMatch[3].toUpperCase();

  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');

  return `${year}-${mm}-${dd}T${hh}:${min}:00`;
}

function parseTextFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, '');
  const lines = text.split(/\r?\n/u);
  const messages = [];

  for (const line of lines) {
    const match = line.match(messageStartPattern);
    if (match) {
      const [, date, time, body] = match;
      const senderSplit = body.match(/^([^:]+):\s([\s\S]*)$/u);
      messages.push({
        id: `${messages.length + 1}`,
        rawDate: date,
        rawTime: time,
        timestamp: parseTimestamp(date, time),
        sender: senderSplit ? senderSplit[1] : null,
        type: senderSplit ? 'message' : 'system',
        text: senderSplit ? senderSplit[2] : body,
        hasMediaPlaceholder: body.includes('<Media omitted>'),
      });
      continue;
    }

    if (line.length > 0 && messages.length > 0) {
      const previous = messages[messages.length - 1];
      previous.text = `${previous.text}\n${line}`;
      previous.hasMediaPlaceholder = previous.hasMediaPlaceholder || line.includes('<Media omitted>');
    }
  }

  return messages;
}

function mediaTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
  if (ext === '.pdf') return 'pdf';
  return 'file';
}

const files = walk(sourceDir);

// When a WhatsApp export exists as both a root-level .txt and a same-named directory,
// skip the root-level .txt — the directory version has the actual media files.
const rootDirNames = new Set(
  fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name),
);
const textFiles = files.filter((file) => {
  if (path.extname(file).toLowerCase() !== '.txt') return false;
  if (path.dirname(file) === sourceDir && rootDirNames.has(path.basename(file, '.txt'))) return false;
  return true;
}).sort();

const chats = textFiles.map((textFile) => {
  const stats = fs.statSync(textFile);
  const chatDir = path.dirname(textFile);
  const chatTitle = chatTitleFromTextFile(textFile);
  const metadata = parseTitle(chatTitle);
  const mediaFiles = files
    .filter((file) => path.dirname(file) === chatDir && file !== textFile && path.extname(file).toLowerCase() !== '.txt')
    .sort()
    .map((file) => {
      const mediaStats = fs.statSync(file);
      return {
        fileName: path.basename(file),
        path: toPosixRelative(file),
        type: mediaTypeFor(file),
        bytes: mediaStats.size,
      };
    });
  const messages = parseTextFile(textFile);
  const senders = [...new Set(messages.map((message) => message.sender).filter(Boolean))].sort();

  return {
    id: chatTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: chatTitle,
    sourceTextFile: toPosixRelative(textFile),
    propertyCode: metadata.propertyCode,
    checkInLabel: metadata.checkInLabel,
    guestName: metadata.guestName,
    occupancy: metadata.occupancy,
    exportedBytes: stats.size,
    messageCount: messages.length,
    mediaCount: mediaFiles.length,
    firstMessageAt: messages.find((message) => message.timestamp)?.timestamp ?? null,
    lastMessageAt: [...messages].reverse().find((message) => message.timestamp)?.timestamp ?? null,
    senders,
    mediaFiles,
    messages,
  };
});

const payload = {
  generatedAt: new Date().toISOString(),
  sourceDir: 'wa_msgs',
  chatCount: chats.length,
  messageCount: chats.reduce((total, chat) => total + chat.messageCount, 0),
  mediaCount: chats.reduce((total, chat) => total + chat.mediaCount, 0),
  propertyCodes: [...new Set(chats.map((chat) => chat.propertyCode).filter(Boolean))].sort(),
  chats,
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`Wrote ${toPosixRelative(outputFile)}`);
console.log(`Chats: ${payload.chatCount}`);
console.log(`Messages: ${payload.messageCount}`);
console.log(`Media files: ${payload.mediaCount}`);
