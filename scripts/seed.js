// Development seed data. Creates (or reuses) a demo user and fills every module with sample rows.
// Credentials: SEED_EMAIL / SEED_PASSWORD env vars, default lucifer@example.com / lucifer123  (CHANGE or don't seed in production).
const bcrypt = require("bcryptjs");
const { client } = require("./_env");

const DEFAULT_LAYOUT = ["overview","tasks","deadlines","calendar","focus","money","projects","notes","weather","activity"].map((id) => ({ id, visible: true, size: id === "overview" ? "lg" : id === "weather" ? "sm" : "md" }));
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const at = (n, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d.toISOString(); };

(async () => {
  const email = (process.env.SEED_EMAIL || "lucifer@example.com").toLowerCase();
  const password = process.env.SEED_PASSWORD || "lucifer123";
  if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) { console.error("✖ Set SEED_PASSWORD before seeding in production."); process.exit(1); }
  const db = client(); await db.connect();
  try {
    await db.query("BEGIN");
    let u = (await db.query("SELECT id FROM users WHERE email=$1", [email])).rows[0];
    if (!u) u = (await db.query("INSERT INTO users(email,password_hash,display_name) VALUES($1,$2,'Lucifer') RETURNING id", [email, await bcrypt.hash(password, 12)])).rows[0];
    const uid = u.id;
    const has = (await db.query("SELECT count(*)::int n FROM projects WHERE user_id=$1", [uid])).rows[0].n;
    if (has) { console.log("• Demo data already present — nothing to do."); await db.query("ROLLBACK"); return; }
    await db.query("INSERT INTO dashboard_settings(user_id,layout,monthly_budget) VALUES($1,$2,15000) ON CONFLICT (user_id) DO NOTHING", [uid, JSON.stringify(DEFAULT_LAYOUT)]);
    const P = {};
    for (const [name, description, status, priority, deadline] of [
      ["HisaabKitaab", "Splitwise-style expense sharing app", "in_progress", "high", day(21)],
      ["Streaming Site", "Self-hosted movie and series streaming", "in_progress", "medium", null],
      ["File Sharing", "Simple link-based file sharing", "planned", "medium", null],
      ["Personal Dashboard", "This app — my personal operating system", "in_progress", "high", day(14)],
      ["ML Project", "MemTransUNet ablation experiments and report", "in_progress", "high", day(3)],
    ]) P[name] = (await db.query("INSERT INTO projects(user_id,name,description,status,priority,deadline,start_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [uid, name, description, status, priority, deadline, day(-30)])).rows[0].id;

    const T = [
      ["Finish ML report", "high", 0, "ML Project", ["uni"], false],
      ["Push project to GitHub", "medium", 0, "Personal Dashboard", ["dev"], false],
      ["Buy groceries", "low", 0, null, ["home"], false],
      ["Read research paper", "medium", 0, "ML Project", ["uni"], true],
      ["Run ablation experiments", "high", 2, "ML Project", ["uni"], false],
      ["Design HisaabKitaab settle-up screen", "medium", 4, "HisaabKitaab", ["dev"], false],
      ["Pay phone bill", "low", -1, null, ["home"], false],
    ];
    let first;
    for (const [title, pr, off, proj, tags, done] of T) {
      const r = await db.query("INSERT INTO tasks(user_id,project_id,title,priority,due_date,tags,completed,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [uid, proj ? P[proj] : null, title, pr, day(off), tags, done, done ? new Date() : null]);
      first = first || r.rows[0].id;
    }
    for (const t of ["Outline results section", "Generate figures", "Proofread"]) await db.query("INSERT INTO subtasks(user_id,task_id,title,completed) VALUES($1,$2,$3,$4)", [uid, first, t, t === "Outline results section"]);
    await db.query("INSERT INTO tasks(user_id,title,priority,due_date,recurrence,tags) VALUES($1,'Weekly review','medium',$2,'weekly','{routine}')", [uid, day(2)]);

    for (const [title, off, pr, course] of [["DBMS Assignment", 1, "high", "DBMS"], ["ML Project submission", 3, "high", "Machine Learning"], ["Internship Application", 8, "medium", "Career"], ["Semester Project", 21, "low", "Capstone"]])
      await db.query("INSERT INTO deadlines(user_id,title,due_date,priority,course) VALUES($1,$2,$3,$4,$5)", [uid, title, day(off), pr, course]);

    await db.query("INSERT INTO notes(user_id,project_id,title,body,tags,pinned) VALUES($1,$2,$3,$4,$5,true)", [uid, P["ML Project"], "MemTransUNet ideas", "## Memory reinforcement\n\nMemory reinforcement causes the attention maps to stabilise.\n\n```python\nloss = dice(pred, mask) + 0.5 * bce(pred, mask)\n```\n\n- try longer warmup\n- compare with plain UNet", ["ml", "research"]]);
    await db.query("INSERT INTO notes(user_id,title,body,tags) VALUES($1,'Grocery list','- milk\n- eggs\n- coffee',$2)", [uid, ["home"]]);
    await db.query("INSERT INTO notes(user_id,title,body,tags) VALUES($1,'Keyboard shortcuts','**Ctrl+K** opens the command palette.',$2)", [uid, ["meta"]]);

    for (const [url, title, domain, cat, tags, fav] of [["https://github.com", "GitHub", "github.com", "development", ["code"], true], ["https://arxiv.org", "arXiv", "arxiv.org", "research", ["papers"], false], ["https://nextjs.org/docs", "Next.js Docs", "nextjs.org", "development", ["docs"], true]])
      await db.query("INSERT INTO bookmarks(user_id,url,title,domain,category,tags,favorite) VALUES($1,$2,$3,$4,$5,$6,$7)", [uid, url, title, domain, cat, tags, fav]);

    for (const [title, d, h, len, loc] of [["Machine Learning lecture", 0, 11, 60, "Room 204"], ["Project sync", 0, 16, 30, "Meet"], ["Gym", 1, 18, 60, ""], ["DBMS tutorial", 2, 10, 90, "Lab 3"]])
      await db.query("INSERT INTO events(user_id,title,location,starts_at,ends_at,reminder_minutes) VALUES($1,$2,$3,$4,$5,15)", [uid, title, loc, at(d, h), at(d, h, len)]);

    for (const t of ["AI email organizer", "Campus marketplace", "Personal knowledge system"]) await db.query("INSERT INTO ideas(user_id,title,description) VALUES($1,$2,$3)", [uid, t, ""]);

    for (const [amt, cat, desc, off] of [[120, "food", "Lunch", 0], [300, "transport", "Cab", 0], [450, "food", "Dinner out", -1], [1200, "shopping", "Headphones case", -3], [90, "food", "Coffee", -2], [2500, "bills", "Internet", -8], [640, "entertainment", "Movie", -5]])
      await db.query("INSERT INTO expenses(user_id,amount,category,description,spent_on) VALUES($1,$2,$3,$4,$5)", [uid, amt, cat, desc, day(off)]);

    for (const [name, gh, dep, stack, status] of [["HisaabKitaab", "", "", ["Next.js", "PostgreSQL"], "live"], ["Streaming Site", "", "", ["Node", "ffmpeg"], "live"], ["File Sharing", "", "", ["Express"], "live"], ["Personal Dashboard", "", "", ["Next.js", "PostgreSQL", "PWA"], "live"], ["ML Project", "", "", ["PyTorch"], "building"]])
      await db.query("INSERT INTO dev_projects(user_id,name,github_url,deploy_url,tech_stack,status,todos) VALUES($1,$2,$3,$4,$5,$6,$7)", [uid, name, gh, dep, stack, status, JSON.stringify([{ text: "Write README", done: false }])]);

    for (const [off, secs, label] of [[0, 1500, "Finish ML report"], [-1, 1500, "Dashboard"], [-1, 1500, "Dashboard"], [-3, 3000, "Reading"]])
      await db.query("INSERT INTO focus_sessions(user_id,label,seconds,started_at) VALUES($1,$2,$3,$4)", [uid, label, secs, at(off, 9)]);
    for (const [k, a, l] of [["task", "completed", "Read research paper"], ["note", "created", "MemTransUNet ideas"], ["bookmark", "created", "GitHub"], ["expense", "created", "Lunch"]])
      await db.query("INSERT INTO activities(user_id,kind,action,label) VALUES($1,$2,$3,$4)", [uid, k, a, l]);
    await db.query("COMMIT");
    console.log(`✔ Seeded demo data.\n  Sign in with  ${email}  /  ${password}`);
  } catch (e) { await db.query("ROLLBACK").catch(() => {}); console.error("✖ Seed failed:", e.message); process.exitCode = 1; } finally { await db.end(); }
})();
