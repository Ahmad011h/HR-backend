// server/controllers/employees.js
const { db, admin, bucket } = require("../config/firebaseAdmin");

// Resolve tenantId from middleware, path param, or header
function getTenantId(req) {
  const hdrTenant = req.header("X-Tenant-Id") || req.header("x-tenant-id") || "";
  return String(req.tenantId || req.params.tenantId || hdrTenant || "").trim();
}

function refEmployees(tenantId) {
  return db.ref(`tenants/${tenantId}/employees`);
}

const isValidYMD = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(new Date(s).valueOf());

const getActor = (req) => {
  const u = req.user || {};
  return {
    uid: u.uid || null,
    email: u.email || req.header("X-User-Email") || null,
  };
};

function applyUploadedEmployeeFiles(target, files = {}) {
  if (files?.contract?.[0]) {
    target.contractFileName = files.contract[0].originalname;
    target.contractBase64   = files.contract[0].buffer.toString("base64");
  }
  if (files?.profilePic?.[0]) {
    target.profilePicFileName = files.profilePic[0].originalname;
    target.profilePicBase64   = files.profilePic[0].buffer.toString("base64");
  }
  if (files?.idDoc?.[0]) {
    target.idDocFileName = files.idDoc[0].originalname;
    target.idDocBase64   = files.idDoc[0].buffer.toString("base64");
  }
}

const safeFileName = (name = "document") =>
  String(name)
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);

async function uploadEmployeeFile({ tenantId, employeeId, field, file }) {
  const objectPath = [
    "tenants",
    tenantId,
    "employees",
    employeeId,
    "documents",
    `${field}-${Date.now()}-${safeFileName(file.originalname)}`,
  ].join("/");

  const storageFile = bucket.file(objectPath);
  await storageFile.save(file.buffer, {
    resumable: false,
    metadata: {
      contentType: file.mimetype || "application/octet-stream",
      metadata: {
        originalName: file.originalname,
        field,
      },
    },
  });

  const [url] = await storageFile.getSignedUrl({
    action: "read",
    expires: "2500-01-01",
  });

  return {
    fileName: file.originalname,
    storagePath: objectPath,
    url,
  };
}

async function applyUploadedEmployeeDocuments(target, files = {}, tenantId, employeeId) {
  const mapping = [
    ["contract", "contract"],
    ["profilePic", "profilePic"],
    ["idDoc", "idDoc"],
  ];

  let uploadedCount = 0;
  for (const [field, prefix] of mapping) {
    const file = files?.[field]?.[0];
    if (!file) continue;

    const uploaded = await uploadEmployeeFile({ tenantId, employeeId, field, file });
    target[`${prefix}FileName`] = uploaded.fileName;
    target[`${prefix}StoragePath`] = uploaded.storagePath;
    target[`${prefix}Url`] = uploaded.url;
    uploadedCount += 1;
  }

  return uploadedCount;
}

// Small helper: sanitize/normalize body
const normalize = (b = {}) => ({
  firstName: (b.firstName || "").trim(),
  lastName: (b.lastName || "").trim(),
  gender: b.gender || "",
  dob: b.dob || "",

  nationality: (b.nationality || "").trim(),
  phone: (b.phone || "").trim(),
  email: (b.email || "").trim(),
  address: (b.address || "").trim(),

  role: (b.role || "").trim(),
  department: b.department || "",
  departmentId: b.departmentId || "",
  teamName: b.teamName || "",
  teamId: b.teamId || "",

  employeeType: b.employeeType || "Full-time",
  startDate: b.startDate || "",
  endDate: b.endDate || "",
  status: b.status || "Active",

  salary: b.salary ? Number(b.salary) : 0,
  salaryCurrency: (b.salaryCurrency || b.currency || "").toString().trim().toUpperCase() || null,
  payFrequency: b.payFrequency || "Monthly",
  gradeId: b.gradeId || null,
  compensationEffectiveFrom: b.compensationEffectiveFrom || b.effectiveFrom || "",

  bankName: (b.bankName || "").trim(),
  accountNumber: (b.accountNumber || "").trim(),
  iban: (b.iban || "").trim(),

  notes: (b.notes || "").trim(),
});

