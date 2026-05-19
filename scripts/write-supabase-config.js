#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "public", "supabase-config.js");

const config = {
  url: firstEnv([
    "SUPABASE_URL",
    "SUPABASE_DATABASE_URL",
    "PUBLIC_SUPABASE_URL",
    "VITE_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL"
  ]),
  anonKey: firstEnv([
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "PUBLIC_SUPABASE_ANON_KEY",
    "PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  ])
};

fs.writeFileSync(
  outputPath,
  `window.WAITLY_SUPABASE = ${JSON.stringify(config, null, 2)};\n`,
  "utf8"
);

if (!config.url || !config.anonKey) {
  console.warn("Supabase config written with blank values. Set Supabase URL and anon/publishable key environment variables to enable Google login.");
}

function firstEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}
