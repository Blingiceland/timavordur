import Link from "next/link";
import { LegalPage } from "../_legal/LegalPage";
import { TERMS_VERSION } from "@/lib/legal";

export const metadata = { title: "Skilmálar — Tímavörður" };

export default function Terms() {
  return (
    <LegalPage title="Skilmálar Tímavarðar" version={TERMS_VERSION}>
      <h2>1. Aðilar</h2>
      <p>Tímavörður er rekinn af KRJ ehf., kt. 540916-1360, Kinnargötu 29, 210 Garðabæ („við“). Viðskiptavinur er það fyrirtæki sem skráir sig („þú“). Sá sem skráir fyrirtækið staðfestir að hann sé í forsvari fyrir það eða hafi umboð þess. Við förum yfir hverja skráningu áður en aðgangur er opnaður og getum hafnað skráningu eða óskað eftir frekari upplýsingum. Fyrirspurnir sendist um <Link href="/hafa-samband">fyrirspurnaform</Link>.</p>
      <h2>2. Þjónustan</h2>
      <p>Tímavörður er vefkerfi fyrir stimpilklukku, vaktaplan, leiðréttingar, vaktaskipti og útreikning launa eftir kjarasamningi SA og Eflingar (hótel og veitingahús) eða sérkjörum sem þú skráir. Launaútreikningur er hjálpartæki: <strong>þú berð ábyrgð á launagreiðslum</strong>, á því að skrá rétt ráðningarkjör (launaflokk, þrep, vinnufyrirkomulag, starfshlutfall) og á að yfirfara uppgjör, helst með bókara, áður en greitt er. Reglur sem kerfið reiknar ekki eru taldar upp í kerfinu og í lýsingu þess.</p>
      <h2>3. Verð</h2>
      <p>Þjónustan er gjaldfrjáls meðan á prufu stendur. Við látum vita með minnst 30 daga fyrirvara áður en gjald er tekið, og þú getur þá hætt án kostnaðar.</p>
      <h2>4. Aðgangur og öryggi</h2>
      <p>Þú stýrir því hverjir fá aðgang og með hvaða hlutverki. Stjórnendur skrá sig inn með Google; starfsfólk með notendanafni og PIN sem er sent í pósti. Þú skuldbindur þig til að halda aðgangi öruggum og láta okkur strax vita af misnotkun.</p>
      <h2>5. Persónuupplýsingar</h2>
      <p>Þú ert ábyrgðaraðili persónuupplýsinga starfsfólks þíns; við erum vinnsluaðili. Um vinnsluna gildir <Link href="/vinnslusamningur">vinnslusamningur</Link> sem er hluti þessara skilmála. KRJ ehf. notar hvorki né skoðar þær upplýsingar sem viðskiptavinur og starfsfólk hans skrá í kerfið. Í kerfinu sjálfu hefur KRJ ehf. engan aðgang að upplýsingum um starfsfólk, stimplanir, vaktir, kjör eða laun; stjórnborð rekstraraðila sýnir eingöngu nafn fyrirtækis, kennitölu þess, nafn og netfang eiganda, símanúmer, fjölda starfsmanna og dagsetningu síðustu stimplunar. Tæknilegur aðgangur að gagnagrunni er aðeins nýttur ef það er óhjákvæmilegt vegna reksturs, öryggis eða bilanaleitar, eða að beiðni ábyrgðaraðila, og þá ekki umfram það sem nauðsynlegt er.</p>
      <h2>6. Takmörkun ábyrgðar</h2>
      <p>Við leggjum okkur fram um að þjónustan sé aðgengileg og rétt en ábyrgjumst ekki að hún sé án truflana. Ábyrgð okkar takmarkast við fjárhæð sem nemur greiddum gjöldum síðustu 12 mánuði, nema um stórfellt gáleysi eða ásetning sé að ræða.</p>
      <h2>7. Lokun aðgangs og uppsögn</h2>
      <p>Þú getur hætt hvenær sem er. Við getum lokað aðgangi ef skilmálar eru brotnir eða við grun um misnotkun; gögn eru þá varðveitt. Við uppsögn getur þú fengið gögnin þín afhent, og þeim er eytt varanlega 30 dögum eftir lokun nema lög krefjist annars.</p>
      <h2>8. Breytingar og lög</h2>
      <p>Við tilkynnum breytingar á skilmálum með fyrirvara. Um skilmálana gilda íslensk lög og ágreining má bera undir Héraðsdóm Reykjavíkur.</p>
    </LegalPage>
  );
}
