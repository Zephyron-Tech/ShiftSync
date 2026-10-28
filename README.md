# ShiftSync

Nahraj PDF s plánem pracovní doby, vyber se a přidej si směny do kalendáře.

- Měsíční kalendář se směnami a denním světlem v Plzni.
- Přidání do Google Kalendáře (výběr kalendáře), do iPhone/Mac kalendáře (odběr) nebo stažení `.ics`.
- Volitelně WhatsApp bot: přepošleš PDF do chatu a přijde odkaz s náhledem.

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm test     # testy parseru potřebují lokální sluzby_listopad.pdf a sluzby_listopad.json, bez nich se přeskočí
```

## Soukromí

Při ručním nahrání se PDF čte v prohlížeči a nikam se neodesílá. U WhatsApp bota PDF prochází přes WhatsApp (Meta) a Vercel funkci, která ho zpracuje v paměti; samotné PDF ani směny kolegů se neukládají. Do soukromého Vercel Blobu se uloží jen jméno a směny odesílatele z `PERSON_MAP` (posledních 12 měsíců a 10 ručních úprav) a otisky (hash) ID zpráv kvůli opakovanému doručení. Odkaz z bota nese jen směny této osoby, zakódované za `#`. Odkazy `#s=` a `#e=` obsahují tajný token: kdo ho má, vidí a upravuje směny, proto je nikam nepřeposílej.

## Změny směn bez nového PDF

Když se směna změní a nepřijde nové PDF, jde ji upravit ručně. Kalendář odběru se obnoví do 24 hodin.

- **WhatsApp (bez AI, přesná syntaxe):** `zmena 12.11. D7`, `smaz 12.11.` (nebo `volno`), `presun 12.11. 14.11.`, `seznam`, `zpet`, `odkaz`, `pomoc`. Povolené kódy: D5, D6, D7, D7.3, D8, N18, N19, R, Ev, ŘD, Ne, NV, RH.
- **Web:** odkaz `#e=<token>` (z příkazu `odkaz`) otevře kalendář směn; klepnutím na den vybereš kód nebo volno, tlačítko Zpět vrací poslední úpravu.
- Nové PDF na stejný měsíc ruční úpravy přepíše a bot to napíše.
- Lokální vývoj bez Blobu: `SHIFTSYNC_STORE_DIR=/tmp/shiftsync pnpm dev`.

## WhatsApp bot

1. Meta for Developers: aplikace s use case *Connect with customers through WhatsApp*, testovací číslo, příjemci (vy dva), trvalý token ze System Usera.
2. Nastav proměnné z `.env.example` ve Vercelu (Settings > Environment Variables) a nasaď.
3. Webhook: *WhatsApp > Configuration > Edit*, Callback URL `https://<doména>/api/whatsapp`, Verify token = `WHATSAPP_VERIFY_TOKEN`, pak odebírat pole `messages`.
4. Napiš botovi a přepošli PDF.

## Testy s ukázkovým PDF

`sluzby_listopad.pdf` a `sluzby_listopad.json` (obojí jen lokálně, v `.gitignore`) obsahují skutečná jména. JSON určuje, koho testy hledají:

```json
{ "person": "Příjmení Jméno", "nightPerson": "Příjmení Jméno" }
```

## Google Kalendář (přímý zápis)

1. Google Cloud Console: nový projekt, *APIs & Services > Library > Google Calendar API > Enable*.
2. *OAuth consent screen*: typ External, stav Testing, přidej oba uživatele jako Test users.
3. *Credentials > Create credentials > OAuth client ID > Web application*; do *Authorized JavaScript origins* dej adresu appky (a `http://localhost:3000`).
4. Zkopíruj Client ID do `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Vercel + `.env.local`).

Směny se zapisují přes `events.import` s pevným UID, takže opakované přidání je přepíše, nezdvojí.
