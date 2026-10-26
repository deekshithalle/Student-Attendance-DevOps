const $ = id => document.getElementById(id);
const dateInput = $("attendanceDate"), monthInput = $("reportMonth");
const today = new Date();
const localDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
dateInput.value = localDate;
monthInput.value = localDate.slice(0,7);
let students = [];

async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  return response;
}
function setStatus(message, error=false) {
  $("status").textContent = message;
  $("status").style.color = error ? "#b91c1c" : "#166534";
}
async function loadAttendance() {
  try {
    const rows = await (await request(`/api/attendance?date=${dateInput.value}`)).json();
    students = rows;
    $("studentCount").textContent = `${rows.length} students`;
    const body = $("attendanceBody"); body.replaceChildren();
    rows.forEach(student => {
      const tr = document.createElement("tr");
      [student.roll_no, student.name, student.department].forEach(value => {
        const td = document.createElement("td"); td.textContent = value; tr.appendChild(td);
      });
      student.periods.forEach((status, index) => {
        const td = document.createElement("td"); td.className = "period";
        const btn = document.createElement("button");
        btn.className = `mark ${status}`; btn.textContent = status || "—";
        btn.setAttribute("aria-label", `${student.name} period ${index+1}`);
        btn.dataset.studentId = student.student_id; btn.dataset.period = index;
        
        btn.addEventListener("click", () => {
            const currentStatus = student.periods[index];
            const newStatus = currentStatus === "P" ? "A" : "P";

            student.periods[index] = newStatus;
            btn.textContent = newStatus;
            btn.className = `mark ${newStatus}`;
       });
        td.appendChild(btn); tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    setStatus(`Loaded attendance for ${dateInput.value}`);
  } catch (e) { setStatus(e.message, true); }
}
function markAll(status) {
  students.forEach(s => s.periods = s.periods.map(() => status));
  document.querySelectorAll(".mark").forEach(btn => {
    btn.textContent = status; btn.className = `mark ${status}`;
  });
}
async function saveAttendance() {
  try {
    const records = students.map(s => ({ student_id: s.student_id, periods: s.periods }));
    await request("/api/attendance/bulk", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ date: dateInput.value, records })
    });
    setStatus("Attendance saved successfully.");
    await generateReport();
  } catch (e) { setStatus(e.message, true); }
}
async function generateReport() {
  try {
    const month = monthInput.value;
    const rows = await (await request(`/api/reports/monthly?month=${month}`)).json();
    const body = $("reportBody"); body.replaceChildren();
    rows.forEach(r => {
      const tr = document.createElement("tr");
      [r.roll_no, r.name, r.working_periods, r.present, r.absent, `${r.percentage.toFixed(2)}%`].forEach((v, i) => {
        const td = document.createElement("td"); td.textContent = v;
        if (i === 5) td.className = r.low_attendance ? "low" : "good";
        tr.appendChild(td);
      });
      const status = document.createElement("td"); status.textContent = r.working_periods === 0 ? "No records" : (r.low_attendance ? "Below 75%" : "Satisfactory");
      status.className = r.low_attendance ? "low" : "good"; tr.appendChild(status);
      body.appendChild(tr);
    });
    $("csvLink").href = `/api/reports/monthly.csv?month=${month}`;
    setStatus(`Monthly report generated for ${month}`);
  } catch (e) { setStatus(e.message, true); }
}
$("loadBtn").addEventListener("click", loadAttendance);
$("allPresent").addEventListener("click", () => markAll("P"));
$("allAbsent").addEventListener("click", () => markAll("A"));
$("saveBtn").addEventListener("click", saveAttendance);
$("reportBtn").addEventListener("click", generateReport);
dateInput.addEventListener("change", loadAttendance);
$("studentForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await request("/api/students", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      roll_no:$("rollNo").value, name:$("studentName").value, department:$("department").value
    })});
    e.target.reset(); $("department").value = "CSE (AI & ML)";
    await loadAttendance(); setStatus("Student added successfully.");
  } catch (err) { setStatus(err.message, true); }
});
loadAttendance();
generateReport();
