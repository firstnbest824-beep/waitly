class WaitDetector {
  constructor({ idleMs, inputPromptGraceMs, thinkingAdDelayMs = 1500, now = Date.now() }) {
    this.idleMs = idleMs;
    this.inputPromptGraceMs = inputPromptGraceMs;
    this.thinkingAdDelayMs = thinkingAdDelayMs;
    this.lastMeaningfulActivityAt = now;
    this.detectionPausedUntil = 0;
    this.thinkingStartedAt = null;
    this.waitStartedAt = null;
    this.waitReason = null;
  }

  observeOutput({ source, chunk, now = Date.now() }) {
    const classification = classifyOutput(chunk);
    const events = [];

    if (classification.kind === "interactive_prompt") {
      if (this.waitStartedAt !== null) {
        events.push(this.endWait({ source, now }));
      }

      this.thinkingStartedAt = null;
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

    if (classification.kind === "thinking_status") {
      if (now < this.detectionPausedUntil) {
        this.detectionPausedUntil = 0;
        this.lastMeaningfulActivityAt = now;
      }

      if (this.thinkingStartedAt === null) {
        this.thinkingStartedAt = now;
      }

      if (this.waitStartedAt === null && this.thinkingAdDelayMs <= 0) {
        events.push(this.startWait({
          startedAt: this.thinkingStartedAt,
          reason: "ai_thinking_status",
          statusForMs: now - this.thinkingStartedAt
        }));
      }

      return events;
    }

    if (classification.kind === "low_signal") {
      if (now < this.detectionPausedUntil) {
        this.detectionPausedUntil = 0;
        this.lastMeaningfulActivityAt = now;
      }
      return events;
    }

    if (this.waitStartedAt !== null) {
      events.push(this.endWait({ source, now }));
    }

    this.thinkingStartedAt = null;
    this.lastMeaningfulActivityAt = now;
    return events;
  }

  check({ now = Date.now() }) {
    if (now < this.detectionPausedUntil || this.waitStartedAt !== null) {
      return [];
    }

    if (this.thinkingStartedAt !== null) {
      const statusForMs = now - this.thinkingStartedAt;
      if (statusForMs >= this.thinkingAdDelayMs) {
        return [this.startWait({
          startedAt: this.thinkingStartedAt,
          reason: "ai_thinking_status",
          statusForMs,
          thinkingAdDelayMs: this.thinkingAdDelayMs
        })];
      }
    }

    const silentForMs = now - this.lastMeaningfulActivityAt;
    if (silentForMs < this.idleMs) {
      return [];
    }

    return [this.startWait({
      startedAt: this.lastMeaningfulActivityAt,
      reason: "idle_output_silence",
      silentForMs,
      idleThresholdMs: this.idleMs
    })];
  }

  isWaiting() {
    return this.waitStartedAt !== null;
  }

  getWaitStartedAt() {
    return this.waitStartedAt;
  }

  getWaitReason() {
    return this.waitReason;
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
    this.thinkingStartedAt = null;
    this.waitReason = null;
    return event;
  }

  startWait({ startedAt, reason, ...payload }) {
    this.waitStartedAt = startedAt;
    this.waitReason = reason;
    return {
      type: "wait_detected",
      reason,
      ...payload
    };
  }
}

function classifyOutput(chunk) {
  if (!chunk) {
    return { kind: "low_signal" };
  }

  const rawText = String(chunk);
  const text = stripAnsi(rawText);

  if (looksLikeAnyThinkingStatus(text)) {
    return { kind: "thinking_status" };
  }

  if (looksLikeLowSignalProgress(rawText, text)) {
    return { kind: "low_signal" };
  }

  if (looksLikePromptMarkerOnly(text)) {
    return { kind: "low_signal" };
  }

  if (looksLikeInteractivePrompt(text)) {
    return { kind: "interactive_prompt" };
  }

  return { kind: "meaningful" };
}

function statusTextFromOutput(text) {
  return normalizeStatusText(text
    .replace(/\r/g, "\n")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(" "));
}

function looksLikeAnyThinkingStatus(text) {
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates = [statusTextFromOutput(text)];
  for (const line of lines.slice(-20)) {
    candidates.push(normalizeStatusText(line));
  }

  return candidates.some(looksLikeThinkingStatus);
}

function normalizeStatusText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\besc to cancel\b/g, "")
    .replace(/(?:^|\s)[>?:\u203a]\s*$/g, "")
    .replace(/^[^a-z\uac00-\ud7af]+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeThinkingStatus(lower) {
  if (!lower || lower.length > 120) {
    return false;
  }

  const elapsedTimeSuffix = "(?:\\s+for\\s+\\d+(?:ms|s|m|sec(?:ond)?s?|mins?|minutes?))?";
  const englishThinkingStatus = new RegExp(
    "^(?:thinking|reasoning|analyzing|analysing|planning|working|processing|generating|calling tool|using tool|tool use)" +
      "(?:\\s+(?:files?|project|context|code|tests?|changes?|tool|response|tokens?)){0,4}" +
      elapsedTimeSuffix +
      "(?:[ .:|\\-/\\\\\\d%()[\\]]*)$"
  ).test(lower);

  const koreanThinkingStatus =
    /(?:\uc0dd\uac01|\ucd94\ub860|\ubd84\uc11d|\uacc4\ud68d|\ucc98\ub9ac|\uc0dd\uc131)\s*(?:\uc911|\uc911\uc785\ub2c8\ub2e4)?[ .:|\-/\\\d%()[\]]*$/.test(lower);

  return englishThinkingStatus || koreanThinkingStatus;
}

function looksLikePromptMarkerOnly(text) {
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 0 &&
    lines.length <= 3 &&
    lines.every((line) => /^[|>?:.\-\s\u203a\u2502]+$/.test(line));
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
    /\b(?:press enter|hit enter|select an option|choose an option)\b/.test(lowerTail) ||
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
  const statusLower = lower
    .replace(/\besc to cancel\b/g, "")
    .replace(/(?:^|\s)[>?:]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/\b(?:error|failed|failure|exception|traceback|warning|warn|denied|unauthorized|permission)\b/.test(lower)) {
    return false;
  }

  if (looksLikeSpinnerOnly(normalized)) {
    return true;
  }

  if (rawText.includes("\r") && looksLikeStatusLine(statusLower)) {
    return true;
  }

  if (looksLikeProgressBar(statusLower)) {
    return true;
  }

  if (looksLikeAiStatus(statusLower)) {
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
