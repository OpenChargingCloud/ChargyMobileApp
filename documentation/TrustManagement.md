# Trust Management

Die Konfiguration enthält **Trust Management** mit den Unterseiten
**Roamingnetze**, **Trust Anchors** und **Mitgelieferte Public Keys**. Der Zurück-Button führt
jeweils eine Ebene zurück. Die bisherigen Einstellungen für Live-Datenserver
bleiben eine eigene Konfigurationsseite.

## Import und Verwerfen

Der Import hat zwei getrennte Schritte:

1. Nach Scan, Einfügen oder Dateiauswahl zeigt die Vorschau ausschließlich den
   Inhalt des Anchors: Netzwerk-ID, Quellen, gegebenenfalls Texte, Holder-Gruppen,
   Quorum und Key-Hashes. Es erscheinen noch keine Prüfstatus, vollständigen Keys
   oder Vertrauensaktionen. Die Buttons heißen **Importieren** und **Abbrechen**.
   Sie bleiben auch auf kleinen Bildschirmen im festen Dialogfuß erreichbar.
2. Erst **Importieren** lädt `GET {Quelle}/keyStatement` mit den vollständigen
   Identity Keys und Signaturen. Anschließend erscheinen die echten Ergebnisse
   für **Signaturen gültig**, **Unterzeichner vertraut**, **Quorum erfüllt** und
   den Gültigkeitszeitraum. Bei korrekten Signaturen und gültigem Zeitraum werden
   Anchor und Originaldokument gespeichert, auch bei unbekannten Unterzeichnern.
   Erst jetzt ist optionales manuelles Schlüsselvertrauen verfügbar.

Der QR-Code enthält ausschließlich Fingerprints der Keys, keine vollständigen
Public Keys; dies hält auch bei PQC-Schlüsseln den QR-Inhalt klein. Der Download
lädt nicht das vollständige Roamingnetz mit seinen Stationen.

### Visuelle Fingerprints

Key-Hashes erscheinen primär als blaue Drunken-Bishop-Rasterbilder. Pro Key wird
ein Bild aus den unveränderten Hashbytes erzeugt; Holder-Gruppen bleiben getrennt.
Dies ist schon vor **Importieren** lokal möglich. **Fingerprint anzeigen** öffnet
den vollständigen Hash mit einer Kopieraktion. Dieselbe Darstellung wird in den
geladenen Key-Details, der manuellen Bestätigung und im Trust Management benutzt.
Die Bildfarben stehen für Besuchshäufigkeiten und haben keine Vertrauensbedeutung.
Die tatsächliche Prüfung und das Quorum verwenden weiterhin vollständige IDs.

`src/ts/securityFingerprint.ts` fixiert für `drunken-bishop-v1` das 17×9-Raster,
den Start in der Mitte, die Reihenfolge der Zweibit-Schritte (niedrigste zuerst),
die Randbegrenzung und das Zählen nach jedem Schritt entsprechend Styx. Die
Farbpalette und Geometrie liegen zentral in `src/scss/defaults.scss`; alle
Ansichten verwenden `src/ts/securityFingerprintView.ts`. Änderungen der Abbildung
benötigen eine bewusste Versionierung, damit Fingerprints nicht beim App-Update
anders aussehen. Die Bilder dienen dem Wiedererkennen und sind nicht
kollisionsfreie Identifikatoren. Getrennte Prüfstatus zeigen das Vertrauen an.

Kamera-Scanner, Copy & Paste, Dateiauswahl und Drag & Drop verwenden dieselbe
TA-Erkennung. Unterstützt werden kompakter `WWCP/TA-2`-Text, TA-URLs,
JSON-TrustAnchors, JSON-Antworten mit `trustAnchor` und QR-Bilder. Die Erkennung
folgt vor **Importieren** keinen URLs und liest auch keinen lokalen Trust-Status.
TrustAnchor-Dateien
müssen einzeln ausgewählt werden; eine Mehrfachauswahl mit einem Anchor wird
vollständig zurückgewiesen, damit keine anderen Dateien unbemerkt verloren gehen.

