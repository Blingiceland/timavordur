# Útgáfu- og flutningsáætlun — grein `launch-hardening-2026-10`

Ekkert af þessu hefur verið gert gegn framleiðslu. Allar prófanir voru keyrðar staðbundið á Firebase-emulator (`demo-timavordur`) með gervigögnum.

## Útgáfuskilyrði

| # | Skilyrði | Staða 30.9.2026 |
| --- | --- | --- |
| 1 | Engin opin P0-villa í kóða | Lokið í kóða og prófað, sjá `LAUNCH_TASKS.md` |
| 2 | Græn próf: lint, typecheck, unit, emulator-samþætting, build | Stenst staðbundið: 124 unit, 30 samþættingar, build á Next 16.3.7. CI-keyrsla á GitHub hefur **ekki** farið fram |
| 3 | Staðfest virk tafla | Jan./apr. 2026: hver reitur borinn saman við PDF. **Bókari/ábyrgðaraðili þarf að undirrita.** 2027 eru drög |
| 4 | Örugg flutningsleið | Migration með dry-run, afriti og rollback, prófuð á emulator. **Dry-run á framleiðslu ekki keyrt** |
| 5 | Prófað afrit og endurheimt | **Ekki staðfest.** README lýsir áætlunum; nýlegt afrit hefur ekki verið endurheimt í einangraðan gagnagrunn |
| 6 | Heilt launatímabil borið saman við bókara | **Ekki gert** |
| 7 | Forsendumat SA/Eflingar sept. 2026 | Forsenda stóðst ekki og viðbragð er óþekkt. Fylgjast þarf með fyrir 8.10.2026 |

## Staða 1.10.2026

- Framleiðslugögn voru hreinsuð með `scripts/reset-staff-data.mjs`. Afrit (40 skjöl, 10 Auth-notendur) er utan geymslunnar: `C:\Users\jonbs\timavordur-backups\wipe-2026-10-01.json`. Eftir eru fyrirtækið Dillon og superadmin `jon@dillon.is`.
- Ekkert starfsfólk er eftir, svo migration 2026-10 breytir engu nema `groupId`. Nýr kóði gefur sér `groupId = id` þar til fyrirtæki eru tengd.
- Næst:
  1. útgáfa kóða;
  2. Pablo stofnað á `/superadmin` með „Sameiginleg innskráning með Dillon“;
  3. Wi-Fi/IP stillt fyrir hvorn stað;
  4. nýskráning starfsfólks.

## Röð aðgerða við útgáfu

1. **Afrit.** Taktu handvirkt Firestore-afrit og endurheimtu það í nýjan gagnagrunn (`firebase firestore:databases:restore … --database endurheimt-YYYYMMDD`). Skráðu dagsetninguna; hún er skilyrði fyrir `--apply`.
2. **Vercel-umhverfi.**
   - Production: `FIREBASE_SERVICE_ACCOUNT_KEY` er óbreytt.
   - Preview: sérstakan lykil að **öðru** Firebase-projecti. Kóðinn neitar að keyra Preview á `timavordur`.
   - Fjarlægðu `SETUP_SECRET` ef superadmin er þegar til.
   - `CLIENT_IP_SOURCE` þarf ekki á Vercel (sjálfgefið `vercel`).
3. **Reglur, index og TTL.** Keyrðu `firebase deploy --only firestore:rules,firestore:indexes --project timavordur`. TTL fylgir á `tv_errors`, `tv_ratelimits` og `punchIdempotency`.
4. **Dry-run.** Keyrðu `node scripts/migrate-2026-10.mjs --project timavordur --report report.json` og farðu yfir skýrsluna:
   - hverjir fá `status` (approved eða pending);
   - hvaða PIN-aðgangar missa admin/owner (verða manager);
   - tvítekin notendanöfn;
   - `placementReview`: launaflokkur, eldri taxti og hvað vantar.
5. **Beiting og útgáfa kóða í sama glugga**, utan opnunartíma:
   `node scripts/migrate-2026-10.mjs --project timavordur --apply --backup backup.json --report report.json --confirm-backup-restored-on YYYY-MM-DD`,
   síðan kynning (promote) á útgáfunni. Nýr kóði hafnar skjölum án `status`, svo migration verður að keyra fyrst.
6. **Staðfesting.** Keyrðu dry-run aftur; það á að skila `0 operation(s)`. Geymdu `backup.json` á öruggum stað; það inniheldur aðeins breytta reiti og auðkenni.
7. **Eftir útgáfu.**
   - PIN-starfsfólk skráir sig inn aftur, því eldri lotur án tenant-bindingar eru ógildar.
   - Owner skráir ráðningarkjör allra á `/{slug}/rates`: flokk, vinnufyrirkomulag, starfshlutfall, upphafsdag, fæðingardag og persónuleg kjör.
   - Farðu yfir `personalDayRate` sem migration varðveitti. Það getur verið úrelt sniðmát frekar en raunveruleg yfirborgun.
8. **Afturköllun (ef þarf).** Endurvektu fyrri útgáfu í Vercel og keyrðu `node scripts/migrate-2026-10.mjs --project timavordur --rollback backup.json`. Nýjar stimplanir og kjör sem urðu til eftir útgáfu haldast.

## Neyðarleið ef stimpilklukka er niðri

Starfsfólk skráir inn/út-tíma á pappír eða í skilaboðum til vaktstjóra. Síðan er sent inn sem leiðrétting í kerfinu, og vaktstjóri eða eigandi samþykkir. Viðmótið sýnir aldrei „stimplað“ nema þjónninn hafi staðfest. Ef netvilla verður er sami idempotency-lykill notaður í næstu tilraun, svo tvísmellur eða endursending myndar ekki aðra stimplun.

## Staðfesting sem enn vantar (ábyrgðaraðili)

- Undirritun bókara á töflum 2026 og á launaflokki, vinnufyrirkomulagi og starfshlutfalli hvers starfsmanns.
- Innlestrarsnið bókarans. CSV er almennt, sjá `docs/PAYROLL_EXPORT.md`.
- Launatímabil 25.–24. á móti 1.–31. / 20.–19. í kjarasamningi (gr. 1.11.1).
- Túlkanir merktar „túlkun“ í `docs/RATE_SOURCES.md`: hæsta álag gildir, yfirvinna aldrei undir álagi, vika hefst á mánudegi, námundun stjórnunarálags.
- Firebase: auth-providers, authorized domains, heimildir þjónustureiknings, TTL-stefnur virkar, kostnaðarmörk og tilkynningar um villur.
- Persónuvernd: fræðsla til starfsfólks, vinnslusamningur og geymslutími. Afritsskrá migration inniheldur persónuupplýsingar.
- Eftirstandandi `npm audit`: 8 miðlungs-athugasemdir (`uuid` í gegnum `firebase-admin`). Lagfæring krefst stórútgáfu firebase-admin; metið við næstu uppfærslu.
