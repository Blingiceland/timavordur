# Tímavörður

Fjöltenant **vaktaplönunar- og stimpilklukkukerfi** fyrir veitinga-/skemmtistaði.
Byggt á Next.js 16 (App Router) + React 19 + Firebase (Auth + Firestore).
Reiknar laun eftir þjónustusamningi SA og Eflingar (hótel og veitingahús):
útgáfustýrðir, staðfestir taxtar, dagsett ráðningarkjör, álag, helgi- og
stórhátíðardagar, vikuleg yfirvinna, læst uppgjör og CSV-útflutningur. Reglur og
heimildir: `docs/RATE_SOURCES.md`. Útgáfuáætlun: `docs/RELEASE_PLAN.md`.

Hvert fyrirtæki (t.d. `dillon`, `pablo`) hefur sína slóð `/[slug]` og einangruð
gögn undir `tv_companies/{id}` í Firestore. Stjórnendur skrá sig inn með Google,
starfsfólk með notendanafni og 4 stafa PIN.

Fyrirtæki með ólíkar kennitölur geta verið í sama **rekstrarhópi** (`groupId`).
Þá gildir eftirfarandi um starfsfólk sem vinnur á fleiri en einum stað:

- Það hefur eina innskráningu (`tv_groups/{groupId}`).
- Það velur starfsstaði við nýskráningu.
- Það er spurt hvar það er þegar það stimplar sig inn.

Kjör, yfirvinna, uppgjör og útflutningur haldast aðskilin eftir fyrirtæki.
Superadmin tengir fyrirtæki í hóp á `/superadmin`, en aðeins meðan nýja
fyrirtækið hefur ekkert starfsfólk.

## Hlutverk

| Hlutverk     | Aðgangur |
|--------------|----------|
| `superadmin` | Stofnar/sýslar með öll fyrirtæki (`/superadmin`). |
| `owner`      | Fullur aðgangur að einu fyrirtæki: stillingar, starfsfólk, vaktir. |
| `admin`      | Starfsmannaumsýsla (ekki owner/admin), ráðningarkjör, launavinnsla. |
| `manager`    | Sér stöðu liðs, stýrir vaktaplani, samþykkir leiðréttingar/vaktaskipti. Sér ekki laun annarra. |
| `staff`      | Eigin stimpilklukka, vaktir, eigin tímaskýrsla og kjör. |

Aðgangur ræðst **eingöngu** af `staff.role` og `status === "approved"` innan
fyrirtækisins. `adminEmails` er boðslisti: staðfest Google-netfang á listanum
verður owner við fyrstu innskráningu; superadmin sem fjarlægir netfang lækkar
hlutverkið. PIN-aðgangar (4 tölustafir) geta mest verið `manager`, eru bundnir
fyrirtæki og ógildast við PIN-endurstillingu.

## Uppsetning (þróun)

1. **Umhverfisbreytur** — afritaðu `.env.example` í `.env.local` og fylltu út
   Firebase-gildin (sjá Firebase Console → Project settings).
2. **Þjónustureikningslykill** — sæktu service-account JSON úr Firebase Console
   (Project settings → Service accounts → Generate new private key) og vistaðu
   sem `service-account-key.json` í verkefnisrótinni. *Hvorug skráin fer í git.*
3. **Setja upp og keyra:**
   ```bash
   npm install
   npm run dev
   ```
   Opnaðu http://localhost:3000.

## Fyrsti superadmin (bootstrap)

Superadmin-hlutverkið er chicken-and-egg: notandi þarf fyrst að vera til í
Firebase Auth.

1. Skráðu þig inn með Google á `/superadmin/login` (býr til Auth-notanda).
2. Keyrðu seed-scriptið (les `service-account-key.json`):
   ```bash
   node seed-superadmin.js
   ```
   Það setur `tv_users/{uid}.role = "superadmin"`. (Netfangið er stillt efst í
   scriptinu.)
3. Eða: kallaðu `POST /api/superadmin/seed` með `{ secret, email }` þar sem
   `secret` jafngildir `SETUP_SECRET` úr `.env.local`.

## Onboarda nýtt fyrirtæki