Nach dem Download bietet die Ansicht **Erneut laden** und **Schließen**.
Beim erneuten Import desselben Anchors wird dessen geladenes Dokument aktualisiert;
vorhandene lokale Key-Entscheidungen bleiben erhalten. Abbrechen vor oder während
des Downloads speichert keinen neuen Import. Der Download wird abgebrochen;
verspätete Antworten ändern eine geschlossene Ansicht nicht.
Netzwerkfehler erlauben einen erneuten Versuch. Fehlerhafte Signaturen oder
abgelaufene Dokumente werden als fehlgeschlagene Prüfungen angezeigt und nicht
gespeichert; manuelles Vertrauen kann diese Fehler nicht übergehen.
Speicherfehler werden ebenfalls ausdrücklich angezeigt.

Downloads verwenden ausschließlich erlaubte HTTP(S)-Quellen gemäß den
Build-Transportregeln, ohne Cookies, ohne Weiterleitungen, mit 15 Sekunden
Timeout pro Quelle und maximal 1 MiB Antwortdaten. Weitere Quellen aus demselben
Anchor werden bei Fehlern versucht. Die App verwendet den WWCP-JSON-Parser und
die Verifikationsfunktionen der Bibliothek. Die Quelle des Dokuments, Netzwerk-ID,
Public-Key-Thumbprints, alle Signaturen, Zeiträume, Holder-Zuordnung und das
größere der beiden Quoren aus Anchor und KeyStatement werden geprüft.

Die Duplikatkennung ist ein SHA-256-Hash von Netzwerk-ID, nach Inhabern
gruppierten Schlüssel-IDs, Quorum und normalisierten Datenquellen. Ein
anderer Anzeigename oder die URL- statt der kompakten QR-Darstellung erzeugt
keine zweite Kopie. Andere Schlüssel, Quoren oder Datenquellen bleiben
getrennte Einträge und überschreiben keinen vorhandenen Anchor.

## Lokaler Speicher

Die App verwendet IndexedDB **`ChargyTrustManagement`**, Schema-Version **2**:

| Object Store | Schlüssel / Inhalt |
| --- | --- |
| `trustAnchors` | `id`: Duplikatkennung; `qrCode`: vollständiger kanonischer Anchor; `sourceText`: ursprünglicher Eingabetext; `importedAt`: UTC-Importzeit; optional `trustedKeys`: explizite Entscheidungen mit Key-ID und `acceptedAt`; optional `downloadedData`: Quelle, Downloadzeit und Original-JSON des KeyStatements |
| `deletedBundledKeys` | `id`: Thumbprint eines für diese Installation entfernten mitgelieferten Keys |
| `poiStationProofs` | Original-JSON des Stationsproofs, Policy-ID und Anchor, EVSE, Quelle, Download- und Prüfzeit; inhaltsbasierte ID, kein gespeicherter Vertrauensstatus |

Duplikatprüfung und Import laufen in einer gemeinsamen Schreibtransaktion.
Auch zwei gleichzeitig importierende Tabs erzeugen dadurch nur einen Eintrag.
Gespeicherte Anchor-Inhalte werden beim Lesen erneut geparst und gegen ihre
Kennung geprüft. Es wird kein gespeicherter grüner Prüfstatus übernommen.

Die Daten bleiben bei Reloads und Browser-Neustarts erhalten, gelten aber
für das jeweilige Browserprofil und die Herkunft der MobileApp. Das Löschen
der Browserdaten entfernt auch die Imports und lokalen Key-Ausschlüsse.

## Optionales manuelles Schlüsselvertrauen

Nach dem Import bietet die Vorschau pro unbekanntem beziehungsweise lokal
entferntem Schlüssel **Diesem Schlüssel vertrauen …** an. Dieselben Aktionen
stehen in den gespeicherten Anchors und den Roamingnetzdetails zur Verfügung.
Eine gesonderte Bestätigung zeigt Fingerprint, Netzwerk-ID, Datenquellen,
Inhaberzuordnung und Quorum. Abbrechen speichert kein Vertrauen.

Die Entscheidung gilt ausschließlich für diese vollständige
TrustAnchor-Konfiguration. Änderungen an Netzwerk-ID, Datenquellen, Quorum oder
Inhabergruppen erhalten kein Vertrauen aus einem anderen Import. Ein
Fingerprint ist zunächst ein Pin: Erst das geladene und geprüfte Schlüsselmaterial
ermöglicht die Bestätigung. Die vollständigen Public Keys sind in Details
einsehbar. Nach einer Entscheidung werden Unterzeichnervertrauen und Quorum neu
berechnet. Signatur- und Gültigkeitsprüfung bleiben davon unabhängig. Der
Prüfbereich wird nur bei vollständig erfolgreichen Prüfungen insgesamt grün.

