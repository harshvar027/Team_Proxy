export const MOCK_MODE = false;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = (offsetMin = 0) => new Date(Date.now() + offsetMin * 60000).toISOString();
const today = () => new Date().toISOString().slice(0, 10);

let csrfToken = "";
let mockUser = null;
let failedAttempts = 0;
let lockoutUntil = 0;
let tokenSeq = 106;

const departments = [
  { id: 1, name: "General Medicine", code: "GM", avg_service_minutes: 8 },
  { id: 2, name: "Pediatrics", code: "PD", avg_service_minutes: 10 },
  { id: 3, name: "Orthopedics", code: "OR", avg_service_minutes: 12 },
  { id: 4, name: "ENT", code: "EN", avg_service_minutes: 9 },
  { id: 5, name: "Ophthalmology", code: "OP", avg_service_minutes: 7 },
];

const doctors = [
  { id: 1, name: "Dr. Priya Sharma", department_id: 1, active: true },
  { id: 2, name: "Dr. Rohan Mehta", department_id: 1, active: true },
  { id: 3, name: "Dr. Anjali Iyer", department_id: 1, active: true },
  { id: 4, name: "Dr. Arun Kulkarni", department_id: 2, active: true },
  { id: 5, name: "Dr. Meera Deshmukh", department_id: 3, active: false },
];

const users = [
  { id: 1, username: "staff", role: "staff", department_id: 1, department_name: "General Medicine", active: true, must_change_password: false, created_at: nowIso(-40000), last_login: nowIso(-20) },
  { id: 2, username: "admin", role: "admin", department_id: null, department_name: null, active: true, must_change_password: false, created_at: nowIso(-80000), last_login: nowIso(-5) },
  { id: 3, username: "reset", role: "staff", department_id: 1, department_name: "General Medicine", active: true, must_change_password: true, created_at: nowIso(-1000), last_login: null },
  { id: 4, username: "staff_arun", role: "staff", department_id: 2, department_name: "Pediatrics", active: true, must_change_password: false, created_at: nowIso(-20000), last_login: nowIso(-120) },
  { id: 5, username: "staff_meera", role: "staff", department_id: 3, department_name: "Orthopedics", active: false, must_change_password: false, created_at: nowIso(-15000), last_login: nowIso(-1440) },
];

const tokens = [
  tokenRow(101, "Ramesh Kumar", "waiting", "normal", -40, 1, "4821"),
  tokenRow(102, "Sunita Devi", "called", "priority", -32, 1, "7319", "Age 74"),
  tokenRow(103, "Amit Patel", "waiting", "normal", -25, 1, "9182"),
  tokenRow(104, "Kavita Rao", "waiting", "normal", -18, 1, "5540"),
  tokenRow(105, "Mohammad Ansari", "waiting", "emergency", -10, 1, "6208", "Acute chest pain"),
  tokenRow(88, "Laxman Bhosle", "done", "normal", -90, 1, "1122"),
];

const audit = [
  { id: 1, timestamp: nowIso(-5), actor_user_id: 1, actor_username: "staff", actor_role: "staff", action: "call_next", details: "Called GM-102" },
  { id: 2, timestamp: nowIso(-18), actor_user_id: 1, actor_username: "staff", actor_role: "staff", action: "set_priority", details: "GM-102 to priority. Reason: Age 74" },
  { id: 3, timestamp: nowIso(-40), actor_user_id: 2, actor_username: "admin", actor_role: "admin", action: "user_toggle", details: "Disabled staff_meera" },
  { id: 4, timestamp: nowIso(-65), actor_user_id: 2, actor_username: "admin", actor_role: "admin", action: "login", details: "admin signed in" },
  { id: 5, timestamp: nowIso(-90), actor_user_id: 1, actor_username: "staff", actor_role: "staff", action: "token_done", details: "Finished GM-088" },
];

function tokenRow(number, name, status, priority, createdOffset, deptId, pin, reason = null) {
  const dept = departments.find((d) => d.id === deptId);
  return {
    id: number,
    token_number: `${dept.code}-${String(number).padStart(2, "0")}`,
    service_date: today(),
    department_id: deptId,
    department_name: dept.name,
    patient_name: name,
    phone_masked: "•••• 2144",
    priority_class: priority,
    priority_reason: reason,
    status,
    pin,
    created_at: nowIso(createdOffset),
    called_at: status === "called" || status === "done" ? nowIso(createdOffset + 20) : null,
    finished_at: status === "done" ? nowIso(createdOffset + 28) : null,
    wait_estimate_min: 12,
    wait_estimate_max: 22,
    arrive_by: "10:40",
    position_in_queue: null,
    issued_by_staff: false,
  };
}

