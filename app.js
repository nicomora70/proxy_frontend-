"use strict";

const API_BASE = ((window.APP_CONFIG && window.APP_CONFIG.API_BASE) || "/api").replace(/\/$/, "");
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  users: [],
  documents: [],
  audit: [],
  currentUserId: "u1",
  layers: { log: true, access: true, cache: true, lazy: true },
  auditFilter: "ALL",
  currentDocument: null,
  metrics: { cacheHits: 0, denied: 0, lastLatency: 0 },
  pending: 0
};

const NODES = ["LOG", "ACCESS", "CACHE", "LAZY", "REMOTE"];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindStaticEvents();
  updateClock();
  window.setInterval(updateClock, 30000);
  setupReveal();
  setupScrollSpy();

  try {
    const data = await api("/users");
    state.users = data.users || [];
    if (state.users.length > 0) {
      state.currentUserId = state.users[0].id;
    }
    renderUsers();
    await Promise.all([loadDocuments(), loadAudit()]);
    renderRunnerNote();
  } catch (error) {
    setSystemStatus(false);
    showToast("Connection error", "The backend is not responding on port 8080.", "denied");
    $("#docs-empty").hidden = false;
  }
}

/* ---------- API ---------- */

async function api(path, options = {}) {
  const url = new URL(API_BASE + path, window.location.href);
  url.searchParams.set("userId", state.currentUserId);
  url.searchParams.set("layers", activeLayers());

  const headers = options.body ? { "Content-Type": "application/json" } : {};
  beginRequest();
  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    });
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      data = { error: "Invalid server response" };
    }
    if (!response.ok) {
      const error = new Error(data.error || "Request failed");
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } finally {
    endRequest();
  }
}

function activeLayers() {
  return Object.keys(state.layers).filter((layer) => state.layers[layer]).join(",");
}

function beginRequest() {
  state.pending += 1;
  $("#progress").classList.add("loading");
}

function endRequest() {
  state.pending = Math.max(0, state.pending - 1);
  if (state.pending === 0) {
    $("#progress").classList.remove("loading");
  }
}

/* ---------- data loading ---------- */

async function loadDocuments() {
  const data = await api("/documents");
  state.documents = data.documents || [];
  state.metrics.lastLatency = data.latencyMs ?? state.metrics.lastLatency;
  renderDocuments();
  renderDocsContext();
  renderDemoOptions();
  renderMetrics();
}

async function loadAudit() {
  const data = await api("/audit");
  state.audit = data.entries || [];
  renderAudit();
}

/* ---------- render ---------- */

function renderUsers() {
  const grid = $("#user-grid");
  grid.innerHTML = state.users.map((user) => {
    const active = user.id === state.currentUserId;
    return `
      <button class="user-card${active ? " active" : ""}" data-user="${escapeHtml(user.id)}" type="button">
        <span class="user-avatar">${initials(user.name)}</span>
        <span class="user-name">${escapeHtml(user.name)}</span>
        <span class="user-role">${escapeHtml(user.role)} · ${escapeHtml(user.area)}</span>
        <span class="user-area">${roleLabel(user.role)}</span>
      </button>`;
  }).join("");
}

function renderDocuments() {
  const grid = $("#doc-grid");
  const empty = $("#docs-empty");
  empty.hidden = state.documents.length !== 0;

  grid.innerHTML = state.documents.map((doc, index) => {
    const image = documentImage(doc.id, index);
    const locked = state.layers.access && doc.canRead === false;
    const meta = [
      escapeHtml(doc.ownerName),
      formatSize(doc.sizeKb) + (locked ? " · locked" : "")
    ].join("<br>");
    return `
      <button class="doc-card${locked ? " locked" : ""}" data-doc="${escapeHtml(doc.id)}" type="button" aria-label="Open ${escapeHtml(doc.title)}">
        <img src="assets/${image}" alt="" loading="lazy">
        <span class="doc-card-body">
          <span class="doc-card-top">
            <span class="class-pill ${doc.classification.toLowerCase()}">${escapeHtml(doc.classification)}</span>
            <span class="doc-open">↗</span>
          </span>
          <span class="doc-card-title">${escapeHtml(doc.title)}</span>
          <span class="doc-card-bottom">
            <span class="doc-vertical">${escapeHtml(doc.area)}</span>
            <span class="doc-meta">${meta}</span>
          </span>
        </span>
      </button>`;
  }).join("");
}

