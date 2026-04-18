const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const employeesRoutes      = require("./routes/employees");
const departmentsRoutes    = require("./routes/departments");
const teamsRoutes          = require("./routes/teams");
const jobsRouter           = require("./routes/jobs");
const applicantsRoutes     = require("./routes/applicants");
const interviewsRoutes     = require("./routes/interviews");
const offersRoutes         = require("./routes/offers");

const gradesRoutes         = require("./routes/salaryGrades");
const payslipsRoutes       = require("./routes/payslips");
const adjustmentsRoutes    = require("./routes/adjustments");

const reviewsRoutes        = require("./routes/reviews");
const goalsRoutes          = require("./routes/goals");
const feedbackRoutes       = require("./routes/feedback");

const coursesRoutes        = require("./routes/courses");
const enrollmentsRoutes    = require("./routes/enrollments");
const certificationsRoutes = require("./routes/certifications");

const diversityRoutes      = require("./routes/diversityMetrics");
const customReportsRoutes  = require("./routes/customReports");

const rolesRoutes          = require("./routes/roles");
const companyRoutes        = require("./routes/companySettings");
const leavePoliciesRoutes  = require("./routes/leavePolicies");
const integrationsRoutes   = require("./routes/integrations");

// Offboarding / Resignations
const offboardingRoutes    = require("./routes/offboarding");
const resignationsRoutes   = require("./routes/resignations");

const tenantsRoutes        = require("./routes/tenants");

// Public/Auth
const publicRoutes         = require("./routes/public");
const publicRecruitment    = require("./routes/publicRecruitment");
const authRoutes           = require("./routes/auth");

// Attendance
const shiftsRoutes         = require("./routes/shiftSchedules");
const attendanceRoutes     = require("./routes/attendance");
const leaveRequestsRoutes  = require("./routes/leaveRequests"); // (moved up just to group)

// Misc
const calendarRoutes       = require("./routes/calendar");
const timeTrackingRoutes   = require("./routes/timeTracking");
const salaryRequestsRoutes = require("./routes/salaryRequests");
const formsLettersRoutes   = require("./routes/formsLetters");
const employeeArchivesRoutes = require("./routes/employeeArchives");

const app = express();

/* ---------------------------------- CORS ---------------------------------- */
const ORIGINS = [
  "http://localhost:3000",
  "https://hr-backend-npbd.onrender.com",
   "https://redakhr.netlify.app",
   'https://redakhr.com' ,
   
  process.env.WEB_ORIGIN,
  process.env.MOBILE_WEB_ORIGIN,
].filter(Boolean);

app.use(cors({
  origin: ORIGINS,
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-tenant-id",
    "X-Tenant-Id",
    "X-Id-Token",
    "X-User-Email",
     "X-Bootstrap-Token"   
  ],
}));

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

/* ------------------------------- Public/Auth ------------------------------ */
app.use("/api/auth", authRoutes);
app.use("/public", publicRoutes);
app.use("/public", publicRecruitment);

/* --------------------------------- Core ---------------------------------- */
app.use("/api/employees",   employeesRoutes);
app.use("/api/departments", departmentsRoutes);
app.use("/api/teams",       teamsRoutes);
app.use("/api/forms-letters", formsLettersRoutes);
app.use("/api/employee-archives", employeeArchivesRoutes);

/* ------------------------------ Recruitment ------------------------------- */
app.use("/api/recruitment/jobs",        jobsRouter);
app.use("/api/jobs",                    jobsRouter);
app.use("/api/recruitment/applicants",  applicantsRoutes);
app.use("/api/recruitment/interviews",  interviewsRoutes);
app.use("/api/recruitment/offers",      offersRoutes);

/* --------------------------- Payroll & Compensation ----------------------- */
app.use("/api/payroll/grades",      gradesRoutes);
app.use("/api/payroll/payslips",    payslipsRoutes);
app.use("/api/payroll/adjustments", adjustmentsRoutes);

/* ------------------------------- Performance ------------------------------ */
app.use("/api/performance/reviews",  reviewsRoutes);
app.use("/api/performance/goals",    goalsRoutes);
app.use("/api/performance/feedback", feedbackRoutes);

/* -------------------------------- Learning -------------------------------- */
app.use("/api/learning/courses",        coursesRoutes);
app.use("/api/learning/enrollments",    enrollmentsRoutes);
app.use("/api/learning/certifications", certificationsRoutes);

/* -------------------------------- Reports --------------------------------- */
app.use("/api/reports/diversity", diversityRoutes);
app.use("/api/reports/custom",    customReportsRoutes);

/* ------------------------------ Administration ---------------------------- */
app.use("/api/admin/roles",             rolesRoutes);
app.use("/api/admin/company",           companyRoutes);
app.use("/api/admin/leave-policies",    leavePoliciesRoutes);
app.use("/api/admin/integrations",      integrationsRoutes);

/* -------------------------------- Tenants --------------------------------- */
app.use("/api/tenants", tenantsRoutes);

/* ------------------------------- Debug/Misc ------------------------------- */
app.use("/api/debug", require("./routes/debug"));
app.use("/api/me",    require("./routes/me"));

/* ----------------------------- Attendance stack --------------------------- */
app.use("/api/attendance/shifts",       shiftsRoutes);
app.use("/api/attendance/leave",        leaveRequestsRoutes);

app.use("/api/leave",                    leaveRequestsRoutes); // optional legacy
app.use("/api/attendance/timesheets",   timeTrackingRoutes);
app.use("/api/attendance/time",         timeTrackingRoutes);
app.use("/api/attendance",              attendanceRoutes);
app.use("/api/salary",                  salaryRequestsRoutes);
app.use("/api/calendar",                calendarRoutes);

/* ------------------------------ Offboarding ------------------------------- */
// Keep these AFTER the broad attendance mounts above
app.use("/api/offboarding/resignations", resignationsRoutes);
app.use("/api/offboarding",              offboardingRoutes);


app.use("/api/notifications", require("./routes/notifications"));
// after your other require() and app.use() calls …
app.use("/api/superadmin", require("./routes/superadmin"));



/* --------------------------------- Server --------------------------------- */
const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`HR server running on http://localhost:${PORT}`);
});
