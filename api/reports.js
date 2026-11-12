const fs = require("fs");
const path = require("path");

const TMP_DB_PATH = "/tmp/roadguard_reports.json";

const SEED_DATA = {
  reports: [
    {
      id: "RG-1001",
      category: "pothole",
      title: "Deep pothole near Peelamedu school gate",
      description: "Large water-filled pothole on Avinashi Road right outside school entrance causing two-wheeler skids.",
      lat: 11.0248,
      lng: 77.0028,
      address: "Avinashi Road, Peelamedu, Coimbatore",
      severity: "High",
      aiConfidence: 0.94,
      aiSummary: "AI detected severe asphalt cavity (~60cm wide) in high-footfall Peelamedu school zone.",
      nearSensitiveZone: "School",
      confirmations: 14,
      priorityScore: 96,
      department: "Highways & Roads",
      status: "Assigned",
      slaHours: 24,
      createdAt: "2026-11-11T09:15:00Z",
      reporterName: "Arjun K.",
      beforeImage: "",
      afterImage: "",
      citizenFixVotes: 0,
    },
    {
      id: "RG-1002",
      category: "lighting",
      title: "3 consecutive streetlights non-functional",
      description: "Complete darkness along Trichy Road stretch after 6:30 PM; unsafe for patients and cyclists.",
      lat: 10.9968,
      lng: 76.9698,
      address: "Trichy Road, near CMCH Hospital, Coimbatore",
      severity: "High",
      aiConfidence: 0.89,
      aiSummary: "Night-safety dark zone flagged near hospital corridor; visibility critically low.",
      nearSensitiveZone: "Hospital",
      confirmations: 11,
      priorityScore: 91,
      department: "Municipal Street Lighting",
      status: "In Progress",
      slaHours: 24,
      createdAt: "2026-11-11T18:40:00Z",
      reporterName: "Priya S.",
      beforeImage: "",
      afterImage: "",
      citizenFixVotes: 0,
    },
    {
      id: "RG-1003",
      category: "crossing",
      title: "Faded zebra crossing & broken signal button",
      description: "Pedestrian crossing markings completely worn off at busy RS Puram shopping intersection.",
      lat: 11.0092,
      lng: 76.9495,
      address: "DB Road Pedestrian Crossing, RS Puram, Coimbatore",
      severity: "Medium",
      aiConfidence: 0.86,
      aiSummary: "High pedestrian volume zone with faded crosswalk markings and missing warning sign.",
      nearSensitiveZone: "Pedestrian Hub",
      confirmations: 8,
      priorityScore: 74,
      department: "Traffic Engineering",
      status: "Reported",
      slaHours: 72,
      createdAt: "2026-11-12T07:20:00Z",
      reporterName: "Karthik R.",
      beforeImage: "",
      afterImage: "",
      citizenFixVotes: 0,
    },
    {
      id: "RG-1004",
      category: "waterlogging",
      title: "Knee-deep waterlogging blocking underpass lane",
      description: "Blocked storm drain near Lanka Corner causing stagnant rainwater across main carriageway.",
      lat: 10.9997,
      lng: 76.9661,
      address: "Lanka Corner Underpass, Town Hall, Coimbatore",
      severity: "High",
      aiConfidence: 0.92,
      aiSummary: "Surface flooding detected; high hydroplaning and stall risk during Coimbatore monsoon showers.",
      nearSensitiveZone: "Hospital",
      confirmations: 17,
      priorityScore: 95,
      department: "Stormwater & Drainage",
      status: "Awaiting Citizen Verification",
      slaHours: 24,
      createdAt: "2026-11-10T14:10:00Z",
      reporterName: "Meena V.",
      beforeImage: "",
      afterImage: "",
      citizenFixVotes: 1,
    },
    {
      id: "RG-1005",
      category: "damaged_road",
      title: "Cracked & uneven road edge near bus stop",
      description: "Shoulder erosion and longitudinal cracks forcing town buses to swerve near Saibaba Colony.",
      lat: 11.027,
      lng: 76.9478,
      address: "Mettupalayam Road, Saibaba Colony, Coimbatore",
      severity: "Low",
      aiConfidence: 0.81,
      aiSummary: "Minor surface cracking; monitor and schedule preventive resurfacing.",
      nearSensitiveZone: "None",
      confirmations: 4,
      priorityScore: 42,
      department: "Highways & Roads",
      status: "Resolved",
      slaHours: 120,
      createdAt: "2026-11-08T11:00:00Z",
      reporterName: "Divya N.",
      beforeImage: "",
      afterImage: "",
      citizenFixVotes: 3,
    },
  ],
  leaderboard: [
    { name: "Meena V.", points: 165, badge: "Flood Watch Hero", verifiedCount: 9 },
    { name: "Arjun K.", points: 140, badge: "Road Guardian", verifiedCount: 7 },
    { name: "Priya S.", points: 115, badge: "Night Safety Scout", verifiedCount: 6 },
    { name: "Karthik R.", points: 80, badge: "Civic Contributor", verifiedCount: 4 },
  ],
};

