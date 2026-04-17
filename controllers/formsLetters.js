const { db, bucket } = require("../config/firebaseAdmin");
const { v4: uuidv4 } = require("uuid");

function refFormsLetters() {
  return db.ref("shared/formsLetters");
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function sanitizeName(name = "file") {
  return String(name)
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 140);
}

function getActor(req) {
  return {
    uid: req.uid || null,
    email: req.user?.email || null,
  };
}

function readText(value, fallback = "") {
  return String(value || fallback).trim();
}

function toRecord(id, value = {}) {
  return { id, ...value };
}

async function uploadSharedFile(file, recordId) {
  if (!file) throw new Error("File is required");
  if ((file.size || 0) > MAX_FILE_BYTES) {
    throw new Error("File exceeds the 20MB upload limit");
  }

  const safeName = sanitizeName(file.originalname || `form_${Date.now()}`);
  const objectPath = `shared/formsLetters/${recordId}/${Date.now()}_${safeName}`;
  const storageFile = bucket.file(objectPath);
  const downloadToken = uuidv4();

  await storageFile.save(file.buffer, {
    metadata: {
      contentType: file.mimetype || "application/octet-stream",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        originalName: file.originalname,
      },
    },
    resumable: false,
    public: false,
    validation: "crc32c",
  });

  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    objectPath
  )}?alt=media&token=${downloadToken}`;

  return {
    fileName: file.originalname,
    storagePath: objectPath,
    downloadUrl,
    downloadToken,
    contentType: file.mimetype || "application/octet-stream",
    size: file.size || file.buffer?.length || 0,
  };
}

exports.list = async (_req, res) => {
  try {
    const snap = await refFormsLetters().once("value");
    const list = Object.entries(snap.val() || {})
      .map(([id, value]) => toRecord(id, value))
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));

    res.json(list);
  } catch (e) {
    console.error("formsLetters.list error:", e);
    res.status(500).json({ error: "Failed to load forms and letters" });
  }
};

exports.create = async (req, res) => {
  try {
    const title = readText(req.body?.title);
    const description = readText(req.body?.description);
    const category = readText(req.body?.category, "General");
    const file = req.files?.file?.[0];

    if (!title) return res.status(400).json({ error: "title is required" });
    if (!file) return res.status(400).json({ error: "file is required" });

    const now = new Date().toISOString();
    const actor = getActor(req);
    const ref = refFormsLetters().push();

    const uploaded = await uploadSharedFile(file, ref.key);
    const record = {
      title,
      description,
      category,
      createdAt: now,
      updatedAt: now,
      uploadedBy: actor,
      ...uploaded,
    };

    await ref.set(record);
    res.status(201).json(toRecord(ref.key, record));
  } catch (e) {
    console.error("formsLetters.create error:", e);
    res.status(500).json({
      error: "Failed to upload form or letter",
      detail: e?.message || String(e),
    });
  }
};

exports.remove = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: "id is required" });

    const node = refFormsLetters().child(id);
    const snap = await node.once("value");
    if (!snap.exists()) return res.status(404).json({ error: "Not found" });

    const data = snap.val() || {};
    if (data.storagePath) {
      await bucket.file(data.storagePath).delete({ ignoreNotFound: true });
    }

    await node.remove();
    res.status(204).end();
  } catch (e) {
    console.error("formsLetters.remove error:", e);
    res.status(500).json({ error: "Failed to delete form or letter" });
  }
};
