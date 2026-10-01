# Yatzy – en duell till

Ett mobilanpassat första utkast för exakt två spelare. Ingen singleplayer och inga botar.

## Starta och spela lokalt

Kräver Node.js 22.12 eller senare.

```sh
npm ci
npm run dev:local
```

Öppna http://127.0.0.1:5173 i ett vanligt fönster och ett privat fönster (eller två separata webbläsarprofiler). Varje profil är en spelare. Välj **Spela mot en vän → Skapa rum**, anslut från det andra fönstret med femteckenskoden. Alternativt välj **Hitta motståndare** i båda.

Den lokala utvecklingsservern använder PGlite/Postgres med samma migrationsfil och samma RPC som onlineversionen. Den lagrar matcherna i `.local-data/` och hämtar uppdateringar var 700:e millisekund. Den lyssnar endast på localhost och är inte avsedd för publicering. Lokal testmiljö är tydligt märkt i gränssnittet.

## Supabase / online

Spelet använder Supabase-projektet **yatzy** (`ywbxidtbprgnoohbukkm`). Migrationen `initial_yatzy_duel` är installerad där. Ordduellens databas berörs inte.

För lokal körning mot Supabase: kopiera `.env.example` till `.env.local` och fyll i projektets **publika publishable-nyckel** från Supabase Dashboard → Project Settings → API Keys. Kör `npm run dev`. `.env.local` är ignorerad av Git. Använd aldrig en hemlig servernyckel i webbklienten. Webbläsaren använder Supabase direkt för onlinespel; den lokala testservern behövs inte vid publicering.

## GitHub Pages

Målet är `https://mansenheim0907.github.io/yatzy/`. Repositoriet har ännu inte pushats, så länken är inte live.

1. Lägg till följande **repository variables** under GitHub → `mansenheim0907/yatzy` → Settings → Secrets and variables → Actions → Variables:
   - `VITE_SUPABASE_URL` = `https://ywbxidtbprgnoohbukkm.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = projektets aktiva **publishable key** (`sb_publishable_…`). Den är avsedd att vara offentlig i en webbklient; använd inte secret/service-role key.
2. Välj **GitHub Actions** som källa under Settings → Pages → Build and deployment.
3. När du uttryckligen vill publicera: pusha `develop`. `.github/workflows/pages.yml` kör databastester och Vite-bygget och publicerar `dist/`. Senare pushar till `develop` publicerar uppdateringar automatiskt.
4. Kontrollera Actions-jobbet och öppna adressen ovan från två olika enheter. Sidan behöver HTTPS och Supabase-projektet måste vara aktivt.

`vite.config.js` sätter byggbasen och förhandsvisningen till `/yatzy/`; lokal utveckling fortsätter på `/`. Startsidelänken använder samma bas. `npm run build` skapar redan Pages-kompatibla filer i `dist/`; kontrollera dem med `npm run preview` och öppna URL:en som visas. En egen domän skulle kräva en annan basadress.

Realtime använder privata Broadcast-kanaler och serverns `realtime.send`. Migreringen lägger till en SELECT-policy på `realtime.messages`; inga ändringar av Supabases egna tabellstrukturer behövs. Webbklienten återhämtar även tillstånd via RPC var femte sekund, vid återanslutning och när fliken blir synlig. Inga speldata accepteras från Broadcast-meddelanden.

## Arkitektur och Ordduellen

Ordduellens lokala repo inspekterades: `index.html` (rum/RPC/återhämtning), `branch-config.js` och migrationen `20260930180415_secure_room_realtime_and_retention.sql` samt paketstruktur. Yatzy följer samma principer:

- Lätt statisk webbklient med JavaScript, utan React eller separat produktionsserver.
- Postgres är auktoritet för spelregler, tärningskast och poäng. Klienten skickar endast handlingar.
- Slumpmässig 256-bitars spelarnyckel i lokal lagring; endast SHA-256-hash i databasen. Privata rumskanaler binds till spelarens nyckelhash. Detta är en capability-baserad gästsessionsmodell, utan krav på Supabase Auth.
- Privata tabeller med RLS och utan klientbehörigheter. En publik SECURITY INVOKER-RPC anropar en privat, strikt validerad SECURITY DEFINER-funktion.
- Radlås och versionskontroll för turer och kast. Ett transaktionslås serialiserar anslutning/matchmaking, även när svar tappas och klienten försöker igen.
- Återanslutning i samma webbläsarprofil med bibehållen lokal lagring. Radering av lagring förlorar spelaridentiteten.
- `develop` används lokalt. Inget har pushats.

Matchmaking använder en atomisk databasbaserad kö istället för Ordduellens klientförhandlade lobby. Det förenklar garantin om exakt två spelare. Ett onlinerum måste ha kontaktat servern inom 30 sekunder för att få en ny motståndare. Rum upphör att gå att återansluta till efter 24 timmars inaktivitet. Gamla rader raderas inte automatiskt i detta utkast; inför schemalagd rensning före bred lansering.

## Regler

15 kategorier per spelare, upp till tre kast per tur, fem tärningar som kan låsas efter första och andra kastet. En kategori väljs efter minst ett kast; noll poäng kräver bekräftelse. Bonus är 50 vid 63 eller mer på Ettor–Sexor. Yatzy ger 50, liten stege 15 och stor stege 20. Två par kräver olika valörer och kåk ett tretal plus ett annat par. Lika slutpoäng ger oavgjort. Att lämna en påbörjad match ger motståndaren segern; ett nätavbrott lämnar matchen öppen för återanslutning.

## Verifiering

```sh
npm test
npm run build
# Hämta testwebbläsare en gång:
npx playwright install chromium
# Med dev:local igång:
npm run test:e2e
```

Databastesterna kör själva migrationsfilen under klientrollen `anon` och verifierar spelregler, åtkomst, rum, matchmaking, turer, versionskontroll och matchslut. Samtliga 252 unika tärningskombinationer jämförs mellan SQL och klient för alla kategorier. PGlite-testet ersätter enbart Supabases hanterade Broadcast-funktion med en lokal stub; det verifierar inte fjärrtjänstens WebSocket-leverans eller produktionens parallella databasanslutningar.

Två webbläsarsessioner har dessutom spelat en hel duell, återanslutit och genomfört matchmaking mot Supabase-projektet **yatzy**. Privat Broadcast-mottagning kontrollerades separat. Kör samma tester mot den aktuella fjärrmiljön med `YATZY_TEST_URL=http://127.0.0.1:5174 npm run test:e2e` medan `npm run dev -- --port 5174` är igång med `.env.local`.

Före bred publik lansering återstår skydd mot automatiserad masskapning/gissning av rum (rate limiting). Femteckenskoder är inbjudningar, inte starka hemligheter.

Om en kompatibel Chrome redan finns kan `CHROME_PATH` sättas till dess körbara fil i stället för att installera Playwrights Chromium.

Senast verifierat: 8 regel-/databastester, 2 webbläsartester mot yatzy-projektet och Pages-bygget godkända. Mobilbredd 390 px kontrollerad utan horisontell överrullning. Supabase säkerhetskontroll visar en informationsnotis om att `yatzy_private.rooms` saknar direkta RLS-policyer; detta är avsiktligt eftersom åtkomsten sker genom den skyddade RPC-funktionen.
