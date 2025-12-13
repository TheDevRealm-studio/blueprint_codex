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

// In-memory cache for expensive analyses (keyed by filePath + mtime + size).
const uassetAnalysisCache = new Map();

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
  const maxSymbols = typeof opts.maxSymbols === 'number' ? opts.maxSymbols : 220;
  const minLen = typeof opts.minLen === 'number' ? opts.minLen : 3;

  const symbols = new Set();

  const noise = new Set([
    'None', 'True', 'False', 'NAME_None',
    'ByteProperty', 'IntProperty', 'FloatProperty', 'BoolProperty', 'StrProperty',
    'NameProperty', 'ObjectProperty', 'StructProperty', 'ArrayProperty', 'MapProperty',
    'DelegateProperty', 'MulticastDelegateProperty'
  ]);

  const addToken = (token) => {
    if (!token || token.length < minLen) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return;
    if (noise.has(token)) return;
    symbols.add(token);
  };

  const ingestString = (s) => {
    if (!s || s.length < minLen) return;

    // Keep Script paths whole.
    if (s.startsWith('/Script/') && s.length <= 240) symbols.add(s);

    // Tokenize identifiers out of longer strings like:
    // "/Script/Engine.Actor:ReceiveBeginPlay" or "MyVarName_12" etc.
    const tokens = s.split(/[^A-Za-z0-9_]+/g);
    for (const t of tokens) addToken(t);
  };

  // 1) Extract ASCII-ish printable runs.
  let current = '';
  const flushAscii = () => {
    if (current.length >= minLen) ingestString(current);
    current = '';
  };

  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    if (b >= 0x20 && b <= 0x7e) {
      current += String.fromCharCode(b);
      if (current.length > 512) flushAscii();
    } else {
      flushAscii();
      if (symbols.size >= maxSymbols) break;
    }
  }
  flushAscii();

  // 2) Extract UTF-16LE “wide” strings (very common in UE assets).
  // Detect runs like: 'A' 0x00 'B' 0x00 ...
  let wide = '';
  const flushWide = () => {
    if (wide.length >= minLen) ingestString(wide);
    wide = '';
  };

  for (let i = 0; i + 1 < buffer.length; i += 1) {
    const lo = buffer[i];
    const hi = buffer[i + 1];
    // printable ASCII stored as UTF-16LE => high byte is 0
    if (hi === 0x00 && lo >= 0x20 && lo <= 0x7e) {
      wide += String.fromCharCode(lo);
      if (wide.length > 512) flushWide();
      i += 1; // consume the pair
    } else {
      flushWide();
    }
    if (symbols.size >= maxSymbols) break;
  }
  flushWide();

  // Prefer “interesting” symbols first.
  const arr = Array.from(symbols);
  const score = (s) => {
    if (s.startsWith('/Script/')) return 7;
    if (/^(BP_|ABP_|BPI_|AnimBP_|WBP_)/.test(s)) return 6;
    if (/^(On[A-Z]|Receive[A-Z]|Begin[A-Z]|End[A-Z])/.test(s)) return 5;
    if (/^(Get|Set|Is|Has)[A-Z]/.test(s)) return 4;
    if (/(Component|Interface|Subsystem|Controller|Character|Pawn)/.test(s)) return 3;
    if (s.length >= 10) return 2;
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

    const cacheKey = `${filePath}::${stat.mtimeMs}::${stat.size}`;
    const cached = uassetAnalysisCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const asset = new UAsset(filePath);
    await asset.load();

    // Avoid asset.toJSON() here — it's often large/slow and not needed for our UI.
    const assetType = (typeof asset.getAssetType === 'function') ? asset.getAssetType() : undefined;
    const unrealVersion = (typeof asset.getUnrealVersion === 'function') ? asset.getUnrealVersion() : undefined;

    // Prefer uassetreader's dependency extraction when available.
    let dependencies = [];
    try {
      if (typeof asset.getAssetDependencies === 'function') {
        const deps = asset.getAssetDependencies();
        if (Array.isArray(deps)) {
          dependencies = deps;
        } else if (deps && typeof deps === 'object') {
          // Some implementations may return an object map; flatten string values.
          const vals = Object.values(deps);
          dependencies = vals.flatMap(v => (Array.isArray(v) ? v : [v])).filter(x => typeof x === 'string');
        }
      }
    } catch {
      // Best-effort only; keep dependencies empty if extraction fails.
      dependencies = [];
    }

    // Best-effort: gather possible symbol names from raw ASCII strings.
    const symbols = asset.FileBuffer ? extractLikelySymbols(asset.FileBuffer) : [];

    const scriptPaths = symbols.filter(s => typeof s === 'string' && s.startsWith('/Script/'));
    const identifiers = symbols.filter(s => typeof s === 'string' && !s.startsWith('/Script/'));

    // Very heuristic buckets. These are NOT guaranteed to be real Blueprint vars/functions,
    // but help the AI and help debugging.
    const functionCandidates = identifiers.filter(s =>
      /^(K2_|Receive[A-Z]|On[A-Z]|Begin[A-Z]|End[A-Z]|Get[A-Z]|Set[A-Z]|Can[A-Z]|Should[A-Z]|Handle[A-Z])/.test(s) ||
      /(Tick|Update|Init|Initialize|Construct|Deconstruct|Start|Stop|Spawn|Destroy)/.test(s)
    );

    const variableCandidates = identifiers.filter(s =>
      !functionCandidates.includes(s) && (
        /^b[A-Z]/.test(s) ||
        /^(Max|Min|Num|Count|Index|Size|Length|Speed|Rate|Time|Duration|Health|Damage|Range)/.test(s) ||
        /^[a-z][A-Za-z0-9_]*$/.test(s)
      )
    );

    const classCandidates = [...new Set([
      ...scriptPaths,
      ...identifiers.filter(s => /^(BP_|ABP_|BPI_|AnimBP_|WBP_)/.test(s))
    ])];

    const payload = {
      assetType,
      unrealVersion,
      dependencies,
      symbols,
      symbolStats: {
        total: symbols.length,
        scriptPaths: scriptPaths.length,
        identifiers: identifiers.length
      },
      candidates: {
        classes: classCandidates.slice(0, 80),
        functions: functionCandidates.slice(0, 120),
        variables: variableCandidates.slice(0, 120)
      },
      samples: {
        topSymbols: symbols.slice(0, 60),
        topScriptPaths: scriptPaths.slice(0, 30),
        topIdentifiers: identifiers.slice(0, 60)
      },
      dependencyStats: {
        total: Array.isArray(dependencies) ? dependencies.length : 0
      },
      filePath,
      size: stat.size
    };

    uassetAnalysisCache.set(cacheKey, payload);
    res.json(payload);
  } catch (e) {
    console.error('Failed to analyze uasset', e);
    res.status(500).json({ error: 'Failed to analyze asset' });
  }
});

app.listen(PORT, () => {
  console.log(`💾 Storage Server running at http://localhost:${PORT}`);
  console.log(`📂 Saving data to: ${DATA_DIR}`);
});
