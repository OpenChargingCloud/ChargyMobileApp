import * as ACrypt from './ACrypt';
import * as iface from './chargyInterfaces';

export default class OCMF extends ACrypt.ACrypt {

    private meterPublicKey: string;

    private parsedValues: {
        rawOCMFString: string;
        rawOCMFSignature: string;
        publicKey: string;
    }[] = [];

    //die ACrypt Klasse schrieb die so vor wir Umgehen das
    constructor(rawSignedValues: string[], publicKey: string) {

        super("OCMF (PTB)", null, null);

        // Erwartet: ["OCMF|...|SD=xxxx", "OCMF|...|SD=yyyy"]
        this.meterPublicKey = publicKey;
        this.parsedValues = rawSignedValues.map(v => this.parseOCMF(v));

    }

    private parseOCMF(raw: string) {

        const parts = raw.split("|");
        const lastPart = parts[parts.length - 1];

        // Teil 0 = "OCMF"
        // Teil 1 = JSON-Payload
        // Teil 2 = {"SD":"..."}

        const jsonPayload = parts[1];  // das ist der signierte Teil
        const signatureJson = JSON.parse(parts[2]);
        const signature = signatureJson.SD;

        return {
            rawOCMFString: jsonPayload,
            rawOCMFSignature: JSON.stringify({ SD: signature }),
            publicKey: ""
        };
    }

    public async SignMeasurement(measurementValue: iface.IMeasurementValue): Promise<iface.ICryptoResult> {
        // OCMF unterstützt keine Messwertsignaturen somit machen wir hier nichts
        return {
            status: iface.VerificationResult.UnknownCTRFormat
        };
    }

    public async VerifyMeasurement(measurementValue: iface.IMeasurementValue): Promise<iface.ICryptoResult> {

        // OCMF hat keine Messwertsignaturen → wir spiegeln das Session‑Ergebnis
        const result: iface.ICryptoResult = {
            status: (measurementValue.result && measurementValue.result.status)
                        ? measurementValue.result.status
                        : iface.VerificationResult.ValidSignature
        };

        measurementValue.result = result;
        measurementValue.method = this;

        return result;
    }

    //
    //  WICHTIG:
    //  Diese Funktion wird vom Session‑Marker (Karte) auf Seite 1 aufgerufen.
    //  Sie MUSS chargingSession.measurements[x].values[y].result setzen,
    //  sonst sieht das UI keine Signaturergebnisse.
    //
    public async VerifyChargingSession(chargingSession: iface.IChargingSession): Promise<iface.ISessionCryptoResult> {

        if (!this.parsedValues || this.parsedValues.length < 2)
            return { status: iface.SessionVerificationResult.AtLeastTwoMeasurementsExpected };

        const publicKey = this.meterPublicKey;

        let sessionStatus = iface.SessionVerificationResult.ValidSignature;

        let values: iface.IMeasurementValue[] = [];

        if (chargingSession.measurements &&
            chargingSession.measurements.length > 0 &&
            chargingSession.measurements[0].values) {

            values = chargingSession.measurements[0].values;
        }

        for (let i = 0; i < this.parsedValues.length; i++) {

            const parsed = this.parsedValues[i];
            parsed.publicKey = publicKey;

            const verifyResult = await this.VerifySingle(parsed, values[i]);

            // Ergebnis in die MeasurementValues schreiben
            if (values[i]) {
                values[i].result = verifyResult;
                values[i].method = this;
            }

            if (verifyResult.status !== iface.VerificationResult.ValidSignature)
                sessionStatus = iface.SessionVerificationResult.InvalidSignature;
        }

        return { status: sessionStatus };
    }

    //Funktion zur vorbereitung der Daten für die Überprüfung
    private async VerifySingle(measurement, measurementValue): Promise<iface.ICryptoResult> {

        const encoder = new TextEncoder();
        (measurementValue as any).buffer = encoder.encode(measurement.rawOCMFString);

        const hashed = await crypto.subtle.digest("SHA-256", (measurementValue as any).buffer);
        (measurementValue as any).hashedBuffer = new Uint8Array(hashed);

        (measurementValue as any).publicKey = measurement.publicKey;
        (measurementValue as any).signatureExpected = measurement.rawOCMFSignature;

        let valid = false;

        try {
            valid = await this.verifyOCMF(
                measurement.rawOCMFString,
                measurement.rawOCMFSignature,
                measurement.publicKey
            );
        console.log("OCMF wurde geprüft" + valid);
        }
        catch (err) {
            console.error("OCMF verify error:", err);
        }

        return {
            status: valid
                ? iface.VerificationResult.ValidSignature
                : iface.VerificationResult.InvalidSignature
        };
    }

