const fs = require("node:fs");
const path = require("node:path");

class EventLog {
  constructor(filePath) {
    this.filePath = filePath;
  }

  write(type, payload = {}) {
    const record = {
      ts: new Date().toISOString(),
      type,
      ...stripUndefined(payload)
    };

    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`);
    } catch (error) {
      console.error(`[waitly] Could not write event log: ${error.message}`);
    }
  }
}

function stripUndefined(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

module.exports = {
  EventLog
};