function publicToken(t, withPin = false) {
  const waiting = tokens.filter((x) => x.department_id === t.department_id && x.status === "waiting" && new Date(x.created_at) <= new Date(t.created_at));
  const pos = t.status === "waiting" ? waiting.length : t.status === "called" ? 0 : null;
  const waitMin = pos == null ? 0 : Math.max(4, pos * 7);
  const arrive = new Date(Date.now() + waitMin * 60000);
  const copy = {
    ...t,
    pin: withPin ? t.pin : null,
    position_in_queue: pos,
    wait_estimate_min: waitMin,
    wait_estimate_max: waitMin + 10,
    arrive_by: t.status === "called" ? "Come now" : arrive.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
  return copy;
}

function sessionView(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    department_id: user.department_id,
    department_name: user.department_name,
    must_change_password: user.must_change_password,
  };
}

function cookieGet(name) {
  const match = document.cookie.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function cookieSet(name, value) {
  document.cookie = value
    ? `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
    : `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function writeMockSession(username) {
  cookieSet("baari_sid", username);
}

function readMockSession() {
  const username = cookieGet("baari_sid");
  const user = users.find((u) => u.username === username);
  if (!user) return null;
  if (cookieGet("baari_pwok").split(",").includes(user.username)) user.must_change_password = false;
  return sessionView(user);
}

function addAudit(action, details) {
  audit.unshift({
    id: Date.now(),
    timestamp: nowIso(),
    actor_user_id: mockUser?.id ?? null,
    actor_username: mockUser?.username ?? "public",
    actor_role: mockUser?.role ?? "patient",
    action,
    details,
  });
}

function fail(status, error, extra = {}) {
  return { ok: false, status, error, ...extra };
}

function ok(data, status = 200) {
  return { ok: true, status, data };
}

function detailOf(data) {
  if (!data) return "Something went wrong. Try again.";
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg || d).join(". ");
  return data.message || "Something went wrong. Try again.";
}

async function request(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (csrfToken && options.method && options.method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  let res;
  try {
    res = await fetch(path, { credentials: "include", ...options, headers });
  } catch {
    return fail(0, "We couldn’t reach the service. Check your connection and try again.", { network: true });
  }
  const csrf = res.headers.get("X-CSRF-Token");
  if (csrf) csrfToken = csrf;
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const retryAfter = Number(res.headers.get("Retry-After") || 0);
    return fail(res.status, detailOf(data), { locked: res.status === 429, lockoutRemaining: retryAfter, data });
  }
  return ok(data, res.status);
}

async function mockLogin(username, password) {
  await wait(420);
  if (Date.now() < lockoutUntil) {
    return fail(429, "Too many attempts. Try again in 10 minutes.", {
      locked: true,
      lockoutRemaining: Math.ceil((lockoutUntil - Date.now()) / 1000),
    });
  }
  const map = { staff: "staff123", admin: "admin123", reset: "reset123" };
  if (map[username] && password === map[username]) {
    failedAttempts = 0;
    const user = users.find((u) => u.username === username);
    mockUser = sessionView(user);
    writeMockSession(user.username);
    addAudit("login", `${username} signed in`);
    return ok({
      message: "Login successful",
      role: user.role,
      must_change_password: user.must_change_password,
      username: user.username,
      department_id: user.department_id,
      department_name: user.department_name,
    });
  }
  failedAttempts += 1;
  if (failedAttempts >= 5) {
    lockoutUntil = Date.now() + 10 * 60 * 1000;
    return fail(429, "Too many attempts. Try again in 10 minutes.", { locked: true, lockoutRemaining: 600 });
  }
  return fail(401, "Incorrect username or password");
}

function queueBoard(deptId) {
  const dept = departments.find((d) => d.id === deptId) || departments[0];
  const list = tokens.filter((t) => t.department_id === dept.id && t.service_date === today());
  const waiting = list.filter((t) => t.status === "waiting");
  const called = list.filter((t) => t.status === "called");
  const done = list.filter((t) => t.status === "done");
  const activeDocs = doctors.filter((d) => d.department_id === dept.id && d.active);
  const queue = list
    .filter((t) => t.status === "waiting" || t.status === "called")
    .sort((a, b) => {
      const rank = { emergency: 0, priority: 1, normal: 2 };
      return (rank[a.priority_class] ?? 2) - (rank[b.priority_class] ?? 2) || new Date(a.created_at) - new Date(b.created_at);
    })
    .map((t, i) => ({
      token_id: t.id,
      token_number: t.token_number,
      patient_name: t.patient_name,
      phone_masked: t.phone_masked,
      priority_class: t.priority_class,
      priority_reason: t.priority_reason,
      status: t.status,
      created_at: t.created_at,
      called_at: t.called_at,
      wait_estimate_min: t.wait_estimate_min,
      wait_estimate_max: t.wait_estimate_max,
      position_in_queue: t.status === "waiting" ? i + 1 : 0,
      is_expected_in_hall: i < activeDocs.length + 2,
    }));
  const avgWait = Math.round(waiting.length * dept.avg_service_minutes / Math.max(1, activeDocs.length));
  return {
    department_id: dept.id,
    department_name: dept.name,
    department_code: dept.code,
    active_doctors: activeDocs.length,
    total_doctors: doctors.filter((d) => d.department_id === dept.id).length,
    waiting_count: waiting.length,
    called_count: called.length,
    done_today: done.length,
    avg_service_minutes: avgWait,
    queue,
    consider_opening_counter: waiting.length > 6,
    estimated_improvement_minutes: waiting.length > 6 ? 18 : null,
    expected_in_hall_count: queue.filter((q) => q.is_expected_in_hall).length,
  };
}

export const api = {
  async login(username, password) {
    if (MOCK_MODE) return mockLogin(username, password);
    return request("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
  },

  async register(payload) {
    if (MOCK_MODE) {
      await wait(300);
      return ok({ message: "Registered", role: payload.role, username: payload.username });
    }
    return request("/api/register", { method: "POST", body: JSON.stringify(payload) });
  },

  async logout() {
    if (MOCK_MODE) {
      mockUser = null;
      writeMockSession("");
      cookieSet("baari_pwok", "");
      return ok({ message: "Logged out" });
    }
    return request("/api/logout", { method: "POST" });
  },

  async me() {
    if (MOCK_MODE) {
      await wait(60);
      if (!mockUser) mockUser = readMockSession();
      return mockUser ? ok(mockUser) : fail(401, "Not signed in");
    }
    return request("/api/me");
  },

  async csrf() {
    if (MOCK_MODE) return ok({ ok: true });
    return request("/api/csrf");
  },

  async changePassword(current_password, new_password) {
    if (MOCK_MODE) {
      await wait(380);
      if (!mockUser) return fail(401, "Not signed in");
      if (current_password.length < 1) return fail(400, "Current password is incorrect");
      const user = users.find((u) => u.id === mockUser.id);
      if (user) user.must_change_password = false;
      mockUser.must_change_password = false;
      const done = new Set(cookieGet("baari_pwok").split(",").filter(Boolean));
      done.add(mockUser.username);
      cookieSet("baari_pwok", [...done].join(","));
      addAudit("password_changed", `${mockUser.username} changed password`);
      return ok({ message: "Password changed successfully" });
    }
    return request("/api/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) });
  },

  async hospitals() {
    if (MOCK_MODE) return ok([{ id: 1, name: "Baari City Care Hospital", code: "HOSP-01", location: "Pune", coordinator_name: "Dr. Sunita", coordinator_phone: "+91 98230 45678" }]);
    return request("/api/patient/hospitals");
  },

  async hospitalInfo(id) {
    if (MOCK_MODE) return ok({ id, name: "Baari City Care Hospital", code: "HOSP-01", location: "Pune", coordinator_name: "Dr. Sunita", coordinator_phone: "+91 98230 45678" });
    return request(`/api/patient/hospital/${id}/info`);
  },

  hospitalQrUrl(id) {
    return `/api/patient/hospital/${id}/qr`;
  },

  async aiTriage({ text, language = "en", hospital_id = null }) {
    if (MOCK_MODE) {
      await wait(300);
      return ok({
        detected_name: "Patient",
        symptoms: text,
        priority_class: "daily_life",
        priority_label: "Daily Life Problem / Urgent (Level 2)",
        suggested_department_code: "G",
        suggested_department_id: 1,
        suggested_department_name: "General Medicine",
        triage_reason: "Automated triage classification",
        confidence: 0.9,
      });
    }
    return request("/api/patient/ai-triage", { method: "POST", body: JSON.stringify({ text, language, hospital_id }) });
  },

  async allHospitalQueues() {
    if (MOCK_MODE) return ok({ tokens: tokens.map((t) => publicToken(t)), waiting_count: 3, called_count: 1, done_count: 2 });
    return request("/api/staff/all-queues");
  },

  async editToken(tokenId, data) {
    if (MOCK_MODE) return ok({ message: "Updated" });
    return request(`/api/staff/token/${tokenId}/edit`, { method: "PUT", body: JSON.stringify(data) });
  },

  async getHospitalProfile() {
    if (MOCK_MODE) return ok({});
    return request("/api/hospital/profile");
  },

  async updateHospitalProfile(data) {
    if (MOCK_MODE) return ok(data);
    return request("/api/hospital/profile", { method: "PUT", body: JSON.stringify(data) });
  },

  async departments(hospital_id = null) {
    if (MOCK_MODE) {
      await wait(80);
      return ok(departments);
    }
    const q = hospital_id ? `?hospital_id=${hospital_id}` : "";
    return request(`/api/patient/departments${q}`);
  },

  async requestToken({ name, department_id, hospital_id = null, priority_class = "routine", priority_reason = null, symptoms = null, language = "en", phone = null, email = null }) {
    if (MOCK_MODE) {
      await wait(360);
      const dept = departments.find((d) => d.id === Number(department_id));
      if (!dept) return fail(400, "Department not found");
      tokenSeq += 1;
      const pin = String(1000 + Math.floor(Math.random() * 9000));
      const row = tokenRow(tokenSeq, name.trim(), "waiting", priority_class, 0, dept.id, pin, priority_reason);
      tokens.push(row);
      addAudit("token_issued", `${row.token_number} issued for ${name}`);
      return ok(publicToken(row, true), 201);
    }
    return request("/api/patient/token/request", {
      method: "POST",
      body: JSON.stringify({ name, department_id, hospital_id, priority_class, priority_reason, symptoms, language, phone, email })
    });
  },

  async lookupToken(token_number, pin) {
    if (MOCK_MODE) {
      await wait(160);
      const t = tokens.find((x) => x.token_number.toUpperCase() === String(token_number).toUpperCase() && x.pin === String(pin));
      if (!t) return fail(404, "Invalid token number or PIN");
      return ok(publicToken(t));
    }
    return request("/api/patient/token/lookup", { method: "POST", body: JSON.stringify({ token_number, pin }) });
  },

  async tokenStatus(token_id) {
    if (MOCK_MODE) {
      await wait(80);
      const t = tokens.find((x) => x.id === Number(token_id));
      if (!t) return fail(404, "Token not found");
      return ok(publicToken(t));
    }
    return request(`/api/patient/token/${token_id}/status`);
  },

  async staffQueue(department_id) {
    if (MOCK_MODE) {
      await wait(120);
      if (!mockUser) return fail(401, "Not signed in");
      const id = mockUser.role === "staff" ? mockUser.department_id : Number(department_id || mockUser.department_id || 1);
      return ok(queueBoard(id));
    }
    const q = department_id ? `?department_id=${department_id}` : "";
    return request(`/api/staff/queue${q}`);
  },

  async callNext() {
    if (MOCK_MODE) {
      await wait(220);
      const deptId = mockUser?.department_id || 1;
      tokens.filter((t) => t.department_id === deptId && t.status === "called").forEach((t) => {
        t.status = "done";
        t.finished_at = nowIso();
      });
      const next = tokens
        .filter((t) => t.department_id === deptId && t.status === "waiting")
        .sort((a, b) => {
          const rank = { emergency: 0, priority: 1, normal: 2 };
          return (rank[a.priority_class] ?? 2) - (rank[b.priority_class] ?? 2) || new Date(a.created_at) - new Date(b.created_at);
        })[0];
      if (!next) return fail(404, "No one is waiting");
      next.status = "called";
      next.called_at = nowIso();
      addAudit("call_next", `Called ${next.token_number}`);
      return ok(publicToken(next));
    }
    return request("/api/staff/call-next", { method: "POST" });
  },

  async markDone(token_id) {
    if (MOCK_MODE) {
      const t = tokens.find((x) => x.id === Number(token_id));
      if (t) {
        t.status = "done";
        t.finished_at = nowIso();
        addAudit("token_done", `Finished ${t.token_number}`);
      }
      return ok(t ? publicToken(t) : {});
    }
    return request(`/api/staff/token/${token_id}/done`, { method: "POST" });
  },

  async markNoShow(token_id) {
    if (MOCK_MODE) {
      await wait(180);
      const t = tokens.find((x) => x.id === Number(token_id));
      if (t) {
        t.status = "no_show";
        addAudit("no_show", `${t.token_number} marked no-show`);
      }
      return ok(t ? publicToken(t) : {});
    }
    return request(`/api/staff/token/${token_id}/no-show`, { method: "POST" });
  },

  async setPriority(token_id, priority_class, priority_reason) {
    if (MOCK_MODE) {
      await wait(180);
      if (priority_class !== "normal" && !String(priority_reason || "").trim()) {
        return fail(400, "A reason is required");
      }
      const t = tokens.find((x) => x.id === Number(token_id));
      if (t) {
        t.priority_class = priority_class;
        t.priority_reason = priority_class === "normal" ? null : priority_reason;
        addAudit("set_priority", `${t.token_number} to ${priority_class}. Reason: ${priority_reason || "—"}`);
      }
      return ok(t ? publicToken(t) : {});
    }
    return request(`/api/staff/token/${token_id}/priority`, {
      method: "PUT",
      body: JSON.stringify({ priority_class, priority_reason }),
    });
  },

  async issueWalkIn({ name, department_id, priority_class = "normal", priority_reason = null, language = "en" }) {
    if (MOCK_MODE) {
      await wait(280);
      const dept = departments.find((d) => d.id === Number(department_id)) || departments[0];
      tokenSeq += 1;
      const pin = String(1000 + Math.floor(Math.random() * 9000));
      const row = tokenRow(tokenSeq, name.trim(), "waiting", priority_class, 0, dept.id, pin, priority_reason);
      row.issued_by_staff = true;
      tokens.push(row);
      addAudit("token_issued", `Walk-in ${row.token_number}`);
      return ok(publicToken(row, true), 201);
    }
    return request("/api/staff/issue-token", {
      method: "POST",
      body: JSON.stringify({ name, department_id, priority_class, priority_reason, language }),
    });
  },

  async staffDoctors() {
    if (MOCK_MODE) {
      const id = mockUser?.department_id || 1;
      return ok(doctors.filter((d) => d.department_id === id));
    }
    return request("/api/staff/doctors");
  },

  async toggleDoctor(doctor_id) {
    if (MOCK_MODE) {
      const d = doctors.find((x) => x.id === Number(doctor_id));
      if (d) d.active = !d.active;
      addAudit("doctor_toggle", `${d?.name} ${d?.active ? "on duty" : "off duty"}`);
      return ok(d);
    }
    return request(`/api/staff/doctors/${doctor_id}/toggle`, { method: "POST" });
  },

  async adminUsers() {
    if (MOCK_MODE) return ok(users.map((u) => ({ ...u })));
    return request("/api/admin/users");
  },

  async createUser(body) {
    if (MOCK_MODE) {
      const dept = departments.find((d) => d.id === Number(body.department_id));
      const row = {
        id: Date.now(),
        username: body.username,
        role: body.role,
        department_id: body.department_id ?? null,
        department_name: dept?.name ?? null,
        active: true,
        must_change_password: true,
        created_at: nowIso(),
        last_login: null,
      };
      users.push(row);
      addAudit("user_create", `Created ${row.username}`);
      return ok(row, 201);
    }
    return request("/api/admin/users", { method: "POST", body: JSON.stringify(body) });
  },

  async toggleUser(user_id) {
    if (MOCK_MODE) {
      const u = users.find((x) => x.id === Number(user_id));
      if (u) u.active = !u.active;
      addAudit("user_toggle", `${u?.username} ${u?.active ? "enabled" : "disabled"}`);
      return ok(u);
    }
    return request(`/api/admin/users/${user_id}/toggle`, { method: "POST" });
  },

  async resetPassword(user_id, new_password) {
    if (MOCK_MODE) {
      const u = users.find((x) => x.id === Number(user_id));
      if (u) u.must_change_password = true;
      addAudit("password_reset", `Reset password for ${u?.username}`);
      return ok({ message: "Password reset", temporary_password: new_password || "Temp#4821" });
    }
    return request(`/api/admin/users/${user_id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ new_password }),
    });
  },

  async adminDepartments() {
    if (MOCK_MODE) return ok(departments);
    return request("/api/admin/departments");
  },

  async createDepartment(body) {
    if (MOCK_MODE) {
      const row = { id: Date.now(), ...body };
      departments.push(row);
      addAudit("department_create", row.name);
      return ok(row, 201);
    }
    return request("/api/admin/departments", { method: "POST", body: JSON.stringify(body) });
  },

  async adminDoctors() {
    if (MOCK_MODE) return ok(doctors);
    return request("/api/admin/doctors");
  },

  async createDoctor(body) {
    if (MOCK_MODE) {
      const row = { id: Date.now(), active: true, ...body };
      doctors.push(row);
      addAudit("doctor_create", row.name);
      return ok(row, 201);
    }
    return request("/api/admin/doctors", { method: "POST", body: JSON.stringify(body) });
  },

  async auditLog({ page = 1, per_page = 50, actor, action } = {}) {
    if (MOCK_MODE) {
      let rows = [...audit];
      if (actor) rows = rows.filter((r) => (r.actor_username || "").includes(actor));
      if (action) rows = rows.filter((r) => r.action === action);
      const start = (page - 1) * per_page;
      return ok({ items: rows.slice(start, start + per_page), total: rows.length, page, per_page });
    }
    const params = new URLSearchParams({ page, per_page });
    if (actor) params.set("actor", actor);
    if (action) params.set("action", action);
    const res = await request(`/api/admin/audit?${params}`);
    if (!res.ok) return res;
    const rows = Array.isArray(res.data) ? res.data : res.data?.items || [];
    return ok({ items: rows, total: rows.length, page, per_page });
  },

  async summary() {
    if (MOCK_MODE) {
      await wait(100);
      return ok({
        date: today(),
        patients_served: 142,
        average_wait_minutes: 18,
        longest_wait_minutes: 47,
        peak_hour: "10:00",
        no_show_count: 6,
        no_show_rate: 0.04,
        by_department: departments.map((d, i) => ({ name: d.name, served: 40 - i * 6, wait: 14 + i * 3 })),
        hourly: [22, 48, 71, 64, 41, 28, 18, 12],
      });
    }
    return request("/api/admin/summary");
  },

  async simulate({ patients_per_day = 100, num_doctors = 3, follow_rate = 0.7 } = {}) {
    if (MOCK_MODE) {
      await wait(260);
      const hours = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
      const trad = [0.18, 0.32, 0.28, 0.12, 0.05, 0.03, 0.01, 0.01].map((f) => Math.round(patients_per_day * f));
      const guided = [0.08, 0.12, 0.14, 0.16, 0.14, 0.14, 0.12, 0.1].map((f) => Math.round(patients_per_day * f));
      const mix = trad.map((v, i) => Math.round(v * (1 - follow_rate) + guided[i] * follow_rate));
      const peakT = Math.max(...trad);
      const peakB = Math.max(...mix);
      const waitT = Math.round(40 + patients_per_day / Math.max(1, num_doctors));
      const waitB = Math.round(12 + (patients_per_day / Math.max(1, num_doctors)) * (1 - follow_rate * 0.7));
      return ok({
        baseline: { peak_waiting: peakT, avg_wait_minutes: waitT, patients_served: patients_per_day },
        with_baari: { peak_waiting: peakB, avg_wait_minutes: waitB, patients_served: patients_per_day },
        improvement_pct: {
          peak_waiting: Math.round((1 - peakB / peakT) * 100),
          avg_wait_minutes: Math.round((1 - waitB / waitT) * 100),
        },
        crowd_over_time: {
          labels: hours,
          baseline: trad,
          baari: mix,
        },
        note: "Simulated data",
      });
    }
    return request("/api/simulation/run", {
      method: "POST",
      body: JSON.stringify({ patients_per_day, num_doctors, follow_rate }),
    });
  },
};
