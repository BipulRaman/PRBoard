// @ts-nocheck
"use strict";

/**
 * Auto-refresh timer + "needs my review" notifications.
 * @module poller
 */

const vscode = require("vscode");

class Poller {
  /**
   * @param {() => Promise<import("./github").PullRequest[]>} refreshFn
   *   Performs a refresh and returns the current PR list.
   */
  constructor(refreshFn) {
    this._refreshFn = refreshFn;
    this._timer = undefined;
    /** @type {Set<string>} PR urls already flagged as needing my review */
    this._knownNeedsReview = new Set();
  }

  /** Read interval (minutes) from settings. */
  _intervalMs() {
    const minutes = vscode.workspace
      .getConfiguration("prDashboard")
      .get("refreshIntervalMinutes", 5);
    return Math.max(0, Number(minutes) || 0) * 60 * 1000;
  }

  /** (Re)start the timer based on current settings. */
  start() {
    this.stop();
    const ms = this._intervalMs();
    if (ms <= 0) {
      return; // auto-refresh disabled
    }
    this._timer = setInterval(() => {
      this._refreshFn().then(
        (prs) => this.checkForNewReviews(prs),
        () => {
          /* errors handled upstream */
        }
      );
    }, ms);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  /**
   * Compare the latest PR list against the previous snapshot and notify on
   * PRs that newly need the user's review.
   * @param {import("./github").PullRequest[]} prs
   */
  checkForNewReviews(prs) {
    const notify = vscode.workspace
      .getConfiguration("prDashboard")
      .get("notifyOnReviewRequest", true);

    const current = new Set();
    for (const pr of prs) {
      if (pr.needsMyReview) {
        current.add(pr.url);
        if (notify && !this._knownNeedsReview.has(pr.url)) {
          vscode.window
            .showInformationMessage(
              `Review requested: #${pr.number} ${pr.title}`,
              "Open"
            )
            .then((choice) => {
              if (choice === "Open") {
                vscode.env.openExternal(vscode.Uri.parse(pr.url));
              }
            });
        }
      }
    }
    this._knownNeedsReview = current;
  }

  dispose() {
    this.stop();
  }
}

module.exports = { Poller };
