# Security-Backlog und GitHub-PRs

Stand: 17.10.2026. Geprüfte Basis: `8a7bd3199f634040b45eb54b493435874725dfb6`.

Die öffentliche GitHub-API meldet 20 offene PRs. Das ist keine vollständige
Ansicht privater GitHub-Security-Alerts. Ein Dependabot-PR ist nicht automatisch
ein Security-Fix. Die PRs wurden NICHT remote gemergt oder geschlossen.
Der öffentliche Snapshot liegt in `github-open-prs.json`.

## Aktueller Dependency-Stand

`npm audit fix --ignore-scripts` ohne `--force` hat kompatible Updates im Lockfile
übernommen. Die Zählung bezeichnet betroffene Pakete einschließlich transitiver
Abhängigkeiten, nicht 60 unabhängige Schwachstellen.

| Scan | Kritisch | Hoch | Moderat | Niedrig | Gesamt |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vorher | 7 | 39 | 13 | 1 | 60 |
| Nach kompatiblen Updates | 0 | 2 | 11 | 0 | 13 |

- [ ] **P0 vor Desktop-Release:** Electron auf eine laut aktuellem Audit sichere
  Version migrieren (derzeit Fixvorschlag 44.9.0), IPC, Preload, Packaging,
  Signierung und Updater auf Windows/Linux/macOS testen. Ein alter 40.x-PR allein
  beseitigt die aktuell gemeldete Schwachstelle nicht.
- [ ] **P1:** Sharp auf eine sichere Version migrieren (Fixvorschlag 0.35.5),
  Icon-/Bildbuild prüfen. Kein erzwungener Major-/0.x-Minor-Sprung im Patch.
- [ ] **P1:** Moderate transitive Funde in Electron-Buildtools und Capacitor CLI
  lösen; keine pauschalen Overrides ohne Kompatibilitätsprüfung.
- [ ] CI-Actions separat aktualisieren und echte CI-/Native-Builds abwarten.

`npm audit --omit=dev` meldet derzeit 0 Einträge. Das ist **keine Entwarnung
für die ausgelieferte Desktop-App**: Electron ist als Dev-Abhängigkeit deklariert,
wird aber als Runtime mit ausgeliefert. Der vollständige Audit bleibt maßgeblich.

## Offene GitHub-PRs und lokale Einordnung

