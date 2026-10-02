import { Fill, LegalPage } from "../_legal/LegalPage";
import { DPA_VERSION } from "@/lib/legal";

export const metadata = { title: "Vinnslusamningur — Tímavörður" };

export default function Dpa() {
  return (
    <LegalPage title="Vinnslusamningur (skv. 28. gr. GDPR / lögum nr. 90/2018)" version={DPA_VERSION}>
      <h2>1. Hlutverk</h2>
      <p>Viðskiptavinur (vinnuveitandi) er <strong>ábyrgðaraðili</strong>. <Fill>Rekstraraðili Tímavarðar, kt.</Fill> er <strong>vinnsluaðili</strong> og vinnur upplýsingarnar eingöngu samkvæmt skjalfestum fyrirmælum ábyrgðaraðila, sem felast í notkun kerfisins.</p>
      <h2>2. Tilgangur og eðli vinnslu</h2>
      <p>Tímaskráning, vaktaskipulag, umsýsla starfsfólks og útreikningur launa og launatengdra gjalda fyrir ábyrgðaraðila.</p>
      <h2>3. Skráðir einstaklingar og tegundir upplýsinga</h2>
      <ul>
        <li><strong>Starfsfólk:</strong> nafn, netfang, notendanafn, kennitala, símanúmer, heimilisfang, banki og reikningsnúmer, stéttarfélag, lífeyrissjóður, vinnuleyfi og gildistími, starfsheiti.</li>
        <li><strong>Ráðningarkjör:</strong> launaflokkur, þrep, vinnufyrirkomulag, starfshlutfall, upphafsdagur ráðningar, fæðingardagur, staðfest starfsreynsla, persónuleg kjör.</li>
        <li><strong>Vinnuupplýsingar:</strong> stimplanir með tíma og IP-tölu, vaktir, leiðréttingar og vaktaskipti, launauppgjör.</li>
        <li><strong>Aðgerðaskrá:</strong> hver breytti hverju og hvenær.</li>
        <li><strong>Stjórnendur:</strong> nafn og netfang (Google-aðgangur).</li>
      </ul>
      <p>PIN-númer eru aðeins geymd sem óafturkræft tætigildi (hash). Engar viðkvæmar persónuupplýsingar í skilningi 9. gr. GDPR eru unnar nema ábyrgðaraðili skrái þær; stéttarfélagsaðild er skráð þegar ábyrgðaraðili gerir það.</p>
      <h2>4. Undirvinnsluaðilar</h2>
      <ul>
        <li>Google Cloud / Firebase (gagnagrunnur og innskráning). Gagnagrunnurinn er geymdur innan EES (fjölsvæði eur3, Belgía og Holland).</li>
        <li>Vercel Inc. (hýsing vefjar).</li>
        <li>Resend (sending tölvupósts, eingöngu netfang, nafn, notendanafn og PIN við útgáfu).</li>
      </ul>
      <p>Flutningur út fyrir EES byggir á EU-US Data Privacy Framework eða stöðluðum samningsákvæðum. Ábyrgðaraðili er upplýstur um breytingar á undirvinnsluaðilum með fyrirvara og getur andmælt.</p>
      <h2>5. Öryggi</h2>
      <p>Allur aðgangur fer um þjón með aðgangsstýringu eftir fyrirtæki og hlutverki; beinn aðgangur að gagnagrunni er lokaður. Samskipti eru dulkóðuð (HTTPS). Innskráningartilraunir eru takmarkaðar. Aðgerðaskrá er óbreytanleg í kerfinu.</p>
      <h2>6. Trúnaður, aðstoð og tilkynningar</h2>
      <p>Þeir sem hafa aðgang hjá vinnsluaðila eru bundnir trúnaði. Vinnsluaðili aðstoðar við beiðnir skráðra einstaklinga og tilkynnir ábyrgðaraðila um öryggisbrest án ótilhlýðilegrar tafar, eigi síðar en 48 klst. eftir að hans verður vart.</p>
      <h2>7. Lok vinnslu</h2>
      <p>Ábyrgðaraðili getur hvenær sem er sótt öll gögn fyrirtækisins á véllæsilegu formi (JSON) undir Stillingar → Gögn og lokun. Þegar ábyrgðaraðili lokar fyrirtækinu er aðgangi lokað strax og gögnin geymd í 30 daga svo hægt sé að hætta við. Að þeim tíma liðnum er þeim eytt varanlega.</p>
      <h2>8. Úttektir</h2>
      <p>Vinnsluaðili lætur ábyrgðaraðila í té upplýsingar sem þarf til að sýna fram á að kröfum sé fullnægt.</p>
    </LegalPage>
  );
}
