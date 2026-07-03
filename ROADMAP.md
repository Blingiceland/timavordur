# Tímavörður — næsta level

Markmið í röð: **(1)** keyra Dillon (og svo Pablo) á kerfinu í alvöru,
**(2)** treysta því nóg til að launavinnslan byggi á því, **(3)** gera það
selanlegt öðrum stöðum. Planið er í fösum — hver fasi endar á áþreifanlegri
sönnun þess að hann virki.

## Staðan (júlí 2026)

Kjarninn er til og prófaður:

- ✅ Stimpilklukka (Google + notandanafn/PIN), IP-takmörkun valkvæð
- ✅ Launavél skv. Efling/SA með einingaprófum — dagvinna/kvöld/helgar/nætur
  (bar ×1,55 / veitingastaður ×1,45)/stórhátíð, íslenskir frídagar reiknaðir
  per ár, vaktir brotnar á taxtamörkum
- ✅ Launakostnaður vinnuveitanda (orlof 10,17/12,07% + lífeyrir 11,5% +
  tryggingagjald 6,35%)
- ✅ Vaktaplan (stakar + endurteknar sniðmátsvaktir), vaktaskipti/yfirtökur
  með samþykki stjórnanda, leiðréttingar á stimplunum
- ✅ Fjöltenant, hlutverk (staff→owner→superadmin), allt server-side,
  Firestore lokað fyrir beinum client-aðgangi
- ✅ Tvítyngt viðmót, dark/light, demo-seed

Það sem vantar er ekki fleiri fítusar heldur **lokun hringrásarinnar**:
launagögnin komast ekki út úr kerfinu (enginn export), enginn fær tilkynningar,
engin afrit, engin aðgerðaskrá — og launavélin hefur aldrei verið borin saman
við alvöru launakeyrslu.

---

## Fasi 0 — Í loftið á Dillon (vika 1–2)

Markmið: Dillon stimplar sig inn og út í Tímaverði **samhliða** núverandi
fyrirkomulagi í eitt heilt launatímabil (25.–24.). Engin ný virkni — bara
rekstraröryggi.

- [ ] **Onboarda Dillon í alvöru**: fyrirtæki, launaflokkar skv. töxtum,
      businessType=bar, IP-takmörkun á WiFi staðarins, starfsfólk skráir sig
      (PIN-leiðin fyrir þau sem ekki nota Google)
- [ ] **Sjálfvirk afrit af Firestore** (scheduled export í Cloud Storage,
      daglegt). Þegar alvöru launagögn eru komin inn má ekkert týnast.
- [ ] **Villuvöktun**: Sentry (eða a.m.k. structured logging á API-leiðum)
      svo bilanir sjáist áður en starfsfólk kvartar
- [ ] **Persónuvernd**: kerfið geymir kennitölur og bankaupplýsingar
      starfsfólks → þarf persónuverndarstefnu/upplýsingablað til starfsfólks
      strax (líka fyrir eigin notkun), og vinnslusamning ef/þegar aðrir nota það
- [ ] **Neyðarleið**: annar superadmin-reikningur (eða skjalfest recovery),
      svo einn læstur Google-aðgangur stöðvi ekki launavinnslu

**Sönnun fasa 0:** eitt heilt launatímabil af alvöru stimplunum í kerfinu.

## Fasi 1 — Treysta á kerfið fyrir laun (launatímabil 1–2)

Markmið: launavinnsla Dillon byggir á Tímaverði — talan úr kerfinu er talan
sem er borguð.

- [ ] **Samanburðarkeyrsla**: bera niðurstöðu Tímavarðar saman við
      launakeyrslu bókarans fyrir sama tímabil, manneskju fyrir manneskju.
      Hvert frávik er annaðhvort bögg í kerfinu eða skekkja í gamla ferlinu —
      hvort tveggja verðmætt.
- [ ] **Launaexport** (stærsta einstaka fítusinn): CSV/Excel per tímabil sem
      bókarinn getur tekið beint inn. *Byrja á að spyrja bókarann hvaða
      launakerfi hann notar (Kjarni, Payday, DK, Origo…) og hvaða dálka hann
      þarf* — sníða exportið að því, ekki giska.
- [ ] **Jaðartilvik kjarasamnings — staðfesta með bókara/stéttarfélagi**:
      yfirvinna umfram fulla vinnuskyldu, lágmarksútkall (t.d. 4 klst),
      11 klst hvíldarregla, neysluhlé. Ekki endilega útfæra allt strax, en
      vita hvað kerfið reiknar EKKI og merkja það skýrt í viðmótinu.