function coerceBool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/* ------------------------------- list -------------------------------- */

exports.list = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    const { q = "", departmentId = "", teamId = "", status = "" } = req.query;

    const snap = await refEmployees(tenantId).once("value");
    let data = snap.val() || {};
    let list = Object.entries(data).map(([id, val]) => ({ id, ...val }));

    if (q) {
      const term = String(q).toLowerCase();
      list = list.filter((r) =>
        [
          r.firstName, r.lastName, r.email, r.phone,
          r.role, r.department, r.teamName, r.address,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term)
      );
    }
    if (departmentId) list = list.filter((r) => r.departmentId === departmentId);
    if (teamId)       list = list.filter((r) => r.teamId === teamId);
    if (status)       list = list.filter((r) => (r.status || "Active") === status);

    list.sort(
      (a, b) => (b.createdAt ? Date.parse(b.createdAt) : 0) - (a.createdAt ? Date.parse(a.createdAt) : 0)
    );

    res.json(list);
  } catch (e) {
    console.error("employees.list error:", e);
    res.status(500).json({ error: "Failed to load employees" });
  }
};

/* ------------------------------- getOne ------------------------------- */

exports.getOne = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    const node = refEmployees(tenantId).child(req.params.id);
    const snap = await node.once("value");
    if (!snap.exists()) return res.status(404).json({ error: "Not found" });

    res.json({ id: snap.key, ...snap.val() });
  } catch (e) {
    console.error("employees.getOne error:", e);
    res.status(500).json({ error: "Failed to load employee" });
  }
};

/* ------------------------------- create ------------------------------- */

exports.create = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    const nowISO = new Date().toISOString();
    const body = normalize(req.body);

    // Basic validation
    if (!body.firstName || !body.lastName) {
      return res.status(400).json({ error: "firstName and lastName are required" });
    }
    if (body.endDate && body.startDate && body.endDate < body.startDate) {
      return res.status(400).json({ error: "endDate cannot be before startDate" });
    }
    if (body.compensationEffectiveFrom && !isValidYMD(body.compensationEffectiveFrom)) {
      return res.status(400).json({ error: "compensationEffectiveFrom must be YYYY-MM-DD" });
    }
    if (body.salaryCurrency && String(body.salaryCurrency).trim().length < 3) {
      return res.status(400).json({ error: "salary currency must be a 3-letter code" });
    }

    // Optional: create a Firebase Auth account for the employee.
    const createLoginAccount = coerceBool(req.body?.createLoginAccount);
    const desiredPassword   = (req.body?.accountPassword || "").trim();

    const employeeData = {
      ...body,
      tenantId,
      createdAt: nowISO,
      updatedAt: nowISO,
    };

    let createdUser = null;
    if (createLoginAccount && employeeData.email) {
      try {
        let userRecord;
        try {
          userRecord = await admin.auth().getUserByEmail(employeeData.email);
        } catch (e) {
          if (e?.code === "auth/user-not-found") userRecord = null;
          else throw e;
        }

        if (!userRecord) {
          const tempPassword = desiredPassword || (Math.random().toString(36).slice(-10) + "Aa1!");
          userRecord = await admin.auth().createUser({
            email: employeeData.email,
            password: tempPassword,
            displayName: `${employeeData.firstName} ${employeeData.lastName}`.trim(),
            emailVerified: false,
          });
          createdUser = {
            uid: userRecord.uid,
            email: userRecord.email,
            tempPassword: desiredPassword ? undefined : tempPassword,
          };
        }

        // Save membership as "employee" (blocked on dashboard routes)
        await db.ref(`memberships/${userRecord.uid}/${tenantId}`)
          .set({ role: "employee", createdAt: nowISO });

        // Default tenant convenience
        await db.ref(`users/${userRecord.uid}/profile/defaultTenantId`).set(tenantId);

        // Link employee record with auth uid
        employeeData.uid = userRecord.uid;
      } catch (authErr) {
        return res.status(400).json({
          error: `Failed to create login account: ${authErr?.message || authErr}`,
        });
      }
    }

    // Optional file blobs (demo only)
    applyUploadedEmployeeFiles(employeeData, req.files);

    const ref = await refEmployees(tenantId).push(employeeData);
    const snap = await ref.once("value");
    res.status(201).json({
      id: snap.key,
      ...snap.val(),
      createdUser,
    });
  } catch (err) {
    console.error("employees.create error:", err);
    res.status(500).json({ error: "Failed to save employee" });
  }
};

