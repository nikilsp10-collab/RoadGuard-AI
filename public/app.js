const CITIES = {
  coimbatore: { name: "Coimbatore", lat: 11.0168, lng: 76.9558, landmark: "Avinashi Rd, Peelamedu" },
  chennai: { name: "Chennai", lat: 13.0827, lng: 80.2707, landmark: "Anna Salai, Guindy" },
  bengaluru: { name: "Bengaluru", lat: 12.9716, lng: 77.5946, landmark: "MG Road Junction" },
  madurai: { name: "Madurai", lat: 9.9252, lng: 78.1198, landmark: "Periyar Bus Stand Rd" },
};

const LIGHT_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const state = {
  lang: "en",
  theme: "light",
  a11yLarge: false,
  city: "coimbatore",
  searchQuery: "",
  showHeatmap: false,
  nightAudit: false,
  showSafeRoute: false,
  reports: [],
  leaderboard: [],
  analytics: {},
  selectedReportId: null,
  map: null,
  tileLayer: null,
  markersLayer: null,
  heatLayer: null,
  routeLayer: null,
  uploadedBeforeImg: "",
};

const CATEGORY_LABELS = {
  pothole: "Pothole",
  damaged_road: "Road Damage",
  lighting: "Streetlight",
  crossing: "Crossing",
  waterlogging: "Waterlogging",
};

const SEVERITY_COLORS = {
  High: "#dc2626",
  Medium: "#d97706",
  Low: "#16a34a",
};

const DEPARTMENTS = [
  "Highways & Roads",
  "Municipal Street Lighting",
  "Traffic Engineering",
  "Stormwater & Drainage",
];

function t(key) {
  return (window.I18N[state.lang] && window.I18N[state.lang][key]) || window.I18N.en[key] || key;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.add("hidden"), 4000);
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.getElementById("themeIcon").textContent = theme === "dark" ? "☀️" : "🌙";
  document.getElementById("themeText").textContent = theme === "dark" ? "Light" : "Dark";
  localStorage.setItem("rg_theme", theme);
  if (state.map && state.tileLayer) {
    state.tileLayer.setUrl(theme === "dark" ? DARK_TILES : LIGHT_TILES);
  }
}

function applyA11y(large) {
  state.a11yLarge = large;
  document.documentElement.classList.toggle("a11y-large", large);
  document.getElementById("a11yToggle").classList.toggle("active", large);
  localStorage.setItem("rg_a11y", large ? "1" : "0");
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (window.I18N[state.lang][key]) {
      el.textContent = window.I18N[state.lang][key];
    }
  });
  document.getElementById("searchInput").placeholder = t("searchPlaceholder");
  document.getElementById("fTitle").placeholder = t("titlePlaceholder");
  document.getElementById("fDesc").placeholder = t("descPlaceholder");
  document.getElementById("fAddress").placeholder = t("addressPlaceholder");
  document.getElementById("fReporter").placeholder = t("reporterPlaceholder");
}

function initMap() {
  const c = CITIES[state.city];
  state.map = L.map("map", { zoomControl: false }).setView([c.lat, c.lng], 13);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);

  state.tileLayer = L.tileLayer(LIGHT_TILES, {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);

  state.markersLayer = L.layerGroup().addTo(state.map);

  state.map.on("click", (e) => {
    const lat = e.latlng.lat.toFixed(4);
    const lng = e.latlng.lng.toFixed(4);
    document.getElementById("fLat").value = lat;
    document.getElementById("fLng").value = lng;
    document.getElementById("sosCoords").textContent = `GPS: ${lat}, ${lng}`;
    updateProximityBanner();
    showToast(`Pinned GPS: ${lat}, ${lng}`);
  });
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function getFilteredReports() {
  const q = state.searchQuery.trim().toLowerCase();
  return state.reports.filter((r) => {
    if (state.nightAudit && r.category !== "lighting" && r.category !== "crossing") {
      return false;
    }
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      (CATEGORY_LABELS[r.category] || "").toLowerCase().includes(q)
    );
  });
}