function renderDocsContext() {
  const user = currentUser();
  const name = user ? user.name : "—";
  $("#docs-context").innerHTML = `Signed in as <strong>${escapeHtml(name)}</strong> · ${state.documents.length} records visible`;
}

function renderDemoOptions() {
  const select = $("#demo-doc");
  const previous = select.value;
  select.innerHTML = state.documents.map((doc) =>
    `<option value="${escapeHtml(doc.id)}">${escapeHtml(doc.id.toUpperCase())} — ${escapeHtml(doc.title)}</option>`
  ).join("");
  if (state.documents.some((doc) => doc.id === previous)) {
    select.value = previous;
  }
}

function renderMetrics() {
  $("#m-docs").textContent = String(state.documents.length).padStart(2, "0");
  $("#m-hits").textContent = String(state.metrics.cacheHits).padStart(2, "0");
  $("#m-denied").textContent = String(state.metrics.denied).padStart(2, "0");
  $("#m-latency").innerHTML = `${state.metrics.lastLatency}<small>ms</small>`;
}

function renderAudit() {
  const list = $("#audit-list");
  const empty = $("#audit-empty");
  const filtered = state.audit
    .filter((entry) => state.auditFilter === "ALL" || entry.status === state.auditFilter)
    .slice()
    .reverse();

  empty.hidden = filtered.length !== 0;
  list.innerHTML = filtered.map((entry) => {
    const denied = entry.status === "DENIED";
    const statusClass = denied ? "denied" : entry.status === "ERROR" ? "error" : "ok";
    const document = entry.documentId ? ` <span class="audit-doc">${escapeHtml(entry.documentId)}</span>` : "";
    return `
      <div class="audit-row${denied ? " denied" : ""}">
        <span class="audit-time">${escapeHtml(entry.time)}</span>
        <span class="audit-user">${escapeHtml(entry.userName)}</span>
        <span class="audit-action">${escapeHtml(entry.action)}${document}</span>
        <span class="audit-status ${statusClass}">${escapeHtml(entry.status)}</span>
        <span class="audit-latency">${entry.latencyMs} ms</span>
      </div>`;
  }).join("");

  const deniedCount = state.audit.filter((entry) => entry.status === "DENIED").length;
  $("#audit-summary").textContent = state.audit.length === 0
    ? "No requests yet."
    : `${state.audit.length} requests · ${state.audit.length - deniedCount} allowed · ${deniedCount} denied`;
}

function renderRunnerNote() {
  const user = currentUser();
  if (!user) {
    $("#runner-note").textContent = "No user selected";
    return;
  }
  $("#runner-note").textContent = `Signed in as ${user.name} · ${user.role} · ${user.area}`;
}

function renderPipeline(trace = [], status = "OK", latency = 0, denied = false) {
  const active = new Set();
  trace.forEach((line) => {
    const layer = String(line).split("·")[0].trim().toUpperCase();
    if (NODES.includes(layer)) {
      active.add(layer);
    }
  });

  $$(".node").forEach((node) => {
    node.classList.toggle("active", active.has(node.dataset.node));
  });
  $$(".connector").forEach((connector, index) => {
    const current = NODES[index];
    const next = NODES[index + 1];
    connector.classList.toggle("active", active.has(current) && active.has(next));
  });

  const pipelineStatus = $("#pipeline-status");
  pipelineStatus.textContent = denied ? `DENIED · ${latency} ms` : `${status} · ${latency} ms`;
  pipelineStatus.classList.toggle("live", !denied);
  pipelineStatus.classList.toggle("denied", denied);

  const traceBox = $("#trace");
  if (trace.length === 0) {
    traceBox.innerHTML = `<p class="trace-empty">No trace recorded${state.layers.log ? "" : " — logging is disabled"}.</p>`;
    return;
  }
  traceBox.innerHTML = trace.map((line) => {
    const isDenied = /DENIED/i.test(line);
    return `<p class="${isDenied ? "denied" : ""}">${escapeHtml(line)}</p>`;
  }).join("");
}

/* ---------- document overlay ---------- */

