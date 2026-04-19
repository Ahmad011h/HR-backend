// server/controllers/me.js
const { db } = require("../config/firebaseAdmin");

exports.profile = async (req, res) => {
  try {
    if (!req.uid) return res.status(401).json({ error: "Unauthenticated" });

    // Superadmin flag (if your auth middleware puts custom claims on req.user)
    const isSuperadmin =
      req.user?.superadmin === true ||
      req.user?.customClaims?.superadmin === true;

    // 1) Load memberships (may be empty)
    const msnap = await db.ref(`memberships/${req.uid}`).once("value");
    const memberships = msnap.val() || {};

    // 2) Pick tenant: explicit header -> defaultTenantId -> first membership
    const explicit = req.header("X-Tenant-Id") || req.header("x-tenant-id") || "";
    let tenantId = explicit;

    if (!tenantId) {
      const defSnap = await db.ref(`users/${req.uid}/profile/defaultTenantId`).once("value");
      const def = defSnap.val();
      tenantId = (def && memberships[def]) ? def : Object.keys(memberships)[0] || null;
    }

    // If there is NO tenant at all, return a lean payload (200 OK)
    if (!tenantId) {
      return res.json({
        ok: true,
        uid: req.uid,
        tenantId: null,
        tenant: null,
        memberships,       // {}
        isSuperadmin,      // let the client route superadmins to /superadmin/tenants
        employee: null,    // no employee context yet
      });
    }

    const tenantMetaSnap = await db.ref(`tenants/${tenantId}/meta`).once("value");
    const tenantMeta = tenantMetaSnap.val() || null;

    // 3) Try to resolve employee in that tenant (by uid, then email)
    let employee = null;
    const byUid = await db
      .ref(`tenants/${tenantId}/employees`)
      .orderByChild("uid").equalTo(req.uid).once("value");

    if (byUid.exists()) {
      const [id, val] = Object.entries(byUid.val())[0];
      employee = { id, ...val };
    } else if (req.user?.email) {
      const byEmail = await db
        .ref(`tenants/${tenantId}/employees`)
        .orderByChild("email").equalTo(req.user.email).once("value");
      if (byEmail.exists()) {
        const [id, val] = Object.entries(byEmail.val())[0];
        employee = { id, ...val };
      }
    }

    // If employee isn't found, still return 200 with employee: null
    if (!employee) {
      return res.json({
        ok: true,
        uid: req.uid,
        tenantId,
        tenant: tenantMeta ? { id: tenantId, ...tenantMeta } : { id: tenantId },
        memberships,
        isSuperadmin,
        employee: null,
      });
    }

    // 4) Normal response when employee exists
    return res.json({
      ok: true,
      uid: employee.uid || req.uid,
      tenantId,
      tenant: tenantMeta ? { id: tenantId, ...tenantMeta } : { id: tenantId },
      memberships,               // { [tenantId]: { role, createdAt } }
      isSuperadmin,
      employee: {
        id: employee.id,
        firstName: employee.firstName || "",
        lastName: employee.lastName || "",
        fullName: `${employee.firstName || ""} ${employee.lastName || ""}`.trim(),
        email: employee.email || "",
        phone: employee.phone || "",
        role: employee.role || "",
        departmentId: employee.departmentId || "",
        department: employee.department || "",
        teamId: employee.teamId || "",
        teamName: employee.teamName || "",
        status: employee.status || "Active",
        createdAt: employee.createdAt || "",
        updatedAt: employee.updatedAt || "",
      },
    });
  } catch (e) {
    console.error("me.profile error:", e);
    res.status(500).json({ error: "Failed to load profile" });
  }
};