const DEPARTMENT_MAP = {
  pothole: "Highways & Roads",
  damaged_road: "Highways & Roads",
  lighting: "Municipal Street Lighting",
  crossing: "Traffic Engineering",
  waterlogging: "Stormwater & Drainage",
};

const SLA_HOURS_MAP = { High: 24, Medium: 72, Low: 120 };
const SENSITIVE_ZONE_BONUS = { School: 25, Hospital: 25, "Pedestrian Hub": 18, None: 0 };

function loadDb() {
  try {
    if (fs.existsSync(TMP_DB_PATH)) {
      return JSON.parse(fs.readFileSync(TMP_DB_PATH, "utf-8"));
    }
  } catch {
    // Fall back to fresh seed
  }
  const fresh = JSON.parse(JSON.stringify(SEED_DATA));
  saveDb(fresh);
  return fresh;
}

function saveDb(data) {
  try {
    fs.mkdirSync(path.dirname(TMP_DB_PATH), { recursive: true });
    fs.writeFileSync(TMP_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Ignore write failures in read-only environments
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lng2 - lng1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function computePriority(severity, confirmations, sensitiveZone) {
  const base = { High: 60, Medium: 40, Low: 20 }[severity] || 35;
  const zoneBonus = SENSITIVE_ZONE_BONUS[sensitiveZone] || 0;
  const crowdBonus = Math.min(confirmations * 2, 20);
  return Math.min(100, base + zoneBonus + crowdBonus);
}

async function analyzeHazardWithAi(category, title, description, imageData) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const textBlob = `${title} ${description}`.toLowerCase();

  if (apiKey && imageData && imageData.includes(",")) {
    try {
      const [header, b64] = imageData.split(",", 2);
      let mimeType = "image/jpeg";
      if (header.includes(":") && header.includes(";")) {
        mimeType = header.split(":", 2)[1].split(";", 2)[0];
      }
      const prompt =
        'Analyze this road safety photo and citizen note. Respond ONLY with valid JSON: {"severity":"Low|Medium|High","confidence":0.9,"summary":"short 1-sentence assessment"}. ' +
        `Category: ${category}. Note: ${title} - ${description}`;

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: mimeType, data: b64 } },
                ],
              },
            ],
          }),
        }
      );
      if (resp.ok) {
        const resJson = await resp.json();
        const rawText = resJson.candidates[0].content.parts[0].text;
        const clean = rawText.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(clean);
        if (["Low", "Medium", "High"].includes(parsed.severity)) {
          return {
            severity: parsed.severity,
            aiConfidence: Number(parsed.confidence || 0.9),
            aiSummary: parsed.summary || "AI vision verified road safety hazard.",
          };
        }
      }
    } catch {
      // Fall back to deterministic classifier
    }
  }

  const highTerms = ["deep", "broken", "dark", "flood", "knee", "accident", "school", "hospital", "danger", "urgent", "skid"];
  const medTerms = ["crack", "faded", "water", "dim", "slip", "uneven", "crossing", "traffic"];

  let severity = "Low";
  let conf = 0.79;
  if (highTerms.some((t) => textBlob.includes(t)) || ((category === "pothole" || category === "waterlogging") && textBlob.length > 40)) {
    severity = "High";
    conf = 0.91;
  } else if (medTerms.some((t) => textBlob.includes(t)) || category === "lighting" || category === "crossing") {
    severity = "Medium";
    conf = 0.85;
  }

  const summaryMap = {
    pothole: `AI classified ${severity.toLowerCase()}-risk pavement cavity requiring road patch.`,
    damaged_road: `AI detected ${severity.toLowerCase()}-severity surface cracking and edge wear.`,
    lighting: `Night-safety AI flagged ${severity.toLowerCase()}-risk dark corridor for illumination.`,
    crossing: `Pedestrian safety AI identified ${severity.toLowerCase()}-risk crosswalk visibility gap.`,
    waterlogging: `Flood-risk AI detected ${severity.toLowerCase()}-severity surface water accumulation.`,
  };

  return {
    severity,
    aiConfidence: conf,
    aiSummary: summaryMap[category] || `AI classified hazard as ${severity} severity.`,
  };
}

