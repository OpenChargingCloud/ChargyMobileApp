export type ChargeDataFormat = "ptb" | "ctr" | "json";

export interface ParsedChargeData {
    format: ChargeDataFormat;
    raw: any;
    content: any;
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

export function parseChargeDataText(text: string): ParsedChargeData {
    const raw     = JSON.parse(text);
    const content = transformToExpectedFormat(raw);

    return {
        format: raw && raw.format === "ptb"
            ? "ptb"
            : raw && raw["@context"] === "https://open.charging.cloud/contexts/CTR+json"
                ? "ctr"
                : "json",
        raw: raw,
        content: content
    };
}

export function formatChargeDataSummary(parsed: ParsedChargeData): string {
    const signedMeterValues = parsed.content.signedMeterValues || [];
    const firstValue        = signedMeterValues[0];
    const lastValue         = signedMeterValues[signedMeterValues.length - 1];
    const firstEnergy       = firstValue ? Number(firstValue.measuredValue.value) : 0;
    const lastEnergy        = lastValue  ? Number(lastValue.measuredValue.value)  : firstEnergy;
    const energyDifference  = lastEnergy - firstEnergy;

    return [
        "format: " + parsed.format,
        "evseId: " + (parsed.content.placeInfo && parsed.content.placeInfo.evseId || ""),
        "meterId: " + (firstValue && firstValue.meterInfo && firstValue.meterInfo.meterId || ""),
        "values: " + signedMeterValues.length,
        "energyDifferenceWh: " + energyDifference
    ].join("\n");
}