/* ------------------------------- update ------------------------------- */

exports.update = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    const node = refEmployees(tenantId).child(req.params.id);

    const raw = req.body || {};
    const trim = (v) => (typeof v === "string" ? v.trim() : v);

    const allowed = [
      "firstName","lastName","gender","dob",
      "nationality","phone","email","address",
      "role","department","departmentId","teamName","teamId",
      "employeeType","startDate","endDate","status",
      "salary","salaryCurrency","payFrequency","gradeId","compensationEffectiveFrom",
      "bankName","accountNumber","iban",
      "notes","importStatus"
    ];

    const patch = { updatedAt: new Date().toISOString() };
    for (const k of allowed) {
      if (raw[k] !== undefined) patch[k] = trim(raw[k]);
    }

    // type/format coercions & validation
    if (raw.salary !== undefined) {
      const n = Number(raw.salary);
      if (Number.isNaN(n) || n < 0) return res.status(400).json({ error: "salary must be a non-negative number" });
      patch.salary = n;
    }
    if (raw.salaryCurrency !== undefined) {
      const c = String(raw.salaryCurrency || "").toUpperCase().trim();
      if (c && c.length < 3) return res.status(400).json({ error: "salary currency must be a 3-letter code" });
      patch.salaryCurrency = c || null;
    }
    if (raw.compensationEffectiveFrom !== undefined) {
      if (raw.compensationEffectiveFrom && !isValidYMD(raw.compensationEffectiveFrom)) {
        return res.status(400).json({ error: "compensationEffectiveFrom must be YYYY-MM-DD" });
      }
    }
    if (raw.startDate && raw.endDate && raw.endDate < raw.startDate) {
      return res.status(400).json({ error: "endDate cannot be before startDate" });
    }

    applyUploadedEmployeeFiles(patch, req.files);

    await node.update(patch);
    const snap = await node.once("value");
    if (!snap.exists()) return res.status(404).json({ error: "Not found" });

    res.json({ id: snap.key, ...snap.val() });
  } catch (e) {
    console.error("employees.update error:", e);
    res.status(500).json({ error: "Failed to update employee" });
  }
};

/* -------------------------- updateDocuments -------------------------- */

exports.updateDocuments = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    const node = refEmployees(tenantId).child(req.params.id);
    const snap = await node.once("value");
    if (!snap.exists()) return res.status(404).json({ error: "Not found" });

    const patch = { updatedAt: new Date().toISOString() };
    const uploadedCount = await applyUploadedEmployeeDocuments(
      patch,
      req.files,
      tenantId,
      req.params.id
    );

    if (!uploadedCount) {
      return res.status(400).json({ error: "Upload at least one document" });
    }

    await node.update(patch);
    const after = await node.once("value");
    res.json({ id: after.key, ...after.val() });
  } catch (e) {
    console.error("employees.updateDocuments error:", e);
    res.status(500).json({
      error: "Failed to update employee documents",
      detail: e?.message || String(e),
    });
  }
};

/* ------------------------------- remove ------------------------------- */

exports.remove = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    await refEmployees(tenantId).child(req.params.id).remove();
    res.status(204).end();
  } catch (e) {
    console.error("employees.remove error:", e);
    res.status(500).json({ error: "Failed to delete employee" });
  }
};

/* -------------------- NEW: salary read + update with history -------------------- */

