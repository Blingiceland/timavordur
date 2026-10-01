# Verkefnalisti útgáfu — Tímavörður (hafið og uppfært 30.09.2026)

Staða: `[x]` lokið og prófað · `[!]` lokið í kóða, bíður ytri staðfestingar · `[ ]` opið.
Grein: `launch-hardening-2026-10`. Engu hefur verið breytt í framleiðslu og ekkert hefur verið committað.

## P0 — hindrar örugga launanotkun

- [x] **P0-1 Eitt aðgangslag.** `verifyCompanyRole` / `verifyCompanyMember` á öllum leiðum, með virkum tenant, meðlim, `status === "approved"` og hlutverki. Skjöl án status teljast ekki samþykkt. Eldri framhjáleiðir `/admin`, `/admin/staff` og `/staff/punch` eru fjarlægðar. Próf: `api.int.test.ts` „tenant isolation …“.
- [x] **P0-2 Leyfislistar og hlutverkavernd.** Stefnan `staff-policy.ts` gildir á öllum aðgerðum: aðeins owner getur úthlutað admin/owner eða breytt þeim, síðasti owner er varinn, PIN-reset og eyðing eru varin, og hver aðgerð er sér. Próf: „role management“, `security.test.ts`.
- [x] **P0-3 Eitt valdakerfi.** `staff.role` ræður. `adminEmails` er boðslisti (staðfest Google-netfang) og er samstilltur við role hjá superadmin. Próf: „owner invite …“.
- [x] **P0-4 PIN.** Viðvarandi rate limit með lokun og back-off (Firestore) eftir notanda, IP og fyrirtæki. Lotur eru bundnar fyrirtæki og ógildast með `pinVersion`. PIN-aðgangur fer mest upp í manager. Próf: „PIN login“.
- [x] **P0-5 Launareitir síaðir á þjóni.** Schedule skilar áætlun aðeins til manager+ eða á eigin vaktir. Sniðmát bera enga taxta. Próf: „wage data is filtered …“.
- [!] **P0-6 Taxtaskrá.** Jan./apr. 2026: hver reitur flokka 6 og 7 er borinn saman við PDF (25 próf). 2027 er merkt **drög**. *Bíður:* undirritun bókara, birt 2027-tafla og niðurstaða forsendumats (forsenda stóðst ekki).
- [x] **P0-7 Launavél.** Öll sex dæmi yfirferðarinnar standast, auk 12:00-marka, sumardagsins fyrsta, 55% kl. 00–05 fyrir krár, deilitölu 172, yfirvinnu 1,0385%, vinnufyrirkomulags og 40 klst. viku. Próf: `calculate.test.ts`, `icelandic-holidays.test.ts`.
- [x] **P0-8 Dagsett kjör.** `employmentTerms` eru append-only. Taxti er valinn eftir degi hvers hluta og ólíkar útgáfur sameinast aldrei. Próf: vaktir yfir 31.3/1.4 og 31.12/1.1, breyting á miðri vakt.
- [x] **P0-9 Tímaskýrslur.** Skörun er sótt, parað og klippt við [25., 25.). Opnar gamlar vaktir og tvístimplanir eru frávik. Mánaðarlaun hluta tímabils og averaged fá blocker. Próf: „pay-period boundaries“.
- [x] **P0-10 Kostnaðarlíkan.** Mótframlag er í stofni tryggingagjalds, orlof er ekki reiknað á föst mánaðarlaun og liðir sem vantar eru nefndir. Staða 2027 er „óstaðfest“.

## P1

- [x] P1-1 Ein stimplunarleið: skýr in/out, transaction, idempotency-lykill og 409 við samkeppni. Próf: samhliða og endursendar beiðnir.
- [x] P1-2 Corrections og swaps í transaction; vaktir sóttar á þjóni og gögn sannreynd aftur við samþykki. Próf: tvöfalt samþykki, gögn breytt eftir beiðni.
- [!] P1-3 IP/CIDR fyrir IPv4 og IPv6, úr traustum header (Vercel `x-forwarded-for`, [Vercel docs](https://vercel.com/docs/headers/request-headers)). Lokast ef stilling er ólæsileg. *Bíður:* prófun á raun-Wi-Fi Dillon.
- [x] P1-4 Nætursniðmát enda næsta dag; hver dagsett vakt reiknast á eigin degi og taxta.
- [x] P1-5 saveSettings: 4xx/5xx birtast og breytingar haldast. Prófað í vafra með þvinguðu 403/500 og raunverulegu 400.
- [x] P1-6 Inntaksstaðfesting: raunverulegar dagsetningar, enums, endanlegar tölur, dagabil og leyfislistar.
- [x] P1-7 Append-only aðgerðaskrá (`auditLog`); leyndarmál eru fjarlægð.
- [x] P1-8 Uppgjör draft → reviewed → locked með snapshot; annar aðili (eða owner) læsir; leiðréttingar eftir lokun eru sérfærslur.
- [!] P1-9 CSV-útflutningur (`docs/PAYROLL_EXPORT.md`). *Bíður:* innlestrarsnið bókara.
- [!] P1-10 Migration með dry-run, skýrslu, afriti og rollback; idempotent (prófað á emulator). *Bíður:* dry-run á framleiðslu og yfirferð skýrslu.
- [x] P1-11 Viðmót: áraval 2026/2027, gildisdagur, núverandi og næsti taxti, mismunur, heimild, staða, eigin forsendur, vantar-röðun, kjaraform og 2027-áætlun úr vaktaplani.
- [x] P1-12 Emulator-próf (30) og CI (`.github/workflows/ci.yml`). *CI hefur ekki keyrt á GitHub.*
- [x] P1-13 Engin sjálfgefin Firebase-tenging; Preview hafnar production-projecti; emulator krefst `demo-`.
- [x] Aukalega: Next.js 16.2.1 → 16.3.7, sem lokar mikilvægum veikleikum (RCE í Image Optimization o.fl.). `npm audit` skilar 0 high/critical; 8 miðlungs eru eftir (uuid/firebase-admin).

## Opið, utan kóða

Sjá `docs/RELEASE_PLAN.md` → „Útgáfuskilyrði“ og „Staðfesting sem enn vantar“.