- [ ] **Aðgerðaskrá (audit log)**: hver samþykkti leiðréttingu/vaktaskipti,
      hver breytti launaflokki, hvenær. Skilyrði þess að hægt sé að treysta
      tölunum þegar ágreiningur kemur upp.
- [ ] **Lásun tímabils**: þegar launatímabil hefur verið gert upp á að vera
      hægt að "loka" því — leiðréttingar eftir það verða sér-merktar á næsta
      tímabili í stað þess að breyta sögunni

**Sönnun fasa 1:** ein launakeyrsla borguð beint upp úr exporti Tímavarðar.

## Fasi 2 — Dagleg notkun sem fólki finnst góð (mánuður 2–3)

Markmið: starfsfólk og vaktstjórar velja að nota kerfið, ekki bara þola það.

- [ ] **PWA**: manifest + tákn svo starfsfólk setji "app" á heimaskjáinn;
      service worker fyrir hraða ræsingu (offline-stimplun má bíða)
- [ ] **Tilkynningar v1** (einfaldast fyrst): tölvupóstur við
      (a) nýtt/breytt vaktaplan birt, (b) vaktaskipti bíða þín / samþykkt,
      (c) leiðrétting samþykkt/hafnað. Web push síðar.
- [ ] **"Birta vaktaplan"-hnappur**: vaktstjóri vinnur planið í drögum og
      birtir svo vikuna með einni aðgerð + tilkynningu — í stað þess að
      breytingar leki út jafnóðum
- [ ] **Framboð starfsfólks**: einföld skráning ("kemst ekki þri/mið") sem
      sést í vaktaplansviðmótinu þegar raðað er á vaktir
- [ ] **Rauntímauppfærsla** á klukku- og teymisflipa (Firestore snapshot eða
      polling) — núna þarf að endurhlaða síðu
- [ ] **Launakostnaðar-mælaborð fyrir eiganda**: áætlaður vs. raunkostnaður
      viku fyrir viku, launahlutfall (þegar veltutölur liggja fyrir — tenging
      við POS síðar). Þetta er stjórntækið sem gerir kerfið verðmætt fyrir
      *þig*, ekki bara starfsfólkið.
- [ ] **Pablo onboardaður** — önnur alvöru prófun á fjöltenant-einangruninni

**Sönnun fasa 2:** vaktstjóri á Dillon gerir næstu viku í Tímaverði án þess
að spyrja hvernig, og starfsfólk fær tilkynningu.

## Fasi 3 — Frá eigin tóli í vöru (mánuður 3+)

Aðeins þegar fasar 0–2 hafa sannað sig í eigin rekstri.

- [ ] **/demo fægður**: seed-demo er til — gera hann að sölutæki (hlekkur sem
      má senda hverjum sem er, endurstillist á nóttunni)
- [ ] **Verðlagning + áskrift**: t.d. fast verð per fyrirtæki per mánuð
      (einfalt fyrst — reikningur handvirkt, Stripe síðar)
- [ ] **Self-serve onboarding**: fyrirtæki stofnar sig sjálft án superadmin
      (með samþykktarskrefi hjá þér)
- [ ] **Fleiri kjarasamningar**: launavélin er nú þegar með `agreement`-vídd
      (efling_sa/custom) — bæta við t.d. Matvís fyrir kokka þegar fyrsti
      viðskiptavinur þarf
- [ ] **Vinnslusamningur + skilmálar** — skilyrði þess að selja kerfi sem
      geymir kennitölur og bankaupplýsingar
- [ ] **Vefsíðan/landing** uppfærð með raundæmum: "Notað daglega á Dillon og
      Pablo" er sterkasta sölusetningin

## Þvert á alla fasa

- **Prófanir fylgi launavélinni**: hver ný regla (yfirvinna, lásun tímabils,
  nýr kjarasamningur) fær einingapróf í sömu andrá — launavélin er varan
- **Tímabelti**: kerfið notar UTC (displayTime HH:MM UTC). Ísland er á UTC
  allt árið svo þetta sleppur — en skjalfesta forsenduna og hafa próf sem
  brotnar ef einhver breytir þessu
- **Ekki byggja fram fyrir þörf**: geofencing, native app, POS-tenging,
  webhooks — allt bíður þar til raunveruleg notkun kallar á það
