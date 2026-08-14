const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, "data", "gigconnect.db");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('freelancer','employer')),
    skills TEXT DEFAULT '[]',
    portfolio TEXT DEFAULT '',
    rating REAL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employer_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    budget TEXT,
    skills TEXT DEFAULT '[]',
    description TEXT,
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employer_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    freelancer_id INTEGER NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, freelancer_id),
    FOREIGN KEY(job_id) REFERENCES jobs(id),
    FOREIGN KEY(freelancer_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    freelancer_id INTEGER NOT NULL,
    employer_id INTEGER NOT NULL,
    progress INTEGER DEFAULT 0,
    amount TEXT,
    escrow_status TEXT DEFAULT 'held',
    status TEXT DEFAULT 'active',
    FOREIGN KEY(job_id) REFERENCES jobs(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    reviewer_id INTEGER NOT NULL,
    reviewee_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Demo accounts + starter jobs.
  db.run(`INSERT OR IGNORE INTO users(id,name,email,role,skills,rating)
          VALUES(1,'Demo Freelancer','freelancer@gigconnect.demo','freelancer','["React","Python","AI"]',4.9)`);
  db.run(`INSERT OR IGNORE INTO users(id,name,email,role,rating)
          VALUES(2,'Demo Employer','employer@gigconnect.demo','employer',0)`);

  db.get(`SELECT COUNT(*) AS count FROM jobs`, (err, row) => {
    if (!err && row.count === 0) {
      const stmt = db.prepare(`INSERT INTO jobs
        (employer_id,title,category,budget,skills,description) VALUES (?,?,?,?,?,?)`);
      const seed = [
        ["React Frontend Developer","Web Development","₹25k–₹40k",["React","JavaScript","Figma"],"Build a responsive frontend for a business application."],
        ["AI Chatbot for College","AI / Machine Learning","₹20k–₹35k",["Python","AI","FastAPI"],"Develop an AI chatbot for student support."],
        ["UI/UX Designer","UI/UX Design","₹15k–₹25k",["Figma","UI/UX","Prototyping"],"Design a clean mobile-first product experience."],
        ["Python Automation Project","Web Development","₹18k–₹30k",["Python","Automation","SQL"],"Automate repetitive business workflows."],
        ["Social Media Content Creator","Marketing","₹10k–₹20k",["Content","Instagram","Canva"],"Create engaging social media content for a startup."],
        ["Full Stack Web Developer","Web Development","₹35k–₹60k",["React","Node.js","MongoDB"],"Build and deploy a full-stack web application."]
      ];
      for (const j of seed) stmt.run(2,j[0],j[1],j[2],JSON.stringify(j[3]),j[4]);
      stmt.finalize();
    }
  });
});

function parseJob(row) {
  return {...row, skills: JSON.parse(row.skills || "[]")};
}

app.get("/api/health", (req,res) => res.json({ok:true, service:"GigConnect API"}));

app.get("/api/jobs", (req,res) => {
  const q = (req.query.q || "").trim();
  const sql = q
    ? `SELECT j.*, u.name AS company,
       COALESCE((SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.reviewee_id=u.id),u.rating) AS rating
       FROM jobs j JOIN users u ON u.id=j.employer_id
       WHERE j.title LIKE ? OR j.category LIKE ? OR j.skills LIKE ? OR j.description LIKE ?
       ORDER BY j.created_at DESC`
    : `SELECT j.*, u.name AS company,
       COALESCE((SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.reviewee_id=u.id),u.rating) AS rating
       FROM jobs j JOIN users u ON u.id=j.employer_id
       ORDER BY j.created_at DESC`;
  const params = q ? [`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`] : [];
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({error:err.message});
    res.json(rows.map(parseJob));
  });
});

app.post("/api/jobs", (req,res) => {
  const {employer_id=2,title,category,budget,skills=[],description=""} = req.body;
  if (!title) return res.status(400).json({error:"Project title is required"});
  db.run(`INSERT INTO jobs(employer_id,title,category,budget,skills,description)
          VALUES(?,?,?,?,?,?)`,
    [employer_id,title,category,budget,JSON.stringify(skills),description],
    function(err){
      if(err) return res.status(500).json({error:err.message});
      res.status(201).json({id:this.lastID,message:"Job stored successfully"});
    });
});

app.post("/api/applications", (req,res) => {
  const {job_id,freelancer_id=1,message=""} = req.body;
  if (!job_id) return res.status(400).json({error:"job_id is required"});
  db.run(`INSERT INTO applications(job_id,freelancer_id,message) VALUES(?,?,?)`,
    [job_id,freelancer_id,message], function(err){
      if(err && err.code === "SQLITE_CONSTRAINT") return res.status(409).json({error:"You already applied to this job"});
      if(err) return res.status(500).json({error:err.message});
      res.status(201).json({id:this.lastID,message:"Application stored successfully"});
    });
});

app.get("/api/applications", (req,res) => {
  db.all(`SELECT a.*, j.title, u.name AS freelancer
          FROM applications a
          JOIN jobs j ON j.id=a.job_id
          JOIN users u ON u.id=a.freelancer_id
          ORDER BY a.created_at DESC`, (err,rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

app.get("/api/stats", (req,res) => {
  const out={};
  db.get(`SELECT COUNT(*) n FROM users WHERE role='freelancer'`,(_,r)=>{out.freelancers=r.n;
    db.get(`SELECT COUNT(*) n FROM jobs`,(_,r)=>{out.jobs=r.n;
      db.get(`SELECT COUNT(*) n FROM applications`,(_,r)=>{out.applications=r.n; res.json(out);});
    });
  });
});

app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT, () => console.log(`GigConnect running at http://localhost:${PORT}`));
