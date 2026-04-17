// server/routes/superadmin.js - Add this DELETE route
const express = require("express");
const router = express.Router({ mergeParams: true });

const admin = require("firebase-admin");
const { db } = require("../config/firebaseAdmin");

const auth = require("../middlewares/auth");
const requireSuperadmin = require("../middlewares/superadmin");
const tenantsCtrl = require("../controllers/tenants");
const formsLettersCtrl = require("../controllers/formsLetters");
const multer = require("multer");
const upload = multer();
const parseSharedFormUpload = upload.fields([{ name: "file", maxCount: 1 }]);

/**
 * POST /api/superadmin/bootstrap
 * Body: { emailOrUid }
 * Header: X-Setup-Token: process.env.SUPERADMIN_BOOTSTRAP_TOKEN
 */
router.post("/bootstrap", async (req, res) => {
  try {
    const token = req.header("X-Setup-Token");
    if (!token || token !== process.env.SUPERADMIN_BOOTSTRAP_TOKEN) {
      return res.status(403).json({ error: "Forbidden (invalid setup token)" });
    }

    const { emailOrUid } = req.body || {};
    if (!emailOrUid) return res.status(400).json({ error: "emailOrUid is required" });

    let userRecord = null;
    if (emailOrUid.includes("@")) {
      userRecord = await admin.auth().getUserByEmail(emailOrUid);
    } else {
      userRecord = await admin.auth().getUser(emailOrUid);
    }

    await admin.auth().setCustomUserClaims(userRecord.uid, {
      ...(userRecord.customClaims || {}),
      superadmin: true,
    });

    await db.ref(`users/${userRecord.uid}/profile`).update({
      isSuperadmin: true,
      updatedAt: Date.now(),
    });

    return res.json({ ok: true, uid: userRecord.uid, email: userRecord.email, superadmin: true });
  } catch (e) {
    console.error("superadmin.bootstrap error:", e);
    return res.status(500).json({ error: "Failed to promote user" });
  }
});

/**
 * GET /api/superadmin/me
 * Verifies the caller is superadmin (used by SuperPrivateRoute)
 */
router.get("/me", auth, requireSuperadmin, async (req, res) => {
  res.json({ ok: true, uid: req.uid, superadmin: true });
});

/**
 * SUPERADMIN Tenant admin endpoints
 */
router.get("/tenants", auth, requireSuperadmin, tenantsCtrl.list);
router.post("/tenants/register", auth, requireSuperadmin, tenantsCtrl.register);
router.get("/forms-letters", auth, requireSuperadmin, formsLettersCtrl.list);
router.post(
  "/forms-letters",
  auth,
  requireSuperadmin,
  (req, res, next) => {
    parseSharedFormUpload(req, res, (err) => {
      if (!err) return next();
      return res.status(400).json({
        error: "Failed to parse file upload",
        detail: err.message || String(err),
        code: err.code || null,
      });
    });
  },
  formsLettersCtrl.create
);
router.delete("/forms-letters/:id", auth, requireSuperadmin, formsLettersCtrl.remove);

/**
 * DELETE /api/superadmin/tenants/:tenantId
 * Delete a tenant and clean up related data
 */
router.delete("/tenants/:tenantId", auth, requireSuperadmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    if (!tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }

    console.log(`Deleting tenant: ${tenantId}`);

    // 1. Delete the main tenant node
    await db.ref(`tenants/${tenantId}`).remove();

    // 2. Clean up memberships for this tenant
    const membershipsSnap = await db.ref(`memberships`).once("value");
    if (membershipsSnap.exists()) {
      const updates = {};
      membershipsSnap.forEach((userSnap) => {
        const userId = userSnap.key;
        if (userSnap.child(tenantId).exists()) {
          updates[`memberships/${userId}/${tenantId}`] = null;
        }
      });
      
      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
        console.log(`Cleaned up memberships for tenant: ${tenantId}`);
      }
    }

    // 3. Clean up device tokens
    await db.ref(`tenants/${tenantId}/deviceTokens`).remove();

    // 4. Clean up user tokens
    await db.ref(`tenants/${tenantId}/userTokens`).remove();

    return res.json({ 
      ok: true, 
      message: `Tenant ${tenantId} deleted successfully`,
      deleted: {
        tenant: true,
        memberships: true,
        deviceTokens: true,
        userTokens: true
      }
    });
  } catch (e) {
    console.error("superadmin.deleteTenant error:", e);
    return res.status(500).json({ error: "Failed to delete tenant: " + e.message });
  }
});

module.exports = router;
