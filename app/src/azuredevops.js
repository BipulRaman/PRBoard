// @ts-check
"use strict";

/**
 * Azure DevOps REST client. Fetches active pull requests for a watched repo
 * and normalizes them into the same shape used by the GitHub client.
 * @module azuredevops
 */

const API_VERSION = "7.1";

/**
 * Base URL for an organization, depending on host style.
 *   {org}.visualstudio.com  -> https://{org}.visualstudio.com
 *   dev.azure.com           -> https://dev.azure.com/{org}
 * @param {import("./store").WatchedRepo} repo
 * @returns {string}
 */
function orgBaseUrl(repo) {
  const host = repo.host;
  if (/\.visualstudio\.com$/i.test(host)) {
    return `https://${host}`;
  }
  // dev.azure.com
  return `https://${host}/${encodeURIComponent(/** @type {string} */ (repo.org))}`;
}

/**
 * @param {string} url
 * @param {string} token
 * @returns {Promise<any>}
 */
async function getJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "pr-dashboard-vscode",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

/**
 * Resolve the authenticated user's id + display name for an organization.
 * @param {string} orgBase
 * @param {string} token
 * @returns {Promise<{id: string, displayName: string}>}
 */
async function getConnectionUser(orgBase, token) {
  const url = `${orgBase}/_apis/connectionData?api-version=${API_VERSION}-preview`;
  const data = await getJson(url, token);
  const user = data && data.authenticatedUser ? data.authenticatedUser : {};
  return {
    id: user.id || "",
    displayName: user.providerDisplayName || user.customDisplayName || "",
  };
}

/**
 * Map Azure DevOps reviewer votes to a normalized review status.
 * Vote values: 10/5 approved, 0 none, -5 waiting for author, -10 rejected.
 * @param {any[]} reviewers
 * @returns {"approved"|"changes_requested"|"review_required"}
 */
function reviewStatusFromVotes(reviewers) {
  if (!reviewers.length) {
    return "review_required";
  }
  if (reviewers.some((r) => (r.vote || 0) < 0)) {
    return "changes_requested";
  }
  const required = reviewers.filter((r) => r.isRequired);
  const pool = required.length ? required : reviewers;
  if (pool.every((r) => (r.vote || 0) >= 5)) {
    return "approved";
  }
  return "review_required";
}

/**
 * @param {string} mergeStatus
 * @returns {string}
 */
function normalizeMergeable(mergeStatus) {
  switch (mergeStatus) {
    case "succeeded":
      return "MERGEABLE";
    case "conflicts":
    case "failure":
    case "rejectedByPolicy":
      return "CONFLICTING";
    default:
      return "UNKNOWN";
  }
}

/**
 * Fetch active pull requests for a single Azure DevOps repository.
 * @param {import("./store").WatchedRepo} repo
 * @param {string} token
 * @param {{id: string, displayName: string}} user
 * @returns {Promise<{me: string, prs: import("./github").PullRequest[]}>}
 */
async function fetchRepoPullRequests(repo, token, user) {
  const orgBase = orgBaseUrl(repo);
  const project = encodeURIComponent(/** @type {string} */ (repo.project));
  const name = encodeURIComponent(repo.name);

  const url =
    `${orgBase}/${project}/_apis/git/repositories/${name}/pullrequests` +
    `?searchCriteria.status=active&$top=50&api-version=${API_VERSION}`;

  const data = await getJson(url, token);
  const values = (data && data.value) || [];

  const prs = values.map((/** @type {any} */ pr) => {
    const reviewers = pr.reviewers || [];
    const reviewerNames = reviewers
      .map((/** @type {any} */ r) => r.displayName)
      .filter(Boolean);
    const needsMyReview =
      !!user.id &&
      reviewers.some(
        (/** @type {any} */ r) => r.id === user.id && (r.vote || 0) === 0
      );

    const webUrl = `${orgBase}/${project}/_git/${name}/pullrequest/${pr.pullRequestId}`;

    return {
      repoId: repo.id,
      number: pr.pullRequestId,
      title: pr.title,
      url: webUrl,
      author: pr.createdBy ? pr.createdBy.displayName : "unknown",
      isDraft: !!pr.isDraft,
      checksStatus: "none",
      reviewStatus: reviewStatusFromVotes(reviewers),
      mergeable: normalizeMergeable(pr.mergeStatus),
      labels: (pr.labels || []).map((/** @type {any} */ l) => l.name).filter(Boolean),
      reviewers: reviewerNames,
      needsMyReview,
      updatedAt: pr.creationDate,
    };
  });

  return { me: user.displayName, prs };
}

module.exports = { orgBaseUrl, getConnectionUser, fetchRepoPullRequests };
