/*
 * Copyright (c) 2018-2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Chargy MobileApp <https://github.com/OpenChargingCloud/ChargyMobileApp>
 *
 * Licensed under the Affero GPL license, Version 3.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.gnu.org/licenses/agpl.html
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// asn1.js ships no types of its own. This describes the part of it Chargy
// actually uses - it is handed to ChargyCore, which does the decoding - and
// mirrors the declaration the WebApp carries for the same dependency.

declare module "asn1.js" {

    interface Asn1Builder {
        bitstr(): Asn1Builder;
        int(): Asn1Builder;
        key(name: string): Asn1Builder;
        obj(...items: unknown[]): Asn1Builder;
        objid(): Asn1Builder;
        seq(): Asn1Builder;
        seqof(schema: Asn1Schema): Asn1Builder;
    }

    interface Asn1Schema {
        // asn1.js schemas return caller-defined object shapes.
        // Keep the default dynamic so legacy decode callsites keep their previous behaviour.
        decode<T = any>(data: Uint8Array | ArrayBuffer, encoding: string): T;
    }

    const asn1: {
        define: (name: string, body: (this: Asn1Builder) => void) => Asn1Schema;
    };

    export = asn1;

}
