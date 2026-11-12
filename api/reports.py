"""Vercel-compatible Python serverless handler and shared API logic for RoadGuard AI."""

from http.server import BaseHTTPRequestHandler
import json
import math
import os
import shutil
import urllib.request
from copy import deepcopy
from datetime import datetime, timezone

try:
    from seed_data import SEED_DATA
except ImportError:
    from api.seed_data import SEED_DATA

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED_PATH = os.path.join(BASE_DIR, "data", "seed_reports.json")
LOCAL_DB_PATH = os.path.join(BASE_DIR, "data", "reports.json")
TMP_DB_PATH = "/tmp/roadguard_reports.json"

DEPARTMENT_MAP = {
    "pothole": "Highways & Roads",
    "damaged_road": "Highways & Roads",
    "lighting": "Municipal Street Lighting",
    "crossing": "Traffic Engineering",
    "waterlogging": "Stormwater & Drainage",
}

SLA_HOURS_MAP = {
    "High": 24,
    "Medium": 72,
    "Low": 120,
}

SENSITIVE_ZONE_BONUS = {
    "School": 25,
    "Hospital": 25,
    "Pedestrian Hub": 18,
    "None": 0,
}


def get_db_path() -> str:
    """Return writable DB path depending on local vs Vercel serverless environment."""
    if os.environ.get("VERCEL"):
        if not os.path.exists(TMP_DB_PATH):
            if os.path.exists(SEED_PATH):
                shutil.copyfile(SEED_PATH, TMP_DB_PATH)
            else:
                with open(TMP_DB_PATH, "w", encoding="utf-8") as f:
                    json.dump(SEED_DATA, f, indent=2)
        return TMP_DB_PATH
    if not os.path.exists(LOCAL_DB_PATH):
        os.makedirs(os.path.dirname(LOCAL_DB_PATH), exist_ok=True)
        if os.path.exists(SEED_PATH):
            shutil.copyfile(SEED_PATH, LOCAL_DB_PATH)
        else:
            with open(LOCAL_DB_PATH, "w", encoding="utf-8") as f:
                json.dump(SEED_DATA, f, indent=2)
    return LOCAL_DB_PATH