async function openDocument(documentId) {
  const summary = state.documents.find((doc) => doc.id === documentId);
  if (!summary) {
    return;
  }

  state.currentDocument = { ...summary, content: "" };
  fillOverlaySummary(summary);
  $("#ov-content").hidden = false;
  $("#ov-editor").hidden = true;
  $("#ov-content").textContent = "Loading through the proxy chain…";
  $("#ov-read-state").textContent = "REQUESTING";
  $("#overlay").hidden = false;
  document.body.classList.add("locked");
  $(".overlay-close").focus();

  try {
    const data = await api(`/documents/${encodeURIComponent(documentId)}`);
    state.currentDocument = {
      ...summary,
      content: data.document.content,
      latencyMs: data.latencyMs,
      cacheHit: data.cacheHit,
      lazyReused: data.lazyReused
    };
    $("#ov-content").textContent = data.document.content;
    $("#ov-latency").textContent = `${data.latencyMs} ms`;
    $("#ov-read-state").textContent = data.cacheHit ? "CACHE HIT" : data.lazyReused ? "LAZY REUSE" : "LOADED";
    renderFlags(summary, data);
    updateMetricsFromResponse(data);
    renderPipeline(data.trace || [], data.cacheHit ? "CACHE HIT" : "OK", data.latencyMs, false);
  } catch (error) {
    handleRequestError(error, true, summary);
  } finally {
    await loadAudit();
  }
}

function fillOverlaySummary(summary) {
  $("#ov-class").textContent = summary.classification;
  $("#ov-title").textContent = summary.title;
  $("#ov-area").textContent = summary.area;
  $("#ov-owner").textContent = summary.ownerName;
  $("#ov-size").textContent = formatSize(summary.sizeKb);
  $("#ov-latency").textContent = "—";
  $("#ov-read-state").textContent = "—";
  renderFlags(summary, {});
}

function renderFlags(summary, data) {
  const flags = [];
  if (!state.layers.access) {
    flags.push(flag("ACCESS BYPASSED", true));
  }
  flags.push(
    flag("READ", summary.canRead !== false, true),
    flag("WRITE", summary.canWrite === true),
    flag("DELETE", summary.canDelete === true)
  );
  if (data.cacheHit) {
    flags.push(flag("CACHE HIT", true));
  }
  if (data.lazyReused) {
    flags.push(flag("LAZY REUSE", true));
  }
  $("#ov-flags").innerHTML = flags.join("");
}

function flag(label, on, neutral = false) {
  const className = on ? "on" : neutral ? "" : "off";
  return `<span class="flag ${className}">${label}</span>`;
}

function closeOverlay() {
  $("#overlay").hidden = true;
  document.body.classList.remove("locked");
  state.currentDocument = null;
  $("#ov-editor").hidden = true;
  $("#ov-content").hidden = false;
}

/* ---------- actions ---------- */

async function runRead() {
  const documentId = $("#demo-doc").value;
  if (!documentId) {
    return;
  }
  try {
    const data = await api(`/documents/${encodeURIComponent(documentId)}`);
    updateMetricsFromResponse(data);
    renderPipeline(data.trace || [], data.cacheHit ? "CACHE HIT" : "OK", data.latencyMs, false);
    showToast("Read completed", `${documentId.toUpperCase()} delivered in ${data.latencyMs} ms${data.cacheHit ? " · cache hit" : ""}`, "ok");
    setSystemStatus(true);
  } catch (error) {
    handleRequestError(error, false);
  } finally {
    await loadAudit();
  }
}

async function runWrite() {
  const documentId = $("#demo-doc").value;
  if (!documentId) {
    return;
  }
  const content = "CONTROLLED UPDATE\n\n"
    + "This record was overwritten from the control room at " + new Date().toLocaleTimeString("en-GB") + ".\n\n"
    + "The access proxy validated the request and every active cache was invalidated.";
  try {
    const data = await api(`/documents/${encodeURIComponent(documentId)}`, {
      method: "PUT",
      body: JSON.stringify({ content })
    });
    updateMetricsFromResponse(data);
    renderPipeline(data.trace || [], "WRITE OK", data.latencyMs, false);
    showToast("Write completed", `${documentId.toUpperCase()} updated in ${data.latencyMs} ms`, "ok");
    setSystemStatus(true);
    await loadDocuments();
  } catch (error) {
    handleRequestError(error, false);
  } finally {
    await loadAudit();
  }
}

