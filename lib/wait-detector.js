class WaitDetector {
  constructor({ idleMs, inputPromptGraceMs, now = Date.now() }) {
    this.idleMs = idleMs;
    this.inputPromptGraceMs = inputPromptGraceMs;
    this.lastMeaningfulActivityAt = now;
    this.detectionPausedUntil = 0;
    this.waitStartedAt = null;
  }

  observeOutput({ source, chunk, now = Date.now() }) {
    const classification = classifyOutput(chunk);
    const events = [];

    if (classification.kind === "interactive_prompt") {
      if (this.waitStartedAt !== null) {
        events.push(this.endWait({ source, now }));
      }

      this.lastMeaningfulActivityAt = now;
      this.detectionPausedUntil = Math.max(
        this.detectionPausedUntil,
        now + this.inputPromptGraceMs
      );
      events.push({
        type: "wait_suppressed",
        source,
        reason: "interactive_prompt",
        suppressMs: this.inputPromptGraceMs
      });
      return events;
    }

    if (classification.kind === "low_signal") {
      return events;
    }

    if (this.waitStartedAt !== null) {
      events.push(this.endWait({ source, now }));
    }

    this.lastMeaningfulActivityAt = now;
    return events;
  }

  check({ now = Date.now() }) {
    if (now < this.detectionPausedUntil || this.waitStartedAt !== null) {
      return [];
    }

    const silentForMs = now - this.lastMeaningfulActivityAt;
    if (silentForMs < this.idleMs) {
      return [];
    }

    this.waitStartedAt = this.lastMeaningfulActivityAt;
    return [{
      type: "wait_detected",
      silentForMs,
      idleThresholdMs: this.idleMs
    }];
  }

  isWaiting() {
    return this.waitStartedAt !== null;
  }

  getWaitStartedAt() {
    return this.waitStartedAt;
  }

  finish({ source, now = Date.now() }) {
    if (this.waitStartedAt === null) {
      return [];
    }

    return [this.endWait({ source, now })];
  }

  endWait({ source, now }) {
    const event = {
      type: "wait_ended",
      source,
      durationMs: now - this.waitStartedAt
    };
    this.waitStartedAt = null;
    return event;
  }
}

function classifyOutput(chunk) {
  if (!chunk) {
    return { kind: "low_signal" };
  }

  const rawText = String(chunk);
  const text = stripAnsi(rawText);

  if (looksLikeInteractivePrompt(text)) {
    return { kind: "interactive_prompt" };
  }

  if (looksLikeLowSignalProgress(rawText, text)) {
    return { kind: "low_signal" };
  }

  return { kind: "meaningful" };
}

function looksLikeInteractivePrompt(text) {
  const tail = text.slice(-320);
  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const lastLine = lines[lines.length - 1] || "";

  if (!lastLine) {
    return false;
  }

  const lower = lastLine.toLowerCase();
  const lowerTail = tail.toLowerCase();
  const hasTrailingNewline = /[\r\n]\s*$/.test(text);

  return (
    /\b(?:continue|proceed|confirm|approve|apply|overwrite|replace|retry)\?\s*$/.test(lower) ||
    /(?:yes\/no|y\/n|\[y\/n\]|\(y\/n\))\s*$/.test(lower) ||
    /\b(?:press enter|hit enter|select an option|choose an option|esc to cancel)\b/.test(lowerTail) ||
    /(?:허용|승인|확인|계속|진행).{0,40}(?:할까요|하시겠습니까|하려면|누르세요)/.test(lastLine) ||
    (!hasTrailingNewline && /(?:^|\s)(?:[>?:])\s*$/.test(lastLine))
  );
}

function looksLikeLowSignalProgress(rawText, text) {
  const normalized = text
    .replace(/\r/g, "\n")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(" ");

  if (!normalized) {
    return true;
  }

  const lower = normalized.toLowerCase();

  if (/\b(?:error|failed|failure|exception|traceback|warning|warn|denied|unauthorized|permission)\b/.test(lower)) {
    return false;
  }

  if (looksLikeSpinnerOnly(normalized)) {
    return true;
  }

  if (rawText.includes("\r") && looksLikeStatusLine(lower)) {
    return true;
  }

  if (looksLikeProgressBar(lower)) {
    return true;
  }

  if (looksLikeAiStatus(lower)) {
    return true;
  }

  return false;
}

function looksLikeSpinnerOnly(value) {
  const compact = value.replace(/[\s.·•…]+/g, "");
  return /^[|/\\\-⠁-⣿◐-◓◴-◷○●◇◆■□▪▫▁-█]+$/.test(compact);
}

function looksLikeStatusLine(lower) {
  return /^(?:[|/\\\-⠁-⣿◐-◓◴-◷·•. ]+)?(?:thinking|working|analyzing|analysing|reading|searching|planning|running|executing|processing|generating|waiting|loading|indexing|scanning|checking|compiling|testing|building|installing|fetching|calling tool|using tool|tool use|streaming)(?:[ .·•…:|\-/\\\d%()[\]]*)$/.test(lower);
}

function looksLikeProgressBar(lower) {
  return /(?:\b\d{1,3}%\b|\[[=\-#▁-█>\s]+\]|\b\d+\/\d+\b)/.test(lower) &&
    !/[{};]/.test(lower);
}

function looksLikeAiStatus(lower) {
  return lower.length <= 120 &&
    /^(?:[|/\\\-⠁-⣿◐-◓◴-◷·•. ]+)?(?:thinking|working|analyzing|analysing|reading|searching|planning|running|executing|processing|generating|waiting|loading|indexing|scanning|checking)(?:\s+(?:files?|project|context|code|tests?|changes?|tool|response|tokens?)){0,4}(?:[ .·•…:|\-/\\\d%()[\]]*)$/.test(lower);
}

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

module.exports = {
  WaitDetector,
  classifyOutput,
  looksLikeInteractivePrompt,
  looksLikeLowSignalProgress,
  stripAnsi
};
