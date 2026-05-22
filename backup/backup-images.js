// ─── LuckyStop: Cloudinary Image Backup ──────────────────────────────────────
// Downloads all receipt photos and banner images to a local folder.
// Keeps only the 3 most recent dated backup folders.
//
// CONFIGURE: set BACKUP_ROOT to your external hard drive path
const BACKUP_ROOT = 'S:\\LuckyStopBackups\\images';
// ─────────────────────────────────────────────────────────────────────────────

const cloudinary = require('cloudinary').v2;
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read credentials from backend/.env
function readEnv() {
  const envPath = path.join(__dirname, '..', 'backend', '.env');
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)="?([^"#\n]+)"?/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function backup() {
  const env = readEnv();
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key:    env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });

  const date   = new Date().toISOString().split('T')[0];
  const outDir = path.join(BACKUP_ROOT, `backup_${date}`);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\nBacking up Cloudinary images to:\n  ${outDir}\n`);

  let nextCursor = null;
  let total = 0;
  let failed = 0;

  // Download images
  do {
    const opts = { max_results: 100, resource_type: 'image' };
    if (nextCursor) opts.next_cursor = nextCursor;

    const result = await cloudinary.api.resources(opts);

    for (const r of result.resources) {
      const ext      = r.format || 'jpg';
      const safeName = r.public_id.replace(/[\\/]/g, '_');
      const dest     = path.join(outDir, `${safeName}.${ext}`);

      try {
        await downloadFile(r.secure_url, dest);
        total++;
        process.stdout.write(`\r  Downloaded ${total} files...`);
      } catch {
        failed++;
      }
    }

    nextCursor = result.next_cursor;
  } while (nextCursor);

  // Also download raw files (PDFs etc.)
  do {
    const opts = { max_results: 100, resource_type: 'raw' };
    if (nextCursor) opts.next_cursor = nextCursor;

    let result;
    try { result = await cloudinary.api.resources(opts); }
    catch { break; }

    for (const r of result.resources) {
      const ext      = r.format || 'bin';
      const safeName = r.public_id.replace(/[\\/]/g, '_');
      const dest     = path.join(outDir, `${safeName}.${ext}`);

      try {
        await downloadFile(r.secure_url, dest);
        total++;
        process.stdout.write(`\r  Downloaded ${total} files...`);
      } catch {
        failed++;
      }
    }

    nextCursor = result.next_cursor;
  } while (nextCursor);

  console.log(`\n\nDone: ${total} files saved${failed ? `, ${failed} failed` : ''}`);

  // Rolling retention: keep 3 most recent backup folders
  const folders = fs.readdirSync(BACKUP_ROOT)
    .filter(f => f.startsWith('backup_'))
    .map(f => ({ name: f, fullPath: path.join(BACKUP_ROOT, f), mtime: fs.statSync(path.join(BACKUP_ROOT, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);

  folders.slice(3).forEach(f => {
    fs.rmSync(f.fullPath, { recursive: true, force: true });
    console.log(`Removed old backup: ${f.name}`);
  });

  console.log(`Backups kept: ${Math.min(folders.length, 3)}`);
}

backup().catch(err => { console.error('\nFailed:', err.message); process.exit(1); });