Die Entscheidung wird mit UTC-Zeit im bestehenden Anchor-Datensatz gespeichert;
die additive Erweiterung benötigt keine neue IndexedDB-Version. Alte Datensätze
ohne `trustedKeys` enthalten keine manuellen Entscheidungen. Import und
Duplikaterkennung erhalten vorhandene Entscheidungen. Änderungen einzelner Keys
laufen als atomare Lese-/Schreibtransaktionen und überschreiben keine parallel
erteilten Entscheidungen für andere Keys.

**Manuelles Vertrauen zurücknehmen** entfernt die einzelne Entscheidung.
Das Löschen des Anchors oder Roamingnetzes entfernt auch dessen Entscheidungen.
Die mitgelieferte JSONL-Liste und ihre lokalen Ausschlüsse werden dabei nicht
verändert. Ein dort gelöschter Key kann ausdrücklich nur für diese Konfiguration
wieder akzeptiert werden. Eine bekannte abgelaufene Key-Gültigkeit lässt sich
dadurch nicht umgehen. Mitgeliefertes Vertrauen bleibt unabhängig bestehen,
wenn nur eine zusätzliche manuelle Entscheidung zurückgenommen wird.

`trustedAnchorHolders` in `src/ts/anchorKeyTrust.ts` liefert die aktuell
verfügbaren Pins mit unveränderter Holder-Gruppierung für die
KeyStatement-Prüfung. Diese Auswahl ist selbst noch kein Signatur- oder
Quorumnachweis. Die gemeinsame Library erzeugt über `TrustContext.evaluate/create`
erst nach vollständiger Prüfung einen Kontext. Signaturen, Inhaberzuordnung,
Quorum und Bindung an Netz, Betreiber und signierten Statement-Inhalt liegen in
WWCP_POI.TS; diese Regeln werden nicht in jeder Chargy-App erneut implementiert.
Die App verwendet die veröffentlichte npm-Version 0.2.0. Das App-Lockfile verwendet
den Integritätswert des veröffentlichten Tarballs; die App wird nach einer
frischen Installation aus der Registry geprüft.

`POITrustService` liest für jede Folgeprüfung Anchor und Key-Ausschlüsse in
einer gemeinsamen IndexedDB-Transaktion. Es gibt keinen gespeicherten grünen
Vertrauensstatus und keinen Rückfall auf ungefilterte mitgelieferte Keys bei
Speicherfehlern. Ein bereits ausgewerteter Kontext ist nur ein Bericht für seinen
Prüfzeitpunkt; nach geänderten Entscheidungen wird er neu erzeugt.

## Verwaltung und Löschen

**Roamingnetze** führt bestätigte Netz-, Betreiber- und Anchor-Konfigurationen
als eigenständige Identitäten. Nicht bestätigte Imports bleiben pro Konfiguration
isoliert, auch bei gleicher Netzwerk-ID. Ein Klick öffnet **Details und Vertrauen**. Dort stehen die
Netzwerk-ID, der Anzeigename aus dem Anchor, die zugehörigen Datenquellen
und die einzelnen Vertrauenskonfigurationen mit Schlüsselinhabern und Quorum.
Unterschiedliche Anchors desselben Netzes werden nicht zu einer gemeinsamen
Schlüsselliste oder einem gemeinsamen Quorum verschmolzen.

Ein **KeyStatement** gehört zum Roamingnetzbetreiber in einem bestimmten
Roamingnetz: Es benennt `roamingNetworkId`, `roamingNetworkOperatorId`, die
Identitätsschlüssel, das Quorum, Gültigkeitszeiten und Signaturen. Die Netzansicht
prüft die gespeicherten Originaldokumente mit der jeweils aktuellen Vertrauensbasis
erneut. Alte Imports ohne geladenes KeyStatement bleiben ausdrücklich als nicht
prüfbar erkennbar; sie können erneut gescannt und über **Importieren** nachgeladen
werden. Die Netzansicht selbst lädt keine Daten automatisch nach. Namen aus
Anchors sind weiterhin keine durch eine Root-Attestierung bestätigten Angaben.