function awardPoints(db, userName, points, verifiedInc = 0) {
  const name = (userName || "Citizen Reporter").trim() || "Citizen Reporter";
  db.leaderboard = db.leaderboard || [];
  let entry = db.leaderboard.find((u) => u.name.toLowerCase() === name.toLowerCase());
  if (!entry) {
    entry = { name, points: 0, badge: "New Scout", verifiedCount: 0 };
    db.leaderboard.push(entry);
  }
  entry.points += points;
  entry.verifiedCount += verifiedInc;
  if (entry.points >= 150) entry.badge = "Road Safety Champion";
  else if (entry.points >= 100) entry.badge = "Road Guardian";
  else if (entry.points >= 50) entry.badge = "Active Verifier";
  else entry.badge = "New Scout";
  db.leaderboard.sort((a, b) => b.points - a.points);
}

function computeAnalytics(reports) {
  const total = reports.length;
  const resolved = reports.filter((r) => r.status === "Resolved").length;
  const awaiting = reports.filter((r) => r.status === "Awaiting Citizen Verification").length;
  const highRisk = reports.filter((r) => r.severity === "High" && r.status !== "Resolved").length;
  const now = Date.now();
  let overdue = 0;
  const byCategory = {};

  for (const r of reports) {
    const cat = r.category || "pothole";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    if (r.status !== "Resolved" && r.createdAt) {
      const elapsedHrs = (now - new Date(r.createdAt).getTime()) / 3600000;
      if (elapsedHrs > (r.slaHours || 72)) overdue += 1;
    }
  }

  return {
    totalReports: total,
    resolvedReports: resolved,
    awaitingVerification: awaiting,
    activeHighRisk: highRisk,
    slaOverdue: overdue,
    resolutionRate: total ? Math.round((resolved / total) * 100) : 0,
    byCategory,
    weatherAlert: {
      active: true,
      condition: "Heavy Monsoon Showers Forecast",
      warning: "Elevated waterlogging and skidding risk in low-lying corridors.",
    },
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const db = loadDb();
  const reports = db.reports || [];

  if (req.method === "GET") {
    const sorted = [...reports].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    return res.status(200).json({
      reports: sorted,
      leaderboard: (db.leaderboard || []).slice(0, 8),
      analytics: computeAnalytics(sorted),
    });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const action = body.action || "create";

    if (action === "create") {
      const category = body.category || "pothole";
      const title = (body.title || "").trim();
      const description = (body.description || "").trim();
      if (!title) return res.status(400).json({ error: "Title is required" });

      const lat = Number(body.lat ?? 11.0183);
      const lng = Number(body.lng ?? 76.9685);
      const address = (body.address || "Pinned GPS Location").trim();
      const sensitiveZone = body.nearSensitiveZone || "None";
      const reporterName = (body.reporterName || "Citizen Reporter").trim();
      const beforeImage = body.beforeImage || "";

      for (const existing of reports) {
        if (existing.status !== "Resolved" && existing.category === category) {
          const dist = haversineMeters(lat, lng, Number(existing.lat), Number(existing.lng));
          if (dist <= 30) {
            existing.confirmations = Number(existing.confirmations || 1) + 1;
            existing.priorityScore = computePriority(existing.severity || "Medium", existing.confirmations, existing.nearSensitiveZone || "None");
            awardPoints(db, reporterName, 10, 1);
            saveDb(db);
            return res.status(200).json({
              merged: true,
              message: `Merged with nearby ticket ${existing.id} (${Math.round(dist)}m away). +10 verification points awarded!`,
              report: existing,
            });
          }
        }
      }

      const aiResult = await analyzeHazardWithAi(category, title, description, beforeImage);
      const severity = aiResult.severity;
      const newId = `RG-${1001 + reports.length}`;
      const newReport = {
        id: newId,
        category,
        title,
        description: description || "Reported via RoadGuard AI citizen portal.",
        lat,
        lng,
        address,
        severity,
        aiConfidence: aiResult.aiConfidence,
        aiSummary: aiResult.aiSummary,
        nearSensitiveZone: sensitiveZone,
        confirmations: 1,
        priorityScore: computePriority(severity, 1, sensitiveZone),
        department: DEPARTMENT_MAP[category] || "Highways & Roads",
        status: "Reported",
        slaHours: SLA_HOURS_MAP[severity] || 72,
        createdAt: new Date().toISOString(),
        reporterName,
        beforeImage,
        afterImage: "",
        citizenFixVotes: 0,
      };
      reports.unshift(newReport);
      awardPoints(db, reporterName, 20, 1);
      saveDb(db);
      return res.status(201).json({
        merged: false,
        message: `Ticket ${newId} created with AI severity ${severity}. +20 points awarded!`,
        report: newReport,
      });
    }

    const reportId = body.id;
    const target = reports.find((r) => r.id === reportId);
    if (!target) return res.status(404).json({ error: "Report not found" });

    if (action === "confirm") {
      target.confirmations = Number(target.confirmations || 1) + 1;
      target.priorityScore = computePriority(target.severity || "Medium", target.confirmations, target.nearSensitiveZone || "None");
      awardPoints(db, body.citizenName || "Nearby Citizen", 10, 1);
      saveDb(db);
      return res.status(200).json({ message: `Confirmed ${reportId}. +10 points awarded!`, report: target });
    }

    if (action === "assign") {
      target.department = body.department || target.department;
      target.status = body.status || "Assigned";
      saveDb(db);
      return res.status(200).json({ message: `Updated ${reportId} to ${target.status}`, report: target });
    }

    if (action === "submit_fix") {
      target.afterImage = body.afterImage || "";
      target.status = "Awaiting Citizen Verification";
      saveDb(db);
      return res.status(200).json({ message: `Repair proof uploaded for ${reportId}. Awaiting citizen verification.`, report: target });
    }

    if (action === "verify_fix") {
      const confirmedFixed = body.fixed !== false;
      if (confirmedFixed) {
        target.citizenFixVotes = Number(target.citizenFixVotes || 0) + 1;
        target.status = "Resolved";
        awardPoints(db, body.citizenName || "Citizen Verifier", 15, 1);
        saveDb(db);
        return res.status(200).json({ message: `${reportId} verified fixed and closed! +15 bonus points awarded.`, report: target });
      }
      target.status = "In Progress";
      saveDb(db);
      return res.status(200).json({ message: `${reportId} reopened as In Progress because citizen reported issue still remains.`, report: target });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
