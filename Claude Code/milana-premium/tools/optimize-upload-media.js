#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "milana.db");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const ORIGINAL_DIR = path.join(UPLOAD_DIR, "originals");
const WORK_DIR = path.join(DATA_DIR, "upload-work");
const APPLY = process.argv.includes("--apply");
const ALL_FILES = process.argv.includes("--all");
const IMAGE_MAX_EDGE = Math.max(1800, Math.min(5000, Number(process.env.MEDIA_IMAGE_MAX_EDGE) || 3200));
const IMAGE_QUALITY = Math.max(82, Math.min(98, Number(process.env.MEDIA_IMAGE_QUALITY) || 92));
const VIDEO_MAX_EDGE = Math.max(1080, Math.min(2160, Number(process.env.MEDIA_VIDEO_MAX_EDGE) || 1920));
const VIDEO_CRF = Math.max(18, Math.min(28, Number(process.env.MEDIA_VIDEO_CRF) || 22));
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const FFPROBE = process.env.FFPROBE_BIN || "ffprobe";
const CWEBP = process.env.CWEBP_BIN || "cwebp";

fs.mkdirSync(ORIGINAL_DIR, { recursive: true });
fs.mkdirSync(WORK_DIR, { recursive: true });

function ffmpegAvailable() {
  try { return spawnSync(FFMPEG, ["-version"], { stdio: "ignore" }).status === 0; } catch { return false; }
}

function cwebpAvailable() {
  try { return spawnSync(CWEBP, ["-version"], { stdio: "ignore" }).status === 0; } catch { return false; }
}

function ffprobeAvailable() {
  try { return spawnSync(FFPROBE, ["-version"], { stdio: "ignore" }).status === 0; } catch { return false; }
}

function extKind(file) {
  const ext = path.extname(file).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return "image";
  if ([".mp4", ".webm"].includes(ext)) return "video";
  return "";
}

function scaleFilter(maxEdge) {
  return `scale='if(gt(iw,ih),min(${maxEdge},iw),-2)':'if(gt(iw,ih),-2,min(${maxEdge},ih))':flags=lanczos`;
}

function run(args) {
  const result = spawnSync(FFMPEG, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "ffmpeg failed").trim().split(/\r?\n/).slice(-3).join(" "));
  }
}

function runCwebp(args) {
  const result = spawnSync(CWEBP, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "cwebp failed").trim().split(/\r?\n/).slice(-3).join(" "));
  }
}

function probeSize(file) {
  if (!ffprobeAvailable()) return null;
  const result = spawnSync(FFPROBE, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0:s=x",
    file,
  ], { encoding: "utf8" });
  const match = String(result.stdout || "").trim().match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function probeRotation(file) {
  if (!ffprobeAvailable()) return 0;
  const result = spawnSync(FFPROBE, [
    "-v", "error",
    "-show_entries", "stream_tags=rotate:side_data=rotation",
    "-of", "default=nw=1",
    file,
  ], { encoding: "utf8" });
  const match = String(result.stdout || "").match(/(?:rotation|rotate)=(-?\d+)/);
  return match ? Number(match[1]) : 0;
}

function cwebpResizeArgs(file) {
  const size = probeSize(file);
  if (!size) return [];
  const edge = Math.max(size.width, size.height);
  if (edge <= IMAGE_MAX_EDGE) return [];
  return size.width >= size.height
    ? ["-resize", String(IMAGE_MAX_EDGE), "0"]
    : ["-resize", "0", String(IMAGE_MAX_EDGE)];
}

function targetNameFor(file, kind) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file, ext);
  if (kind === "image") return `${base}.webp`;
  return ext === ".mp4" ? `${base}-optimized.mp4` : `${base}.mp4`;
}