| PR | Titel | Stand / nächster Schritt |
| --- | --- | --- |
| [#66](https://github.com/WLANRouterKing/seal/pull/66) | build(deps-dev): bump @xmldom/xmldom from 0.8.11 to 0.8.13 | Lockfile aktualisiert; Paketversionen siehe unten. |
| [#65](https://github.com/WLANRouterKing/seal/pull/65) | build(deps-dev): bump the dev-dependencies group across 1 directory with 13 updates | Gruppiertes Dev-Update: Differenz und Build-Matrix vor Merge prüfen. |
| [#64](https://github.com/WLANRouterKing/seal/pull/64) | build(deps-dev): bump follow-redirects from 1.15.11 to 1.16.0 | Lockfile aktualisiert; HTTP-Redirect-Abhängigkeiten erneut auditiert. |
| [#62](https://github.com/WLANRouterKing/seal/pull/62) | build(deps-dev): bump axios from 1.13.3 to 1.15.0 | Lockfile aktualisiert; Axios erneut auditiert. |
| [#61](https://github.com/WLANRouterKing/seal/pull/61) | build(deps-dev): bump lodash from 4.17.23 to 4.18.1 | Lockfile aktualisiert; Lodash erneut auditiert. |
| [#60](https://github.com/WLANRouterKing/seal/pull/60) | build(deps): bump the production-dependencies group across 1 directory with 7 updates | Gruppiertes Produktionsupdate: API-/Gerätetests vor Merge prüfen. |
| [#59](https://github.com/WLANRouterKing/seal/pull/59) | build(deps-dev): bump vite from 7.3.1 to 7.3.2 | Vite lokal auf 7.3.7 aktualisiert; Build erfolgreich. |
| [#58](https://github.com/WLANRouterKing/seal/pull/58) | build(deps-dev): bump electron from 40.0.0 to 40.8.5 | Electron lokal auf 40.10.6; PR-Ziel überholt, aktueller Audit verlangt 44.9.0. NICHT als erledigt betrachten. |
| [#54](https://github.com/WLANRouterKing/seal/pull/54) | build(deps): bump codecov/codecov-action from 5 to 6 | GitHub Action unverändert; Laufzeit-/Runner-Kompatibilität prüfen. |
| [#52](https://github.com/WLANRouterKing/seal/pull/52) | build(deps): bump picomatch | Transitive Abhängigkeiten aktualisiert; Audit enthält keinen picomatch-Eintrag mehr. |
| [#50](https://github.com/WLANRouterKing/seal/pull/50) | build(deps): bump gradle/actions from 4 to 6 | Gradle Action unverändert; Android-Build vor Merge prüfen. |
| [#49](https://github.com/WLANRouterKing/seal/pull/49) | build(deps-dev): bump flatted from 3.3.3 to 3.4.2 | Transitive Abhängigkeiten aktualisiert; Audit enthält keinen flatted-Eintrag mehr. |
| [#45](https://github.com/WLANRouterKing/seal/pull/45) | build(deps): bump tar, @capacitor/cli and electron-builder | Kompatible npm-Updates übernommen; Electron-/Capacitor-Build-Matrix bleibt offen. |
| [#42](https://github.com/WLANRouterKing/seal/pull/42) | build(deps): bump actions/upload-artifact from 4 to 7 | Upload Action unverändert; Artefakt-/Runner-Kompatibilität prüfen. |
| [#41](https://github.com/WLANRouterKing/seal/pull/41) | build(deps): bump rollup | Rollup lokal aktualisiert; Audit enthält keinen Rollup-Eintrag mehr. |
| [#40](https://github.com/WLANRouterKing/seal/pull/40) | build(deps-dev): bump minimatch from 3.1.2 to 3.1.5 | Transitive Abhängigkeiten aktualisiert; Audit enthält keinen minimatch-Eintrag mehr. |
| [#31](https://github.com/WLANRouterKing/seal/pull/31) | build(deps): bump @nostrify/nostrify from 0.48.3 to 0.49.2 | Nostrify 0.49.x: API-/Protokoll-Kompatibilität separat prüfen. |
| [#28](https://github.com/WLANRouterKing/seal/pull/28) | build(deps): bump actions/setup-python from 5 to 6 | Python Setup Action unverändert; CI prüfen. |
| [#7](https://github.com/WLANRouterKing/seal/pull/7) | build(deps): bump @noble/hashes from 1.8.0 to 2.0.1 | Noble Hashes 2.x: Breaking Changes / Importpfade separat prüfen, nicht erzwungen. |
| [#4](https://github.com/WLANRouterKing/seal/pull/4) | build(deps): bump actions/checkout from 4 to 6 | Checkout Action unverändert; Runner und Credentials-Verhalten prüfen. |

## Ausgewählte lokal aufgelöste Versionen

| Paket | Version |
| --- | --- |
| `@xmldom/xmldom` | 0.8.15 |
| `axios` | 1.20.0 |
| `follow-redirects` | 1.16.1 |
| `lodash` | 4.18.1 |
| `flatted` | 3.4.4 |
| `rollup` | 4.64.8 |
| `vite` | 7.3.7 |
| `electron` | 40.10.6 |
| `sharp` | 0.34.5 |
| `@capacitor/android` | 8.5.3 |
| `@capacitor/ios` | 8.5.3 |
| `@capacitor/cli` | 8.5.3 |
| `electron-builder` | 26.15.3 |
| `@noble/hashes` | 1.8.0 |
| `@nostrify/nostrify` | 0.48.3 |

## Verbleibende Audit-Einträge

| Paket | Stufe | Advisory / Herkunft |
| --- | --- | --- |
| `@capacitor/cli` | moderate | `xcode` |
| `@electron/get` | moderate | `global-agent` |
| `app-builder-lib` | moderate | `@electron/get`, `dmg-builder`, `electron-builder-squirrel-windows` |
| `dmg-builder` | moderate | `app-builder-lib` |
| `electron` | high | https://github.com/advisories/GHSA-9f4c-93c8-jc8g, https://github.com/advisories/GHSA-hq2x-r82h-9wj4, https://github.com/advisories/GHSA-gr2m-v5gq-v685, https://github.com/advisories/GHSA-j84w-jfhq-vhvj, https://github.com/advisories/GHSA-vv43-5jgx-7qv8, https://github.com/advisories/GHSA-9qh4-3jw8-366w |
| `electron-builder` | moderate | `app-builder-lib`, `dmg-builder` |
| `electron-builder-squirrel-windows` | moderate | `app-builder-lib` |
| `global-agent` | moderate | `roarr` |
| `roarr` | moderate | `sprintf-js` |
| `sharp` | high | https://github.com/advisories/GHSA-f88m-g3jw-g9cj, https://github.com/advisories/GHSA-rgj7-g3m4-5g8c, https://github.com/advisories/GHSA-wq5f-xc86-pv6w |
| `sprintf-js` | moderate | https://github.com/advisories/GHSA-hp3w-g68c-fv3c |
| `uuid` | moderate | https://github.com/advisories/GHSA-w5hq-g745-h8pq |
| `xcode` | moderate | `uuid` |

## Anwendungssicherheit

- [x] Unsichere Biometriepfade deaktiviert, Passwortzugang erhalten.
- [x] Signaturen und Empfänger beim Entpacken prüfen.
- [x] Gesperrte verschlüsselte DB darf nicht in Klartext zurückfallen.
- [x] Kontaktbestätigung an unveränderlichen Public Key binden; keine Übernahme
  von Bestätigungen über den Gerätesync.
- [ ] Native Keystore/Keychain und WebAuthn PRF mit echten Geräten prüfen.
- [ ] Forward Secrecy / Geräteberechtigungen und Schlüsselrotation entwerfen.
- [ ] Versionsbasierte, speicherharte Passwort-KDF-Migration.
- [ ] Atomare Speichermigrationen, Recovery und Speicherbereinigung beim Sperren.
- [ ] Externer Audit vor Sicherheitsversprechen und Business-Verkauf.

## Merge-/Release-Reihenfolge

1. Diesen Patch auf einem Featurebranch prüfen (Sicherheitskorrekturen + UX).
2. Lockfile mit den Dependabot-PRs abgleichen; bereits überholte PRs neu bewerten.
3. Übrig gebliebene Security-Migrationen getrennt umsetzen und testen.
4. Native Builds, Relay-Interoperabilität und zwei Geräte testen.
5. Erst dann PRs auf GitHub zusammenführen und Release veröffentlichen.

Keine automatische Merge-Regel auf Basis der Dependabot-Kompatibilitätsanzeige.