def load_db() -> dict:
    """Load persisted reports and leaderboard JSON."""
    db_path = get_db_path()
    if not os.path.exists(db_path):
        return deepcopy(SEED_DATA)
    with open(db_path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_db(data: dict) -> None:
    """Persist reports and leaderboard JSON."""
    db_path = get_db_path()
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    with open(db_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in meters between two GPS coordinates."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def compute_priority(severity: str, confirmations: int, sensitive_zone: str) -> int:
    """Rank hazard priority from 1-100 using severity, crowd votes, and sensitive zones."""
    base = {"High": 60, "Medium": 40, "Low": 20}.get(severity, 35)
    zone_bonus = SENSITIVE_ZONE_BONUS.get(sensitive_zone, 0)
    crowd_bonus = min(confirmations * 2, 20)
    return min(100, base + zone_bonus + crowd_bonus)


def analyze_hazard_with_ai(category: str, title: str, description: str, image_data: str) -> dict:
    """Use Gemini API if GEMINI_API_KEY is configured, otherwise deterministic classifier."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    text_blob = f"{title} {description}".lower()

    if api_key and image_data and "," in image_data:
        try:
            header, b64 = image_data.split(",", 1)
            mime_type = "image/jpeg"
            if ":" in header and ";" in header:
                mime_type = header.split(":", 1)[1].split(";", 1)[0]
            prompt = (
                "Analyze this road safety photo and citizen note. Respond ONLY with valid JSON: "
                '{"severity":"Low|Medium|High","confidence":0.9,"summary":"short 1-sentence assessment"}. '
                f"Category: {category}. Note: {title} - {description}"
            )
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {"mime_type": mime_type, "data": b64}},
                    ]
                }]
            }
            req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                raw_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                clean = raw_text.strip().strip("`").replace("json\n", "", 1).strip()
                parsed = json.loads(clean)
                if parsed.get("severity") in ("Low", "Medium", "High"):
                    return {
                        "severity": parsed["severity"],
                        "aiConfidence": float(parsed.get("confidence", 0.9)),
                        "aiSummary": parsed.get("summary", "AI vision verified road safety hazard."),
                    }
        except Exception:
            pass

    high_terms = ("deep", "broken", "dark", "flood", "knee", "accident", "school", "hospital", "danger", "urgent", "skid")
    med_terms = ("crack", "faded", "water", "dim", "slip", "uneven", "crossing", "traffic")

    if any(t in text_blob for t in high_terms) or category in ("pothole", "waterlogging") and len(text_blob) > 40:
        severity, conf = "High", 0.91
    elif any(t in text_blob for t in med_terms) or category in ("lighting", "crossing"):
        severity, conf = "Medium", 0.85
    else:
        severity, conf = "Low", 0.79

    summary_map = {
        "pothole": f"AI classified {severity.lower()}-risk pavement cavity requiring road patch.",
        "damaged_road": f"AI detected {severity.lower()}-severity surface cracking and edge wear.",
        "lighting": f"Night-safety AI flagged {severity.lower()}-risk dark corridor for illumination.",
        "crossing": f"Pedestrian safety AI identified {severity.lower()}-risk crosswalk visibility gap.",
        "waterlogging": f"Flood-risk AI detected {severity.lower()}-severity surface water accumulation.",
    }
    return {
        "severity": severity,
        "aiConfidence": conf,
        "aiSummary": summary_map.get(category, f"AI classified hazard as {severity} severity."),
    }


def award_points(db: dict, user_name: str, points: int, verified_inc: int = 0) -> None:
    """Update citizen points and badge on the community leaderboard."""
    name = (user_name or "Citizen Reporter").strip() or "Citizen Reporter"
    board = db.setdefault("leaderboard", [])
    entry = next((u for u in board if u["name"].lower() == name.lower()), None)
    if not entry:
        entry = {"name": name, "points": 0, "badge": "New Scout", "verifiedCount": 0}
        board.append(entry)
    entry["points"] += points
    entry["verifiedCount"] += verified_inc
    if entry["points"] >= 150:
        entry["badge"] = "Road Safety Champion"
    elif entry["points"] >= 100:
        entry["badge"] = "Road Guardian"
    elif entry["points"] >= 50:
        entry["badge"] = "Active Verifier"
    else:
        entry["badge"] = "New Scout"
    board.sort(key=lambda u: u["points"], reverse=True)


def compute_analytics(reports: list) -> dict:
    """Build summary analytics and SLA status counts."""
    total = len(reports)
    resolved = sum(1 for r in reports if r.get("status") == "Resolved")
    awaiting = sum(1 for r in reports if r.get("status") == "Awaiting Citizen Verification")
    high_risk = sum(1 for r in reports if r.get("severity") == "High" and r.get("status") != "Resolved")
    now = datetime.now(timezone.utc)
    overdue = 0
    by_category = {}

    for r in reports:
        cat = r.get("category", "pothole")
        by_category[cat] = by_category.get(cat, 0) + 1
        if r.get("status") != "Resolved":
            try:
                created = datetime.fromisoformat(r["createdAt"].replace("Z", "+00:00"))
                elapsed_hours = (now - created).total_seconds() / 3600.0
                if elapsed_hours > r.get("slaHours", 72):
                    overdue += 1
            except Exception:
                pass

    return {
        "totalReports": total,
        "resolvedReports": resolved,
        "awaitingVerification": awaiting,
        "activeHighRisk": high_risk,
        "slaOverdue": overdue,
        "resolutionRate": round((resolved / total) * 100) if total else 0,
        "byCategory": by_category,
        "weatherAlert": {
            "active": True,
            "condition": "Heavy Monsoon Showers Forecast",
            "warning": "Elevated waterlogging and skidding risk in low-lying corridors.",
        },
    }


def process_get() -> tuple[int, dict]:
    """Handle GET /api/reports."""
    db = load_db()
    reports = sorted(db.get("reports", []), key=lambda r: r.get("priorityScore", 0), reverse=True)
    return 200, {
        "reports": reports,
        "leaderboard": db.get("leaderboard", [])[:8],
        "analytics": compute_analytics(reports),
    }


def process_post(body: dict) -> tuple[int, dict]:
    """Handle POST /api/reports actions."""
    action = body.get("action", "create")
    db = load_db()
    reports = db.setdefault("reports", [])

    if action == "create":
        category = body.get("category", "pothole")
        title = (body.get("title") or "").strip()
        description = (body.get("description") or "").strip()
        if not title:
            return 400, {"error": "Title is required"}
        lat = float(body.get("lat", 13.0827))
        lng = float(body.get("lng", 80.2707))
        address = (body.get("address") or "Pinned GPS Location").strip()
        sensitive_zone = body.get("nearSensitiveZone", "None")
        reporter_name = (body.get("reporterName") or "Citizen Reporter").strip()
        before_image = body.get("beforeImage", "")

        # Smart Duplicate Clustering within 30 meters for same category
        for existing in reports:
            if existing.get("status") != "Resolved" and existing.get("category") == category:
                dist = haversine_meters(lat, lng, float(existing["lat"]), float(existing["lng"]))
                if dist <= 30.0:
                    existing["confirmations"] = int(existing.get("confirmations", 1)) + 1
                    existing["priorityScore"] = compute_priority(
                        existing.get("severity", "Medium"),
                        existing["confirmations"],
                        existing.get("nearSensitiveZone", "None"),
                    )
                    award_points(db, reporter_name, 10, verified_inc=1)
                    save_db(db)
                    return 200, {
                        "merged": True,
                        "message": f"Merged with nearby ticket {existing['id']} ({round(dist)}m away). +10 verification points awarded!",
                        "report": existing,
                    }

        ai_result = analyze_hazard_with_ai(category, title, description, before_image)
        severity = ai_result["severity"]
        new_id = f"RG-{1001 + len(reports)}"
        new_report = {
            "id": new_id,
            "category": category,
            "title": title,
            "description": description or "Reported via RoadGuard AI citizen portal.",
            "lat": lat,
            "lng": lng,
            "address": address,
            "severity": severity,
            "aiConfidence": ai_result["aiConfidence"],
            "aiSummary": ai_result["aiSummary"],
            "nearSensitiveZone": sensitive_zone,
            "confirmations": 1,
            "priorityScore": compute_priority(severity, 1, sensitive_zone),
            "department": DEPARTMENT_MAP.get(category, "Highways & Roads"),
            "status": "Reported",
            "slaHours": SLA_HOURS_MAP.get(severity, 72),
            "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "reporterName": reporter_name,
            "beforeImage": before_image,
            "afterImage": "",
            "citizenFixVotes": 0,
        }
        reports.insert(0, new_report)
        award_points(db, reporter_name, 20, verified_inc=1)
        save_db(db)
        return 201, {
            "merged": False,
            "message": f"Ticket {new_id} created with AI severity {severity}. +20 points awarded!",
            "report": new_report,
        }

    report_id = body.get("id")
    target = next((r for r in reports if r["id"] == report_id), None)
    if not target:
        return 404, {"error": "Report not found"}

    if action == "confirm":
        target["confirmations"] = int(target.get("confirmations", 1)) + 1
        target["priorityScore"] = compute_priority(
            target.get("severity", "Medium"),
            target["confirmations"],
            target.get("nearSensitiveZone", "None"),
        )
        award_points(db, body.get("citizenName", "Nearby Citizen"), 10, verified_inc=1)
        save_db(db)
        return 200, {"message": f"Confirmed {report_id}. +10 points awarded!", "report": target}

    if action == "assign":
        target["department"] = body.get("department") or target.get("department")
        target["status"] = body.get("status") or "Assigned"
        save_db(db)
        return 200, {"message": f"Updated {report_id} to {target['status']}", "report": target}

    if action == "submit_fix":
        target["afterImage"] = body.get("afterImage", "")
        target["status"] = "Awaiting Citizen Verification"
        save_db(db)
        return 200, {"message": f"Repair proof uploaded for {report_id}. Awaiting citizen verification.", "report": target}

    if action == "verify_fix":
        confirmed_fixed = bool(body.get("fixed", True))
        if confirmed_fixed:
            target["citizenFixVotes"] = int(target.get("citizenFixVotes", 0)) + 1
            target["status"] = "Resolved"
            award_points(db, body.get("citizenName", "Citizen Verifier"), 15, verified_inc=1)
            msg = f"{report_id} verified fixed and closed! +15 bonus points awarded."
        else:
            target["status"] = "In Progress"
            msg = f"{report_id} reopened as In Progress because citizen reported issue still remains."
        save_db(db)
        return 200, {"message": msg, "report": target}

    return 400, {"error": f"Unknown action: {action}"}


class handler(BaseHTTPRequestHandler):
    """Vercel Python Serverless Function entrypoint."""

    def _send_json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self._send_json(204, {})

    def do_GET(self):
        status, payload = process_get()
        self._send_json(status, payload)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON body"})
            return
        status, payload = process_post(body)
        self._send_json(status, payload)
