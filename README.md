# Tímavörður

Fjöltenant **vaktaplönunar- og stimpilklukkukerfi** fyrir veitinga-/skemmtistaði.
Byggt á Next.js 16 (App Router) + React 19 + Firebase (Auth + Firestore).
Reiknar laun sjálfvirkt skv. Efling/SA kjarasamningi (dagvinna, kvöld-, helgar-,
nætur- og stórhátíðarálag, íslenskir frídagar).

Hvert fyrirtæki (t.d. `dillon`, `pablo`) hefur sína slóð `/[slug]` og einangruð
gögn undir `tv_companies/{id}` í Firestore. Notendur skrá sig inn með Google.

## Hlutverk

| Hlutverk     | Aðgangur |
|--------------|----------|
| `superadmin` | Stofnar/sýslar með öll fyrirtæki (`/superadmin`). |
| `owner`      | Fullur aðgangur að einu fyrirtæki: stillingar, starfsfólk, vaktir. |
| `admin`      | Starfsmannaumsýsla, vaktir, launayfirlit. |
| `manager`    | Sér stöðu liðs og vaktir. |
| `staff`      | Eigin stimpilklukka, vaktir og launayfirlit. |

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
| `npm run test`   | Vitest (einingapróf, m.a. launaútreikningur). |
