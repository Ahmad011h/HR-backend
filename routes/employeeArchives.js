const express = require("express");
const multer = require("multer");

const auth = require("../middlewares/auth");
const tenant = require("../middlewares/tenant");
const requireRole = require("../middlewares/requireRole");
const ctrl = require("../controllers/employeeArchives");

const router = express.Router({ mergeParams: true });
const upload = multer();
const parseUpload = upload.fields([{ name: "file", maxCount: 1 }]);

router.use(auth, tenant);
router.use(requireRole("owner", "admin", "hr", "manager", "superadmin"));

router.get("/", ctrl.list);

router.post(
  "/",
  (req, res, next) => {
    parseUpload(req, res, (err) => {
      if (!err) return next();
      return res.status(400).json({
        error: "Failed to parse archive upload",
        detail: err.message || String(err),
        code: err.code || null,
      });
    });
  },
  ctrl.create
);

module.exports = router;
