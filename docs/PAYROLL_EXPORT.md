# Launaútflutningur (CSV)

Almennt, skjalfest snið, ekki sniðið að tilteknu launakerfi. **Opið atriði:** innlestrarsnið bókarans (t.d. DK, Payday, Kjarni) er óþekkt; sértæk tenging bíður þess að það sé staðfest.

- Slóð: `GET /api/{slug}/payroll/export?period=YYYY-MM` (aðeins admin/owner). Án `&draft=1` fæst aðeins **læst** tímabil og gögnin koma úr snapshot.
- Kóðun: UTF-8 með BOM, dálkaskil `;`, línuskil CRLF, tugabrot með kommu, íslenskir stafir óbreyttir.
- Formula injection: textareitur sem byrjar á `= + - @`, tab eða CR fær `'` fremst. Tölur sem kerfið reiknar eru aldrei með forskeyti.
- Ein lína á hvern launalið, og síðan ein `SAMTALS`-lína á hvern starfsmann. Summa lína = SAMTALS = heildarlaun í læstu uppgjöri. Þetta er prófað í `csv.test.ts` og `api.int.test.ts`.

| Dálkur | Merking |
| --- | --- |
| timabil | Tímabilslykill `YYYY-MM`: mánuðurinn sem tímabilið 25.–24. **hefst** í |
| stada_uppgjors | `locked` eða `draft` |
| starfsmadur_id, nafn, kennitala | Eins og skráð var við lokun |
| dagsetning, upphaf, lok | Vinnudagur og ISO-tími (UTC = íslenskur tími) |
| vinnulidur, tegund | T.d. „Vaktaálag 45% (helgi)“ / `weekend`, `salary`, `adjustment`. Vikuyfirvinna (umfram 40 klst.) heldur nafni álagstímans: „Vaktaálag 45% (helgi) · yfirvinna“; dagvinnufólk utan 08–17: „Yfirvinna“ / `day_overtime` |
| alag_pct, yfirvinna | Álagsprósenta sem greidd er (0 á yfirvinnulínum, sem greiðast á yfirvinnutaxta); 1 ef yfirvinna |
| klst, taxti_kr, fjarhaed_kr | Magn, taxti og fjárhæð (2 aukastafir; tómt ef útreikning vantar) |
| taxtautgafa, taxtastada | T.d. `2026-04` / `verified` |
| kjaraskra_id, launaflokkur, threp, grunnur | Ráðningarkjör sem giltu: `minimum` eða `personal` |
| aaetlun | 1 ef áætlun (vakt í gangi eða drög) |
| uppruni | Uppruni og auðkenni stimplana, aðgreind með `|` |
| reiknivel | Útgáfa launavélar |

## Tímaskýrsla í Excel (CSV)

Hnappurinn „Sækja í Excel“ á tímaskýrslusíðunni. Þetta er ekki launaskjal, heldur yfirlit yfir unnar vaktir.

- Slóð: `GET /api/{slug}/timesheets/export?period=YYYY-MM&uid=all|<uid>`. Starfsmaður fær aðeins sínar eigin vaktir; aðra eða alla (`all`) þarf admin/owner.
- Sama kóðun og hér að ofan. Skráarnafn endar á `_DROG` ef tímabilið er ekki læst.
- Ein lína á hverja vakt: `Nafn; Kennitala; Dagsetning; Vikudagur; Inn; Út; Klst; Athugasemd`, og síðan `SAMTALS`-lína á hvern starfsmann.
- Vaktir eru settar saman úr launalínunum (`src/lib/payroll/timesheet-csv.ts`), svo klukkustundirnar eru alltaf þær sömu og í launaútreikningnum. Vakt sem nær yfir tímabilsmörk er klippt við mörkin, og vakt í gangi er merkt „Vakt í gangi (áætlun)“.