Für jede Schlüssel-ID wird separat angezeigt, ob sie in der mitgelieferten
Vertrauensliste steht, lokal gelöscht wurde, unbekannt ist oder außerhalb
ihrer zeitlichen Gültigkeit liegt. Diese Zuordnung wird aus der aktuellen
Key-Konfiguration berechnet; sie beweist noch keine Signatur eines
KeyStatements und kein erfülltes Quorum.

**Roamingnetz löschen** entfernt alle lokal gespeicherten Trust Anchors der
angezeigten Konfiguration in einer gemeinsamen IndexedDB-Transaktion. Andere
Konfigurationen mit gleicher Netz-ID, mitgelieferte Public Keys und lokale Ausschlüsse
bleiben erhalten. Die Netzliste wird direkt aus den gespeicherten Anchors
gebildet; deshalb ist keine zusätzliche Datenbankmigration nötig. Nach dem
Löschen des letzten Anchors eines Netzes verschwindet es auch aus der Liste.

**Trust Anchors** listet die Imports mit Netzwerk, Importzeit, Datenquellen,
Quorum und Schlüssel-IDs. **Trust Anchor löschen** entfernt nur den gewählten
Import. Derselbe Anchor kann anschließend erneut importiert werden.

**Mitgelieferte Public Keys** zeigt die beim Build eingebetteten Keys.
**Key löschen** speichert einen lokalen Ausschluss anhand des Thumbprints:
Der Key wird in dieser Installation nicht mehr als vertrauenswürdig
bereitgestellt. Sein unveränderlicher ursprünglicher Inhalt bleibt im
App-Bundle enthalten und wird in der Verwaltung als gelöscht angezeigt.
**Key wiederherstellen** entfernt diesen Ausschluss wieder.

Die Ausschlüsse werden nicht automatisch bei einem App-Update aufgehoben.
Die Entfernung eines Keys löscht keinen gespeicherten Trust Anchor. Sie
verändert die verfügbare Vertrauensbasis für dessen nachfolgende Prüfungen.

Code, der tatsächlich Vertrauen prüft, muss lokale Key-Ausschlüsse berücksichtigen,
entweder über `getActiveBundledTrustedPublicKeys(store)` oder die scoped Auswahl
`trustedAnchorHolders`. Die rohe Liste
`bundledTrustedPublicKeys` dient der Verwaltung der ursprünglichen Keys.
Bei einem Speicherfehler wird nicht auf diese ungefilterte Liste zurückgefallen.

Implementierung: `src/ts/trustStore.ts`, `src/ts/trustManagement.ts`, `src/ts/roamingNetworks.ts`,
`src/ts/trustAnchorPreview.ts`. Die Build-Liste und ihr Format sind unter
[`src/trust/README.md`](../src/trust/README.md) dokumentiert.

TA-Fixtures einschließlich scannbarer Bilder und eines tatsächlich mehrfach
signierten KeyStatements liegen unter
[`tests/fixtures/TrustAnchors`](../tests/fixtures/TrustAnchors/README.md).
`tests/trustAnchorImport.test.ts` prüft die gemeinsamen Importformate und
Fehlerfälle; `tests/anchorKeyTrust.test.ts` prüft Vertrauensgrenzen und Quorum
gegen die Signaturen der Fixture. Die bestehenden Parser-, Identitäts- und
Gruppierungstests bleiben erhalten.
`tests/trustAnchorData.test.ts` prüft Downloadgrenzen, Quellenauswahl,
Netzbindung, Signaturen, Quorum, Gültigkeit und Abbruch.
`tests/poiTrustContext.test.ts` prüft die gemeinsame Autorisierung mit aktuellen
Speicherentscheidungen, Widerruf, Speicherfehlern, Ablauf, getrennten Identitäten
und einem echten Stationsproof. Stationsdownload und Zuordnung zum Ladevorgang
sind ebenfalls integriert; siehe [Port- und Prüfübersicht](WWCP-POI-Mobile-Port.md).

Die folgenden QA-Notizen beschreiben die ursprüngliche WebApp-Prüfung vom
31. Oktober 2026. Die aktuelle mobile Browserprüfung und ihre Grenzen sind
in der [Portübersicht](WWCP-POI-Mobile-Port.md) dokumentiert.

