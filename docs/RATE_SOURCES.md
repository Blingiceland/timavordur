# Heimildaskrá launareglna

Allar reglur sem launavélin (`src/lib/payroll/`) beitir, með heimild, gildistíma, athugunardegi, stöðu og prófinu sem sannreynir regluna. Athugað 30.09.2026 gegn PDF-skjölunum sjálfum (ekki eftir endursögn).

**Heimildir**

- **[S]** Samningur SA og Eflingar v/veitinga-, gisti-, þjónustu- og greiðasölustaða 2024–2028: [PDF hjá SA](https://samtok-atvinnulifsins.cdn.prismic.io/samtok-atvinnulifsins/aEGu3rh8WN-LVq1N_Hotelogveitinagh%C3%BAsasamningurSAogEfling2024-2028lokaskjal-vef%C3%BAtg%C3%A1fa.pdf). Gildir 1.2.2024–1.2.2028.
- **[J]** [Kaupgjaldsskrá SA/Eflingar frá 1. janúar 2026](https://irp.cdn-website.com/54dfb5a4/files/uploaded/Kauptaxtar_2026_januar_SA.pdf). Mánaðarlaun eru á bls. 1 og tímakaup í kaflanum HÓTEL- OG VEITINGAHÚS.
- **[A]** [Kaupgjaldsskrá SA/Eflingar frá 1. apríl 2026](https://irp.cdn-website.com/54dfb5a4/files/uploaded/Kauptaxtar_2026_april_SA.pdf). Sama uppsetning og [J].
- **[K]** [Efling: kauptaxtaauki 0,06% frá 1. apríl 2026](https://www.efling.is/kauptaxtaauki-tekur-gildi-1-april).
- **[T]** [Skatturinn: tryggingagjald](https://www.skatturinn.is/atvinnurekstur/skattar-og-gjold/tryggingagjald): 6,35% árið 2026. Stofninn er „allar tegundir skattskyldra launa“.
- **[L]** [Skatturinn: launamiðar og stofn](https://www.skatturinn.is/atvinnurekstur/framtal-og-alagning/launamidar-og-launaframtal/). Mótframlag vinnuveitanda í lífeyrissjóð telst til stofns tryggingagjalds (samkvæmt yfirferðinni; ég bar síðuna ekki sjálfur saman við töluna í þessari lotu).
- **[V]** [Viðskiptablaðið 2.9.2026, „Enn reynir á samningana“](https://vb.is/frettir/enn-reynir-a-samningana-/): verðlagsforsenda stóðst ekki.

## Taxtar

| Regla | Heimild | Gildir | Staða | Próf |
| --- | --- | --- | --- | --- |
| Mánaðarlaun fl. 6 og 7, öll þrep, jan. 2026 | [J] bls. 1 | 1.1.–31.3.2026 | Staðfest | `agreements.test.ts` („2026-01 fl.6/7 …“) |
| Mánaðarlaun fl. 6 og 7, öll þrep, apr. 2026 | [A] bls. 1, [K] | 1.4.–31.12.2026 | Staðfest | `agreements.test.ts` („2026-04 …“) |
| Tímakaup = mánaðarlaun/172 | [S] gr. 1.6 | allt tímabilið | Staðfest | 16 dagvinnureitir í `agreements.test.ts` |
| Yfirvinna = 1,0385% af mánaðarlaunum | [S] gr. 1.7.1 | allt | Staðfest | 16 yfirvinnureitir |
| Álagstaxti = tímakaup × (1+álag), námundað í 2 aukastafi | [J]/[A], kafli hótel/veitingahús | allt | Staðfest | 33/45/55%-reitir (48) og 90%-reitir gistihúsadálks (8) |
| 2027: mánaðarlaun | [S] gr. 1.2.1, dálkur 1.1.2027 | frá 1.1.2027 | **DRÖG** | `versionForDate` + „2027 draft …“ |

Í kóðanum eru engin önnur taxtagögn. Fyrir 2027 vantar eftirfarandi áður en taflan má fara í uppgjör:

1. Birt kaupgjaldsskrá SA/Eflingar fyrir janúar 2027. Hún var ekki komin á [yfirlitssíðu Eflingar](https://www.efling.is/sa-launatoflur) 30.9.2026; þar voru aðeins töflur frá febrúar 2024 til apríl 2026. `npm run check:rates` flaggar nýja töflu sjálfkrafa.
2. Staðfesting á því hvernig kauptaxtaaukar 2025 og 2026 flytjast yfir. Upphafleg samningstafla 2026 (478.993 kr.) er lægri en birt tafla (481.631 kr.), svo drögin eru líklega of lág.
3. Niðurstaða forsendumats: verðlagsforsenda september 2026 **stóðst ekki** ([V]; ársverðbólga 5,6%). Forsendunefnd semur um viðbragð. Náist það ekki má segja samningi upp fyrir 8.10.2026 og fellur hann þá úr gildi 31.10.2026. Þetta getur einnig haft áhrif á nóvember–desember 2026.
4. Kauptaxtaauki í mars 2027 (gr. 1.3.4) og tryggingagjaldshlutfall 2027.

## Álag, frídagar og vinnufyrirkomulag

| Regla | Heimild | Próf |
| --- | --- | --- |
| 33% mán.–fös. 17–24 | [S] 3.2.1 | `calculate.test.ts` „weekday 17–24 is 33% …“ |
| 45% 00–08 alla daga og laugardaga/sunnudaga | [S] 3.2.1 | sama; „Saturday daytime is 45%“ |
| 55% 00–05 aðfararnótt lau./sun., aðeins krár og skemmtistaðir | [S] 3.2.1 sérákvæði | „bar: Fri 22 → Sat 06 …“, „restaurant …“, dæmi 29.3 (5.800) |
| Helgidagar 45%: skírdagur, annar í páskum, sumardagurinn fyrsti, 1. maí, uppstigningardagur, annar í hvítasunnu, fyrsti mán. í ágúst, annar í jólum | [S] 2.3.2, 3.2.2 | `icelandic-holidays.test.ts` 2026 og 2027; dæmi 1.5 og 23.4 |
| Stórhátíð 90%: nýársdagur, föst. langi, páskadagur, hvítasunnudagur, 17. júní, jóladagur; aðfangadagur og gamlársdagur frá 12:00 | [S] 2.3.1, 3.2.3 | dæmi 1.1, 24.12 12–16 og 24.12 06–10; „Gamlársdagur …“ |
| Hæsta viðeigandi álag gildir (álög leggjast ekki saman) | Túlkun á [S] 3.2 | innbyggt í `classify()` |
| Yfirvinna eftir 40 klst. á viku (vika frá mánudegi), í tímaröð | [S] 3.1.4, 3.2.4, 2.2.3 | „hours beyond 40 …“ |
| Yfirvinna greiðist aldrei lægra en álagið sem annars gilti | Túlkun (varfærin) | „overtime never pays less …“ |
| Dagvinnufólk: 08–17 virka daga er dagvinna; annars yfirvinna | [S] 2.1.1, 2.2.1–2.2.2 | „day arrangement …“ |
| Dagvinnufólk á stórhátíð fær **blocker**, enginn útreikningur | [S] 1.7.2/1.7.3 (ósamrýmanlegar leiðir) | sama próf |
| Mánaðarlaun: föst laun einu sinni, aðeins álagshluti á tíma, orlof ekki á föst laun | [S] 3.1.4, 6.1 | „monthly pay …“ |
| Mánaðarlaun hluta tímabils fá **blocker**; áætlun er merkt | Hlutfallsregla óskráð | „monthly pay starting mid-period …“ |
| `averaged` (jafnaðarkaup) fær **blocker** | Ekki útfært | „averaged pay type …“ |

## Þrep, stjórnun, orlof

| Regla | Heimild | Próf |
| --- | --- | --- |
| 1 og 3 ár miðast við reynslu í starfsgrein, 5 ár við sama atvinnurekanda | [S] 1.5, [J]/[A] neðanmálsgrein | `terms.test.ts` |
| 22 ára aldur jafngildir eins árs starfi | [S] 1.2.3, 1.5.4 | „22 years of age …“ |
| Staðfest fyrri reynsla gildir frá næstu mánaðamótum | [S] 1.2.3 | „verified prior experience …“ |
| Handvirkt þrep má aðeins hækka | Kröfur verkefnis | „manual override …“ |
| Stjórnun +15% samkvæmt ráðningarsamningi, óháð app-hlutverki | [S] 1.2.4 | `rates.ts` (managementRole). Námundun í heila krónu er túlkun |
| Orlof: 10,17%; 10,64% (22 ára og 6 mán.); 12,07% (5 ár); 13,04% (10 ár); gildir frá næsta 1. maí | [S] 6.1 | `terms.test.ts` orlof |

## Launakostnaður

| Liður | Hlutfall | Heimild | Staða 2026 / 2027 |
| --- | --- | --- | --- |
| Mótframlag í lífeyrissjóð | 11,5% | [S] 11.4 | staðfest / óstaðfest |
| Sjúkrasjóður, orlofsheimilasjóður, starfsmenntasjóður | 1%, 0,25%, 0,3% | [S] 11.1–11.3 | staðfest / óstaðfest |
| Virk | 0,10% | lög 60/2012 | **ekki borið saman við heimild** |
| Tryggingagjald á laun, orlof og mótframlag | 6,35% | [T], [L] | staðfest / 2026-hlutfall notað sem forsenda |

Próf: `terms.test.ts`, þar sem 100.000 kr. gefa 7.800 kr. tryggingagjald en ekki 6.996 kr.

## Ekki reiknað (skráð, ekki falið)

- Útkall, lágmark 4 klst. (1.8).
- Frítökuréttur vegna skertrar hvíldar (2.4). Hvíld undir 11 klst. kemur fram sem viðvörun.
- Bakvaktir (2.9).
- Vetrarfrí vaktavinnufólks (3.4).
- Desember- og orlofsuppbót (1.4).
- Unglingataxtar og 95% á þjálfunartíma (1.2.3). Ekkert er lækkað sjálfkrafa.
- Dagleg yfirvinna dagvinnufólks eftir 7 klst. 25 mín. (2.2.1). Viðvörun birtist yfir 8 klst.
- 38 klst. vinnuvika þegar eingöngu er unnið 17–08 (3.1.1).
- Sérákvæði 5.12.
- Mánaðarlaunagreiðslutímabil 1.–31. í stað 25.–24. (1.11.1). Tímabilaskipan fyrirtækisins þarf að staðfesta með bókara.

## Ný tafla birtist (viðhaldsferli)

1. `npm run check:rates` (vikulega í CI) skilar villu og listar óskráðu töfluna. Hún er **aldrei** tekin inn sjálfkrafa.
2. Einstaklingur les PDF-skjalið og bætir við **nýrri** útgáfu í `agreements.ts`, með `effectiveFrom`, heimild og stöðunni `draft`.
3. Allir reitir flokka 6 og 7 eru færðir sjálfstætt inn í `PUBLISHED` í `agreements.test.ts`, beint úr PDF-skjalinu en ekki reiknaðir.
4. Þegar prófið stenst er staðan sett á `verified` og nýr útgáfuliður skráður í þetta skjal. Eldri útgáfum er aldrei breytt.
