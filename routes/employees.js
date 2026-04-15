// server/routes/employees.js
const express = require("express");
const router = express.Router({ mergeParams: true });

const multer = require("multer");
const upload = multer();

const auth = require("../middlewares/auth");
const tenant = require("../middlewares/tenant");
const requireRole = require("../middlewares/requireRole");
const ctrl = require("../controllers/employees");

// Auth + tenant membership required
router.use(auth, tenant);

// Allow owner/admin/hr/manager/superadmin to use dashboard employees API
router.use(requireRole("owner", "admin", "hr", "manager", "superadmin"));

router
  .route("/")
  .get(ctrl.list)
  .post(
    upload.fields([
      { name: "contract",   maxCount: 1 },
      { name: "profilePic", maxCount: 1 },
      { name: "idDoc",      maxCount: 1 },
    ]),
    ctrl.create
  );

router
  .route("/:id")
  .get(ctrl.getOne)
  .put(
    upload.fields([
      { name: "contract",   maxCount: 1 },
      { name: "profilePic", maxCount: 1 },
      { name: "idDoc",      maxCount: 1 },
    ]),
    ctrl.update
  )
  .delete(ctrl.remove);

router.put(
  "/:id/documents",
  upload.fields([
    { name: "contract",   maxCount: 1 },
    { name: "profilePic", maxCount: 1 },
    { name: "idDoc",      maxCount: 1 },
  ]),
  ctrl.updateDocuments
);

// NEW: Salary endpoints
router.get("/:id/salary", ctrl.getSalary);
router.post("/:id/salary", ctrl.setSalary);

module.exports = router;
