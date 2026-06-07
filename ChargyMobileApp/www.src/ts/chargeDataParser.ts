export type ChargeDataFormat = "ptb" | "ctr" | "json";

export interface ParsedChargeData {
    format: ChargeDataFormat;
    raw: any;
    content: any;
}

export interface ChargeDataVerificationReport {
    format: ChargeDataFormat;
    evseId: string;
    meterId: string;
    values: number;
    energyDifferenceWh: number;
    consistencyValid: boolean;
    presentSignatures: number;
    validSignatures: number;
    totalSignatures: number;
    overallValid: boolean;
    issues: string[];
    details: string[];
}

function parseOCMFTimestamp(timestamp: string): number {
    const normalizedTimestamp = timestamp.
        replace(",", ".").
        replace(/ [A-Z]$/, "").
        replace(/(\+|-)(\d{2})(\d{2})$/, "$1$2:$3");

    return Date.parse(normalizedTimestamp) / 1000;
}

function parsePTBOCMF(ocmfString: string, publicKey: string) {
    const parts     = ocmfString.split("|");
    const data      = JSON.parse(parts[1]);
    const signature = JSON.parse(parts[2]).SD;
    const rd        = data.RD[0];
    const timestamp = parseOCMFTimestamp(rd.TM);

    return {
        timestamp: timestamp,
        meterInfo: {
            firmwareVersion: data.MF,
            publicKey: publicKey,
            meterId: data.ID,
            type: data.MM,
            manufacturer: data.MV
        },
        transactionId: data.PG,
        contract: {
            type: "RFID_TAG_ID",
            timestampLocal: {
                timestamp: timestamp,
                localOffset: 60,
                seasonOffset: 0
            },
            timestamp: timestamp,
            id: data.ID.substring(0, 8)
        },
        measurementId: "00000001",
        measuredValue: {
            timestampLocal: {
                timestamp: timestamp,
                localOffset: 60,
                seasonOffset: 0
            },
            value: rd.RV.toString(),
            unit: "WATT_HOUR",
            scale: 0,
            valueType: "Integer64",
            unitEncoded: 30
        },
        measurand: {
            id: rd.RI,
            name: "PTB"
        },
        additionalInfo: {
            indexes: {
                timer: 0,
                logBook: ""
            },
            status: rd.ST
        },
        signature: signature
    };
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);

    for (let i = 0; i < hex.length; i += 2)
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);

    return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
    const decoded = atob(base64);
    const bytes   = new Uint8Array(decoded.length);

    for (let i = 0; i < decoded.length; i++)
        bytes[i] = decoded.charCodeAt(i);

    return bytes;
}

function derToRawECDSASignature(der: Uint8Array): Uint8Array {
    let offset = 0;

    if (der[offset++] !== 0x30)
        throw new Error("Invalid ECDSA signature: expected DER sequence.");

    offset++;

    if (der[offset++] !== 0x02)
        throw new Error("Invalid ECDSA signature: expected r integer.");

    const rLength = der[offset++];
    let r         = der.slice(offset, offset + rLength);
    offset       += rLength;

    if (der[offset++] !== 0x02)
        throw new Error("Invalid ECDSA signature: expected s integer.");

    const sLength = der[offset++];
    let s         = der.slice(offset, offset + sLength);

    if (r.length > 32)
        r = r.slice(r.length - 32);

    if (s.length > 32)
        s = s.slice(s.length - 32);

    if (r.length < 32)
        r = Uint8Array.from([...Array(32 - r.length).fill(0), ...r]);

    if (s.length < 32)
        s = Uint8Array.from([...Array(32 - s.length).fill(0), ...s]);

    return new Uint8Array([...r, ...s]);
}

async function verifyOCMFSignature(ocmf: string, publicKeyBase64: string): Promise<boolean> {
    const parts        = ocmf.split("|");
    const payload      = parts[1];
    const signatureHex = JSON.parse(parts[2]).SD;
    const publicKey    = await crypto.subtle.importKey(
        "spki",
        base64ToBytes(publicKeyBase64).buffer as ArrayBuffer,
        {
            name: "ECDSA",
            namedCurve: "P-256"
        },
        true,
        ["verify"]
    );

    return await crypto.subtle.verify(
        {
            name: "ECDSA",
            hash: { name: "SHA-256" }
        },
        publicKey,
        derToRawECDSASignature(hexToBytes(signatureHex)) as unknown as BufferSource,
        new TextEncoder().encode(payload) as unknown as BufferSource
    );
}

export function transformToExpectedFormat(raw: any): any {
    if (!raw || raw.format !== "ptb")
        return raw;

    const begin = parsePTBOCMF(raw.ocmfBegin, raw.publicKey);
    const end   = parsePTBOCMF(raw.ocmfEnd,   raw.publicKey);

    return {
        signedMeterValues: [begin, end],
        ocmfRaw: {
            S: raw.ocmfBegin,
            E: raw.ocmfEnd,
            P: raw.publicKey
        },
        placeInfo: {
            evseId: raw.chargeboxIdentifier,
            address: raw.address,
            geoLocation: {
                lat: raw.geoLocation.lat,
                lon: raw.geoLocation.lng
            }
        }
    };
}