Ursprüngliche Browser-QA gegen den Produktionsbuild: Chromium via
Playwright, Desktop 1280×900 und Mobilansicht 390×844. Geprüft wurden echte
Clipboard-Textübergabe, Dateiauswahldialog, Drag & Drop, JSON-Antworten,
SVG-/GIF-QR-Dateien sowie ein Kamerascan mit simuliertem Videostream. Bestätigen,
Abbrechen, Widerrufen, Persistenz nach Reload, Löschen/Reimport, isoliertes
Vertrauen pro Anchor und Fehler bei nicht verfügbarem IndexedDB wurden geprüft.
Zusätzlich wurden gleichzeitige Entscheidungen in zwei Tabs und eingeschleuste
Vertrauensbehauptungen getestet. Der zweistufige Ablauf wurde zusätzlich mit
kontrollierten POI-Antworten, Abbruch während eines Downloads, Mirror-Fallback,
manipulierten und abgelaufenen Statements sowie einem erneuten Versuch geprüft.
Es gab keine unerwarteten Konsolenfehler; die absichtlich simulierten HTTP-503-
Antworten erzeugen erwartete Browser-Netzwerkfehler. TA-Erkennung vor
**Importieren** und spätere einzelne Vertrauensentscheidungen lösen keine
POI-Downloads aus. Erst **Importieren** beziehungsweise **Erneut laden** fragt
das KeyStatement ab.
Ein Test mit physischer Kamera ist davon nicht abgedeckt. Die POI-Endpunkte
werden in der Browser-QA kontrolliert simuliert; dies ist kein Integrationstest
gegen einen produktiven POI-Server.

## Stationsproof laden und anzeigen

✅ In den Roamingnetzdetails führt **Ladestation prüfen** zur EVSE-Eingabe.
Der Abruf verwendet ausschließlich Quellen des ausgewählten Anchors und benötigt
ein aktuell vertrauenswürdiges KeyStatement. Nach dem Download werden die lokalen
Vertrauensentscheidungen erneut gelesen. Die gemeinsame POI-Library prüft die
angefragte EVSE, RNO-Zertifikate, Attestierungen, Quorum und Merkle-Inclusion.

Bei Erfolg erscheint ein grüner Prüfbereich mit Haken, bei Hinweisen ein gelber.
Details zeigen EVSEs, Zähler und Keys, statische Tarifdefinitionen, Quorum,
Versionsdaten und Originalproof. Das Ergebnis bestätigt diese Stationsversion
zum angezeigten Prüfzeitpunkt; Zählerwertsignaturen, dynamische Preise und
Veröffentlichungsnachweise werden dadurch noch nicht bestätigt.

Der Originalproof wird mit Herkunft in einem lokalen Cache gespeichert.
**Öffnen und erneut prüfen** validiert ohne erneuten Download gegen heutiges
Vertrauen und die aktuelle Zeit. Speicherfehler erscheinen getrennt vom
Prüfergebnis und erlauben einen erneuten Speicherversuch. Abbrechen oder
Navigation bricht laufende Abrufe ab.

Die Migration von Version 1 auf 2 erhält vorhandene Anchors und Key-Entscheidungen.
Einzelne Proofs lassen sich löschen; beim Löschen eines Anchors beziehungsweise
der angezeigten Netzkonfiguration wird auch deren Stationsproof-Cache atomar
entfernt. Dies ist noch kein historisches Sitzungsarchiv.

[English feature guide, screenshots and maintenance](WWCP-POI-Station-Proof.md).

## Mitgelieferte Vertrauensbasis eines Ladevorgangs

Ein Ladevorgang kann jetzt ein `poiEvidence`-Objekt mit EVSE-Proof, TrustAnchor
und signiertem KeyStatement mitliefern. Die Ladevorgangsansicht erlaubt den
ausdrücklichen Import dieser Vertrauensbasis ohne Netzabruf. Die Vorschau zeigt
zunächst nur den Anchor; nach „Importieren“ erscheinen die normalen Prüfungen
und optionalen manuellen Vertrauensentscheidungen. Es entsteht kein Vertrauen
allein aus dem Dateiinhalt. Mitgelieferte Dokumente tragen `origin: "embedded"`;
die angegebene Quelle wird ausdrücklich als deklarierte Quelle gekennzeichnet.

[Completed-session example and illustrated workflow](WWCP-POI-Session-Integration.md).