async function runDelete() {
  const documentId = $("#demo-doc").value;
  if (!documentId || !window.confirm(`Delete ${documentId.toUpperCase()} from the vault?`)) {
    return;
  }
  try {
    const data = await api(`/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
    updateMetricsFromResponse(data);
    renderPipeline(data.trace || [], "DELETE OK", data.latencyMs, false);
    showToast("Record removed", `${documentId.toUpperCase()} deleted in ${data.latencyMs} ms`, "ok");
    setSystemStatus(true);
    await loadDocuments();
  } catch (error) {
    handleRequestError(error, false);
  } finally {
    await loadAudit();
  }
}

async function saveOverlay() {
  if (!state.currentDocument) {
    return;
  }
  const content = $("#ov-textarea").value;
  try {
    const data = await api(`/documents/${encodeURIComponent(state.currentDocument.id)}`, {
      method: "PUT",
      body: JSON.stringify({ content })
    });
    state.currentDocument.content = content;
    state.currentDocument.latencyMs = data.latencyMs;
    $("#ov-content").textContent = content;
    $("#ov-content").hidden = false;
    $("#ov-editor").hidden = true;
    $("#ov-latency").textContent = `${data.latencyMs} ms`;
    $("#ov-read-state").textContent = "SAVED";
    renderFlags(state.currentDocument, data);
    updateMetricsFromResponse(data);
    renderPipeline(data.trace || [], "WRITE OK", data.latencyMs, false);
    showToast("Write completed", "Content updated through the proxy chain.", "ok");
    await loadDocuments();
  } catch (error) {
    handleRequestError(error, true);
  } finally {
    await loadAudit();
  }
}

async function deleteCurrentDocument() {
  if (!state.currentDocument) {
    return;
  }
  if (!window.confirm(`Delete ${state.currentDocument.id.toUpperCase()} from the vault?`)) {
    return;
  }
  const documentId = state.currentDocument.id;
  try {
    const data = await api(`/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
    updateMetricsFromResponse(data);
    renderPipeline(data.trace || [], "DELETE OK", data.latencyMs, false);
    showToast("Record removed", `${documentId.toUpperCase()} deleted from the vault.`, "ok");
    closeOverlay();
    await loadDocuments();
  } catch (error) {
    handleRequestError(error, true);
  } finally {
    await loadAudit();
  }
}

async function resetVault() {
  try {
    await api("/reset", { method: "POST" });
    state.metrics = { cacheHits: 0, denied: 0, lastLatency: 0 };
    state.currentDocument = null;
    closeOverlay();
    await Promise.all([loadDocuments(), loadAudit()]);
    renderPipeline([], "IDLE", 0, false);
    $("#trace").innerHTML = `<p class="trace-empty">Run a request to see the proxy trace.</p>`;
    showToast("Vault reset", "Documents, cache, lazy content and audit were cleared.", "ok");
    setSystemStatus(true);
  } catch (error) {
    handleRequestError(error, false);
  }
}

function handleRequestError(error, inOverlay = false, summary = null) {
  const status = error.status || 0;
  const data = error.data || {};
  if (status === 403) {
    state.metrics.denied += 1;
    state.metrics.lastLatency = data.latencyMs ?? state.metrics.lastLatency;
    renderMetrics();
  }
  renderPipeline(data.trace || [], status ? `HTTP ${status}` : "ERROR", data.latencyMs || 0, status === 403);
  showToast(status === 403 ? "Access denied" : "Request failed", data.error || error.message, "denied");
  setSystemStatus(status !== 0 && status < 500);

  if (inOverlay && summary) {
    $("#ov-content").textContent = status === 403
      ? "ACCESS DENIED BY THE ACCESS PROXY.\n\n" + (data.error || "This user cannot perform that action.")
      : (data.error || error.message);
    $("#ov-content").hidden = false;
    $("#ov-editor").hidden = true;
    $("#ov-read-state").textContent = status === 403 ? "DENIED" : "ERROR";
    $("#ov-latency").textContent = data.latencyMs ? `${data.latencyMs} ms` : "—";
    renderFlags(summary, data);
  }
}

function updateMetricsFromResponse(data) {
  if (data && data.cacheHit) {
    state.metrics.cacheHits += 1;
  }
  if (data && typeof data.latencyMs === "number") {
    state.metrics.lastLatency = data.latencyMs;
  }
  renderMetrics();
}

/* ---------- events ---------- */

function bindStaticEvents() {
  $("#doc-grid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-doc]");
    if (card) {
      openDocument(card.dataset.doc);
    }
  });

  $("#user-grid").addEventListener("click", async (event) => {
    const card = event.target.closest("[data-user]");
    if (!card) {
      return;
    }
    state.currentUserId = card.dataset.user;
    renderUsers();
    renderRunnerNote();
    try {
      await loadDocuments();
      await loadAudit();
    } catch (error) {
      handleRequestError(error);
    }
  });

  $("#demo-doc").addEventListener("change", () => {
    $("#runner-note").textContent = `Selected ${$("#demo-doc").value.toUpperCase()} · ${currentUser() ? currentUser().name : ""}`;
  });

  $("#toggles").addEventListener("change", async (event) => {
    const row = event.target.closest("[data-layer]");
    if (!row) {
      return;
    }
    state.layers[row.dataset.layer] = event.target.checked;
    renderRunnerNote();
    try {
      await loadDocuments();
    } catch (error) {
      handleRequestError(error);
    }
  });

  $("#audit-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) {
      return;
    }
    state.auditFilter = button.dataset.filter;
    $$("#audit-filters button").forEach((item) => item.classList.toggle("active", item === button));
    renderAudit();
  });

  $("#run-read").addEventListener("click", runRead);
  $("#run-write").addEventListener("click", runWrite);
  $("#run-delete").addEventListener("click", runDelete);
  $("#reset-btn").addEventListener("click", resetVault);

  $("#ov-edit").addEventListener("click", () => {
    if (!state.currentDocument) {
      return;
    }
    $("#ov-textarea").value = state.currentDocument.content || "";
    $("#ov-content").hidden = true;
    $("#ov-editor").hidden = false;
    $("#ov-textarea").focus();
  });

  $("#ov-cancel").addEventListener("click", () => {
    $("#ov-editor").hidden = true;
    $("#ov-content").hidden = false;
  });

  $("#ov-save").addEventListener("click", saveOverlay);
  $("#ov-delete").addEventListener("click", deleteCurrentDocument);

  $$("[data-close]").forEach((element) => element.addEventListener("click", closeOverlay));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#overlay").hidden) {
      closeOverlay();
    }
    if (event.key === "Tab" && !$("#overlay").hidden) {
      trapFocus(event);
    }
  });
}

