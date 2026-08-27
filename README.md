# Chargy Mobile App

[![CI](https://github.com/OpenChargingCloud/ChargyMobileApp/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenChargingCloud/ChargyMobileApp/actions/workflows/ci.yml)
[![Nightly](https://github.com/OpenChargingCloud/ChargyMobileApp/actions/workflows/nightly.yml/badge.svg)](https://github.com/OpenChargingCloud/ChargyMobileApp/actions/workflows/nightly.yml)

Chargy is a transparency software for secure and transparent e-mobility charging processes, as defined by the German "Eichrecht". The software allows you to verify the cryptographic signatures of energy measurements within charge detail records and comes with a couple of useful extentions to simplify the entire process for endusers and operators.

Chargy was inspired by [TRuDI](https://www.ptb.de/cms/ptb/fachabteilungen/abt2/fb-23/ag-234/info-center-234/trudi.html) an Open Source Software project for transparency of smart meters.


You can find the app within the following app stores:
- Google PlayStore: [Chargy Transparenz Software](https://play.google.com/store/apps/details?id=cloud.charging.open.chargy.mobile)


## Benefits of Chargy

1. Chargy comes with __*meta data*__. True charging transparency is more than just signed smart meter values. Chargy allows you to group multiple signed smart meter values to entire charging sessions and to add additional meta data like EVSE information, geo coordinates, tariffs, ... within your backend in order to improve the user experience for the ev drivers.
2. Chargy is __*secure*__. Chargy implements a public key infrastructure for managing certificates of smart meters, EVSEs, charging stations, charging station operators and e-mobility providers. By this the ev driver will always retrieve the correct public key to verify a charging process automatically and without complicated manual lookups in external databases.
3. Chargy is __*platform agnostic*__. The entire software is available for desktop and smart phone operating systems and .NET. If you want ports to other platforms or programming languages, we will support your efforts.
4. Chargy is __*Open Source*__. In contrast to other vendors in e-mobility, we belief that true transparency is only trustworthy if the entire process and the required software is open and reusable under a fair copyleft license (AGPL).
5. Chargy is __*open for your contributions*__. We currently support adapters for the protocols of different charging station vendors like chargeIT mobility, ABL (OCMF), chargepoint. The certification at the Physikalisch-Technische Bundesanstalt (PTB) is provided by chargeIT mobility. If you want to add your protocol or a protocol adapter feel free to read the contributor license agreement and to send us a pull request.
6. Chargy is __*white label*__. If you are a supporter of the Chargy project you can even use the entire software project under the free Apache 2.0 license. This allows you to create proprietary forks implementing your own corporate design or to include Chargy as a library within your existing application (This limitation was introduced to avoid discussions with too many black sheeps in the e-mobility market. We are sorry...).
7. Chargy is __*accessible*__. For public sector bodies Chargy fully supports the [EU directive 2016/2102](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32016L2102) on the accessibility of websites and mobile applications and provides a context-sensitive feedback-mechanism and methods for dispute resolution.


## Supported Charge Transparency Data Formats

Currently supported formats include:

- **Alfen** charge transparency data
- **Bauer** energy meter data (2 format variants)
- **ChargePoint** transparency data (2 format variants)
- **EDL40** and **ISA-EDL40 SML** data
- **EMH** energy meter data
- **Mennekes** XML
- **OCMF**, versions v1.1 to v1.4
  - Bonner Eichrechtstage **Tariff Text** Extensions
  - EdDSA support: Ed25519 and Ed448
  - Post-Quantum Cryptography support: ML-DSA-44, ML-DSA-65, ML-DSA-87
- **Porsche Charging Data Format (PCDF)**

Supported representations include:

- **Plain Files** containing a single charge transparency data set.
- **chargeIT Container Format**, a JSON-based container format for a single charging session (2 format variants).
- **Chargy Container Format**, a JSON-based container format for multiple charging sessions.
- **SAFE XML Container Format**, an XML-based container format for a single charging session, optionally enriched with additional Chargy metadata about the charging session.
- **PTB Container Format**, a JSON-based container format for a single charging session.
- **Archive formats** such as ***tar, ZIP, tar.gz***, and similar formats that combine or compress multiple charge transparency files.
- **QR-Code images**, such as ***PNG, JPG, JPEG or SVG files***, where the QR-Code represents a charge transparency data set.
- **PDF/A-3** files transporting a charge transparency file as an embedded additional data stream.


## Building from Source

Chargy Mobile is an [Apache Cordova](https://cordova.apache.org) application
for Android and iOS. A browser target is available for development and testing.

For prerequisites, installation, tests, and regular browser or native builds,
follow the [build guide](documentation/BUILD.md).

If a regular build fails because installed dependencies, generated web assets,
Cordova platforms, or plugins are inconsistent, follow the
[rebuild and recovery guide](documentation/REBUILD.md).

Before release updates do not forget to:
```
npx cordova prepare android
```


## Funding

This Open Source project is partially funded by the [NGI Zero Commons Fund](https://nlnet.nl/commonsfund/) as part of our [EVQI project](https://nlnet.nl/project/EVQI/).

We also appreciate any additional funding and long-term support for the Chargy family, for example via [GitHub Sponsors](https://github.com/sponsors/GraphDefined), as it helps us keep the project sustainable, independent and useful for the entire e-mobility community.

<center>
  <img src="src/images/NGI0_tag.svg" height="30">
</center>
