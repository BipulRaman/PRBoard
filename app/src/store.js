// @ts-check
"use strict";

/**
 * Watched-repo storage backed by VS Code globalState (persisted under app data).
 * @module store
 */

const STORAGE_KEY = "watchedRepos";

/**
 * @typedef {Object} WatchedRepo
 * @property {string} id          Unique id
 * @property {"github"|"azuredevops"} provider
 * @property {string} host        e.g. "github.com", "github.mycompany.com", "microsoftit.visualstudio.com", "dev.azure.com"
 * @property {string} owner       Display owner (GitHub owner, or ADO project)
 * @property {string} name        Repository name
 * @property {string} [org]       Azure DevOps organization (ADO only)
 * @property {string} [project]   Azure DevOps project (ADO only)
 * @property {string} addedAt     ISO timestamp
 */

/**
 * Recognize and parse an Azure DevOps repository URL.
 * Supports:
 *   https://{org}.visualstudio.com/{project}/_git/{repo}
 *   https://dev.azure.com/{org}/{project}/_git/{repo}
 * @param {URL} url
 * @returns {WatchedRepo|undefined} undefined if not an ADO URL.
 */
function parseAzureDevOpsUrl(url) {
  const host = url.hostname;
  const isVsts = /\.visualstudio\.com$/i.test(host);
  const isDevAzure = /(^|\.)dev\.azure\.com$/i.test(host);
  if (!isVsts && !isDevAzure) {
    return undefined;
  }

  const parts = url.pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((p) => decodeURIComponent(p))
    .filter(Boolean);

  const gitIdx = parts.indexOf("_git");
  if (gitIdx === -1 || gitIdx + 1 >= parts.length) {
    throw new Error(`Could not find "_git/<repo>" in Azure DevOps URL: ${url.href}`);
  }

  let org;
  let project;
  if (isVsts) {
    // https://{org}.visualstudio.com/{project}/_git/{repo}
    org = host.split(".")[0];
    project = parts.slice(0, gitIdx).join("/") || undefined;
  } else {
    // https://dev.azure.com/{org}/{project}/_git/{repo}
    org = parts[0];
    project = parts.slice(1, gitIdx).join("/") || undefined;
  }

  const name = parts[gitIdx + 1].replace(/\.git$/i, "");

  // Azure DevOps allows a repo with no explicit project segment (project == repo).
  if (!project) {
    project = name;
  }

  if (!org || !project || !name) {
    throw new Error(`Could not parse org/project/repo from Azure DevOps URL: ${url.href}`);
  }

  return {
    id: `${host}/${org}/${project}/${name}`,
    provider: "azuredevops",
    host,
    owner: project,
    name,
    org,
    project,
    addedAt: new Date().toISOString(),
  };
}

/**
 * Parse user input (owner/repo, or a full GitHub/Azure DevOps URL) into a
 * normalized WatchedRepo.
 * @param {string} input
 * @returns {WatchedRepo}
 */
function parseRepoInput(input) {
  const raw = (input || "").trim();
  if (!raw) {
    throw new Error("Repository is empty.");
  }

  let host = "github.com";
  let owner;
  let name;

  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);

    const ado = parseAzureDevOpsUrl(url);
    if (ado) {
      return ado;
    }

    host = url.hostname;
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length < 2) {
      throw new Error(`Could not parse owner/repo from URL: ${raw}`);
    }
    owner = parts[0];
    name = parts[1].replace(/\.git$/i, "");
  } else {
    const parts = raw.split("/").filter(Boolean);
    if (parts.length !== 2) {
      throw new Error(`Use "owner/repo" or a full repository URL. Got: ${raw}`);
    }
    [owner, name] = parts;
  }

  if (!owner || !name) {
    throw new Error(`Could not parse owner/repo from: ${raw}`);
  }

  return {
    id: `${host}/${owner}/${name}`,
    provider: "github",
    host,
    owner,
    name,
    addedAt: new Date().toISOString(),
  };
}

/**
 * @param {import("vscode").Memento} globalState
 * @returns {WatchedRepo[]}
 */
function getRepos(globalState) {
  return globalState.get(STORAGE_KEY, []);
}

/**
 * @param {import("vscode").Memento} globalState
 * @param {string} input
 * @returns {Promise<WatchedRepo>}
 */
async function addRepo(globalState, input) {
  const repo = parseRepoInput(input);
  const repos = getRepos(globalState);
  if (repos.some((r) => r.id === repo.id)) {
    throw new Error(`Already watching ${repo.owner}/${repo.name}.`);
  }
  repos.push(repo);
  await globalState.update(STORAGE_KEY, repos);
  return repo;
}

/**
 * @param {import("vscode").Memento} globalState
 * @param {string} id
 * @returns {Promise<void>}
 */
async function removeRepo(globalState, id) {
  const repos = getRepos(globalState).filter((r) => r.id !== id);
  await globalState.update(STORAGE_KEY, repos);
}

module.exports = {
  STORAGE_KEY,
  parseRepoInput,
  parseAzureDevOpsUrl,
  getRepos,
  addRepo,
  removeRepo,
};