1. Skráðu þig inn sem superadmin á `/superadmin`.
2. „+ Bæta við fyrirtæki" → nafn, slug (t.d. `dillon`), kennitala, admin-netfang.
3. Admin fer á `/[slug]`, skráir sig inn með Google — fær sjálfkrafa `owner`
   (netfangið er í `adminEmails`).
4. Starfsfólk skráir sig á `/[slug]`; owner/admin samþykkir í starfsmannaflipanum.

## Öryggi

- Öll gagnaöflun fer um API-leiðir með Firebase Admin SDK (server-side).
- `firestore.rules` hafnar **öllum** beinum client-aðgangi (admin SDK fer framhjá
  reglunum). Birtu reglur með `firebase deploy --only firestore:rules`.
- `service-account-key.json`, `.env*` og `*service-account*.json` eru git-hunsuð.

## Prófanir

| Skipun | Hvað |
|--------|------|
| `npm test` | Einingapróf: taxtareitir gegn birtum töflum, launavél, frídagar 2026/2027, öryggi, CSV, migration |
| `npm run test:integration` | API-próf á Firebase-emulator (`demo-timavordur`, engin lykilorð): tenant-einangrun, hlutverk, PIN-takmörkun, samhliða stimplanir, læsing, útflutningur, migration. Krefst Java 21 |
| `npm run check:rates` | Leitar að nýjum opinberum töflum hjá Eflingu (flaggar, breytir engu) |
| `npm run audit:deps` | `npm audit` á framleiðsluháðum pökkum (bilar á high/critical) |

Handvirk prófun í vafra með gervigögnum: ræstu emulator, keyrðu
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-timavordur node scripts/emulator-seed.mjs`
og síðan `next dev` með `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`,
`GCLOUD_PROJECT=demo-timavordur`, `NEXT_PUBLIC_AUTH_EMULATOR=127.0.0.1:9099` og
`NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-timavordur`. Í emulator-ham les
`firebase-admin` aldrei lykla og neitar öðru en `demo-`-projecti.

## Villuvöktun

Óvæntar villur í API-leiðum fara gegnum `reportApiError()`
(`src/lib/report-error.ts`): þær eru skrifaðar í console (Vercel-logga, sem
eyðast fljótt) **og** vistaðar í `tv_errors`-safnið í Firestore með leið,
skilaboðum, stack og tímastimpli. Skoða: Firebase Console → Firestore →
`tv_errors`, raðað eftir `createdAt`.

Hvert skjal ber `expiresAt` (30 dagar) svo hægt sé að setja TTL-reglu á
safnið (Google Cloud Console → Firestore → TTL, svæði `expiresAt`) — án
hennar safnast skjölin bara upp, sem er meinlaust í þessu umfangi.

## Afrit (backups)

> **Athugið:** þessi lýsing er ekki staðfesting á nýlegu, endurheimtanlegu
> afriti. Fyrir útgáfu þarf að endurheimta nýlegt afrit í einangraðan gagnagrunn
> og skrá dagsetninguna (sjá `docs/RELEASE_PLAN.md`).

Sjálfvirk Firestore-afrit eru virk á verkefninu (sett upp 3. júlí 2026 með
firebase CLI, innskráður eigandi — service-account lykillinn hefur *ekki*
réttindi í þetta):

- **Daglegt** afrit, geymt í 7 daga
- **Vikulegt** afrit (aðfaranótt mánudags), geymt í 8 vikur

```bash
firebase firestore:backups:schedules:list --project timavordur   # áætlanir
firebase firestore:backups:list --project timavordur             # tekin afrit
```

**Endurheimt** fer í *nýjan* gagnagrunn (skrifar ekki yfir þann sem er í notkun):

```bash
firebase firestore:databases:restore --project timavordur \
  --backup <backup-nafn úr listanum> --database endurheimt-YYYYMMDD
```

Skoða má afritin líka í Google Cloud Console → Firestore → Disaster Recovery.

## Skipanir

| Skipun           | Lýsing |
|------------------|--------|
| `npm run dev`    | Þróunarþjónn (Turbopack). |
| `npm run build`  | Framleiðslubygging. |
| `npm run start`  | Keyra byggingu. |
| `npm run lint`   | ESLint. |
| `npm run test`   | Vitest einingapróf. |
| `npm run test:integration` | API-próf á Firebase-emulator. |
| `npm run typecheck` | TypeScript. |
