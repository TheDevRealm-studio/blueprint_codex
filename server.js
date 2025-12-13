import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const DATA_DIR = path.join(__dirname, 'data');
const ASSETS_DIR = path.join(DATA_DIR, 'assets');

// Ensure directories exist
await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(ASSETS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/assets', express.static(ASSETS_DIR));

const require = createRequire(import.meta.url);
// uassetreader is CommonJS
const { UAsset } = require('uassetreader');

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, ASSETS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({ storage: storage });

// --- API Routes ---

// Get Projects
app.get('/api/projects', async (req, res) => {
  try {
    const data = await fs.readFile(path.join(DATA_DIR, 'projects.json'), 'utf-8');
    res.json(JSON.parse(data));
  } catch (e) {
    // If file doesn't exist, return empty array
    res.json([]);
  }
});

// Save Projects
app.post('/api/projects', async (req, res) => {
  try {
    await fs.writeFile(path.join(DATA_DIR, 'projects.json'), JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save projects' });
  }
});

// Upload Asset
app.post('/api/assets', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ filename: req.file.filename });
});

// Delete Asset
app.delete('/api/assets/:filename', async (req, res) => {
  try {
    await fs.unlink(path.join(ASSETS_DIR, req.params.filename));
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// List Assets
app.get('/api/assets', async (req, res) => {
  try {
    const files = await fs.readdir(ASSETS_DIR);
    res.json(files.filter(f => !f.startsWith('.')));
  } catch (e) {
    console.error(e);
    res.json([]);
  }
});

// Fetch URL Metadata (Open Graph)
app.get('/api/metadata', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BlueprintCodex/1.0; +http://localhost:3000)'
      }
    });
    const html = await response.text();

    // Simple Regex extraction for OG tags and Title
    const getMeta = (prop) => {
      const match = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`, 'i')) ||
                    html.match(new RegExp(`<meta name="${prop}" content="([^"]*)"`, 'i'));
      return match ? match[1] : null;
    };

    const title = getMeta('og:title') ||
                  (html.match(/<title>([^<]*)<\/title>/i) ? html.match(/<title>([^<]*)<\/title>/i)[1] : '') ||
                  url;

    const description = getMeta('og:description') ||
                        getMeta('description') || '';

    const image = getMeta('og:image') || '';

    res.json({ title, description, image, url });
  } catch (e) {
    console.error('Failed to fetch metadata for', url, e);
    // Return basic info if fetch fails
    res.json({ title: url, description: '', image: '', url });
  }
});

function extractLikelySymbols(buffer, opts = {}) {
  const maxSymbols = typeof opts.maxSymbols === 'number' ? opts.maxSymbols : 120;
  const minLen = typeof opts.minLen === 'number' ? opts.minLen : 4;

  // Collect printable ASCII sequences. This is heuristic and intentionally conservative.
  const symbols = new Set();
  let current = '';

  const flush = () => {
    if (current.length >= minLen) {
      // Identifier-ish token
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(current)) {
        // Filter out some common UE noise tokens.
        if (!['None', 'True', 'False', 'NAME_None'].includes(current)) {
          symbols.add(current);
        }
      }
      // Also keep Script paths (class names) if they appear.
      if (current.startsWith('/Script/') && current.length <= 200) {
        symbols.add(current);
      }
    }
    current = '';
  };

  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    if (b >= 0x20 && b <= 0x7e) {
      current += String.fromCharCode(b);
      if (current.length > 240) flush();
    } else {
      flush();
      if (symbols.size >= maxSymbols) break;
    }
  }
  flush();

  // Prefer "interesting" symbols first.
  const arr = Array.from(symbols);
  const score = (s) => {
    if (s.startsWith('/Script/')) return 5;
    if (/^(BP_|ABP_|BPI_|AnimBP_|WBP_)/.test(s)) return 4;
    if (/(Function|Event|On[A-Z]|Get[A-Z]|Set[A-Z])/.test(s)) return 3;
    if (/(Component|Interface|Subsystem|Controller|Character)/.test(s)) return 2;
    return 1;
  };
  arr.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
  return arr.slice(0, maxSymbols);
}

// Analyze Unreal uasset/umap (dependencies + basic metadata)
app.post('/api/analyze-uasset', async (req, res) => {
  try {
    const filePath = req.body?.path;
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'path is required' });
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.uasset' && ext !== '.umap') {
      return res.status(400).json({ error: 'Only .uasset or .umap is supported' });
    }

    const stat = await fs.stat(filePath);
    // Guardrail: avoid parsing extremely large files in the local server.
    if (stat.size > 250 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large to analyze' });
    }

    const asset = new UAsset(filePath);
    await asset.load();
    const base = asset.toJSON();

    // Best-effort: gather possible symbol names from raw ASCII strings.
    const symbols = asset.FileBuffer ? extractLikelySymbols(asset.FileBuffer) : [];

    res.json({
      ...base,
      symbols,
      filePath,
      size: stat.size
    });
  } catch (e) {
    console.error('Failed to analyze uasset', e);
    res.status(500).json({ error: 'Failed to analyze asset' });
  }
});

app.listen(PORT, () => {
  console.log(`💾 Storage Server running at http://localhost:${PORT}`);
  console.log(`📂 Saving data to: ${DATA_DIR}`);
});
