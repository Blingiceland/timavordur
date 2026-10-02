// Versioned wage tables for the SA/Efling hotel & restaurant agreement
// (kaflinn „HÓTEL- OG VEITINGAHÚS“ í kaupgjaldsskrá Eflingar).
//
// Rules for maintaining this file (see docs/RATE_SOURCES.md):
//   * Only transcribe figures from an official source listed in `sources`.
//   * A new table is added as a NEW version with its own effectiveFrom — never
//     edit the figures of a version that may already be in a locked payroll run.
//   * status "verified" means every cell has been compared with the published
//     table by the fixture test in agreements.test.ts. "draft" versions are shown
//     as previews and block period locking.
//   * scripts/check-rate-sources.mjs flags new PDFs on efling.is for review; it
//     never changes this file.

export type AgreementId = "efling_sa_hotel";
export type WageClass = 6 | 7;
export type Step = "start" | "y1" | "y3" | "y5";
export const STEPS: Step[] = ["start", "y1", "y3", "y5"];
export const WAGE_CLASSES: WageClass[] = [6, 7];

export interface SourceRef {
  title: string;
  url: string;
  locator: string; // page / clause
  checkedOn: string; // YYYY-MM-DD
}

export interface AgreementRules {
  /** gr. 1.6 — dagvinnutímakaup = mánaðarlaun / 172 */
  dayDivisor: number;
  /** gr. 1.7.1 — yfirvinna 1,0385% af mánaðarlaunum, as numerator over 1 000 000 */
  overtimePerMillion: number;
  /** gr. 3.2.1 — 33% mán.–fös. 17–24 */
  eveningPct: number;
  /** gr. 3.2.1 — 45% 00–08 alla daga og laugardaga/sunnudaga */
  nightWeekendPct: number;
  /** gr. 3.2.1 sérákvæði skemmtistaða, kráa og dansstaða — 55% 00–05 aðfararnótt lau./sun. */
  barNightPct: number;
  barNightEndHour: number;
  /** gr. 3.2.2 — helgidagar 45% */
  helgidagurPct: number;
  /** gr. 3.2.3 — stórhátíðardagar 90% */
  storhatidPct: number;
  /** gr. 1.2.4 — 15% vegna stjórnunarstarfa (samkvæmt ráðningarsamningi) */
  managementPct: number;
  /** gr. 3.1.4 / 3.2.4 / 2.2.3 — yfirvinna eftir 40 stundir á viku */
  weeklyHoursBeforeOvertime: number;
  /** gr. 2.1.1 — dagvinnutímabil 08–17 */
  dayStartHour: number;
  dayEndHour: number;
}

export interface AgreementVersion {
  agreementId: AgreementId | "custom";
  version: string;
  effectiveFrom: string; // YYYY-MM-DD inclusive, 00:00 UTC
  effectiveTo: string | null; // exclusive
  status: "verified" | "draft";
  verification: string;
  checkedOn: string;
  sources: SourceRef[];
  roundingPolicy: string;
  /** Mánaðarlaun í heilum krónum (lágmarkstaxtar). */
  monthly: Record<WageClass, Record<Step, number>>;
  rules: AgreementRules;
  notes: string[];
}

const CONTRACT_SOURCE = (locator: string): SourceRef => ({
  title: "Samningur SA og Eflingar v/veitinga-, gisti-, þjónustu- og greiðasölustaða 2024–2028",
  url: "https://samtok-atvinnulifsins.cdn.prismic.io/samtok-atvinnulifsins/aEGu3rh8WN-LVq1N_Hotelogveitinagh%C3%BAsasamningurSAogEfling2024-2028lokaskjal-vef%C3%BAtg%C3%A1fa.pdf",
  locator,
  checkedOn: "2026-09-30",
});

