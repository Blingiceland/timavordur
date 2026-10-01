# Tímavörður fyrir útgáfu

Yfirferð 30. september 2026. Niðurstaða: verkefnið byggist og hefur nothæfan grunn, en ég mæli ekki með að nota núverandi útgáfu sem endanlegan grunn launagreiðslna. Fyrst þarf að leiðrétta launareglur, verja launasögu og loka aðgangsvillum. Takmörkuð samhliða prufukeyrsla kemur næst, eftir öryggislagfæringar.

Skoðaður var staðbundinn Next.js/Firebase-kóði, API-leiðir, gagnalíkan, viðmótskóði, próf, README og ROADMAP. Heimildir SA, Eflingar og Skattsins voru bornar saman við útreikninga. Framleiðslugagnagrunnur, raunverulegir ráðningarsamningar, afrit í skýi, DNS og innskráð notendaflæði í vafra voru ekki sannreynd. Það sem hér segir um gloppur í aðgangi er niðurstaða kóðaskoðunar, ekki árásarprófun á lifandi þjónustu. Engum rekstrargögnum eða forritskóða var breytt.

## Prófunarniðurstöður

| Athugun | Niðurstaða |
| --- | --- |
| `npm run test` | 18 próf í tveimur skrám standast |
| `npm run lint` | Engar villur; tvær viðvaranir um `img` |
| `npm run build` | Stenst, þar með talið TypeScript |
| Sjálfstæð launadæmi | Sex frávik frá viðmiðum hér fyrir neðan |
| Stofn tryggingagjalds | Eitt staðfest reiknifrávik |
| `npm audit --omit=dev --json` | Ekki lokið; npm audit-vefþjónustan svaraði með villu í þessu umhverfi |

Græn próf eru ekki sönnun um rétt kjarasamningsuppgjör. `wage-calculator.test.ts` og `icelandic-holidays.test.ts` staðfesta meðal annars núverandi ranga hegðun. Ný próf þurfa að sækja viðmið í sjálfstæðar heimildir.

## Launataxtar núna