export async function verifyChargeData(parsed: ParsedChargeData): Promise<ChargeDataVerificationReport> {
    const content           = parsed.content || {};
    const signedMeterValues = content.signedMeterValues || [];
    const firstValue        = signedMeterValues[0];
    const lastValue         = signedMeterValues[signedMeterValues.length - 1];
    const issues            = [];
    const details           = [];

    let consistencyValid = true;

    function addIssue(issue: string) {
        consistencyValid = false;
        issues.push(issue);
    }

    function measurementDescription(index: number): string {
        const measurementValue = signedMeterValues[index];

        if (!measurementValue)
            return "measurement " + (index + 1);

        return [
            "measurement " + (index + 1),
            "meterId=" + (measurementValue.meterInfo && measurementValue.meterInfo.meterId || ""),
            "measurementId=" + (measurementValue.measurementId || ""),
            "timestamp=" + (measurementValue.timestamp || "")
        ].join(", ");
    }

    if (parsed.format !== "ptb" && parsed.format !== "ctr")
        addIssue("Unknown charge data format.");

    if (signedMeterValues.length < 2)
        addIssue("At least two signed meter values are required.");

    if (!content.placeInfo || !content.placeInfo.evseId)
        addIssue("Missing EVSE id.");

    if (!content.placeInfo || !content.placeInfo.geoLocation ||
        !Number.isFinite(content.placeInfo.geoLocation.lat) ||
        !Number.isFinite(content.placeInfo.geoLocation.lon))
        addIssue("Missing or invalid geo location.");

    if (firstValue && lastValue) {
        if (Number(lastValue.measuredValue.value) < Number(firstValue.measuredValue.value))
            addIssue("Energy meter value decreases.");

        if (lastValue.timestamp < firstValue.timestamp)
            addIssue("Measurement timestamps are not chronological.");
    }

    let presentSignatures = 0;

    for (const value of signedMeterValues) {
        if (!value.meterInfo || !value.meterInfo.publicKey)
            addIssue("Missing meter public key.");

        if (!value.signature)
            addIssue("Missing measurement signature.");
        else
            presentSignatures++;
    }

    const publicKey       = content.ocmfRaw && content.ocmfRaw.P;
    const rawOCMFValues   = content.ocmfRaw
        ? [content.ocmfRaw.S, content.ocmfRaw.E].filter(value => value)
        : [];
    let validSignatures   = 0;
    const totalSignatures = rawOCMFValues.length;

    if (publicKey) {
        for (let i = 0; i < rawOCMFValues.length; i++) {
            const rawOCMFValue = rawOCMFValues[i];
            const isValid      = await verifyOCMFSignature(rawOCMFValue, publicKey);

            details.push(
                "signature " + (i + 1) + ": " +
                (isValid ? "valid" : "invalid") +
                " (" + measurementDescription(i) + ")"
            );

            if (isValid)
                validSignatures++;
        }
    }

    if (totalSignatures === 0 && presentSignatures > 0) {
        issues.push("Digital signatures are present but not cryptographically verified by this test.");
        for (let i = 0; i < signedMeterValues.length; i++) {
            if (signedMeterValues[i].signature) {
                details.push(
                    "signature " + (i + 1) + ": not verified (" +
                    measurementDescription(i) + ")"
                );
            }
        }
    }
    else if (totalSignatures === 0)
        addIssue("Missing raw OCMF signatures.");

    if (validSignatures !== totalSignatures) {
        for (let i = 0; i < rawOCMFValues.length; i++) {
            if (details[i] && details[i].indexOf(": invalid ") >= 0)
                issues.push("Digital signature " + (i + 1) + " is invalid (" + measurementDescription(i) + ").");
        }
    }

    const firstEnergy      = firstValue ? Number(firstValue.measuredValue.value) : 0;
    const lastEnergy       = lastValue  ? Number(lastValue.measuredValue.value)  : firstEnergy;
    const signaturesValid  = totalSignatures > 0 && validSignatures === totalSignatures;

    return {
        format: parsed.format,
        evseId: content.placeInfo && content.placeInfo.evseId || "",
        meterId: firstValue && firstValue.meterInfo && firstValue.meterInfo.meterId || "",
        values: signedMeterValues.length,
        energyDifferenceWh: lastEnergy - firstEnergy,
        consistencyValid: consistencyValid,
        presentSignatures: presentSignatures,
        validSignatures: validSignatures,
        totalSignatures: totalSignatures,
        overallValid: consistencyValid && signaturesValid,
        issues: issues,
        details: details
    };
}

export function parseChargeDataText(text: string): ParsedChargeData {
    const raw     = JSON.parse(text);
    const content = transformToExpectedFormat(raw);

    return {
        format: raw && raw.format === "ptb"
            ? "ptb"
            : raw && (raw["@context"] === "https://open.charging.cloud/contexts/CTR+json" ||
                      raw.signedMeterValues)
                ? "ctr"
                : "json",
        raw: raw,
        content: content
    };
}

export function formatChargeDataVerificationReport(report: ChargeDataVerificationReport): string {
    const lines = [
        "format: " + report.format,
        "evseId: " + report.evseId,
        "meterId: " + report.meterId,
        "values: " + report.values,
        "energyDifferenceWh: " + report.energyDifferenceWh,
        "consistency: " + (report.consistencyValid ? "valid" : "invalid"),
        "signatures: " + (report.totalSignatures === 0
            ? "not verified (" + report.presentSignatures + " present)"
            : (report.validSignatures === report.totalSignatures ? "valid" : "invalid") +
                " (" + report.validSignatures + "/" + report.totalSignatures + ")"),
        "overall: " + (report.overallValid ? "valid" : "invalid")
    ];

    if (report.issues.length > 0) {
        lines.push("issues:");
        for (const issue of report.issues)
            lines.push("- " + issue);
    }

    if (report.details.length > 0) {
        lines.push("details:");
        for (const detail of report.details)
            lines.push("- " + detail);
    }

    return lines.join("\n");
}