const RULES_2024_2028: AgreementRules = {
  dayDivisor: 172,
  overtimePerMillion: 10385,
  eveningPct: 33,
  nightWeekendPct: 45,
  barNightPct: 55,
  barNightEndHour: 5,
  helgidagurPct: 45,
  storhatidPct: 90,
  managementPct: 15,
  weeklyHoursBeforeOvertime: 40,
  dayStartHour: 8,
  dayEndHour: 17,
};

const ROUNDING =
  "Mánaðarlaun í heilum kr. Tímakaup = mánaðarlaun/172 námundað í 2 aukastafi (half-up). " +
  "Álagstaxti = tímakaup × (1 + álag) námundað í 2 aukastafi. Yfirvinna = mánaðarlaun × 1,0385% námundað í 2 aukastafi. " +
  "Staðfest gegn öllum reitum töflunnar (agreements.test.ts).";

export const AGREEMENT_VERSIONS: AgreementVersion[] = [
  {
    agreementId: "efling_sa_hotel",
    version: "2026-01",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-04-01",
    status: "verified",
    verification: "Allir reitir flokka 6 og 7 bornir saman við birta kaupgjaldsskrá (bls. 1 mánaðarlaun, bls. 6 hótel- og veitingahús).",
    checkedOn: "2026-09-30",
    sources: [
      {
        title: "Kaupgjaldsskrá SA og Eflingar frá 1. janúar 2026",
        url: "https://irp.cdn-website.com/54dfb5a4/files/uploaded/Kauptaxtar_2026_januar_SA.pdf",
        locator: "Bls. 1 (mánaðarlaun) og kafli HÓTEL- OG VEITINGAHÚS",
        checkedOn: "2026-09-30",
      },
      CONTRACT_SOURCE("gr. 1.2.1, 1.6, 1.7.1, 3.2"),
    ],
    roundingPolicy: ROUNDING,
    monthly: {
      6: { start: 481631, y1: 486447, y3: 493744, y5: 503619 },
      7: { start: 484424, y1: 489268, y3: 496607, y5: 506539 },
    },
    rules: RULES_2024_2028,
    notes: [
      "Birt tafla inniheldur kauptaxtaauka 2025 og er því hærri en upphafleg samningstafla 1.1.2026 (478.993 kr. í fl. 6 byrjun).",
    ],
  },
  {
    agreementId: "efling_sa_hotel",
    version: "2026-04",
    effectiveFrom: "2026-04-01",
    effectiveTo: "2027-01-01",
    status: "verified",
    verification: "Allir reitir flokka 6 og 7 bornir saman við birta kaupgjaldsskrá (bls. 1 mánaðarlaun, kafli hótel- og veitingahús).",
    checkedOn: "2026-09-30",
    sources: [
      {
        title: "Kaupgjaldsskrá SA og Eflingar frá 1. apríl 2026",
        url: "https://irp.cdn-website.com/54dfb5a4/files/uploaded/Kauptaxtar_2026_april_SA.pdf",
        locator: "Bls. 1 (mánaðarlaun) og kafli HÓTEL- OG VEITINGAHÚS",
        checkedOn: "2026-09-30",
      },
      {
        title: "Efling: Kauptaxtaauki tekur gildi 1. apríl (úrskurður birtur 12. mars 2026, 0,06%)",
        url: "https://www.efling.is/kauptaxtaauki-tekur-gildi-1-april",
        locator: "Frétt",
        checkedOn: "2026-09-30",
      },
      CONTRACT_SOURCE("gr. 1.2.1, 1.3.4, 1.6, 1.7.1, 3.2"),
    ],
    roundingPolicy: ROUNDING,
    monthly: {
      6: { start: 481921, y1: 486740, y3: 494041, y5: 503922 },
      7: { start: 484716, y1: 489563, y3: 496906, y5: 506844 },
    },
    rules: RULES_2024_2028,
    notes: [
      "Forsendur samnings stóðust ekki í september 2026. Viðbragð forsendunefndar (eða uppsögn fyrir 8.10.2026) getur haft áhrif á kjör frá nóvember 2026 — athuga þarf niðurstöðu áður en nóvember–desember eru gerð upp.",
    ],
  },
  {
    agreementId: "efling_sa_hotel",
    version: "2027-01-draft",
    effectiveFrom: "2027-01-01",
    effectiveTo: null,
    status: "draft",
    verification:
      "DRÖG. Tölur úr upphaflegri samningstöflu 1.1.2027 (gr. 1.2.1). Ekki staðfest sem greiðslugrunnur.",
    checkedOn: "2026-09-30",
    sources: [CONTRACT_SOURCE("gr. 1.2.1 (dálkur 1.1.2027), 1.3, 17. kafli")],
    roundingPolicy: ROUNDING,
    monthly: {
      6: { start: 503020, y1: 508050, y3: 515671, y5: 525984 },
      7: { start: 505938, y1: 510997, y3: 518662, y5: 529035 },
    },
    rules: RULES_2024_2028,
    notes: [
      "Upphafleg samningstafla inniheldur ekki kauptaxtaauka 2025 og 2026; birt kaupgjaldsskrá 2027 gæti því orðið hærri.",
      "Forsendumat september 2026 (17. kafli): verðlagsforsenda STÓÐST EKKI (ársverðbólga 5,6%, sex mánaða 6%; Viðskiptablaðið 2.9.2026). Forsendunefnd semur um viðbragð; náist það ekki má segja samningi upp fyrir 8.10.2026 og fellur hann þá úr gildi 31.10.2026. Niðurstaða óþekkt 30.9.2026.",
      "Kauptaxtaauki mars 2027 (gr. 1.3.4) er óþekktur.",
      "Ekki má loka uppgjöri á þessari útgáfu fyrr en birt kaupgjaldsskrá hefur verið skráð sem ný staðfest útgáfa.",
    ],
  },
];