function renderMapLayers() {
  if (!state.map) return;
  state.markersLayer.clearLayers();
  if (state.heatLayer) {
    state.map.removeLayer(state.heatLayer);
    state.heatLayer = null;
  }
  if (state.routeLayer) {
    state.map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }

  const visible = getFilteredReports();
  const heatPoints = [];

  visible.forEach((r) => {
    const color = r.status === "Resolved" ? "#64748b" : SEVERITY_COLORS[r.severity] || "#2563eb";
    const marker = L.circleMarker([r.lat, r.lng], {
      radius: r.severity === "High" ? 10 : 8,
      fillColor: color,
      color: "#ffffff",
      weight: 2,
      fillOpacity: 0.92,
    });
    marker.bindPopup(
      `<div style="min-width:185px">
        <strong>${escapeHtml(r.id)}: ${escapeHtml(r.title)}</strong><br/>
        <span style="font-size:12px;color:#475569">${CATEGORY_LABELS[r.category] || r.category} · <b>${r.severity}</b></span><br/>
        <span style="font-size:11px">${escapeHtml(r.address)}</span><br/>
        <span style="font-size:11px">Status: <b>${escapeHtml(r.status)}</b></span>
      </div>`
    );
    marker.on("click", () => {
      state.selectedReportId = r.id;
      renderFeaturedCard();
    });
    marker.addTo(state.markersLayer);

    if (r.status !== "Resolved") {
      const weight = r.severity === "High" ? 1.0 : r.severity === "Medium" ? 0.6 : 0.3;
      heatPoints.push([r.lat, r.lng, weight]);
    }
  });

  if (state.showHeatmap && heatPoints.length > 0 && typeof L.heatLayer === "function") {
    state.heatLayer = L.heatLayer(heatPoints, { radius: 34, blur: 22, maxZoom: 16 }).addTo(state.map);
  }

  if (state.showSafeRoute) {
    state.routeLayer = L.layerGroup().addTo(state.map);
    L.polyline(
      [
        [11.0248, 77.0028],
        [10.9997, 76.9661],
        [10.9968, 76.9698],
      ],
      { color: "#dc2626", weight: 3.5, dashArray: "6 6" }
    )
      .bindPopup("Direct Route: Passes High-Risk Pothole & Waterlogging")
      .addTo(state.routeLayer);

    L.polyline(
      [
        [11.0248, 77.0028],
        [11.0105, 76.9790],
        [10.9968, 76.9698],
      ],
      { color: "#2563eb", weight: 4.5 }
    )
      .bindPopup("RoadGuard Safe Route (via Race Course Rd): Avoids high-severity hazards")
      .addTo(state.routeLayer);
  }

  updateProximityBanner();
}

