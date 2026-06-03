// @ts-check
"use strict";

/**
 * GitHub GraphQL client (works for github.com and GitHub Enterprise Server).
 * @module github
 */

const { getToken } = require("./auth");
const azuredevops = require("./azuredevops");

/**
 * Resolve the GraphQL endpoint for a host.
 * @param {string} host
 * @returns {string}
 */
function graphqlEndpoint(host) {
  return host === "github.com"
    ? "https://api.github.com/graphql"
    : `https://${host}/api/graphql`;
}

const PR_QUERY = `
query($owner: String!, $name: String!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        url
        isDraft
        mergeable
        updatedAt
        author { login }
        reviewDecision
        labels(first: 10) { nodes { name } }
        reviewRequests(first: 20) {
          nodes { requestedReviewer { __typename ... on User { login } } }
        }
        commits(last: 1) {
          nodes { commit { statusCheckRollup { state } } }
        }
      }
    }
  }
}`;

/**
 * Normalize a raw rollup check state into the UI's vocabulary.
 * @param {string|undefined|null} state
 * @returns {"success"|"failure"|"pending"|"none"}
 */
function normalizeChecks(state) {
  switch (state) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return "none";
  }
}

/**
 * @param {string|undefined|null} decision
 * @returns {"approved"|"changes_requested"|"review_required"}
 */
function normalizeReview(decision) {
  switch (decision) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes_requested";
    default:
      return "review_required";
  }
}

/**
 * Execute a GraphQL request against a host.
 * @param {string} host
 * @param {string} token
 * @param {string} query
 * @param {Record<string, unknown>} variables
 * @returns {Promise<any>}
 */
async function graphql(host, token, query, variables) {
  const res = await fetch(graphqlEndpoint(host), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "pr-dashboard-vscode",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${host}`);
  }

  const json = await res.json();
  if (json.errors && json.errors.length) {
    throw new Error(json.errors.map((/** @type {any} */ e) => e.message).join("; "));
  }
  return json.data;
}

/**
 * @typedef {Object} PullRequest
 * @property {string} repoId
 * @property {number} number
 * @property {string} title
 * @property {string} url
 * @property {string} author
 * @property {boolean} isDraft
 * @property {"success"|"failure"|"pending"|"none"} checksStatus
 * @property {"approved"|"changes_requested"|"review_required"} reviewStatus
 * @property {string} mergeable
 * @property {string[]} labels
 * @property {string[]} reviewers
 * @property {boolean} needsMyReview
 * @property {string} updatedAt
 */

/**
 * Fetch open PRs for a single watched repo.
 * @param {import("./store").WatchedRepo} repo
 * @param {string} token
 * @returns {Promise<{me: string, prs: PullRequest[]}>}
 */
async function fetchReposPullRequests(repo, token) {
  const data = await graphql(repo.host, token, PR_QUERY, {
    owner: repo.owner,
    name: repo.name,
  });

  const me = data?.viewer?.login || "";
  const nodes = data?.repository?.pullRequests?.nodes || [];

  const prs = nodes.map((/** @type {any} */ pr) => {
    const reviewers = (pr.reviewRequests?.nodes || [])
      .map((/** @type {any} */ n) => n.requestedReviewer && n.requestedReviewer.login)
      .filter(Boolean);
    const rollup = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
    return {
      repoId: repo.id,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author: pr.author ? pr.author.login : "ghost",
      isDraft: !!pr.isDraft,
      checksStatus: normalizeChecks(rollup),
      reviewStatus: normalizeReview(pr.reviewDecision),
      mergeable: pr.mergeable || "UNKNOWN",
      labels: (pr.labels?.nodes || []).map((/** @type {any} */ l) => l.name),
      reviewers,
      needsMyReview: !!me && reviewers.includes(me),
      updatedAt: pr.updatedAt,
    };
  });

  return { me, prs };
}

/**
 * Fetch PRs for all watched repos. Per-repo errors are captured and returned
 * so one failing repo does not break the whole dashboard.
 * @param {import("./store").WatchedRepo[]} repos
 * @returns {Promise<{me: string, prs: PullRequest[], errors: {repoId: string, message: string}[]}>}
 */
async function fetchAll(repos) {
  /** @type {PullRequest[]} */
  const prs = [];
  /** @type {{repoId: string, message: string}[]} */
  const errors = [];
  let me = "";

  // Group repos by host so we request a token per host once.
  /** @type {Map<string, string>} */
  const tokensByHost = new Map();
  // Cache Azure DevOps connection user per org base url.
  /** @type {Map<string, {id: string, displayName: string}>} */
  const adoUserByOrg = new Map();

  for (const repo of repos) {
    try {
      let token = tokensByHost.get(repo.host);
      if (!token) {
        token = await getToken(repo.host, true);
        if (!token) {
          throw new Error(`Not signed in to ${repo.host}.`);
        }
        tokensByHost.set(repo.host, token);
      }

      let result;
      if (repo.provider === "azuredevops") {
        const orgBase = azuredevops.orgBaseUrl(repo);
        let user = adoUserByOrg.get(orgBase);
        if (!user) {
          user = await azuredevops.getConnectionUser(orgBase, token);
          adoUserByOrg.set(orgBase, user);
        }
        result = await azuredevops.fetchRepoPullRequests(repo, token, user);
      } else {
        result = await fetchReposPullRequests(repo, token);
      }

      if (result.me) {
        me = result.me;
      }
      prs.push(...result.prs);
    } catch (err) {
      errors.push({
        repoId: repo.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { me, prs, errors };
}

module.exports = { graphqlEndpoint, fetchAll, fetchReposPullRequests };