/**
 * Stand-in "version" for personal terms outside a supported agreement. It only
 * supplies the time windows and day divisor; there is no minimum table.
 */
export const CUSTOM_VERSION: AgreementVersion = {
  agreementId: "custom",
  version: "custom",
  effectiveFrom: "1900-01-01",
  effectiveTo: null,
  status: "verified",
  verification: "Persónuleg kjör utan studds kjarasamnings — álög skv. skráningu atvinnurekanda, enginn lágmarkssamanburður.",
  checkedOn: "2026-10-02",
  sources: [],
  roundingPolicy: ROUNDING,
  monthly: {
    6: { start: 0, y1: 0, y3: 0, y5: 0 },
    7: { start: 0, y1: 0, y3: 0, y5: 0 },
  },
  rules: RULES_2024_2028,
  notes: [],
};

export type VersionLookup =
  | { ok: true; version: AgreementVersion }
  | { ok: false; reason: "no_rate_version" };

/** The agreement version in force on a calendar date (YYYY-MM-DD, UTC). */
export function versionForDate(
  date: string,
  versions: AgreementVersion[] = AGREEMENT_VERSIONS,
  agreementId: AgreementId = "efling_sa_hotel"
): VersionLookup {
  const v = versions.find(
    (x) => x.agreementId === agreementId && x.effectiveFrom <= date && (x.effectiveTo === null || date < x.effectiveTo)
  );
  return v ? { ok: true, version: v } : { ok: false, reason: "no_rate_version" };
}

/** Instants (ms) at which a version changes inside [fromMs, toMs). */
export function versionBoundaries(fromMs: number, toMs: number, versions: AgreementVersion[] = AGREEMENT_VERSIONS): number[] {
  const out: number[] = [];
  for (const v of versions) {
    for (const d of [v.effectiveFrom, v.effectiveTo]) {
      if (!d) continue;
      const t = Date.parse(`${d}T00:00:00Z`);
      if (t > fromMs && t < toMs) out.push(t);
    }
  }
  return out;
}