Í `src/lib/wage-categories.ts:1` eru sex handskráðir taxtar, merkt óstaðfest sniðmát, miðaðir við eldri janúartöflu og deilitöluna 173,33. Eftirfarandi eru birtir dagvinnutaxtar úr kaflanum HÓTEL- OG VEITINGAHÚS á blaðsíðu 6 í [apríltöflu Eflingar 2026](https://irp.cdn-website.com/54dfb5a4/files/uploaded/Kauptaxtar_2026_april_SA.pdf). Þetta er nýjasta taflan á [yfirlitssíðu Eflingar](https://www.efling.is/sa-launatoflur) við skoðun.

| Flokkur | Þrep | Mánaðargrunnur ISK | Dagvinna ISK/klst | Sniðmát í kóða |
| --- | --- | ---: | ---: | ---: |
| 6 | Byrjun | 481.921 | 2.801,87 | 2.764 |
| 6 | 1 ár | 486.740 | 2.829,88 | 2.791 |
| 6 | 3 ár | 494.041 | 2.872,33 | 2.833 |
| 6 | 5 ár | 503.922 | 2.929,78 | 2.890 |
| 7 | Byrjun | 484.716 | 2.818,12 | 2.780 |
| 7 | 1 ár | 489.563 | 2.846,30 | Vantar |
| 7 | 3 ár | 496.906 | 2.888,99 | Vantar |
| 7 | 5 ár | 506.844 | 2.946,77 | 2.907 |

Taflan sýnir viðmið, ekki staðfest laun einstaklinga hjá Dillon eða Pablo. Fyrirtæki geta þegar hafa yfirskrifað sniðmátið. Finna þarf slík frávik með lesaðgerð og færa þau yfir í nýtt kerfi án þess að lækka betri kjör.

[Janúartaflan 2026](https://irp.cdn-website.com/54dfb5a4/files/uploaded/Kauptaxtar_2026_januar_SA.pdf) sýnir þegar 2.800,18 kr. fyrir byrjunarþrep 6 í þessum starfshópi. Þar af leiðandi dugir ekki að bæta eingöngu aprílhækkun við núverandi sniðmát. [Úrskurður birtur 12. mars 2026](https://www.efling.is/kauptaxtaauki-tekur-gildi-1-april) staðfestir 0,06% kauptaxtaauka frá 1. apríl. Eldri samningstafla og síðar útgefin kaupgjaldsskrá eru því ekki sami gagnagrunnur.

## Reglur sem þarf að leiðrétta eða útfæra

Viðmið úr [þjónustusamningi SA og Eflingar 2024–2028](https://www.efling.is/kjarasamningur/hotel-og-veitingahus), staðfest einnig í [PDF hjá SA](https://samtok-atvinnulifsins.cdn.prismic.io/samtok-atvinnulifsins/aEGu3rh8WN-LVq1N_Hotelogveitinagh%C3%BAsasamningurSAogEfling2024-2028lokaskjal-vef%C3%BAtg%C3%A1fa.pdf):

| Atriði | Viðmið og grein |
| --- | --- |
| Dagvinnudeilitala | 172; 1.6 |
| Nýársdagur | 90% vaktaálag; 3.2.3 |
| 1. maí og sumardagurinn fyrsti | 45% vaktaálag; 3.2.2 |
| Aðfangadagur og gamlársdagur | 90% frá 12:00; 3.2.3 |
| Krár og skemmtistaðir | 55% aðfararnótt laugardags/sunnudags 00:00–05:00; 3.2.1 |
| Starfsaldur | 1/3 ár í starfsgrein, 5 hjá atvinnurekanda; 22 ára aldur gefur minnst eins árs þrep; 1.2/1.5 |
| Stjórnun | 15% samkvæmt starfssviði; 1.2.4 |
| Yfirvinna | 1,0385% mánaðargrunns; skilgreining vinnufyrirkomulags skiptir máli; 1.7, 2.2, 3.2.4 |
| Orlof | Auk 10,17/12,07% þarf 10,64/13,04% og gildistöku réttinda; 6.1 |
| Önnur réttindi | Útkall, hvíld, neysluhlé, vetrarfrí og uppbætur; 1.4, 1.8, 2.4, 3.3–3.4 |

Kóðinn hefur aðeins eina almenna álagsleið fyrir `efling_sa`. `employmentType` ræður ekki reiknireglum. Ekki má jafna dagvinnu, vaktavinnu og tilfallandi vinnu saman. Nákvæm afmörkun þarf að fylgja ráðningu. `custom` má ekki fela óstaðfestar forsendur.

Eftirfarandi keyrslur notuðu 2.000 kr. prófunartaxta og reglulega vaktavinnu. Fjárhæðir eru eigin samanburðarútreikningar, ekki raunlaun starfsfólks:

| Vakt UTC | Kóðinn skilar | Viðmið | Frávik |
| --- | ---: | ---: | ---: |
| 1.1.2026 12–16 | 11.600 | 15.200 | −3.600 |
| 1.5.2026 12–16 | 15.200 | 11.600 | +3.600 |
| 24.12.2026 12–16 | 8.000 | 15.200 | −7.200 |
| 29.3.2026 06–08, bar | 6.200 | 5.800 | +400 |
| 23.4.2026 12–16 | 8.000 | 11.600 | −3.600 |
| 24.12.2026 06–10 | 11.600 | 9.800 | +1.800 |

Síðasta dæmið sýnir sjálfstæða reiknivillu: `getNextBoundary()` hoppar beint að stórhátíðarmörkum og sleppir venjulegum 08:00-mörkum fyrr um daginn. Ekki nægir að breyta föstum klukkutíma í hátíðaskránni.

`calculateEmployerCost()` leggur tryggingagjald á laun og orlof en sleppir mótframlagi vinnuveitanda í lífeyri úr stofninum. [Skatturinn telur almennt mótframlag til stofns](https://www.skatturinn.is/atvinnurekstur/framtal-og-alagning/launamidar-og-launaframtal/). Í prófun með 100.000 kr. brúttó og sjálfgefnum hlutföllum reiknast gjaldið 6.996 kr. en 7.800 kr. þegar þessum lið er bætt við. [Almenna hlutfallið 2026 er 6,35%](https://www.skatturinn.is/atvinnurekstur/skattar-og-gjold/tryggingagjald). Aðrir sjóðir og uppbætur eru ekki í núverandi kostnaðarlíkani; því er heitið „heildarkostnaður“ of víðtækt.

## Sjálfvirkar hækkanir og 2027

Samningurinn tilgreinir janúarhækkun 2027 og sérstakar taxtatöflur. Almenn launahækkun er 3,5%, minnst 23.750 kr. á mánaðargrunn; þetta er ekki almenn margföldunarregla fyrir alla taxta. Aprílákvæði getur síðar breytt lágmarkstöxtum. Sjá greinar 1.3 og 17 í samningsheimildunum að ofan.

Ég fann ekki nýja, sjálfstæða 2027-kaupgjaldsskrá sem staðfestir endanlega yfirfærslu allra síðari taxtaauka. Tölur úr upphaflega 2024-samningnum eiga því ekki að vera merktar endanlegir 2027-taxtar án frekari staðfestingar. Einnig þarf að athuga niðurstöðu forsendumats haustsins 2026 fyrir virkjun. Þessi óvissa kemur ekki í veg fyrir að byggja tæknina og sýna 2027 sem skýrt merkta forskoðun.

Tillaga að útfærslu:

1. Geyma útgáfur launataflna með `agreementId`, `version`, `effectiveFrom`, `effectiveTo`, `status`, `sourceUrl`, `verifiedAt`, `verifiedBy`, taxtum og nákvæmnireglu. Aðgreina opinbera taxta frá persónulegum viðbótum.
2. Geyma dagsetta ráðningarsögu: samning, vinnufyrirkomulag, starfshlutfall, launaflokk, þrep, staðfesta starfsreynslu, ráðningardag, réttinda- og viðbótarlaunaupplýsingar. Aðgangshlutverk `manager` er ekki sama og umsamin launaröðun stjórnanda.
3. Velja taxta eftir vinnudegi hvers vaktarhluta. Vakt yfir áramót skiptist við miðnætti, einnig þegar álagsprósentan breytist ekki. Sama gildir um apríl og persónulegar kjarabreytingar.
4. Reikna allar birtingar í gegnum sama þjónustulag: stimplun, tímaskýrslur, vaktaplan, sniðmát og útflutning. Enginn skjár á að eiga eigin launareglu.
5. Geyma reikniútgáfu og forsendur með hverjum útreikningi. Lokað uppgjör er varðveitt; leiðrétting myndar rekjanlega breytingu. Taxtauppfærsla má ekki hljóðlega skrifa yfir söguna.
6. Virkja staðfesta framtíðarútgáfu sjálfkrafa með dagsetningarvali. Það þarf ekki árlegan cron sem yfirskrifar starfsmannalaun. Sérstök vöktun á nýjum heimildum býr til yfirferðarverkefni; óstaðfest skrapað tafla fer ekki sjálfkrafa í greiðslur.
7. Ef enginn staðfestur taxti nær yfir dagsetninguna þarf sýnilega villu eða merkt áætlunargildi. Ekki nota núll eða útrunninn taxta hljóðlega.

Í viðmótinu mæli ég með áravali 2026/2027, gildistökudagsetningu, núverandi taxta, næsta staðfesta taxta, breytingu í krónum/prósentum og heimildarhlekk. Forskoðun framtíðarkostnaðar byggist á vaktaplani og er aðskilin frá uppgjöri raunverulegra stimplana. Í `src/app/[slug]/timesheets/page.tsx:172` er áframhnappur nú óvirkur á núverandi tímabili; einföld fjarlæging þessarar takmörkunar leysir ekki gagnalíkanið.

## Útgáfuhindranir í kóðanum

| Forgangur | Staður | Niðurstaða og nauðsynleg lagfæring |
| --- | --- | --- |
| P0 | `api/[slug]/portal/route.ts:234` | `updates` er afritað óheft. Admin getur sent `role: owner` í almennri uppfærslu þótt `set-role` sé owner-only. Nota skýran leyfislista reita og vernda hlutverkin í öllum leiðum. |
| P0 | `api/[slug]/portal/route.ts:286` | Admin má stofna nýjan `owner` í PUT. Sama réttindaregla þarf að gilda við stofnun og breytingu. Vernda síðasta owner og stjórnandareikninga gegn óheimilu PIN-resetti/eyðingu. |
| P0 | `api/[slug]/staff/login/route.ts` og `staff/signup` | Fjögurra stafa PIN án tilraunatakmarkana í kóða. Setja viðvarandi takmörkun eftir fyrirtæki/notanda/IP, tímabundna lokun og eftirlit. Ekki treysta á minni eins serverless-process. Athuga hvort PIN-aðgangur eigi að ná utan stimpilklukku. |
| P0 | `api/[slug]/timesheets`, `schedule`, `shift-templates` | Nokkrar leiðir athuga aðeins tilvist starfsmanns, ekki `approved`; breytingarleiðir athuga stundum aðeins hlutverk. Sameina með `verifyCompanyRole` og skýra hvernig eldri skjöl án status eru flutt. |
| P0 | `schedule GET`, `shift-templates GET` | Svar inniheldur launataxta/kostnað samstarfsfólks fyrir almenna starfsmenn. Sía á þjóninum eftir hlutverki; CSS eða falinn dálkur dugar ekki. |
| P0 | `timesheets/route.ts:118` | Eldri vaktir reiknast með núverandi taxta. `wageData` er lesið en ekki notað við samantekt. Samningur, starfshlutfall og businessType eru heldur ekki dagsett. |
| P0 | `timesheets/route.ts:85` og `:145` | Aðeins stimplar innan tímabils sóttir. Innstimplun fyrir tímabil tapast; útstimplun eftir tímabil sést ekki. Opin vakt á gömlu tímabili reiknast til dagsins í dag. Sækja skörun, para fyrst og klippa síðan við hálfopin tímabil. |
| P0 | `timesheets/route.ts:157` | Mánaðarlaun verða einfaldlega `monthlyRate`; álag, hlutföll og fjarvistir hafa ekki fulla útfærslu. `averaged` er val milli mánaðarlauna og tímavinnu, ekki sjálfstætt reglulíkan. |
| P1 | `portal POST`, `staff/punch POST` | Lesa síðustu stimplun og skrifa nýja án transaction/idempotency. Samhliða beiðnir geta tvístimplað; endursending getur snúið innstimplun í útstimplun. Sameina leiðir. |
| P1 | `corrections PATCH`, `swaps PATCH` | Afgreiðsla er margar sjálfstæðar skrifaðgerðir. Tvær samþykktir geta tvítekið færslur eða hálfklárað vaktaskipti. Nota transaction og tryggja einfalda endurkeyrslu. |
| P1 | `swaps POST` | Treystir vaktalýsingu frá client. Sækja upprunalega vakt á þjóninum og sannreyna eiganda, fyrirtæki, dagsetningu og útgáfu aftur við samþykki. |
| P1 | `portal/route.ts:161`, `staff/punch` | IP-reglan notar strengjaforskeyti fyrstu þriggja IPv4-hluta. Þetta er hvorki nákvæmur IP-samanburður né CIDR. Styðja rétta parsingu, IPv6 og traustan uppruna proxy-headera. |
| P1 | `shift-templates/route.ts:70` | Báðar greinar `endISO` nota sama dag. Nætursniðmát getur fengið núll tíma/kostnað. Útfærðar vaktir endurnýta líka kostnað stofndags án tillits til raunverulegs vikudags/hátíðar/taxta. |
| P1 | `[slug]/page.tsx:278` | Stillingaskjár birtir vistað án þess að kanna `res.ok`. Backend notar `adminEmails`, aðrir skjáir staff-role. Notandi getur séð vistun takast þegar hún fékk 403. |
| P1 | `admin/staff`, `superadmin/company`, `portal GET` | Tvö ólík valdakerfi, `adminEmails` og staff-role. Að fjarlægja netfang fjarlægir ekki sjálfkrafa owner-role; að lækka role tekur ekki öll eldri netfangsréttindi. Skilgreina eitt valdakerfi og aðskilda boðaleið. |
| P1 | `validation.ts`, API-færslur | Dagsetningarexpr staðfestir form en ekki tilvist dags. Vantar staðfestingu á enums, neikvæðum fjárhæðum, finite tölum, stórum dagabilum og einstökum taxtaauðkennum. |
| P1 | Enginn uppgjörslás/útflutningur | Vantar lokað uppgjör, heildstæða aðgerðaskrá og gagnaskil til bókara. Fyrirliggjandi samþykktarreitir eru gagnlegir en duga ekki sem varðveitt breytingasaga. |

P0 merkir hér hindrun fyrir örugga launanotkun. P1 þarf einnig að loka eftir því hvaða virkni fer í fyrstu útgáfu. Óleyst virkni má aðeins fara í prufu með skýrri afmörkun og án þess að gefa villandi lokaútreikninga.

## Útgáfa og rekstur

Góð atriði sem þegar eru til: Firestore-reglur hafna beinum client-aðgangi, sameiginlegur aðgangshjálpari er til, lykilorð eru söltuð og höshuð með scrypt, villuskráning er til og `dev-seed` er lokað í production. Verkefnið þarf því ekki endurskrift frá grunni.

Áður en útgáfa fer í almenna notkun þarf eftirfarandi áþreifanlega staðfestingu:

1. Aðskilið prófunarumhverfi, tilbúin starfsmannagögn og tvo tenants fyrir aðgangspróf. Preview má ekki falla sjálfkrafa yfir á production Firebase-project. `firebase-admin.ts` hefur nú project-fallback.
2. Framleiðsluútgáfa með skilgreindri Node-útgáfu, læstum dependencies, `npm ci`, test/lint/build og dependency-audit í CI. Velja næsta viðhaldsuppfærslustig eftir raunverulegum öryggisniðurstöðum, ekki giska á útgáfunúmer.
3. Staðfesta Firebase Auth providers, authorized domains, service-account heimildir og að server-leyndarmál séu aðeins server-side. Slökkva á bootstrap með því að fjarlægja `SETUP_SECRET` eftir uppsetningu eða loka leiðinni í production. Lykill var ekki lesinn í yfirferðinni.
4. Birta og prófa Firestore-reglur og indexes í réttu projecti. README segir afrit virk frá júlí; sannreyna áætlanir og raunverulegt nýlegt afrit, síðan endurheimt í einangruðum gagnagrunni.
5. Staðfesta TTL fyrir `tv_errors`, virkar villutilkynningar, kostnaðarmörk, aðgang að loggum og afmáun persónugreinanlegra gagna úr villum. Villuskráning í sama Firestore-gagnagrunni sér ekki ein og sér um eftirlit þegar gagnagrunnurinn bilar.
6. Skjalfesta ábyrgð á starfsmannagögnum, tilgang, geymslu, aðgang og leiðréttingar. Útbúa persónuverndarupplýsingar, rekstraraðilaskilmála og vinnslusamning fyrir utanaðkomandi viðskiptavini; staðfesta lagalegar kröfur sérstaklega fyrir reksturinn.
7. Neyðaraðgangur og afturköllun útgáfu þurfa að vera prófuð, með skýru ferli ef stimpilklukkan er niðri. Ekki sýna innstimplun sem tókst ef þjónn staðfesti hana ekki.
8. Bókarasamanburður fyrir heilt 25.–24. tímabil, með sundurliðun frávika og staðfestingu á ráðningarfyrirkomulagi. CSV fyrst, síðan sérsniðin tenging þegar launakerfi og innlestrarsnið eru þekkt.

## Úrbætur sem auka notagildi

Launaforsendur og útskýrð sundurliðun gefa meira virði núna en stór útlitsendurgerð. Láta notanda sjá hvers vegna taxti er valinn og hvað vantar. Vantar launaröðun á að birtast sem verkefni fyrir stjórnanda, ekki 0 kr. laun.

Því næst: áravalið 2027, skýr áætlun gegn raunvinnu, yfirlit yfir opnar/vafasamar vaktir og einföld leiðrétting. Síðan birting vaktaplans, tilkynningar og PWA. Staðfesta farsímanotkun, lyklaborð, focus, villa/vistun og íslenskt/enskt viðmót með raunverulegum notendaflæðum áður en nýir sölueiginleikar bætast við.

Sjálfvirkni þarf bæði áreiðanlegar reglur og ábyrgð á viðhaldi. Dagsett taxtaskrá leysir sjálfvirka gildistöku þegar samþykkt gögn liggja fyrir; hún sér ekki fyrir óútgefna úrskurði eða breytingar á samningum.

Tilbúið framkvæmdaerindi er í `CLAUDE_LAUNCH_PROMPT.txt`. Það byggir á þessari yfirferð og krefst prófanlegra niðurstaðna.