function trapFocus(event) {
  const panel = $(".overlay-panel");
  const focusable = $$("button, textarea, a[href]", panel).filter((element) => !element.hidden);
  if (focusable.length === 0) {
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ---------- chrome ---------- */

function setupReveal() {
  const elements = $$(".reveal");
  if (!("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("visible"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
  elements.forEach((element) => observer.observe(element));
}

function setupScrollSpy() {
  const sections = $$("main section[data-section]");
  const links = $$(".topnav a");
  const update = () => {
    let current = sections[0];
    sections.forEach((section) => {
      if (window.scrollY >= section.offsetTop - 130) {
        current = section;
      }
    });
    if (!current) {
      return;
    }
    $("#rail-section").textContent = current.dataset.section;
    links.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${current.id}`));
  };
  window.addEventListener("scroll", update, { passive: true });
  update();
}

function updateClock() {
  const now = new Date();
  $("#clock").textContent = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function setSystemStatus(online) {
  const status = $("#system-status");
  const dot = $(".topbar-status .dot");
  status.textContent = online ? "System online" : "System offline";
  dot.style.background = online ? "var(--sage)" : "var(--terracotta)";
  dot.style.boxShadow = online ? "0 0 9px var(--sage)" : "0 0 9px var(--terracotta)";
}

function showToast(title, message, type = "ok") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  $("#toasts").appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("out");
    window.setTimeout(() => toast.remove(), 320);
  }, 4300);
}

/* ---------- helpers ---------- */

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId);
}

function initials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function roleLabel(role) {
  if (role === "ADMIN") return "Full control";
  if (role === "EDITOR") return "Can edit own area";
  return "Read-only access";
}

function formatSize(sizeKb) {
  return `${(Number(sizeKb) / 1024).toFixed(1)} MB`;
}

function documentImage(documentId, index) {
  const numeric = Number(String(documentId).replace(/\D/g, ""));
  const image = numeric >= 1 && numeric <= 8 ? numeric : (index % 8) + 1;
  return `doc-${image}.jpg`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}
