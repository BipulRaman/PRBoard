// @ts-check
/* global acquireVsCodeApi */
"use strict";

/**
 * Sidebar repo list. Shows watched repositories only; clicking one opens the
 * PR panel filtered to that repo.
 */
(function () {
  const vscode = acquireVsCodeApi();

  /** @type {{repos: any[], prs: any[], me: string, selectedRepoIds: string[]}} */
  let state = { repos: [], prs: [], me: "", selectedRepoIds: [] };

  let filterText = "";

  const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "repos") {
      state = {
        repos: msg.repos || [],
        prs: msg.prs || [],
        me: msg.me || "",
        selectedRepoIds: Array.isArray(msg.selectedRepoIds) ? msg.selectedRepoIds : [],
      };
      render();
    }
  });

  // ---------- Search wiring ----------
  const filterInput = /** @type {HTMLInputElement} */ ($("repo-filter"));
  filterInput.addEventListener("input", () => {
    filterText = filterInput.value.toLowerCase();
    $("repo-clear").hidden = !filterText;
    render();
  });

  $("repo-clear").addEventListener("click", () => {
    filterInput.value = "";
    filterText = "";
    $("repo-clear").hidden = true;
    render();
    filterInput.focus();
  });

  /** Toggle a repo id in the current selection and notify the host. */
  function toggleSelection(id) {
    const set = new Set(state.selectedRepoIds);
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    state.selectedRepoIds = Array.from(set);
    vscode.postMessage({ type: "selectRepos", ids: state.selectedRepoIds });
    render();
  }

  /** Clear the selection (show all) and notify the host. */
  function clearSelection() {
    state.selectedRepoIds = [];
    vscode.postMessage({ type: "selectRepos", ids: [] });
    render();
  }

  /**
   * Toggle selection of every (currently visible) repo. When all are already
   * selected we clear the selection; otherwise we select them all.
   * @param {string[]} ids repo ids that the select-all controls
   */
  function toggleSelectAll(ids) {
    const set = new Set(state.selectedRepoIds);
    const allSelected = ids.length > 0 && ids.every((id) => set.has(id));
    if (allSelected) {
      for (const id of ids) {
        set.delete(id);
      }
    } else {
      for (const id of ids) {
        set.add(id);
      }
    }
    state.selectedRepoIds = Array.from(set);
    vscode.postMessage({ type: "selectRepos", ids: state.selectedRepoIds });
    render();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function countsFor(repoId) {
    let total = 0;
    let mine = 0;
    for (const p of state.prs) {
      if (p.repoId === repoId) {
        total++;
        if (p.needsMyReview) mine++;
      }
    }
    return { total, mine };
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

  function render() {
    const content = $("repo-content");

    if (!state.repos.length) {
      content.innerHTML = emptyState();
      const addBtn = document.getElementById("empty-add");
      if (addBtn) {
        addBtn.onclick = () => vscode.postMessage({ type: "promptAdd" });
      }
      return;
    }

    const selected = new Set(state.selectedRepoIds);
    const totalPrs = state.prs.length;
    const totalMine = state.prs.filter((p) => p.needsMyReview).length;

    const allIds = state.repos.map((r) => r.id);
    const selectedCount = allIds.filter((id) => selected.has(id)).length;
    const allChecked = allIds.length > 0 && selectedCount === allIds.length;
    const someChecked = selectedCount > 0 && !allChecked;

    const listHeader = `
      <div class="repo-list-header">
        <input
          type="checkbox"
          id="repo-select-all"
          class="repo-check"
          ${allChecked ? "checked" : ""}
          aria-label="Select all repositories"
          title="Select all repositories"
        />
        <span class="repo-col-title">Repository</span>
        <span class="repo-col-count" title="Pull requests">PRs</span>
      </div>`;

    const allRow = `
      <div class="repo-row all-row ${selected.size ? "" : "is-selected"}" data-all="">
        <span class="provider-dot all" aria-hidden="true"></span>
        <span class="repo-row-title">All pull requests</span>
        ${totalMine ? `<span class="repo-pill mine" title="Need my review">${totalMine}</span>` : ""}
        <span class="repo-pill">${totalPrs}</span>
      </div>`;

    const matches = state.repos.filter((repo) => {
      if (!filterText) {
        return true;
      }
      const sub =
        repo.provider === "azuredevops"
          ? `${repo.org} ${repo.project}`
          : repo.owner || "";
      return `${repo.name} ${sub}`.toLowerCase().includes(filterText);
    });

    const rows = matches.length
      ? matches
          .map((repo) => {
            const { total, mine } = countsFor(repo.id);
            const provider = repo.provider === "azuredevops" ? "azuredevops" : "github";
            const sub =
              repo.provider === "azuredevops"
                ? `${escapeHtml(repo.org)} / ${escapeHtml(repo.project)}`
                : escapeHtml(repo.owner);
            const isChecked = selected.has(repo.id);

            return `
          <div class="repo-row ${isChecked ? "is-selected" : ""}" data-select="${escapeHtml(repo.id)}" title="${escapeHtml(repo.name)} — ${sub}">
            <input type="checkbox" class="repo-check" data-check="${escapeHtml(repo.id)}" ${isChecked ? "checked" : ""} aria-label="Select ${escapeHtml(repo.name)}" />
            <span class="provider-dot ${provider}" aria-hidden="true"></span>
            <span class="repo-row-main">
              <span class="repo-row-title">${escapeHtml(repo.name)}</span>
              <span class="repo-row-sub">${sub}</span>
            </span>
            ${mine ? `<span class="repo-pill mine" title="Need my review">${mine}</span>` : ""}
            <span class="repo-pill">${total}</span>
            <button class="repo-remove" data-remove="${escapeHtml(repo.id)}" title="Stop watching">✕</button>
          </div>`;
          })
          .join("")
      : `<div class="repo-empty">No repositories match “${escapeHtml(filterText)}”.</div>`;

    content.innerHTML = listHeader + allRow + rows;

    const selectAllEl = /** @type {HTMLInputElement | null} */ (
      content.querySelector("#repo-select-all")
    );
    if (selectAllEl) {
      selectAllEl.indeterminate = someChecked;
      selectAllEl.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSelectAll(allIds);
      });
    }

    const allEl = content.querySelector("[data-all]");
    if (allEl) {
      allEl.addEventListener("click", () => clearSelection());
    }

    content.querySelectorAll(".repo-check[data-check]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSelection(el.getAttribute("data-check"));
      });
    });

    content.querySelectorAll("[data-select]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (target.closest(".repo-remove") || target.closest(".repo-check")) {
          return;
        }
        toggleSelection(el.getAttribute("data-select"));
      });
    });

    content.querySelectorAll("[data-remove]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: "removeRepo", id: el.getAttribute("data-remove") });
      });
    });
  }

  vscode.postMessage({ type: "ready" });
})();
