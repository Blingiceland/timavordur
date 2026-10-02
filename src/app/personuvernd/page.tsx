import { Fill, LegalPage } from "../_legal/LegalPage";
import { PRIVACY_VERSION } from "@/lib/legal";

export const metadata = { title: "Persónuvernd — Tímavörður" };

export default function Privacy() {
  return (
    <LegalPage title="Persónuvernd — upplýsingar til starfsfólks" version={PRIVACY_VERSION}>
      <p>Vinnuveitandi þinn notar Tímavörð fyrir stimpilklukku, vaktaplan og launaútreikning. <strong>Vinnuveitandinn er ábyrgðaraðili</strong> upplýsinganna um þig; Tímavörður vinnur þær fyrir hans hönd.</p>
      <h2>Hvaða upplýsingar?</h2>
      <p>Það sem þú eða vinnuveitandinn skráið: nafn, netfang, notendanafn, og eftir atvikum kennitala, sími, heimilisfang, bankaupplýsingar, stéttarfélag og lífeyrissjóður. Auk þess stimplanir (tími og IP-tala tengingar), vaktir, leiðréttingar og ráðningarkjör sem ráða launum þínum.</p>
      <h2>Til hvers?</h2>
      <p>Til að skrá vinnutíma, skipuleggja vaktir og reikna laun rétt samkvæmt kjarasamningi. Vinnslan byggir á ráðningarsamningi og lagaskyldu vinnuveitanda (t.d. um launaseðla og skráningu vinnutíma). IP-tala er notuð til að tryggja að stimplað sé á vinnustað, ef vinnuveitandi hefur kveikt á því.</p>
      <h2>Hver sér upplýsingarnar?</h2>
      <p>Þú sérð þínar eigin stimplanir, vaktir, kjör og launasundurliðun. Stjórnendur hjá vinnuveitanda sjá upplýsingar samkvæmt hlutverki sínu; vaktstjórar sjá ekki laun annarra. Launaupplýsingar geta verið sendar bókara vinnuveitanda.</p>
      <h2>Hve lengi?</h2>
      <p>Tímaskráningar eru aðgengilegar þér í minnst 12 mánuði (gr. 1.11 í kjarasamningi).</p>
      <h2>Réttindi þín</h2>
      <p>Þú átt rétt á aðgangi að upplýsingum um þig, leiðréttingu og í vissum tilvikum eyðingu eða takmörkun vinnslu. Snúðu þér fyrst til vinnuveitanda þíns. Þú getur kvartað til <a href="https://www.personuvernd.is" target="_blank" rel="noreferrer">Persónuverndar</a>.</p>
      <h2>Tengiliður</h2>
      <p>Vinnuveitandi þinn. Um kerfið sjálft: <Fill>netfang rekstraraðila Tímavarðar</Fill>.</p>
    </LegalPage>
  );
}
