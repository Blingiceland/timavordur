#!/usr/bin/env node
// Watches Efling's SA wage-table page for PDFs that are not yet registered in
// src/lib/payroll/agreements.ts. It NEVER changes rate data: a new table is a
// review task (a person transcribes it as a new version and the fixture test
// verifies every cell). Exit code 1 = review needed; 2 = page unreadable.

import fs from "fs";
import path from "path";

const PAGE = "https://www.efling.is/sa-launatoflur";
const agreements = fs.readFileSync(path.join(process.cwd(), "src/lib/payroll/agreements.ts"), "utf8");
const known = new Set([...agreements.matchAll(/https:\/\/[^"'\s]+\.pdf/g)].map((m) => m[0]));
// Tables for periods before the first version in agreements.ts (2026-01-01) —
// deliberately not registered because no pay before 2026 is calculated here.
const HISTORICAL = [
  "https://irp.cdn-website.com/54dfb5a4/files/uploaded/Kauptaxtar_2024_feb_SA2.pdf",
  "https://irp.cdn-website.com/54dfb5a4/files/uploaded/Kauptaxtar_2025_jan_SA.pdf",
  "https://irp.cdn-website.com/54dfb5a4/files/uploaded/Kauptaxtar_2025_April_SA.pdf",
];
HISTORICAL.forEach((u) => known.add(u));

let html;
try {
  const res = await fetch(PAGE, { headers: { "User-Agent": "timavordur-rate-check" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  html = await res.text();
} catch (e) {
  console.error(`Could not read ${PAGE}: ${e.message}`);
  process.exit(2);
}

const links = [...new Set([...html.matchAll(/https?:\/\/[^"'\s<>]+\.pdf/gi)].map((m) => m[0]))];
const tables = links.filter((l) => /kauptaxt|launatafl|taxtar/i.test(l));
const fresh = tables.filter((l) => !known.has(l));

console.log(`Found ${tables.length} wage-table PDF(s) on ${PAGE}; ${known.size} registered in agreements.ts.`);
if (fresh.length === 0) {
  console.log("No unregistered tables. Nothing to review.");
  process.exit(0);
}
console.log("\nREVIEW NEEDED — tables not yet registered as a verified version:");
for (const l of fresh) console.log(`  - ${l}`);
console.log("\nSteps: docs/RATE_SOURCES.md → „Ný tafla birtist“. Do not use the figures for payroll until the fixture test passes and the version is marked verified.");
process.exit(1);
