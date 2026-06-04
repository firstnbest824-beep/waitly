class AdStateMachine {
  constructor({
    openAd,
    closeAd,
    delayMs = 2000,
    logger = () => {}
  }) {
    if (typeof openAd !== "function") {
      throw new Error("AdStateMachine requires openAd");
    }

    if (typeof closeAd !== "function") {
      throw new Error("AdStateMachine requires closeAd");
    }

    this.openAd = openAd;
    this.closeAd = closeAd;
    this.delayMs = Math.max(0, Number.parseInt(delayMs, 10) || 0);
    this.logger = logger;
    this.open = false;
    this.pendingTimer = null;
    this.pendingReason = null;
  }

  scheduleOpen(reason) {
    if (this.open || this.pendingTimer !== null) {
      return false;
    }

    this.pendingReason = reason || "wait_detected";
    this.logger("ad_open_scheduled", {
      reason: this.pendingReason,
      delayMs: this.delayMs
    });

    this.pendingTimer = setTimeout(() => {
      const openReason = this.pendingReason;
      this.pendingTimer = null;
      this.pendingReason = null;

      if (this.open) {
        return;
      }

      const opened = this.openAd(openReason);
      this.open = opened !== false;
    }, this.delayMs);

    return true;
  }

  close(reason) {
    const closeReason = reason || "wait_ended";
    const hadPending = this.pendingTimer !== null;
    const wasOpen = this.open;

    if (!hadPending && !wasOpen) {
      return false;
    }

    this.cancelPending();
    this.logger("ad_close_requested", {
      reason: closeReason,
      hadPending,
      wasOpen
    });

    if (wasOpen) {
      this.closeAd(closeReason);
      this.open = false;
      this.logger("ad_closed", { reason: closeReason });
    }

    return true;
  }

  forceClose(reason) {
    const closeReason = reason || "force_close";
    const hadPending = this.pendingTimer !== null;
    const wasOpen = this.open;

    this.cancelPending();

    if (wasOpen) {
      this.closeAd(closeReason);
      this.open = false;
    }

    this.logger("ad_force_closed", {
      reason: closeReason,
      hadPending,
      wasOpen
    });

    return hadPending || wasOpen;
  }

  cancelPending() {
    if (this.pendingTimer === null) {
      return;
    }

    clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    this.pendingReason = null;
  }
}

module.exports = {
  AdStateMachine
};
