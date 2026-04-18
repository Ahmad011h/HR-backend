const { db, bucket } = require("../config/firebaseAdmin");
const { v4: uuidv4 } = require("uuid");

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function getTenantId(req) {
  return (
    req.tenantId ||
    req.params.tenantId ||
    req.header("X-Tenant-Id") ||
    req.header("x-tenant-id") ||
    ""
  );
}

function refArchives(tenantId) {
  return db.ref(`tenants/${tenantId}/employeeArchives`);
}

function refEmployees(tenantId) {
  return db.ref(`tenants/${tenantId}/employees`);
}

function sanitizeName(name = "file") {
  return String(name)
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 140);
}

function toRecord(id, value = {}) {
  return { id, ...value };
}

function getActor(req) {
  return {
    uid: req.uid || null,
    email: req.user?.email || null,
  };
}

async function uploadArchiveFile({ tenantId, archiveId, file }) {
  if (!file) throw new Error("file is required");
  if ((file.size || 0) > MAX_FILE_BYTES) {
    throw new Error("File exceeds the 20MB upload limit");
  }

  const safeName = sanitizeName(file.originalname || `archive_${Date.now()}`);
  const objectPath = `tenants/${tenantId}/employeeArchives/${archiveId}/${Date.now()}_${safeName}`;
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

exports.list = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    const snap = await refArchives(tenantId).once("value");
    const list = Object.entries(snap.val() || {})
      .map(([id, value]) => toRecord(id, value))
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));

    res.json(list);
  } catch (e) {
    console.error("employeeArchives.list error:", e);
    res.status(500).json({ error: "Failed to load employee archives" });
  }
};

exports.create = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    const employeeId = String(req.body?.employeeId || "").trim();
    const dateFrom = String(req.body?.dateFrom || "").trim();
    const dateTo = String(req.body?.dateTo || "").trim();
    const file = req.files?.file?.[0];

    if (!employeeId) return res.status(400).json({ error: "employeeId is required" });
    if (!dateFrom) return res.status(400).json({ error: "dateFrom is required" });
    if (!dateTo) return res.status(400).json({ error: "dateTo is required" });
    if (!file) return res.status(400).json({ error: "file is required" });

    const employeeSnap = await refEmployees(tenantId).child(employeeId).once("value");
    if (!employeeSnap.exists()) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const employee = employeeSnap.val() || {};
    const employeeName =
      `${employee.firstName || ""} ${employee.lastName || ""}`.trim() ||
      employee.name ||
      employee.email ||
      employeeId;

    const now = new Date().toISOString();
    const actor = getActor(req);
    const ref = refArchives(tenantId).push();
    const uploaded = await uploadArchiveFile({ tenantId, archiveId: ref.key, file });

    const record = {
      tenantId,
      employeeId,
      employeeName,
      dateFrom,
      dateTo,
      createdAt: now,
      updatedAt: now,
      uploadedBy: actor,
      ...uploaded,
    };

    await ref.set(record);
    res.status(201).json(toRecord(ref.key, record));
  } catch (e) {
    console.error("employeeArchives.create error:", e);
    res.status(500).json({
      error: "Failed to upload employee archive file",
      detail: e?.message || String(e),
    });
  }
};
