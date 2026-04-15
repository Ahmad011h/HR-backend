// server/routes/employees.js
const express = require("express");
const router = express.Router({ mergeParams: true });

const multer = require("multer");
const upload = multer();
const employeeUpload = upload.fields([
  { name: "contract",   maxCount: 1 },
  { name: "profilePic", maxCount: 1 },
  { name: "idDoc",      maxCount: 1 },
]);

const handleEmployeeUpload = (req, res, next) => {
  employeeUpload(req, res, (err) => {
    if (!err) return next();
    return res.status(400).json({
      error: "Failed to parse employee upload",
      detail: err.message || String(err),
      code: err.code || null,
    });
  });
};

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
  .post(handleEmployeeUpload, ctrl.create);

router.put("/:id/documents", handleEmployeeUpload, ctrl.updateDocuments);

router
  .route("/:id")
  .get(ctrl.getOne)
  .put(handleEmployeeUpload, ctrl.update)
  .delete(ctrl.remove);

// NEW: Salary endpoints
router.get("/:id/salary", ctrl.getSalary);
router.post("/:id/salary", ctrl.setSalary);

module.exports = router;
