// @ts-check
/* global acquireVsCodeApi */
"use strict";

(function () {
  const vscode = acquireVsCodeApi();

  /** @type {{repos: any[], prs: any[], errors: any[], me: string}} */
  let state = { repos: [], prs: [], errors: [], me: "" };

  // Restore lightweight UI state across reloads.
  const persisted = vscode.getState() || {};
  let filterText = "";
  let activeChip = persisted.activeChip || "all";
  /** @type {Set<string>} collapsed repo ids */
  let collapsed = new Set(persisted.collapsed || []);
  /** @type {string[]} repos selected in the sidebar (empty = show all) */
  let selectedRepoIds = [];
  let hasLoadedOnce = false;

  const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

  function saveUi() {
    vscode.setState({ activeChip, collapsed: Array.from(collapsed) });
  }

  // ---------- Toolbar wiring ----------
  const filterInput = /** @type {HTMLInputElement} */ ($("filter-input"));
  filterInput.addEventListener("input", () => {
    filterText = filterInput.value.toLowerCase();
    $("clear-filter").hidden = !filterText;
    render();
  });

  $("clear-filter").addEventListener("click", () => {
    filterInput.value = "";
    filterText = "";
    $("clear-filter").hidden = true;
    render();
    filterInput.focus();
  });

  $("chips").addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const chip = target.closest(".chip");
    if (!chip) {
      return;
    }
    activeChip = chip.getAttribute("data-filter") || "all";
    document
      .querySelectorAll(".chip")
      .forEach((c) => c.classList.toggle("is-active", c === chip));
    saveUi();
    render();
  });

  // ---------- Message handling ----------
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "loading":
        if (!hasLoadedOnce) {
          showSkeletons();
        } else {
          setStatus(true);
        }
        break;
      case "error":
        setStatus(false);
        setErrors([{ message: msg.message }]);
        break;
      case "data":
        hasLoadedOnce = true;
        setStatus(false);
        state = {
          repos: msg.repos || [],
          prs: msg.prs || [],
          errors: msg.errors || [],
          me: msg.me || "",
        };
        selectedRepoIds = Array.isArray(msg.selectedRepoIds) ? msg.selectedRepoIds : [];
        render();
        break;
      default:
        break;
    }
  });

  // ---------- Helpers ----------
  function setStatus(loading) {
    const el = $("status");
    if (loading) {
      el.hidden = false;
      el.innerHTML = `<span class="spinner"></span> Refreshing…`;
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function setErrors(errors) {
    const el = $("errors");
    if (!errors || !errors.length) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    const text = errors
      .map((e) => (e.repoId ? `${shortRepo(e.repoId)}: ${e.message}` : e.message))
      .filter((m) => m && m.trim())
      .join("\n");
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = `<span aria-hidden="true">⚠</span><span class="banner-text"></span><button class="banner-dismiss" title="Dismiss">✕</button>`;
    /** @type {HTMLElement} */ (el.querySelector(".banner-text")).textContent = text;
    /** @type {HTMLElement} */ (el.querySelector(".banner-dismiss")).addEventListener(
      "click",
      () => {
        el.hidden = true;
        el.textContent = "";
      }
    );
  }

  function shortRepo(id) {
    const parts = String(id).split("/");
    return parts.slice(-1)[0] || id;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initials(name) {
    const clean = String(name || "?").trim();
    const parts = clean.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }

  // Deterministic color from a string.
  function colorFor(name) {
    let hash = 0;
    const s = String(name || "");
    for (let i = 0; i < s.length; i++) {
      hash = s.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 45%)`;
  }

  function relativeTime(iso) {
    if (!iso) {
      return "";
    }
    const then = new Date(iso).getTime();
    if (isNaN(then)) {
      return "";
    }
    const diff = Date.now() - then;
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.round(days / 30);
    return `${months}mo ago`;
  }

  function matchesChip(pr) {
    if (activeChip === "mine") return pr.needsMyReview;
    if (activeChip === "drafts") return pr.isDraft;
    return true;
  }

  function matchesFilter(pr) {
    if (!filterText) {
      return true;
    }
    const haystack = [
      pr.author,
      ...(pr.reviewers || []),
      ...(pr.labels || []),
      pr.title,
      "#" + pr.number,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(filterText);
  }

  function pill(cls, text, title) {
    return `<span class="pill ${cls}"${title ? ` title="${escapeHtml(title)}"` : ""}>${text}</span>`;
  }

  function checksPill(pr) {
    switch (pr.checksStatus) {
      case "success":
        return pill("success", "✓", "Checks passing");
      case "failure":
        return pill("failure", "✗", "Checks failing");
      case "pending":
        return pill("pending", "●", "Checks running");
      default:
        return "";
    }
  }

  function reviewPill(pr) {
    switch (pr.reviewStatus) {
      case "approved":
        return pill("approved", "approved");
      case "changes_requested":
        return pill("changes_requested", "changes");
      default:
        return "";
    }
  }

  function renderPr(pr) {
    const labels = (pr.labels || [])
      .slice(0, 3)
      .map((l) => `<span class="label-chip">${escapeHtml(l)}</span>`)
      .join("");

    const meta = [
      `<span class="pr-author" title="${escapeHtml(pr.author)}">${escapeHtml(pr.author)}</span>`,
      `<span class="pr-num">#${pr.number}</span>`,
      pr.needsMyReview ? pill("mine", "review") : "",
      checksPill(pr),
      reviewPill(pr),
      pr.isDraft ? pill("draft", "draft") : "",
      pr.mergeable === "CONFLICTING" ? pill("conflict", "conflict") : "",
      labels,
      `<span class="time">· ${relativeTime(pr.updatedAt)}</span>`,
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <div class="pr ${pr.needsMyReview ? "needs-review" : ""}" data-url="${escapeHtml(pr.url)}" title="${escapeHtml(pr.title)}">
        <div class="avatar" style="background:${colorFor(pr.author)}">${escapeHtml(initials(pr.author))}</div>
        <div class="pr-main">
          <a class="pr-title" href="#" role="link" data-open="${escapeHtml(pr.url)}" title="${escapeHtml(pr.title)}">${escapeHtml(pr.title)}</a>
          <div class="pr-meta">${meta}</div>
        </div>
      </div>`;
  }

  function showSkeletons() {
    $("content").innerHTML = Array.from({ length: 4 })
      .map(() => `<div class="skeleton"></div>`)
      .join("");
  }

  function emptyState() {
    return `
      <div class="empty">
        <div class="big-icon" aria-hidden="true">⎇</div>
        <h3>No repositories yet</h3>
        <p>Add a GitHub or Azure DevOps repository to start watching its pull requests.</p>
        <button class="btn" id="empty-add">Add repository</button>
      </div>`;
  }

  function updateChipCounts() {
    const all = state.prs.length;
    const mine = state.prs.filter((p) => p.needsMyReview).length;
    const drafts = state.prs.filter((p) => p.isDraft).length;
    $("count-all").textContent = String(all);
    $("count-mine").textContent = String(mine);
    $("count-drafts").textContent = String(drafts);
  }

  function render() {
    setErrors(state.errors);
    updateChipCounts();
    const content = $("content");

    if (!state.repos.length) {
      content.innerHTML = emptyState();
      wireEmptyAdd();
      return;
    }

    const errorByRepo = new Map((state.errors || []).map((e) => [e.repoId, e.message]));

    const selected = new Set(selectedRepoIds);
    let visibleRepos = selected.size
      ? state.repos.filter((r) => selected.has(r.id))
      : state.repos;

    // Selected repos were all removed; fall back to all.
    if (selected.size && !visibleRepos.length) {
      selectedRepoIds = [];
      selected.clear();
      visibleRepos = state.repos;
    }

    const html = visibleRepos
      .map((repo) => {
        const isCollapsed = collapsed.has(repo.id);
        const repoPrs = state.prs.filter(
          (p) => p.repoId === repo.id && matchesChip(p) && matchesFilter(p)
        );
        const err = errorByRepo.get(repo.id);

        const body = err
          ? `<div class="repo-error">⚠ ${escapeHtml(err)}</div>`
          : repoPrs.length
          ? repoPrs.map(renderPr).join("")
          : `<div class="repo-error" style="opacity:.7;color:inherit">No matching pull requests.</div>`;

        const provider = repo.provider === "azuredevops" ? "azuredevops" : "github";
        const sub =
          repo.provider === "azuredevops"
            ? `${escapeHtml(repo.org)} / ${escapeHtml(repo.project)}`
            : escapeHtml(repo.owner);

        return `
          <section class="repo-group ${isCollapsed ? "collapsed" : ""}" data-repo="${escapeHtml(repo.id)}">
            <div class="repo-header" data-toggle="${escapeHtml(repo.id)}">
              <span class="twisty">▾</span>
              <span class="provider-dot ${provider}" title="${provider}"></span>
              <span class="repo-title">${escapeHtml(repo.name)} <span class="repo-sub">${sub}</span></span>
              <span class="repo-pill">${repoPrs.length}</span>
              <button class="repo-remove" data-remove="${escapeHtml(repo.id)}" title="Stop watching">✕</button>
            </div>
            <div class="pr-list">${body}</div>
          </section>`;
      })
      .join("");

    content.innerHTML = html;
    wireRows(content);
  }

  function wireEmptyAdd() {
    const addBtn = document.getElementById("empty-add");
    if (addBtn) {
      addBtn.onclick = () => vscode.postMessage({ type: "promptAdd" });
    }
  }

  function wireRows(content) {
    content.querySelectorAll(".repo-header").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (/** @type {HTMLElement} */ (e.target).closest(".repo-remove")) {
          return;
        }
        const id = el.getAttribute("data-toggle");
        if (!id) return;
        if (collapsed.has(id)) {
          collapsed.delete(id);
        } else {
          collapsed.add(id);
        }
        saveUi();
        const group = el.closest(".repo-group");
        if (group) {
          group.classList.toggle("collapsed");
        }
      });
    });

    content.querySelectorAll(".pr-title[data-open]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = el.getAttribute("data-open");
        if (url) {
          vscode.postMessage({ type: "openPR", url });
        }
      });
    });

    content.querySelectorAll("[data-remove]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: "removeRepo", id: el.getAttribute("data-remove") });
      });
    });
  }

  // Apply restored active chip to the DOM on first paint.
  document.querySelectorAll(".chip").forEach((c) => {
    c.classList.toggle("is-active", c.getAttribute("data-filter") === activeChip);
  });

  // Tell the host we're ready to receive data.
  vscode.postMessage({ type: "ready" });
})();
