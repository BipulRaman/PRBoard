// @ts-check
"use strict";

/**
 * PR Dashboard extension entry point.
 *
 * Two surfaces share one data pipeline:
 *  - "repos"  : the Activity Bar sidebar view — lists watched repositories only.
 *  - "prs"    : an editor panel — lists pull requests (optionally filtered to the
 *               repository selected in the sidebar).
 *
 * @module extension
 */

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

const store = require("./store");
const github = require("./github");
const { Poller } = require("./poller");

/** @type {DashboardController} */
let controller;
/** @type {vscode.WebviewPanel|undefined} */
let panel;

/**
 * Central controller: owns data, the poller, and the registered webviews.
 */
class DashboardController {
  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this.context = context;
    /** @type {Map<vscode.Webview, "repos"|"prs">} */
    this.webviews = new Map();
    /** Latest snapshot, replayed to webviews that connect later. */
    this.snapshot = { repos: [], prs: [], errors: [], me: "" };
    /** @type {string[]} repo ids currently selected in the sidebar (empty = all) */
    this.selectedRepoIds = [];

    this.poller = new Poller(async () => {
      const { prs } = await this.loadData(false);
      return prs;
    });
    this.poller.start();

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("prDashboard.refreshIntervalMinutes")) {
          this.poller.start();
        }
      })
    );
  }

  /**
   * Register a webview with a role.
   * @param {vscode.Webview} webview
   * @param {"repos"|"prs"} role
   */
  attach(webview, role) {
    const mediaRoot = vscode.Uri.file(path.join(this.context.extensionPath, "media"));
    webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    webview.html = getHtml(webview, this.context.extensionPath, role);
    webview.onDidReceiveMessage((msg) => this.handleMessage(msg, role));
    this.webviews.set(webview, role);
  }

  /** @param {vscode.Webview} webview */
  detach(webview) {
    this.webviews.delete(webview);
  }

  /**
   * Post a message to all webviews, or only those of a given role.
   * @param {any} message
   * @param {"repos"|"prs"=} role
   */
  post(message, role) {
    for (const [wv, r] of this.webviews) {
      if (!role || r === role) {
        wv.postMessage(message);
      }
    }
  }

  /** Send the current snapshot to webviews (optionally a single role). */
  publish(role) {
    const { repos, prs, errors, me } = this.snapshot;
    this.post({ type: "repos", repos, prs, me, selectedRepoIds: this.selectedRepoIds }, role ? (role === "repos" ? "repos" : undefined) : "repos");
    this.post(
      { type: "data", repos, prs, errors, me, selectedRepoIds: this.selectedRepoIds },
      role ? (role === "prs" ? "prs" : undefined) : "prs"
    );
  }

  /**
   * @param {any} msg
   * @param {"repos"|"prs"} role
   */
  async handleMessage(msg, role) {
    if (!msg || !msg.type) {
      return;
    }
    switch (msg.type) {
      case "ready":
        // The sidebar (repos) view is the entry point: make sure the PR panel
        // is open whenever the sidebar connects, so closing the panel tab and
        // reopening the view brings the panel back.
        if (role === "repos") {
          await this.openPanel();
        }
        // Replay last snapshot immediately, then trigger a fresh load.
        this.publish(role);
        await this.refresh();
        break;
      case "refresh":
        await this.refresh();
        break;
      case "selectRepos":
        this.selectedRepoIds = Array.isArray(msg.ids) ? msg.ids.filter(Boolean) : [];
        await this.openPanel();
        this.publish();
        break;
      case "addRepo":
        await this.addRepo(msg.value);
        break;
      case "promptAdd":
        await this.promptAddRepo();
        break;
      case "removeRepo":
        this.selectedRepoIds = this.selectedRepoIds.filter((id) => id !== msg.id);
        await store.removeRepo(this.context.globalState, msg.id);
        await this.refresh();
        break;
      case "openPR":
        if (msg.url) {
          vscode.env.openExternal(vscode.Uri.parse(msg.url));
        }
        break;
      default:
        break;
    }
  }

  /** Ensure the PR editor panel is open and focused. */
  async openPanel() {
    await vscode.commands.executeCommand("prDashboard.open");
  }

  async promptAddRepo() {
    const value = await vscode.window.showInputBox({
      title: "Add repository to watch",
      prompt: "GitHub owner/repo, or a full GitHub / Azure DevOps repository URL",
      placeHolder: "microsoft/vscode  or  https://dev.azure.com/org/project/_git/repo",
      ignoreFocusOut: true,
    });
    if (value) {
      await this.addRepo(value);
    }
  }

  /** @param {string} value */
  async addRepo(value) {
    try {
      await store.addRepo(this.context.globalState, value);
      await this.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`PR Dashboard: ${message}`);
    }
  }

  /** @param {boolean} showLoading */
  async loadData(showLoading) {
    const repos = store.getRepos(this.context.globalState);
    if (showLoading) {
      this.post({ type: "loading" });
    }
    const { me, prs, errors } = await github.fetchAll(repos);
    return { repos, me, prs, errors };
  }

  async refresh() {
    if (!this.webviews.size) {
      return;
    }
    try {
      const { repos, me, prs, errors } = await this.loadData(true);
      this.snapshot = { repos, prs, errors, me };
      // Drop any stale selections whose repos no longer exist.
      if (this.selectedRepoIds.length) {
        this.selectedRepoIds = this.selectedRepoIds.filter((id) =>
          repos.some((r) => r.id === id)
        );
      }
      this.publish();
      this.poller.checkForNewReviews(prs);
    } catch (err) {
      this.post({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  dispose() {
    this.poller.dispose();
  }
}

/**
 * Sidebar webview view provider (Activity Bar) — the repos list.
 * @implements {vscode.WebviewViewProvider}
 */
class DashboardViewProvider {
  /** @param {DashboardController} ctrl */
  constructor(ctrl) {
    this.ctrl = ctrl;
  }

  /** @param {vscode.WebviewView} webviewView */
  resolveWebviewView(webviewView) {
    this.ctrl.attach(webviewView.webview, "repos");
    webviewView.onDidChangeVisibility(() => {
      // Re-open the PR panel when the user returns to the sidebar after
      // having closed the panel tab.
      if (webviewView.visible) {
        this.ctrl.openPanel();
      }
    });
    webviewView.onDidDispose(() => this.ctrl.detach(webviewView.webview));
  }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  controller = new DashboardController(context);
  context.subscriptions.push(controller);

  const provider = new DashboardViewProvider(controller);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("prDashboard.view", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("prDashboard.open", () => openPanel(context)),
    vscode.commands.registerCommand("prDashboard.refresh", () => controller.refresh()),
    vscode.commands.registerCommand("prDashboard.addRepo", () => controller.promptAddRepo())
  );
}

/**
 * Open (or reveal) the PR editor panel.
 * @param {vscode.ExtensionContext} context
 */
function openPanel(context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Active, true);
    return;
  }
  const mediaRoot = vscode.Uri.file(path.join(context.extensionPath, "media"));
  panel = vscode.window.createWebviewPanel(
    "prDashboard",
    "Pull Requests",
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaRoot],
    }
  );
  controller.attach(panel.webview, "prs");
  panel.onDidDispose(() => {
    if (panel) {
      controller.detach(panel.webview);
    }
    panel = undefined;
  });
}

/**
 * Build the webview HTML with a CSP nonce and the right script/style for a role.
 * @param {vscode.Webview} webview
 * @param {string} extensionPath
 * @param {"repos"|"prs"} role
 * @returns {string}
 */
function getHtml(webview, extensionPath, role) {
  const mediaDir = path.join(extensionPath, "media");
  const htmlFile = role === "repos" ? "repos.html" : "dashboard.html";
  const scriptFile = role === "repos" ? "repos.js" : "main.js";
  let html = fs.readFileSync(path.join(mediaDir, htmlFile), "utf8");

  const nonce = getNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(mediaDir, scriptFile))
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(mediaDir, "style.css"))
  );

  html = html
    .replace(/{{cspSource}}/g, webview.cspSource)
    .replace(/{{nonce}}/g, nonce)
    .replace(/{{scriptUri}}/g, scriptUri.toString())
    .replace(/{{styleUri}}/g, styleUri.toString());

  return html;
}

function getNonce() {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

function deactivate() {
  if (controller) {
    controller.dispose();
  }
}

module.exports = { activate, deactivate };
