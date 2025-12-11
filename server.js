import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';

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

app.listen(PORT, () => {
  console.log(`💾 Storage Server running at http://localhost:${PORT}`);
  console.log(`📂 Saving data to: ${DATA_DIR}`);
});
