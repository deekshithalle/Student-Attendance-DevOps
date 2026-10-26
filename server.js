const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "attendance.db");
const db = new sqlite3.Database(DB_PATH);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_no TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'CSE (AI & ML)'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    period INTEGER NOT NULL CHECK(period BETWEEN 1 AND 7),
    status TEXT NOT NULL CHECK(status IN ('P','A')),
    UNIQUE(student_id, attendance_date, period),
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`);
  db.get("SELECT COUNT(*) AS count FROM students", (err, row) => {
    if (!err && row.count === 0) {
      const insert = db.prepare("INSERT INTO students (roll_no, name, department) VALUES (?, ?, ?)");
      [
        ["101", "Student 1", "CSE (AI & ML)"],
        ["102", "Student 2", "CSE (AI & ML)"],
        ["103", "Student 3", "CSE (AI & ML)"],
        ["104", "Student 4", "CSE (AI & ML)"],
        ["105", "Student 5", "CSE (AI & ML)"]
      ].forEach(s => insert.run(s));
      insert.finalize();
    }
  });
});

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
  }));
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/students", async (_req, res) => {
  try { res.json(await dbAll("SELECT * FROM students ORDER BY roll_no")); }
  catch { res.status(500).json({ error: "Could not retrieve students" }); }
});

app.post("/api/students", async (req, res) => {
  const { roll_no, name, department = "CSE (AI & ML)" } = req.body || {};
  if (!String(roll_no || "").trim() || !String(name || "").trim()) {
    return res.status(400).json({ error: "Roll number and name are required" });
  }
  try {
    const result = await dbRun(
      "INSERT INTO students (roll_no, name, department) VALUES (?, ?, ?)",
      [String(roll_no).trim(), String(name).trim(), String(department).trim()]
    );
    res.status(201).json({ id: result.lastID, roll_no, name, department });
  } catch (e) {
    res.status(e.message.includes("UNIQUE") ? 409 : 500).json({ error: e.message.includes("UNIQUE") ? "Roll number already exists" : "Could not add student" });
  }
});

app.get("/api/attendance", async (req, res) => {
  const date = req.query.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "A date in YYYY-MM-DD format is required" });
  try {
    const rows = await dbAll(`
      SELECT s.id AS student_id, s.roll_no, s.name, s.department,
             a.period, a.status
      FROM students s
      LEFT JOIN attendance a ON a.student_id = s.id AND a.attendance_date = ?
      ORDER BY s.roll_no, a.period`, [date]);
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.student_id)) map.set(row.student_id, {
        student_id: row.student_id, roll_no: row.roll_no, name: row.name,
        department: row.department, periods: ["", "", "", "", "", "", ""]
      });
      if (row.period) map.get(row.student_id).periods[row.period - 1] = row.status;
    }
    res.json([...map.values()]);
  } catch { res.status(500).json({ error: "Could not retrieve attendance" }); }
});

app.post("/api/attendance/bulk", async (req, res) => {
  const { date, records } = req.body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(records)) {
    return res.status(400).json({ error: "Valid date and records array are required" });
  }
  for (const r of records) {
    if (!Number.isInteger(Number(r.student_id)) || !Array.isArray(r.periods) || r.periods.length !== 7 ||
        r.periods.some(s => !["P", "A"].includes(s))) {
      return res.status(400).json({ error: "Each student must have seven statuses: P or A" });
    }
  }
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    const stmt = db.prepare(`INSERT INTO attendance (student_id, attendance_date, period, status)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(student_id, attendance_date, period) DO UPDATE SET status = excluded.status`);
    records.forEach(r => r.periods.forEach((status, i) => stmt.run(Number(r.student_id), date, i + 1, status)));
    stmt.finalize(err => {
      if (err) {
        db.run("ROLLBACK");
        return res.status(500).json({ error: "Could not save attendance" });
      }
      db.run("COMMIT", commitErr => commitErr
        ? res.status(500).json({ error: "Could not commit attendance" })
        : res.json({ message: "Attendance saved successfully", date, students_saved: records.length }));
    });
  });
});

app.get("/api/reports/monthly", async (req, res) => {
  const month = req.query.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "A month in YYYY-MM format is required" });
  try {
    const rows = await dbAll(`
      SELECT s.id, s.roll_no, s.name,
        COUNT(a.id) AS working_periods,
        SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN a.status = 'A' THEN 1 ELSE 0 END) AS absent
      FROM students s
      LEFT JOIN attendance a ON a.student_id = s.id AND substr(a.attendance_date, 1, 7) = ?
      GROUP BY s.id, s.roll_no, s.name
      ORDER BY s.roll_no`, [month]);
    res.json(rows.map(r => ({
      ...r, present: r.present || 0, absent: r.absent || 0,
      working_periods: r.working_periods || 0,
      percentage: r.working_periods ? Number(((r.present || 0) / r.working_periods * 100).toFixed(2)) : 0,
      low_attendance: r.working_periods > 0 && ((r.present || 0) / r.working_periods * 100) < 75
    })));
  } catch { res.status(500).json({ error: "Could not generate monthly report" }); }
});

app.get("/api/reports/monthly.csv", async (req, res) => {
  const month = req.query.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).send("A month in YYYY-MM format is required");
  try {
    const rows = await dbAll(`
      SELECT s.roll_no, s.name, COUNT(a.id) AS working_periods,
        SUM(CASE WHEN a.status='P' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN a.status='A' THEN 1 ELSE 0 END) AS absent
      FROM students s LEFT JOIN attendance a
      ON a.student_id=s.id AND substr(a.attendance_date,1,7)=?
      GROUP BY s.id ORDER BY s.roll_no`, [month]);
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["Roll No,Student,Working Periods,Present,Absent,Attendance %"];
    rows.forEach(r => {
      const total = r.working_periods || 0, present = r.present || 0, absent = r.absent || 0;
      const pct = total ? (present / total * 100).toFixed(2) : "0.00";
      lines.push([r.roll_no, r.name, total, present, absent, pct].map(esc).join(","));
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="attendance-${month}.csv"`);
    res.send(lines.join("\n"));
  } catch { res.status(500).send("Could not export report"); }
});

app.use((_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Student Attendance app running at http://localhost:${PORT}`));
}
module.exports = app;
