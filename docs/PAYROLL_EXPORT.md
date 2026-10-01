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
| vinnulidur, tegund | T.d. „Vaktaálag 45% (helgi)“ / `weekend`, `salary`, `adjustment` |
| alag_pct, yfirvinna | Álagsprósenta; 1 ef yfirvinna |
| klst, taxti_kr, fjarhaed_kr | Magn, taxti og fjárhæð (2 aukastafir; tómt ef útreikning vantar) |
| taxtautgafa, taxtastada | T.d. `2026-04` / `verified` |
| kjaraskra_id, launaflokkur, threp, grunnur | Ráðningarkjör sem giltu: `minimum` eða `personal` |
| aaetlun | 1 ef áætlun (vakt í gangi eða drög) |
| uppruni | Uppruni og auðkenni stimplana, aðgreind með `|` |
| reiknivel | Útgáfa launavélar |
