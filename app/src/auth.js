// @ts-check
"use strict";

/**
 * Authentication helper. Resolves an access token for a given host using
 * VS Code's built-in authentication providers (OAuth):
 *  - GitHub.com           -> "github"
 *  - GitHub Enterprise    -> "github-enterprise"
 *  - Azure DevOps         -> "microsoft" (Azure DevOps resource scope)
 * @module auth
 */

const vscode = require("vscode");

const SCOPES = ["repo", "read:org"];

// Azure DevOps resource id; the ".default" scope yields an AAD token usable
// against the Azure DevOps REST APIs via the built-in "microsoft" provider.
const AZURE_DEVOPS_SCOPES = ["499b84ac-1321-427f-aa17-267ca6975798/.default"];

/**
 * Pick the authentication provider id for a host.
 * @param {string} host
 * @returns {string}
 */
function providerForHost(host) {
  if (/\.visualstudio\.com$/i.test(host) || /(^|\.)dev\.azure\.com$/i.test(host)) {
    return "microsoft";
  }
  return host === "github.com" ? "github" : "github-enterprise";
}

/**
 * Get an OAuth access token for the given host.
 * @param {string} host
 * @param {boolean} createIfNone Whether to trigger the sign-in flow if needed.
 * @returns {Promise<string|undefined>} The access token, or undefined if unavailable.
 */
async function getToken(host, createIfNone) {
  const providerId = providerForHost(host);
  const scopes = providerId === "microsoft" ? AZURE_DEVOPS_SCOPES : SCOPES;
  try {
    const session = await vscode.authentication.getSession(providerId, scopes, {
      createIfNone,
    });
    return session ? session.accessToken : undefined;
  } catch (err) {
    // getSession throws if the provider is unavailable or the user cancels.
    if (createIfNone) {
      throw new Error(
        `Sign-in to ${providerId} failed or was cancelled: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return undefined;
  }
}

module.exports = { SCOPES, AZURE_DEVOPS_SCOPES, providerForHost, getToken };
