# Seal: nächste Produktetappen

## In diesem Patch umgesetzt

- Verständlicherer Einstieg und Links zu Quellcode/Sicherheitsgrenzen.
- Wiederherstellungsschlüssel vor dem Speichern einer neuen Identität bestätigen.
- Desktop: Chatliste, Namenssuche und Gespräch nebeneinander; mobile Einzelansicht.
- Einladungslink und QR mit öffentlichem Schlüssel im URL-Fragment.
- Einladungen bleiben während Einrichtung/Entsperren erhalten; Kontakt erst nach
  ausdrücklichem Hinzufügen speichern. Import unterstützt npub, nostr:npub und Seal-Links.
- Kontaktadresse persönlich/über vertrauten Kanal oder per QR vergleichen und
  lokal als bestätigt markieren. Die Bestätigung ist keine Firmenverifikation.

## Nächste kostenlose Kernfunktionen

- [ ] Persistente verschlüsselte Outbox; Retry mit Deduplizierung, Backoff und
  ehrlichen Statusbegriffen (Relay-Annahme ist keine Empfangsbestätigung).
- [ ] Verschlüsseltes Backup mit geprüftem Wiederherstellungsablauf.
- [ ] Geräteverwaltung und Widerruf auf Protokollebene.
- [ ] Gruppen mit geprüftem Schlüsselwechsel bei Mitgliedschaftsänderungen.
- [ ] Lokale Nachrichtensuche ohne serverseitigen Klartextindex.

## Bezahlbare Module als Produkthypothese

| Paket | Inhalt | Modell |
| --- | --- | --- |
| Free | Sichere Chats, Medien, Kontakte, Sicherheitsupdates | kostenlos |
| Plus | Lokale Organisationsfunktionen, mehrere Profile, Darstellung | Einmalkauf oder Jahreslizenz |
| Business | Firmenverzeichnis, Einladungen, Rollen, Geräteverwaltung | pro Nutzer/Jahr |
| Hosted | Privates Relay, verschlüsselter Speicher, Monitoring, Support | Abo |

Business zuerst mit wenigen Teams validieren. Noch kein Billing, kein
Lizenzserver und kein ausführbares Plugin-System implementiert. Sicherheits-
updates nicht hinter eine Paywall stellen. Module dürfen niemals den privaten
Identitätsschlüssel erhalten. Firmenmitglieder brauchen eigene Identitäten;
ein gemeinsam verteilter nsec ist kein Rollen-/Berechtigungssystem.