function updateProximityBanner() {
  const userLat = parseFloat(document.getElementById("fLat").value) || 11.0183;
  const userLng = parseFloat(document.getElementById("fLng").value) || 76.9685;
  const activeHigh = state.reports.filter((r) => r.status !== "Resolved" && r.severity === "High");
  let nearest = null;
  let minDist = Infinity;

  activeHigh.forEach((r) => {
    const d = haversineMeters(userLat, userLng, r.lat, r.lng);
    if (d < minDist) {
      minDist = d;
      nearest = r;
    }
  });

  const badge = document.getElementById("proximityBadge");
  if (nearest && minDist < 3000) {
    badge.textContent = `Alert: ${nearest.title} (${Math.round(minDist)}m)`;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function severityPill(sev) {
  const cls = sev === "High" ? "sev-high" : sev === "Medium" ? "sev-medium" : "sev-low";
  return `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}">${sev} Severity</span>`;
}

function renderStepper(status) {
  const stepIndex =
    status === "Resolved"
      ? 4
      : status === "Awaiting Citizen Verification"
      ? 3
      : status === "Assigned" || status === "In Progress"
      ? 2
      : 1;

  const steps = ["Reported", "Assigned", "Fixed", "Verified"];
  return `
    <div class="stepper pt-1">
      ${steps
        .map((label, idx) => {
          const num = idx + 1;
          const done = num <= stepIndex;
          const verifiedCls = num === 4 && done ? "verified" : "";
          const line =
            idx < steps.length - 1
              ? `<div class="step-line ${num < stepIndex ? "done" : ""}"></div>`
              : "";
          return `
            <div class="step-node ${done ? "done" : ""} ${verifiedCls}">
              <span class="step-dot"></span>
              <span>${label}</span>
            </div>
            ${line}
          `;
        })
        .join("")}
    </div>`;
}

function renderKPIs() {
  const a = state.analytics;
  document.getElementById("statTotal").textContent = a.totalReports ?? state.reports.length;
  document.getElementById("statHigh").textContent = a.activeHighRisk ?? 0;
  document.getElementById("statResolved").textContent = a.resolvedReports ?? 0;
}

function renderFeaturedCard() {
  const box = document.getElementById("featuredCard");
  if (!state.reports.length) {
    box.innerHTML = `<p class="text-xs text-slate-500">No reports yet.</p>`;
    return;
  }
  const r =
    state.reports.find((item) => item.id === state.selectedReportId) ||
    state.reports.find((item) => item.status === "Awaiting Citizen Verification") ||
    state.reports[0];

  const canVerifyFix = r.status === "Awaiting Citizen Verification";

  box.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="text-xs font-bold">${escapeHtml(r.address)}</p>
        <p class="text-[11px] text-slate-500">${escapeHtml(r.title)}${r.nearSensitiveZone !== "None" ? ` · Near ${escapeHtml(r.nearSensitiveZone)}` : ""}</p>
      </div>
      ${severityPill(r.severity)}
    </div>
    <div class="flex flex-wrap gap-2">
      <button onclick="confirmHazard('${r.id}')" class="tool-btn flex-1 justify-center !border-amber-300 !bg-amber-50 !text-amber-800 dark:!bg-amber-950/50 dark:!text-amber-300 dark:!border-amber-800">${t("confirmBtn")}</button>
      <button onclick="verifyFix('${r.id}', true)" class="tool-btn flex-1 justify-center !border-emerald-300 !bg-emerald-50 !text-emerald-800 dark:!bg-emerald-950/50 dark:!text-emerald-300 dark:!border-emerald-800">${t("verifyFixBtn")}</button>
    </div>
    ${renderStepper(r.status)}
  `;
}

function renderCitizenFeed() {
  const container = document.getElementById("citizenFeed");
  const filtered = getFilteredReports();

  if (!filtered.length) {
    container.innerHTML = `<p class="text-xs text-slate-500">No matching reports found.</p>`;
    return;
  }

  container.innerHTML = filtered
    .map((r) => {
      const canVerifyFix = r.status === "Awaiting Citizen Verification";
      return `
        <div class="rg-subcard p-3.5 space-y-2.5">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[11px] font-mono text-slate-500">${r.id}</span>
                ${severityPill(r.severity)}
                <span class="text-[11px] px-2 py-0.5 rounded-full border border-slate-300/60 font-medium">${CATEGORY_LABELS[r.category] || r.category}</span>
              </div>
              <h3 class="font-bold text-xs mt-1">${escapeHtml(r.title)}</h3>
              <p class="text-[11px] text-slate-500">${escapeHtml(r.address)} · ${r.confirmations} confirmations</p>
            </div>
            <span class="text-[11px] font-semibold text-blue-600">${escapeHtml(r.status)}</span>
          </div>

          <p class="text-[11px] text-slate-600 dark:text-slate-300">${escapeHtml(r.aiSummary)}</p>

          ${r.beforeImage ? `<img src="${r.beforeImage}" class="rounded-lg max-h-28 w-full object-cover border border-slate-200" alt="Reported hazard" />` : ""}
          ${r.afterImage ? `<img src="${r.afterImage}" class="rounded-lg max-h-28 w-full object-cover border border-emerald-400" alt="Repair proof" />` : ""}

          <div class="flex flex-wrap gap-2">
            ${
              r.status !== "Resolved" && !canVerifyFix
                ? `<button onclick="confirmHazard('${r.id}')" class="tool-btn">${t("confirmBtn")}</button>`
                : ""
            }
            ${
              canVerifyFix
                ? `<button onclick="verifyFix('${r.id}', true)" class="tool-btn !border-emerald-600 !text-emerald-700">${t("verifyFixBtn")}</button>
                   <button onclick="verifyFix('${r.id}', false)" class="tool-btn !border-red-500 !text-red-600">${t("reopenBtn")}</button>`
                : ""
            }
          </div>
          ${renderStepper(r.status)}
        </div>`;
    })
    .join("");
}

function isSlaOverdue(report) {
  if (report.status === "Resolved") return false;
  const created = new Date(report.createdAt).getTime();
  return (Date.now() - created) / 3600000 > (report.slaHours || 72);
}

function renderAdminQueue() {
  const statusFilter = document.getElementById("adminStatusFilter").value;
  const container = document.getElementById("adminQueue");
  const list = state.reports.filter((r) => statusFilter === "all" || r.status === statusFilter);

  container.innerHTML = list
    .map((r) => {
      const overdue = isSlaOverdue(r);
      const deptOptions = DEPARTMENTS.map(
        (d) => `<option value="${d}" ${r.department === d ? "selected" : ""}>${d}</option>`
      ).join("");
      const statusOptions = ["Reported", "Assigned", "In Progress", "Awaiting Citizen Verification", "Resolved"]
        .map((s) => `<option value="${s}" ${r.status === s ? "selected" : ""}>${s}</option>`)
        .join("");

      return `
        <div class="rg-subcard p-4 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono text-xs font-bold">${r.id}</span>
              ${severityPill(r.severity)}
              ${overdue ? `<span class="px-2 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-bold">SLA Overdue (${r.slaHours}h)</span>` : `<span class="text-xs text-slate-500">SLA: ${r.slaHours}h</span>`}
            </div>
            <span class="text-xs text-slate-500">${r.confirmations} citizen votes · Zone: <b>${escapeHtml(r.nearSensitiveZone)}</b></span>
          </div>

          <div>
            <h3 class="font-bold text-sm">${escapeHtml(r.title)}</h3>
            <p class="text-xs text-slate-500">${escapeHtml(r.address)} — ${escapeHtml(r.aiSummary)}</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
            <select id="dept-${r.id}" class="rg-input text-xs">${deptOptions}</select>
            <select id="stat-${r.id}" class="rg-input text-xs">${statusOptions}</select>
            <button onclick="adminUpdate('${r.id}')" class="py-2 px-3 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold">Save Assignment</button>
            <label class="py-2 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold text-center cursor-pointer hover:bg-emerald-700">
              Upload Proof-of-Fix
              <input type="file" accept="image/*" class="hidden" onchange="uploadRepairProof('${r.id}', event)" />
            </label>
          </div>
        </div>`;
    })
    .join("");
}

function renderLeaderboard() {
  document.getElementById("leaderboardList").innerHTML = state.leaderboard
    .map(
      (u, idx) => `
      <div class="rg-subcard p-3.5 flex items-center justify-between">
        <div>
          <span class="font-bold text-sm mr-1.5">#${idx + 1}</span>
          <span class="font-semibold text-sm">${escapeHtml(u.name)}</span>
          <span class="ml-2 text-[11px] px-2 py-0.5 rounded-full sev-medium font-semibold">${escapeHtml(u.badge)}</span>
          <p class="text-[11px] text-slate-500 mt-0.5">${u.verifiedCount} verified contributions</p>
        </div>
        <span class="font-bold text-blue-600 text-sm">${u.points} pts</span>
      </div>`
    )
    .join("");
}

function renderAnalytics() {
  const a = state.analytics;
  const byCat = a.byCategory || {};
  const total = Math.max(1, a.totalReports || state.reports.length);

  const catBars = Object.entries(CATEGORY_LABELS)
    .map(([key, label]) => {
      const count = byCat[key] || 0;
      const pct = Math.round((count / total) * 100);
      return `
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-semibold">
            <span>${label}</span><span>${count} (${pct}%)</span>
          </div>
          <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div class="h-full rounded-full" style="width:${pct}%;background:linear-gradient(90deg,#4338ca,#0284c7,#10b981)"></div>
          </div>
        </div>`;
    })
    .join("");

  document.getElementById("analyticsGrid").innerHTML = `
    <div class="rg-subcard p-4 space-y-3">
      <h3 class="font-bold text-sm">Hazards by Problem Category</h3>
      ${catBars}
    </div>
    <div class="rg-subcard p-4 space-y-2.5 text-sm">
      <h3 class="font-bold text-sm">Resolution &amp; SLA Performance</h3>
      <p>Resolution Rate: <strong class="text-emerald-600">${a.resolutionRate ?? 0}%</strong></p>
      <p>Awaiting Citizen Verification: <strong>${a.awaitingVerification ?? 0}</strong></p>
      <p>Active High-Risk Hazards: <strong class="text-red-600">${a.activeHighRisk ?? 0}</strong></p>
      <p>SLA Overdue Tickets: <strong class="text-amber-600">${a.slaOverdue ?? 0}</strong></p>
    </div>`;
}

async function fetchDashboard() {
  try {
    const res = await fetch("/api/reports");
    const data = await res.json();
    state.reports = data.reports || [];
    state.leaderboard = data.leaderboard || [];
    state.analytics = data.analytics || {};
    renderKPIs();
    renderMapLayers();
    renderFeaturedCard();
    renderCitizenFeed();
    renderAdminQueue();
    renderLeaderboard();
    renderAnalytics();
  } catch {
    showToast("Could not connect to /api/reports");
  }
}

async function postAction(payload) {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || "Action failed");
    return null;
  }
  if (data.message) showToast(data.message);
  await fetchDashboard();
  return data;
}

window.confirmHazard = async (id) => {
  const citizenName = document.getElementById("fReporter").value || "Nearby Citizen";
  await postAction({ action: "confirm", id, citizenName });
};

window.verifyFix = async (id, fixed) => {
  const citizenName = document.getElementById("fReporter").value || "Citizen Verifier";
  await postAction({ action: "verify_fix", id, fixed, citizenName });
};

window.adminUpdate = async (id) => {
  const department = document.getElementById(`dept-${id}`).value;
  const status = document.getElementById(`stat-${id}`).value;
  await postAction({ action: "assign", id, department, status });
};

window.uploadRepairProof = (id, event) => {
  const file = event.target.files[0];
  if (!file) return;
  readCompressedImage(file, async (dataUrl) => {
    await postAction({ action: "submit_fix", id, afterImage: dataUrl });
  });
};

function readCompressedImage(file, cb) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxW = 480;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function wireEvents() {
  // Primary tabs
  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.getAttribute("data-tab");
      ["map", "admin", "community", "analytics"].forEach((tab) => {
        document.getElementById(`tab-${tab}`).classList.toggle("hidden", tab !== target);
      });
      if (target === "map" && state.map) {
        setTimeout(() => state.map.invalidateSize(), 120);
      }
    });
  });

  // Citizen panel sub-tabs
  const subReport = document.getElementById("subTabReport");
  const subVerify = document.getElementById("subTabVerify");
  subReport.addEventListener("click", () => {
    document.getElementById("panelReport").classList.remove("hidden");
    document.getElementById("panelVerify").classList.add("hidden");
    subReport.classList.add("bg-white", "dark:bg-slate-800", "shadow-sm");
    subReport.classList.remove("text-slate-500");
    subVerify.classList.remove("bg-white", "dark:bg-slate-800", "shadow-sm");
    subVerify.classList.add("text-slate-500");
  });
  subVerify.addEventListener("click", () => {
    document.getElementById("panelVerify").classList.remove("hidden");
    document.getElementById("panelReport").classList.add("hidden");
    subVerify.classList.add("bg-white", "dark:bg-slate-800", "shadow-sm");
    subVerify.classList.remove("text-slate-500");
    subReport.classList.remove("bg-white", "dark:bg-slate-800", "shadow-sm");
    subReport.classList.add("text-slate-500");
  });

  // Category tiles
  document.querySelectorAll(".cat-tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      document.querySelectorAll(".cat-tile").forEach((c) => c.classList.remove("active"));
      tile.classList.add("active");
      document.getElementById("fCategory").value = tile.getAttribute("data-cat");
    });
  });

  // Theme, A11y, Language, City
  document.getElementById("themeToggle").addEventListener("click", () => {
    applyTheme(state.theme === "dark" ? "light" : "dark");
  });
  document.getElementById("a11yToggle").addEventListener("click", () => {
    applyA11y(!state.a11yLarge);
  });
  document.getElementById("langToggle").addEventListener("click", () => {
    state.lang = state.lang === "en" ? "ta" : "en";
    applyTranslations();
    renderFeaturedCard();
    renderCitizenFeed();
  });
  document.getElementById("citySelector").addEventListener("change", (e) => {
    state.city = e.target.value;
    const c = CITIES[state.city];
    if (c && state.map) {
      state.map.setView([c.lat, c.lng], 13);
      document.getElementById("fAddress").value = c.landmark;
      document.getElementById("fLat").value = c.lat;
      document.getElementById("fLng").value = c.lng;
      document.getElementById("sosCoords").textContent = `GPS: ${c.lat}, ${c.lng} (${c.name})`;
      showToast(`Switched map view to ${c.name}`);
    }
  });

  // Search
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    renderMapLayers();
    renderCitizenFeed();
    const matches = getFilteredReports();
    if (state.searchQuery.trim() && matches.length > 0 && state.map) {
      state.map.setView([matches[0].lat, matches[0].lng], 14);
    }
  });

  // Map pills
  document.getElementById("pillAll").addEventListener("click", () => {
    state.showHeatmap = false;
    state.nightAudit = false;
    state.showSafeRoute = false;
    document.getElementById("pillAll").classList.add("active");
    document.getElementById("pillHeat").classList.remove("active");
    document.getElementById("pillNight").classList.remove("active");
    document.getElementById("pillSafe").classList.remove("active");
    renderMapLayers();
  });
  document.getElementById("pillHeat").addEventListener("click", (e) => {
    state.showHeatmap = !state.showHeatmap;
    e.currentTarget.classList.toggle("active", state.showHeatmap);
    document.getElementById("pillAll").classList.remove("active");
    renderMapLayers();
  });
  document.getElementById("pillNight").addEventListener("click", (e) => {
    state.nightAudit = !state.nightAudit;
    e.currentTarget.classList.toggle("active", state.nightAudit);
    document.getElementById("pillAll").classList.remove("active");
    renderMapLayers();
  });
  document.getElementById("pillSafe").addEventListener("click", (e) => {
    state.showSafeRoute = !state.showSafeRoute;
    e.currentTarget.classList.toggle("active", state.showSafeRoute);
    document.getElementById("pillAll").classList.remove("active");
    renderMapLayers();
  });

  const captureGps = () => {
    if (!navigator.geolocation) {
      showToast("Geolocation unavailable; click the map to drop a pin.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(4);
        const lng = pos.coords.longitude.toFixed(4);
        document.getElementById("fLat").value = lat;
        document.getElementById("fLng").value = lng;
        document.getElementById("sosCoords").textContent = `GPS: ${lat}, ${lng}`;
        state.map.setView([lat, lng], 15);
        updateProximityBanner();
        showToast("Live GPS coordinates captured!");
      },
      () => showToast("GPS permission blocked; click anywhere on the map instead.")
    );
  };
  document.getElementById("gpsBtn").addEventListener("click", captureGps);
  document.getElementById("gpsMapBtn").addEventListener("click", captureGps);

  // Voice Note (Web Speech API)
  document.getElementById("voiceBtn").addEventListener("click", () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      showToast("Voice input requires Chrome/Edge; type your note below.");
      return;
    }
    const rec = new SpeechRec();
    rec.lang = state.lang === "ta" ? "ta-IN" : "en-IN";
    rec.onresult = (ev) => {
      const text = ev.results[0][0].transcript;
      const desc = document.getElementById("fDesc");
      desc.value = desc.value ? `${desc.value} ${text}` : text;
      showToast("Voice note added!");
    };
    rec.onerror = () => showToast("Could not capture voice note.");
    rec.start();
    showToast("Listening...");
  });

  document.getElementById("fPhoto").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readCompressedImage(file, (dataUrl) => {
      state.uploadedBeforeImg = dataUrl;
      const preview = document.getElementById("photoPreview");
      preview.src = dataUrl;
      preview.classList.remove("hidden");
    });
  });

  document.getElementById("reportForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await postAction({
      action: "create",
      category: document.getElementById("fCategory").value,
      title: document.getElementById("fTitle").value,
      description: document.getElementById("fDesc").value,
      nearSensitiveZone: document.getElementById("fZone").value,
      reporterName: document.getElementById("fReporter").value,
      address: document.getElementById("fAddress").value,
      lat: parseFloat(document.getElementById("fLat").value),
      lng: parseFloat(document.getElementById("fLng").value),
      beforeImage: state.uploadedBeforeImg,
    });
    if (res) {
      if (res.report) state.selectedReportId = res.report.id;
      document.getElementById("fTitle").value = "";
      document.getElementById("fDesc").value = "";
      state.uploadedBeforeImg = "";
      document.getElementById("fPhoto").value = "";
      document.getElementById("photoPreview").classList.add("hidden");
    }
  });

  document.getElementById("adminStatusFilter").addEventListener("change", renderAdminQueue);

  const modal = document.getElementById("sosModal");
  document.getElementById("sosOpenBtn").addEventListener("click", () => {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  });
  document.getElementById("sosCloseBtn").addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  });
  document.getElementById("copySosBtn").addEventListener("click", () => {
    const coords = document.getElementById("sosCoords").textContent;
    navigator.clipboard?.writeText(`EMERGENCY ROAD INCIDENT - ${coords}`);
    showToast("SOS location copied!");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("rg_theme") || "light");
  applyA11y(localStorage.getItem("rg_a11y") === "1");
  initMap();
  wireEvents();
  applyTranslations();
  fetchDashboard();
});