function optimizeFile(file) {
  const kind = extKind(file);
  if (!kind || file.includes("/originals/")) return { changed: false, reason: "unsupported" };
  if (path.basename(file).startsWith("._")) return { changed: false, reason: "metadata_file" };
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file, ext);
  if (kind === "image" && ext === ".webp") return { changed: false, reason: "already_webp" };
  if (kind === "video" && ext === ".mp4" && base.endsWith("-optimized")) return { changed: false, reason: "already_optimized_video" };

  const source = path.join(UPLOAD_DIR, path.basename(file));
  if (!fs.existsSync(source)) return { changed: false, reason: "missing" };

  const originalName = path.basename(source);
  const originalBackup = path.join(ORIGINAL_DIR, originalName);
  if (APPLY && !fs.existsSync(originalBackup)) fs.copyFileSync(source, originalBackup);

  const targetName = targetNameFor(file, kind);
  const target = path.join(UPLOAD_DIR, targetName);
  const work = path.join(WORK_DIR, `${process.pid}-${targetName}`);
  const orientedWork = path.join(WORK_DIR, `${process.pid}-${base}-oriented.png`);
  try { fs.unlinkSync(work); } catch {}
  try { fs.unlinkSync(orientedWork); } catch {}

  const before = fs.statSync(source).size;
  try {
    if (kind === "image") {
      if (!cwebpAvailable()) return { changed: false, reason: "cwebp_missing" };
      let imageSource = source;
      const rotation = probeRotation(source);
      if (rotation && ffmpegAvailable()) {
        run([
          "-y", "-hide_banner", "-loglevel", "error",
          "-i", source,
          "-vf", scaleFilter(IMAGE_MAX_EDGE),
          orientedWork,
        ]);
        imageSource = orientedWork;
      }
      runCwebp([
        "-quiet",
        "-preset", "picture",
        "-q", String(IMAGE_QUALITY),
        "-m", "6",
        "-sharp_yuv",
        ...(imageSource === source ? cwebpResizeArgs(source) : []),
        imageSource,
        "-o", work,
      ]);
      try { fs.unlinkSync(orientedWork); } catch {}
    } else {
      if (!ffmpegAvailable()) return { changed: false, reason: "ffmpeg_missing" };
      run([
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", source,
        "-vf", scaleFilter(VIDEO_MAX_EDGE),
        "-an",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", String(VIDEO_CRF),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        work,
      ]);
    }
  } catch (e) {
    try { fs.unlinkSync(work); } catch {}
    try { fs.unlinkSync(orientedWork); } catch {}
    return { changed: false, reason: e.message || "optimizer_failed" };
  }

  const after = fs.statSync(work).size;
  const goodEnough = kind === "video"
    ? after > 1024 && after <= before * 1.15
    : after > 1024 && after < before * 0.98;
  if (!goodEnough) {
    fs.unlinkSync(work);
    return { changed: false, reason: "kept_original", before, after };
  }
  if (APPLY) fs.renameSync(work, target);
  else fs.unlinkSync(work);
  return { changed: true, from: `/uploads/${path.basename(file)}`, to: `/uploads/${targetName}`, before, after, saved: before - after };
}

function readImages(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function main() {
  if (!ffmpegAvailable() && !cwebpAvailable()) {
    console.error(`Missing media tools. Install ffmpeg for video and cwebp for images before optimizing media.`);
    process.exit(1);
  }

  const db = new DatabaseSync(DB_PATH);
  const rows = db.prepare("SELECT id, images FROM products ORDER BY id").all();
  const updates = [];
  let changedFiles = 0;
  let savedBytes = 0;
  const seen = new Map();

  for (const row of rows) {
    const images = readImages(row.images);
    const next = images.map((url) => {
      if (!url.startsWith("/uploads/") || url.startsWith("/uploads/originals/")) return url;
      if (!seen.has(url)) {
        const result = optimizeFile(url);
        seen.set(url, result);
        if (result.changed) {
          changedFiles += 1;
          savedBytes += result.saved || 0;
        }
      }
      const result = seen.get(url);
      if (result.changed) return result.to;
      return url;
    });
    if (JSON.stringify(next) !== JSON.stringify(images)) updates.push({ id: row.id, images: next });
  }

  if (ALL_FILES) {
    for (const name of fs.readdirSync(UPLOAD_DIR)) {
      const url = `/uploads/${name}`;
      if (seen.has(url)) continue;
      const result = optimizeFile(url);
      if (result.changed) {
        changedFiles += 1;
        savedBytes += result.saved || 0;
      }
    }
  }

  if (APPLY) {
    const update = db.prepare("UPDATE products SET images=? WHERE id=?");
    db.exec("BEGIN");
    try {
      for (const row of updates) update.run(JSON.stringify(row.images), row.id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  console.log(`${APPLY ? "Applied" : "Dry run"} media optimization`);
  console.log(`Products to update: ${updates.length}`);
  console.log(`Optimized files: ${changedFiles}`);
  console.log(`Estimated saved: ${(savedBytes / 1024 / 1024).toFixed(1)} MB`);
  if (!APPLY) console.log("Run again with --apply to write optimized files and update SQLite product references.");
}

main();