    //Funktion zur eigentlichen Signaturprüfung
    private async verifyOCMF(ocmfString: string, ocmfSignatur: string, publicKeyBase64: string): Promise<boolean> {

        function hexToBytes(hex: string) {
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2)
                bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
            return bytes;
        }

        function derToRaw(der: Uint8Array) {
            let offset = 0;

            if (der[offset++] !== 0x30) throw new Error("Not a SEQUENCE");
            offset++;

            if (der[offset++] !== 0x02) throw new Error("Expected INTEGER (r)");
            const rLen = der[offset++];
            let r = der.slice(offset, offset + rLen);
            offset += rLen;

            if (der[offset++] !== 0x02) throw new Error("Expected INTEGER (s)");
            const sLen = der[offset++];
            let s = der.slice(offset, offset + sLen);

            if (r.length > 32) r = r.slice(r.length - 32);
            if (s.length > 32) s = s.slice(s.length - 32);

            if (r.length < 32) r = Uint8Array.from([...Array(32 - r.length).fill(0), ...r]);
            if (s.length < 32) s = Uint8Array.from([...Array(32 - s.length).fill(0), ...s]);

            return new Uint8Array([...r, ...s]);
        }

        const signatureJson = JSON.parse(ocmfSignatur);
        const signatureHex = signatureJson.SD;
        const derSignature = hexToBytes(signatureHex);
        const rawSignature = derToRaw(derSignature);

        const publicKeyBytes = Uint8Array.from(atob(publicKeyBase64), c => c.charCodeAt(0));

        const publicKey = await crypto.subtle.importKey(
            "spki",
            publicKeyBytes.buffer,
            {
                name: "ECDSA",
                namedCurve: "P-256"
            },
            true,
            ["verify"]
        );

        const encoder = new TextEncoder();
        const payloadBytes = encoder.encode(ocmfString);

        return await crypto.subtle.verify(
            {
                name: "ECDSA",
                hash: { name: "SHA-256" }
            },
            publicKey,
            rawSignature,
            payloadBytes
        );
    }

    //Übergabe von werten ans UI
    public ViewMeasurement(
        measurementValue: iface.IMeasurementValue,
        introDiv: HTMLDivElement,
        infoDiv: HTMLDivElement,
        bufferValue: HTMLDivElement,
        hashedBufferValue: HTMLDivElement,
        publicKeyValue: HTMLDivElement,
        signatureExpectedValue: HTMLDivElement,
        signatureCheckValue: HTMLDivElement
    ): void {

        introDiv.querySelector('#cryptoAlgorithm')!.innerHTML = "OCMF (PTB)";

        function bytesToHex(bytes: Uint8Array): string {
            let s = "0x";
            for (let i = 0; i < bytes.length; i++) {
                s += ("0" + bytes[i].toString(16)).slice(-2);
            }
            return s;
        }

        const mv: any = measurementValue;

        if (mv.buffer) {
            bufferValue.innerHTML = bytesToHex(mv.buffer as Uint8Array);
        }

        if (mv.hashedBuffer) {
            hashedBufferValue.innerHTML = bytesToHex(mv.hashedBuffer as Uint8Array);
        }

        publicKeyValue.innerHTML = mv.publicKey || "0x00000000000000000000000000000000000";
        signatureExpectedValue.innerHTML = mv.signatureExpected || "0x00000000000000000000000000000000000";

        signatureCheckValue.innerHTML =
            measurementValue.result.status === iface.VerificationResult.ValidSignature
                ? '<i class="fas fa-check-circle"></i><div id="description">Gültige Signatur</div>'
                : '<i class="fas fa-times-circle"></i><div id="description">Ungültige Signatur</div>';
    }


}
