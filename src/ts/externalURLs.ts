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

// The "externalURLs.conf" rules, shared verbatim with the Chargy WebApp: which
// URL prefixes a live link may be reloaded from without asking the user, and
// how much such an answer may weigh. An installation that ships no such file
// simply has no pre-approved prefixes - every origin is then a trust question
// for the user.

export type ExternalURLRule = {
    prefix:           string;
    maxPayloadBytes:  number;
};

/**
 * How a live link's transport URLs that no prefix covers are treated.
 *
 * "open"   (the default): an uncovered origin is offered to the user, once per
 *          origin, remembered - trust on first use.
 * "strict": an uncovered origin is never offered and never polled. Only the
 *          prefixes below and the installation's own origin are reloaded. A
 *          self-hosting operator that lists its own servers here wants this, so
 *          its drivers are never asked a trust question they cannot judge.
 *
 * Set with a directive line `mode strict` (or `mode open`) anywhere in
 * externalURLs.conf; the last one wins, and an unknown mode leaves the default.
 */
export type ExternalURLMode = "open" | "strict";

export function parseExternalURLConfigMode(configText: string): ExternalURLMode
{

    let mode: ExternalURLMode = "open";

    for (const rawLine of configText.split(/\r?\n/))
    {

        const line = rawLine.trim();

        if (line === "" || line.startsWith("#"))
            continue;

        const parts = line.split(/\s+/);

        if (parts[0] !== "mode")
            continue;

        if (parts[1] === "strict" || parts[1] === "open")
            mode = parts[1];

    }

    return mode;

}

export function parseExternalURLConfig(configText: string): ExternalURLRule[]
{

    return configText.
        split(/\r?\n/).
        map(line => line.trim()).
        filter(line => line !== "" && !line.startsWith("#")).
        map(line => {

            const parts              = line.split(/\s+/);
            const prefix             = parts[0] ?? "";
            const maxPayloadKBytes   = Number(parts[1]);

            if (!Number.isFinite(maxPayloadKBytes) ||
                maxPayloadKBytes <= 0)
            {
                return null;
            }

            try
            {

                const prefixURL = new URL(prefix);

                if (prefixURL.protocol !== "https:" &&
                    prefixURL.protocol !== "http:")
                {
                    return null;
                }

                return {
                    prefix:           prefixURL.href,
                    maxPayloadBytes:  Math.floor(maxPayloadKBytes * 1024)
                };

            }
            catch
            {
                return null;
            }

        }).
        filter((rule): rule is ExternalURLRule => rule != null);

}

export function findExternalURLRule(verifyURL: URL,
                                    rules:     ExternalURLRule[]): ExternalURLRule|null
{

    return rules.find(rule => verifyURL.href.startsWith(rule.prefix)) ?? null;

}

export async function readResponseWithinLimit(response:        Response,
                                              maxPayloadBytes: number): Promise<Uint8Array>
{

    const contentLengthHeader = response.headers.get("content-length");

    if (contentLengthHeader != null)
    {
        const contentLength = Number(contentLengthHeader);

        if (Number.isFinite(contentLength) &&
            contentLength > maxPayloadBytes)
        {
            throw new Error("External verification payload exceeds configured limit.");
        }
    }

    if (response.body == null)
    {
        const data = new Uint8Array(await response.arrayBuffer());

        if (data.byteLength > maxPayloadBytes)
            throw new Error("External verification payload exceeds configured limit.");

        return data;
    }

    const reader = response.body.getReader();
    const chunks = new Array<Uint8Array>();
    let length   = 0;

    try
    {

        for (;;)
        {
            const { done, value } = await reader.read();

            if (done)
                break;

            length += value.byteLength;

            if (length > maxPayloadBytes)
            {
                await reader.cancel();
                throw new Error("External verification payload exceeds configured limit.");
            }

            chunks.push(value);
        }

    }
    finally
    {
        reader.releaseLock();
    }

    const data = new Uint8Array(length);
    let offset = 0;

    for (const chunk of chunks)
    {
        data.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return data;

}