exports.getSalary = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    const node = refEmployees(tenantId).child(req.params.id);
    const snap = await node.once("value");
    if (!snap.exists()) return res.status(404).json({ error: "Not found" });

    const emp = snap.val() || {};
    const histSnap = await node.child("salaryHistory").once("value");
    const history = Object.entries(histSnap.val() || {})
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0));

    const limit = Number.parseInt(req.query.limit, 10);
    const limited = !Number.isNaN(limit) && limit > 0 ? history.slice(0, limit) : history;

    res.json({
      id: snap.key,
      salary: emp.salary ?? 0,
      salaryCurrency: emp.salaryCurrency || null,
      payFrequency: emp.payFrequency || "Monthly",
      gradeId: emp.gradeId || null,
      compensationEffectiveFrom: emp.compensationEffectiveFrom || null,
      history: limited,
    });
  } catch (e) {
    console.error("employees.getSalary error:", e);
    res.status(500).json({ error: "Failed to load salary" });
  }
};

exports.setSalary = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    const id = req.params.id;
    const node = refEmployees(tenantId).child(id);
    const snap = await node.once("value");
    if (!snap.exists()) return res.status(404).json({ error: "Not found" });

    const current = snap.val() || {};
    const body = req.body || {};

    const { salary, currency, payFrequency, effectiveFrom, gradeId } = body;

    if (
      salary === undefined &&
      currency === undefined &&
      payFrequency === undefined &&
      gradeId === undefined &&
      effectiveFrom === undefined
    ) {
      return res.status(400).json({
        error: "Provide at least one of salary, currency, payFrequency, gradeId, effectiveFrom",
      });
    }

    const patch = { updatedAt: new Date().toISOString() };

    if (salary !== undefined) {
      const n = Number(salary);
      if (Number.isNaN(n) || n < 0) return res.status(400).json({ error: "salary must be a non-negative number" });
      patch.salary = n;
    }

    if (currency !== undefined) {
      const c = String(currency || "").trim().toUpperCase();
      if (c && c.length < 3) return res.status(400).json({ error: "currency must be a 3-letter code" });
      patch.salaryCurrency = c || null;
    }

    if (payFrequency !== undefined) {
      const pf = String(payFrequency || "").trim();
      const allowed = ["Monthly", "Biweekly", "Weekly", "Annual", "Hourly"];
      if (pf && !allowed.includes(pf)) {
        return res.status(400).json({ error: `payFrequency must be one of: ${allowed.join(", ")}` });
      }
      if (pf) patch.payFrequency = pf;
    }

    if (gradeId !== undefined) {
      patch.gradeId = String(gradeId || "").trim() || null;
    }

    if (effectiveFrom !== undefined) {
      if (effectiveFrom && !isValidYMD(effectiveFrom)) {
        return res.status(400).json({ error: "effectiveFrom must be YYYY-MM-DD" });
      }
      patch.compensationEffectiveFrom = effectiveFrom || null;
    }

    const actor = getActor(req);

    const histEntry = {
      at: patch.updatedAt,
      actor,
      before: {
        salary: current.salary ?? null,
        currency: current.salaryCurrency ?? null,
        payFrequency: current.payFrequency ?? null,
        gradeId: current.gradeId ?? null,
        effectiveFrom: current.compensationEffectiveFrom ?? null,
      },
      after: {
        salary: patch.salary ?? current.salary ?? null,
        currency: patch.salaryCurrency ?? current.salaryCurrency ?? null,
        payFrequency: patch.payFrequency ?? current.payFrequency ?? null,
        gradeId: patch.gradeId ?? current.gradeId ?? null,
        effectiveFrom: patch.compensationEffectiveFrom ?? current.compensationEffectiveFrom ?? null,
      },
    };

    await Promise.all([
      node.update(patch),
      node.child("salaryHistory").push(histEntry),
    ]);

    const after = await node.once("value");
    res.json({ id: after.key, ...after.val(), lastSalaryChange: histEntry });
  } catch (e) {
    console.error("employees.setSalary error:", e);
    res.status(500).json({ error: "Failed to set salary" });
  }
};
