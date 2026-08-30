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

import {
    Chargy,
    ChargyInterfaces         as iface,
    ChargeTransparencyRecord as chargeTransparencyRecord,
    ChargeTransparencyLiveLink as liveLink,
    PublicKeyInfo            as publicKeyInfo,
    SimpleURL                as simpleURL
}                                      from '@open-charging-cloud/chargy-core';
import * as chargyLib                  from '@open-charging-cloud/chargy-core';
import * as elliptic                   from 'elliptic';
import moment                          from 'moment';
import base32Decode                    from 'base32-decode';
import * as asn1                       from 'asn1.js';
import Chart                           from 'chart.js/auto';
import type { Plugin, TooltipItem }    from 'chart.js';
import {
    createI18nDictionary,
    SupportedLanguage
}                                      from './i18n';
import { formatOBISForDisplay }        from './uiFormatting';
import {
    getSessionWarnings,
    hasSessionWarnings,
    isWarningSession
}                                      from './sessionPresentation';
import {
    distinctValuesInTimeOrder,
    getMeasurementDifferenceText,
    getMeasurementDisplayValue,
    getMeasurementValueInKWh,
    shouldShowMeasurementChart
}                                      from './measurementPresentation';
import {
    findExternalURLRule,
    parseExternalURLConfig,
    parseExternalURLConfigMode,
    readResponseWithinLimit,
    type ExternalURLRule
}                                      from './externalURLs';
import {
    defaultTrustedPayloadBytes,
    emptyTrustedOriginsStore,
    findTrustedOrigin,
    isLoopbackHost,
    maximumRefreshSeconds,
    maximumRetentionMonths,
    minimumRefreshSeconds,
    minimumRetentionMonths,
    parseTrustedOriginsStore,
    pollTargetProblem,
    pruneExpiredTrustedOrigins,
    removeTrustedOrigin,
    sanitizeRetentionMonths,
    sanitizeTrustLabel,
    serializeTrustedOriginsStore,
    touchTrustedOrigin,
    trustLabelForOrigin,
    trustedOriginExpiry,
    upsertTrustedOrigin,
    type ITrustedOriginsStore
}                                      from './liveLinkTrust';
import {
    documentSignatureState,
    measurementValueState,
    meterValueSessionState,
    worstLiveLinkState
}                                      from './liveLinkStatus';
import type { LiveLinkOverallState }   from './liveLinkStatus';

// @ts-expect-error Leaflet is provided globally by the runtime bundle.
const leaflet: any = L;

declare let cordova: any;

const chargyAsn1 = asn1 as ConstructorParameters<typeof Chargy>[4];

interface MobileApp {
    importantInfo:          HTMLDivElement;
    startPage:              HTMLDivElement;
    chargingSessionsPage:   HTMLDivElement;
    publicKeyInfoPage:       HTMLDivElement;
    liveLinkPage:           HTMLDivElement;
    settingsPage:           HTMLDivElement;
    measurementInfosPage:   HTMLDivElement;
    cryptoDetailsPage:      HTMLDivElement;
    issueTrackerPage:       HTMLDivElement;
    aboutPage:              HTMLDivElement;
    cryptoDetailsReturnPage: HTMLDivElement | null;
    map:                    any;
    showPage(page: HTMLDivElement): void;
    refreshMap(fitBounds?: any): void;
    hidePage(page: HTMLDivElement): void;
    openExternalURL(url: string): void;
}

// What the user decided about one origin in the live link trust dialog. An
// origin the user left undecided (dismissed) simply does not appear in the
// result map - it is neither remembered nor polled this time.
type LiveLinkOriginChoice = "once" | "always" | "deny";

// Where a live link poll is allowed to go, and under which limits: a prefix
// rule from externalURLs.conf carries its own payload limit and prefix, a
// user-approved origin gets the default limit.
type LiveLinkPollTarget = {
    url:              URL;
    maxPayloadBytes:  number;
    prefix?:          string;
};

// What the trust row under the live link says about reloading.
type LiveLinkTrustState =
    | { kind: "installation" }
    | { kind: "session"      }
    | { kind: "always", since?: string|undefined }
    | { kind: "denied"       }
    | { kind: "ask"          }
    | { kind: "unavailable"  };

// Where showChargingSessionDetails renders: the measurement infos page by
// default, or the live link page's own containers when a live link shows the
// meter values it carries right below its card.
type ChargingSessionDetailsTargets = {
    info:      HTMLDivElement;
    values:    HTMLDivElement;
    warnings:  HTMLDivElement;
};

type ChargingProgressChartMode = "energy" | "power";
type MeasurementValuesViewMode = "measurements" | ChargingProgressChartMode;
type ChargingProgressChart = Chart<'bar', number[]>;
type ChargingProgressChartPoint = {
    x:                   number;
    y:                   number;
    start:               number;
    end:                 number;
    intervalLabel:       string;
    isValidSignature:    boolean;
    signatureStatusText: string;
};
type ChargingProgressTickStatus = {
    timestamp:        number;
    isValidSignature: boolean;
};
type ChargingProgressChartData = {
    points:         ChargingProgressChartPoint[];
    tickTimestamps: number[];
    tickStatuses:   ChargingProgressTickStatus[];
    unit:           string;
    datasetLabel:   string;
    yAxisLabel:     string;
};

export default class ChargyApp {

    private readonly chargy: Chargy;
    private UILanguage: SupportedLanguage;
    private measurementChart: ChargingProgressChart | null = null;
    private measurementValuesViewMode: MeasurementValuesViewMode = "measurements";
    private currentChargingSession: chargeTransparencyRecord.IChargingSession | null = null;
    private currentMeasurementValue: chargeTransparencyRecord.IMeasurementValue | null = null;
    private currentPublicKeyLookup: publicKeyInfo.IPublicKeyLookup | null = null;
    private currentSimpleURL: simpleURL.IURL | null = null;
    private currentLiveLink: liveLink.IChargeTransparencyLiveLink | null = null;
    private currentLiveLinkMeterValues: chargeTransparencyRecord.IChargeTransparencyRecord | null = null;
    private refreshChargingSessionsPage: (() => void | Promise<void>) | null = null;
    private mapMarkers: any[] = [];

    //#region Live link reloading and trust

    private liveLinkRefreshTimer:          ReturnType<typeof setTimeout>                            | null = null;
    private liveLinkRefreshGeneration:     number                                                          = 0;
    private readonly liveLinkSessionAllowedOrigins: Set<string>                                            = new Set();
    private liveLinkTrustResolve:          ((decisions: Map<string, LiveLinkOriginChoice>) => void) | null = null;
    private liveLinkTrustDecisions:        Map<string, LiveLinkOriginChoice>                        | null = null;
    private liveLinkTrustRowDiv:           HTMLDivElement                                           | null = null;
    private liveLinkTrustContentDiv:       HTMLDivElement                                           | null = null;

    private readonly liveLinkTrustDialogDiv:    HTMLDivElement;
    private readonly liveLinkTrustDocumentDiv:  HTMLDivElement;
    private readonly liveLinkTrustOriginsDiv:   HTMLDivElement;
    private readonly liveLinkTrustBackButton:   HTMLButtonElement;

    private readonly settingsMenuDiv:              HTMLDivElement;
    private readonly settingsTrustedOriginsDiv:    HTMLDivElement;
    private readonly settingsTrustedOriginsEntry:  HTMLButtonElement;
    private readonly trustedOriginsListDiv:        HTMLDivElement;
    private readonly noTrustedOriginsDiv:          HTMLDivElement;
    private readonly trustRetentionEnabledInput:   HTMLInputElement;
    private readonly trustRetentionMonthsInput:    HTMLInputElement;

    //#endregion

    chargingSessions = new Array<chargeTransparencyRecord.IChargingSession>();


    private chargingSessionsPage_MovementStartX: any;

    inputInfosDiv: HTMLDivElement;

    // chargingSessionsPage:               HTMLDivElement;
    chargingSessionReportDiv:           HTMLDivElement;

    // measurementInfosPage:                 HTMLDivElement;
    //chartDiv:                           HTMLCanvasElement;

    errorTextDiv: HTMLDivElement;
    overlayDiv:   HTMLDivElement;

    app: MobileApp;

    constructor (app:      MobileApp,
                 language: SupportedLanguage) {

        this.app                       = app;
        this.chargingSessionReportDiv  = this.app.chargingSessionsPage.querySelector<HTMLDivElement>("#chargingSessionReport");
        this.chargy                    = new Chargy(
                                             createI18nDictionary(),
                                             [ language ],
                                             elliptic,
                                             moment,
                                             chargyAsn1,
                                             base32Decode,
                                             () => undefined
                                         );

        this.setUILanguage(language);

        //#region The live link trust dialog

        this.liveLinkTrustDialogDiv    = document.getElementById('liveLinkTrustDialog')  as HTMLDivElement;
        this.liveLinkTrustDocumentDiv  = this.liveLinkTrustDialogDiv.querySelector("#liveLinkTrustDocument") as HTMLDivElement;
        this.liveLinkTrustOriginsDiv   = this.liveLinkTrustDialogDiv.querySelector("#liveLinkTrustOrigins")  as HTMLDivElement;
        this.liveLinkTrustBackButton   = this.liveLinkTrustDialogDiv.querySelector("#liveLinkTrustBackButton") as HTMLButtonElement;

        // The back arrow answers with whatever has been decided so far; the
        // rest of the origins stay undecided and are simply not polled.
        this.liveLinkTrustBackButton.onclick = (): void => { this.resolveLiveLinkTrust(); };

        //#endregion

        //#region The settings page

        this.settingsMenuDiv              = this.app.settingsPage.querySelector("#settingsMenu")               as HTMLDivElement;
        this.settingsTrustedOriginsDiv    = this.app.settingsPage.querySelector("#settingsTrustedOrigins")     as HTMLDivElement;
        this.settingsTrustedOriginsEntry  = this.app.settingsPage.querySelector("#settingsTrustedOriginsEntry") as HTMLButtonElement;
        this.trustedOriginsListDiv        = this.app.settingsPage.querySelector("#trustedOriginsList")         as HTMLDivElement;
        this.noTrustedOriginsDiv          = this.app.settingsPage.querySelector("#noTrustedOrigins")           as HTMLDivElement;
        this.trustRetentionEnabledInput   = this.app.settingsPage.querySelector("#trustRetentionEnabled")      as HTMLInputElement;
        this.trustRetentionMonthsInput    = this.app.settingsPage.querySelector("#trustRetentionMonths")       as HTMLInputElement;
        this.trustRetentionMonthsInput.min = minimumRetentionMonths.toString();
        this.trustRetentionMonthsInput.max = maximumRetentionMonths.toString();

        this.settingsTrustedOriginsEntry.onclick = (): void => {
            this.refreshTrustedOriginsList();
            this.settingsMenuDiv.style.display           = "none";
            this.settingsTrustedOriginsDiv.style.display = "block";
        };

        // How long decisions are kept. Turning retention on prunes on the very
        // next load, so entries older than the chosen span disappear right
        // away - which is the point, not an accident: the setting says what
        // may still exist, not only what may be newly written.
        this.trustRetentionEnabledInput.onchange = (): void => {

            const store = this.loadTrustedOrigins();

            store.retentionMonths = this.trustRetentionEnabledInput.checked
                                        ? sanitizeRetentionMonths(this.trustRetentionMonthsInput.valueAsNumber)
                                        : null;

            this.saveTrustedOrigins(store);
            this.refreshTrustedOriginsList();

        };

        this.trustRetentionMonthsInput.onchange = (): void => {

            const store = this.loadTrustedOrigins();

            if (store.retentionMonths !== null)
            {
                store.retentionMonths = sanitizeRetentionMonths(this.trustRetentionMonthsInput.valueAsNumber);
                this.saveTrustedOrigins(store);
            }

            this.refreshTrustedOriginsList();

        };

        //#endregion

        // Loading the store prunes expired decisions and rewrites anything
        // stored in an outdated shape - worth doing once at startup, so stale
        // entries leave storage even in a session that never touches trust.
        this.loadTrustedOrigins();

    }

    public setUILanguage(language: SupportedLanguage): void {
        this.UILanguage = language;
        this.chargy.SetUILanguages([ language ]);
        moment.locale(language);
        chargyLib.setUILocale(language);
    }

    public getLocalizedMessage(key: string): string {
        return this.chargy.GetLocalizedMessage(key);
    }

    public async refreshVisibleContent(): Promise<void> {
        if (this.app.cryptoDetailsPage.style.display !== 'none' &&
            this.currentMeasurementValue != null) {
            await this.showMeasurementCryptoDetails(this.currentMeasurementValue);
            return;
        }

        if (this.app.publicKeyInfoPage.style.display !== 'none' &&
            this.currentPublicKeyLookup != null) {
            this.showPublicKeyInfo(this.currentPublicKeyLookup);
            return;
        }

        if (this.app.publicKeyInfoPage.style.display !== 'none' &&
            this.currentSimpleURL != null) {
            this.showSimpleURL(this.currentSimpleURL);
            return;
        }

        if (this.app.liveLinkPage.style.display !== 'none' &&
            this.currentLiveLink != null) {
            this.showLiveLink(this.currentLiveLink, this.currentLiveLinkMeterValues);
            return;
        }

        if (this.app.settingsPage.style.display !== 'none') {
            this.refreshTrustedOriginsList();
            return;
        }

        if (this.app.measurementInfosPage.style.display !== 'none' &&
            this.currentChargingSession != null) {
            this.showChargingSessionDetails(this.currentChargingSession);
            return;
        }

        if (this.app.chargingSessionsPage.style.display !== 'none' &&
            this.refreshChargingSessionsPage != null)
            await this.refreshChargingSessionsPage();
    }


    //#region Global error handling...

    doGlobalError(text:      string,
                  context?:  any): void
    {

        const importantInfo                = document.getElementById("importantInfo")     as HTMLDivElement;

        importantInfo.style.display              = 'block';
        importantInfo.innerHTML                  = '<i class="fas fa-times-circle"></i> ' + text;

        console.log(text);
        console.log(context);

    }

    //#endregion


    //#region detectContentFormat

    public async detectContentFormat(fileInfos:  iface.IFileInfo[] | iface.IFileInfo | string,
                                     onError?:   (message: string) => void): Promise<boolean> {

        const me = this;

        try
        {
            const normalizedFileInfos = typeof fileInfos === 'string'
                ? [{
                    name: "clipboard",
                    type: "text/plain",
                    data: new TextEncoder().encode(fileInfos)
                }]
                : iface.isIFileInfo(fileInfos)
                    ? [fileInfos]
                    : fileInfos;

            const result = await this.chargy.DetectAndConvertContentFormat(normalizedFileInfos);

            if (chargeTransparencyRecord.IsAChargeTransparencyRecord(result))
            {
                this.clearLiveLinkState();
                this.currentPublicKeyLookup = null;
                this.currentSimpleURL = null;
                this.refreshChargingSessionsPage = (): void => {
                    processChargeTransparencyRecord(result);
                };
                await this.refreshChargingSessionsPage();
                return true;
            }

            if (liveLink.IsAChargeTransparencyLiveLink(result))
            {
                this.showLiveLink(
                    result,
                    await this.chargy.TryToParseLiveLinkMeterValues(result) ?? null
                );
                return true;
            }

            if (publicKeyInfo.IsAPublicKey(result) || publicKeyInfo.IsAPublicKeyLookup(result))
            {
                this.showPublicKeyInfo(result);
                return true;
            }

            if (simpleURL.IsAURL(result))
            {
                this.showSimpleURL(result);
                return true;
            }

            const errorResult = result as iface.ISessionCryptoResult;
            const errorMessage = this.chargy.GetLocalizedText(errorResult.message) ??
                                 this.chargy.GetLocalizedMessage("UnknownOrInvalidChargeTransparencyRecord");

            if (onError != null)
                onError(errorMessage);
            else
                this.doGlobalError(errorMessage, errorResult.exception);
        }
        catch (exception)
        {
            const errorMessage = this.chargy.GetLocalizedMessage("UnknownOrInvalidChargeTransparencyRecord");

            if (onError != null)
                onError(errorMessage);
            else
                this.doGlobalError(errorMessage, exception);
        }

        return false;

        function processChargeTransparencyRecord(CTR: chargeTransparencyRecord.IChargeTransparencyRecord): void
        {

            //#region Data

            const me2 = me;

            me.chargingSessions          = [];

            for (const marker of me.mapMarkers)
                marker.remove();
            me.mapMarkers = [];

            let minlat                    = 1000;
            let maxlat                    = -1000;
            let minlng                    = 1000;
            let maxlng                    = -1000;

            //#endregion

            function checkSessionCrypto(chargingSession: chargeTransparencyRecord.IChargingSession): string
            {

                const result = chargingSession.verificationResult ?? {
                    status:    iface.SessionVerificationResult.Unvalidated,
                    certainty: 0
                };

                //#region Add marker to map

                const redMarker                 = leaflet.AwesomeMarkers.icon({
                    prefix:                     'fa',
                    icon:                       'exclamation',
                    markerColor:                'red',
                    iconColor:                  '#ecc8c3'
                });

                const greenMarker               = leaflet.AwesomeMarkers.icon({
                    prefix:                     'fa',
                    icon:                       'charging-station',
                    markerColor:                'green',
                    iconColor:                  '#c2ec8e'
                });

                const orangeMarker              = leaflet.AwesomeMarkers.icon({
                    prefix:                     'fa',
                    icon:                       'exclamation',
                    markerColor:                'orange',
                    iconColor:                  '#ae6a0a'
                });

                const markerIcon = result.status === iface.SessionVerificationResult.InplausibleMeasurement ||
                                   (result.status === iface.SessionVerificationResult.ValidSignature && hasSessionWarnings(chargingSession))
                                       ? orangeMarker
                                       : result.status === iface.SessionVerificationResult.ValidSignature
                                           ? greenMarker
                                           : redMarker;

                let geoLocation  = null;

                if (chargingSession.chargingPool                != null &&
                    chargingSession.chargingPool.geoLocation    != null)
                {
                    geoLocation = chargingSession.chargingPool.geoLocation;
                }

                if (chargingSession.chargingStation             != null &&
                    chargingSession.chargingStation.geoLocation != null)
                {
                    geoLocation = chargingSession.chargingStation.geoLocation;
                }

                if (geoLocation != null)
                {

                    const marker = leaflet.marker([geoLocation.lat, geoLocation.lng], { icon: markerIcon }).addTo(me2.app.map);
                    me.mapMarkers.push(marker);

                    if (minlat > geoLocation.lat)
                        minlat = geoLocation.lat;

                    if (maxlat < geoLocation.lat)
                        maxlat = geoLocation.lat;

                    if (minlng > geoLocation.lng)
                        minlng = geoLocation.lng;

                    if (maxlng < geoLocation.lng)
                        maxlng = geoLocation.lng;

                    switch (result.status)
                    {

                        case iface.SessionVerificationResult.UnknownSessionFormat:
                            marker.bindPopup(me.chargy.GetLocalizedMessage("InvalidChargingSession"));
                            break;

                        case iface.SessionVerificationResult.InplausibleMeasurement:
                            marker.bindPopup(me.chargy.GetLocalizedMessage("sessionValidationWarningsLabel"));
                            break;

                        case iface.SessionVerificationResult.PublicKeyNotFound:
                        case iface.SessionVerificationResult.InvalidPublicKey:
                        case iface.SessionVerificationResult.InvalidSignature:
                            marker.bindPopup(me.chargy.GetLocalizedMessage("InvalidChargingSession"));
                            break;

                        case iface.SessionVerificationResult.ValidSignature:
                            marker.bindPopup(me.chargy.GetLocalizedMessage(
                                hasSessionWarnings(chargingSession)
                                    ? "sessionValidationWarningsLabel"
                                    : "ValidChargingSession"
                            ));
                            break;


                        default:
                            break;

                    }

                }

                //#endregion

                switch (result.status)
                {

                    case iface.SessionVerificationResult.UnknownSessionFormat:
                        return '<i class="fas fa-times-circle"></i> ' + me.chargy.GetLocalizedMessage("InvalidChargingSession");

                    case iface.SessionVerificationResult.InplausibleMeasurement:
                        return '<i class="fas fa-exclamation-circle"></i> ' + me.chargy.GetLocalizedMessage("sessionValidationWarningsLabel");

                    case iface.SessionVerificationResult.PublicKeyNotFound:
                    case iface.SessionVerificationResult.InvalidPublicKey:
                    case iface.SessionVerificationResult.InvalidSignature:
                        return '<i class="fas fa-times-circle"></i> ' + me.chargy.GetLocalizedMessage("InvalidChargingSession");

                    case iface.SessionVerificationResult.ValidSignature:
                        return hasSessionWarnings(chargingSession)
                                   ? '<i class="fas fa-exclamation-circle"></i> ' + me.chargy.GetLocalizedMessage("sessionValidationWarningsLabel")
                                   : '<i class="fas fa-check-circle"></i> '       + me.chargy.GetLocalizedMessage("ValidChargingSessionShort");


                    default:
                        return '<i class="fas fa-times-circle"></i> ' + me.chargy.GetLocalizedMessage("InvalidChargingSession");

                }

            }

            //#region Show CTR infos

            me.app.showPage(me.app.chargingSessionsPage);

            if (CTR.description) {
                const descriptionDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#description');
                descriptionDiv.innerText = me.chargy.GetLocalizedText(CTR.description) ?? chargyLib.firstValue(CTR.description);
            }

            if (CTR.begin) {
                const beginDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#begin');
                beginDiv.innerHTML = chargyLib.parseUTC(CTR.begin).format('dddd, D. MMMM YYYY');
            }

            if (CTR.end) {
                const endDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#end');
                endDiv.innerHTML   = chargyLib.parseUTC(CTR.end).format('dddd, D. MMMM YYYY');
            }

            //#endregion

            //#region Show contract infos

            //#endregion



            //#region Show all charging sessions...

            if (CTR.chargingSessions) {

                const chargingSessionsDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#chargingSessions');
                chargingSessionsDiv.innerText = '';

                for (const chargingSession of CTR.chargingSessions)
                {





                    const chargingSessionDiv      = chargyLib.CreateDiv(chargingSessionsDiv, "chargingSession");
                    chargingSession.GUI         = chargingSessionDiv;
                    chargingSessionDiv.onclick  = me.captureChargingSession(chargingSession);

                    //#region Show session time infos

                    let duration: moment.Duration | undefined;

                    try {

                        if (chargingSession.begin)
                        {

                            const beginUTC = chargyLib.parseUTC(chargingSession.begin);

                            const dateDiv = chargingSessionDiv.appendChild(document.createElement('div'));
                            dateDiv.className = "date";
                            dateDiv.innerHTML = beginUTC.format('dddd, D; MMM YYYY HH:mm:ss').
                                                        replace(".", "").   // Nov. -> Nov
                                                        replace(";", ".") +  // 14;  -> 14.
                                                        me.chargy.GetLocalizedMessage("timeSuffix");

                            if (chargingSession.end)
                            {

                                const endUTC   = chargyLib.parseUTC(chargingSession.end);
                                duration = moment.duration(endUTC.valueOf() - beginUTC.valueOf());

                                dateDiv.innerHTML += " - " +
                                                    (Math.floor(duration.asDays()) > 0 ? endUTC.format("dddd") + " " : "") +
                                                    endUTC.format('HH:mm:ss') +
                                                    me.chargy.GetLocalizedMessage("timeSuffix");

                            }

                        }

                    }
                    catch (exception)
                    {
                        console.log("Could not show session time infos of charging session '" + chargingSession["@id"] + "':" + exception);
                    }

                    //#endregion

                    const tableDiv                = chargingSessionDiv.appendChild(document.createElement('div'));
                        tableDiv.className      = "table";

                    //#region Show energy infos

                    try {

                        const productInfoDiv                   = tableDiv.appendChild(document.createElement('div'));
                        productInfoDiv.className             = "productInfos";

                        const productIconDiv                   = productInfoDiv.appendChild(document.createElement('div'));
                        productIconDiv.className             = "icon";
                        productIconDiv.innerHTML             = '<i class="fas fa-chart-pie"></i>';

                        const productDiv                       = productInfoDiv.appendChild(document.createElement('div'));
                        productDiv.className                 = "text";
                        productDiv.innerHTML = chargingSession.product != null ? chargingSession.product["@id"] + "<br />" : "";

                        if (duration != null) {
                            productDiv.innerHTML += me.chargy.GetLocalizedMessage("chargingDurationLabel") + " " +
                                                    me.formatChargingDuration(duration.asMilliseconds());
                        }

                        if (chargingSession.measurements)
                        {
                            for (const measurement of chargingSession.measurements)
                            {
                                //<i class="far fa-chart-bar"></i>
                                if (measurement.values && measurement.values.length > 0)
                                {

                                    const first  = Number(measurement.values[0].value);
                                    const last   = Number(measurement.values[measurement.values.length-1].value);
                                    let amount = parseFloat(((last - first) * Math.pow(10, measurement.scale)).toFixed(10));

                                    switch (measurement.unit)
                                    {

                                        case "KILO_WATT_HOURS":
                                            break;

                                        // "WATT_HOURS"
                                        default:
                                            amount = parseFloat((amount / 1000).toFixed(10));
                                            break;

                                    }

                                    productDiv.innerHTML += "<br />" + chargyLib.measurementName2human(measurement.name) + " " + amount.toString() + " kWh (" + measurement.values.length + " " + me.chargy.GetLocalizedMessage("Meter Values") + ")";

                                }

                            }
                        }

                    }
                    catch (exception)
                    {
                        console.log("Could not show energy infos of charging session '" + chargingSession["@id"] + "':" + exception);
                    }

                    //#endregion

                    //#region Show authorization start/stop information

                    try {

                        if (chargingSession.authorizationStart != null)
                        {

                            const authorizationStartDiv            = tableDiv.appendChild(document.createElement('div'));
                                authorizationStartDiv.className  = "authorizationStart";

                            const authorizationStartIconDiv                   = authorizationStartDiv.appendChild(document.createElement('div'));
                            authorizationStartIconDiv.className             = "icon";
                            switch (chargingSession.authorizationStart.type)
                            {

                                case "cryptoKey":
                                    authorizationStartIconDiv.innerHTML     = '<i class="fas fa-key"></i>';
                                    break;

                                case "eMAId":
                                case "EVCOId":
                                    authorizationStartIconDiv.innerHTML     = '<i class="fas fa-mobile-alt"></i>';
                                    break;

                                default:
                                    authorizationStartIconDiv.innerHTML     = '<i class="fas fa-id-card"></i>';
                                    break;

                            }

                            const authorizationStartIdDiv                     = authorizationStartDiv.appendChild(document.createElement('div'));
                            authorizationStartIdDiv.className               = "id";
                            authorizationStartIdDiv.innerHTML = chargingSession.authorizationStart["@id"];

                        }

                        if (chargingSession.authorizationStop != null)
                        {

                            const authorizationStopDiv            = tableDiv.appendChild(document.createElement('div'));
                                authorizationStopDiv.className  = "authorizationStop";

                            const authorizationStopIconDiv                   = authorizationStopDiv.appendChild(document.createElement('div'));
                            authorizationStopIconDiv.className             = "icon";
                            switch (chargingSession.authorizationStop.type)
                            {

                                case "cryptoKey":
                                    authorizationStopIconDiv.innerHTML     = '<i class="fas fa-key"></i>';
                                    break;

                                case "eMAId":
                                case "EVCOId":
                                    authorizationStopIconDiv.innerHTML     = '<i class="fas fa-mobile-alt"></i>';
                                    break;

                                default:
                                    authorizationStopIconDiv.innerHTML     = '<i class="fas fa-id-card"></i>';
                                    break;

                            }

                            const authorizationStopIdDiv                     = authorizationStopDiv.appendChild(document.createElement('div'));
                            authorizationStopIdDiv.className               = "id";
                            authorizationStopIdDiv.innerHTML = chargingSession.authorizationStop["@id"];

                        }

                    } catch (exception)
                    {
                        console.log("Could not show authorization start/stop infos of charging session '" + chargingSession["@id"] + "':" + exception);
                    }

                    //#endregion

                    //#region Show location infos...

                    try
                    {

                        if (chargingSession.EVSEId            || chargingSession.EVSE            ||
                            chargingSession.chargingStationId || chargingSession.chargingStation ||
                            chargingSession.chargingPoolId    || chargingSession.chargingPool) {

                            let address:iface.IAddress            = null;

                            const locationInfoDiv                   = tableDiv.appendChild(document.createElement('div'));
                            locationInfoDiv.className             = "locationInfos";

                            const locationIconDiv                   = locationInfoDiv.appendChild(document.createElement('div'));
                            locationIconDiv.className             = "icon";
                            locationIconDiv.innerHTML             = '<i class="fas fa-map-marker-alt"></i>';

                            const locationDiv                       = locationInfoDiv.appendChild(document.createElement('div'));
                            locationDiv.classList.add("text");

                            if (chargingSession.EVSEId || chargingSession.EVSE) {

                                if (chargingSession.EVSE == null || typeof chargingSession.EVSE !== 'object')
                                    chargingSession.EVSE = me.chargy.GetEVSE(chargingSession.EVSEId);

                                locationDiv.classList.add("EVSE");
                                locationDiv.innerHTML             = (chargingSession.EVSE   != null && chargingSession.EVSE.description != null
                                                                        ? chargyLib.firstValue(chargingSession.EVSE.description) + "<br />"
                                                                        : "") +
                                                                    (chargingSession.EVSEId != null
                                                                        ? chargingSession.EVSEId
                                                                        : chargingSession.EVSE["@id"]);

                                chargingSession.chargingStation   = chargingSession.EVSE.chargingStation;
                                chargingSession.chargingStationId = chargingSession.EVSE.chargingStationId;

                                chargingSession.chargingPool      = chargingSession.EVSE.chargingStation.chargingPool;
                                chargingSession.chargingPoolId    = chargingSession.EVSE.chargingStation.chargingPoolId;

                                address                           = chargingSession.EVSE.chargingStation.address;

                            }

                            else if (chargingSession.chargingStationId || chargingSession.chargingStation) {

                                if (chargingSession.chargingStation == null || typeof chargingSession.chargingStation !== 'object')
                                    chargingSession.chargingStation = me.chargy.GetChargingStation(chargingSession.chargingStationId);

                                if (chargingSession.chargingStation != null)
                                {

                                    locationDiv.classList.add("chargingStation");
                                    locationDiv.innerHTML             = (chargingSession.chargingStation   != null && chargingSession.chargingStation.description != null
                                                                            ? chargyLib.firstValue(chargingSession.chargingStation.description) + "<br />"
                                                                            : "") +
                                                                        (chargingSession.chargingStationId != null
                                                                            ? chargingSession.chargingStationId
                                                                            : chargingSession.chargingStation["@id"]);

                                    chargingSession.chargingPool      = chargingSession.chargingStation.chargingPool;
                                    chargingSession.chargingPoolId    = chargingSession.chargingStation.chargingPoolId;

                                    address                           = chargingSession.chargingStation.address;

                                }
                                else
                                    locationInfoDiv.remove();

                            }

                            else if (chargingSession.chargingPoolId || chargingSession.chargingPool) {

                                if (chargingSession.chargingPool == null || typeof chargingSession.chargingPool !== 'object')
                                    chargingSession.chargingPool = me.chargy.GetChargingPool(chargingSession.chargingPoolId);

                                if (chargingSession.chargingPool != null)
                                {

                                    locationDiv.classList.add("chargingPool");
                                    locationDiv.innerHTML             = (chargingSession.chargingPool   != null && chargingSession.chargingPool.description != null
                                                                            ? chargyLib.firstValue(chargingSession.chargingPool.description) + "<br />"
                                                                            : "") +
                                                                        (chargingSession.chargingPoolId != null
                                                                            ? chargingSession.chargingPoolId
                                                                            : chargingSession.chargingPool["@id"]);

                                    address = me.chargy.GetChargingPool(chargingSession.chargingPool["@id"])?.address ?? null;

                                }
                                else
                                    locationInfoDiv.remove();

                            }

                            if (address != null)
                                locationDiv.innerHTML += "<br />" +
                                                            (address.street      != null ? " " + address.street        : "") +
                                                            (address.houseNumber != null ? " " + address.houseNumber   : "") +

                                                            (address.postalCode  != null || address.city != null ? "," : "") +
                                                            (address.postalCode  != null ? " " + address.postalCode    : "") +
                                                            (address.city        != null ? " " + address.city : "");

                        }

                    } catch (exception)
                    {
                        console.log("Could not show location infos of charging session '" + chargingSession["@id"] + "':" + exception);
                    }
                    //#endregion

                    //#region Show verification status

                    const verificationStatusDiv = chargingSessionDiv.appendChild(document.createElement('div'));
                    verificationStatusDiv.className = "verificationStatus";
                    verificationStatusDiv.innerHTML = checkSessionCrypto(chargingSession);

                    if (isWarningSession(chargingSession))
                        verificationStatusDiv.classList.add("warning");

                    //#endregion




                    me.chargingSessions.push(chargingSession);

                }

                // If there is only one charging session show its details at once...
                // if (me.chargingSessions.length == 1)
                //     me.chargingSessions[0].GUI.click();

                me2.app.refreshMap([[minlat, minlng], [maxlat, maxlng]]);

            }

            //#endregion

        }

    }

    //#endregion

    //#region Charging progress chart helpers

    private clearMeasurementChart(): void {
        if (this.measurementChart) {
            this.measurementChart.destroy();
            this.measurementChart = null;
        }
    }

    //#region showPublicKeyInfo

    private showPublicKeyInfo(publicKeyResult: publicKeyInfo.IPublicKey | publicKeyInfo.IPublicKeyLookup): void
    {
        const publicKeys = publicKeyInfo.IsAPublicKeyLookup(publicKeyResult)
                               ? publicKeyResult.publicKeys
                               : [ publicKeyResult ];

        this.clearLiveLinkState();
        this.currentPublicKeyLookup = { publicKeys };
        this.currentSimpleURL = null;
        this.app.showPage(this.app.publicKeyInfoPage);

        const page          = this.app.publicKeyInfoPage;
        this.setInfoPageTitle(page, 'publicKeyDetailsTitle');
        const publicKeysDiv = page.querySelector<HTMLDivElement>('#publicKeys');
        if (publicKeysDiv == null)
            return;

        publicKeysDiv.replaceChildren();

        for (const publicKey of publicKeys)
        {
            const card       = chargyLib.CreateDiv(publicKeysDiv, 'publicKeyCard');
            const subject    = this.formatPublicKeyValue(publicKey.subject);
            const identifier = typeof publicKey['@id'] === 'string' ? publicKey['@id'] : '';
            const title      = chargyLib.CreateDiv(card, 'title');
            title.innerText  = subject || identifier || this.chargy.GetLocalizedMessage('publicKeyLabel');

            const table = chargyLib.CreateDiv(card, 'publicKeyTable');

            if (identifier !== '')
                this.appendPublicKeyInfoRow(table, 'fa-fingerprint', 'publicKeyIdentifierLabel', identifier);

            if (subject !== '')
                this.appendPublicKeyInfoRow(table, 'fa-user-tag', 'publicKeySubjectLabel', subject);

            this.appendPublicKeyInfoRow(table, 'fa-shield-alt', 'publicKeyAlgorithmLabel', this.formatPublicKeyValue(publicKey.algorithm));

            if (publicKey.type !== undefined)
                this.appendPublicKeyInfoRow(table, 'fa-key', 'publicKeyTypeLabel', this.formatPublicKeyValue(publicKey.type));

            if (typeof publicKey.format === 'string' && publicKey.format !== '')
                this.appendPublicKeyInfoRow(table, 'fa-file-code', 'publicKeyFormatLabel', publicKey.format);

            if (typeof publicKey.encoding === 'string' && publicKey.encoding !== '')
                this.appendPublicKeyInfoRow(table, 'fa-code', 'publicKeyEncodingLabel', publicKey.encoding);

            if (publicKey.value !== '')
                this.appendPublicKeyInfoRow(table, 'fa-key', 'publicKeyValueLabel', publicKey.value, true);

            if (publicKeyInfo.IsAPublicKeyXY(publicKey))
            {
                this.appendPublicKeyInfoRow(table, 'fa-arrows-alt-h', 'publicKeyXCoordinateLabel', publicKey.x, true);
                this.appendPublicKeyInfoRow(table, 'fa-arrows-alt-v', 'publicKeyYCoordinateLabel', publicKey.y, true);
            }

            if (publicKey.certainty !== undefined)
            {
                const certainty = publicKey.certainty <= 1
                                      ? Math.round(publicKey.certainty * 100).toString() + ' %'
                                      : publicKey.certainty.toString();
                this.appendPublicKeyInfoRow(table, 'fa-check-circle', 'publicKeyCertaintyLabel', certainty);
            }

            if (publicKey.signatures !== undefined)
            {
                const signatureText = publicKey.signatures.length === 1
                                          ? this.chargy.GetLocalizedMessage('publicKeyOneSignatureLabel')
                                          : publicKey.signatures.length.toString() + ' ' + this.chargy.GetLocalizedMessage('publicKeySignaturesLabel');
                this.appendPublicKeyInfoRow(table, 'fa-file-signature', 'publicKeySignatureCountLabel', signatureText);
            }
        }
    }

    //#region showSimpleURL

    private showSimpleURL(urlInfo: simpleURL.IURL): void
    {
        this.clearLiveLinkState();
        this.currentSimpleURL = urlInfo;
        this.currentPublicKeyLookup = null;
        this.app.showPage(this.app.publicKeyInfoPage);

        const page          = this.app.publicKeyInfoPage;
        this.setInfoPageTitle(page, 'urlDetailsTitle');
        const publicKeysDiv = page.querySelector<HTMLDivElement>('#publicKeys');
        if (publicKeysDiv == null)
            return;

        publicKeysDiv.replaceChildren();

        const card      = chargyLib.CreateDiv(publicKeysDiv, 'publicKeyCard');
        const title     = chargyLib.CreateDiv(card, 'title');
        title.innerText = this.chargy.GetLocalizedMessage('urlLabel');

        const table = chargyLib.CreateDiv(card, 'publicKeyTable');

        this.appendPublicKeyInfoRow(table, 'fa-globe', 'urlContextLabel', urlInfo['@context']);
        this.appendPublicKeyInfoRow(table, 'fa-link',  'urlAddressLabel', urlInfo.url, true);

        if (urlInfo.method !== undefined)
            this.appendPublicKeyInfoRow(table, 'fa-exchange-alt', 'urlMethodLabel', urlInfo.method);

        if (urlInfo.acceptType !== undefined)
            this.appendPublicKeyInfoRow(table, 'fa-file-download', 'urlAcceptTypeLabel', urlInfo.acceptType);

        if (urlInfo.actions !== undefined)
            this.appendPublicKeyInfoRow(table, 'fa-bolt', 'urlActionsLabel', urlInfo.actions.join(', '));

        if (urlInfo.serviceTypes !== undefined)
            this.appendPublicKeyInfoRow(table, 'fa-cogs', 'urlServiceTypesLabel', urlInfo.serviceTypes.join(', '));

        if (urlInfo.serviceData !== undefined)
            this.appendPublicKeyInfoRow(table, 'fa-code', 'urlServiceDataLabel', JSON.stringify(urlInfo.serviceData, null, 2), true);
    }

    //#region showLiveLink

    private showLiveLink(liveLinkInfo:  liveLink.IChargeTransparencyLiveLink,
                         meterValues:   chargeTransparencyRecord.IChargeTransparencyRecord | null = null): void
    {

        if (this.currentLiveLink !== liveLinkInfo)
            this.measurementValuesViewMode = "measurements";

        this.stopLiveLinkRefresh();
        this.closeLiveLinkTrustDialog();
        this.liveLinkTrustRowDiv     = null;
        this.liveLinkTrustContentDiv = null;

        this.currentLiveLink            = liveLinkInfo;
        this.currentLiveLinkMeterValues = meterValues;
        this.currentPublicKeyLookup     = null;
        this.currentSimpleURL           = null;

        // A background reload while the user studies the crypto details of one
        // of this live link's meter values must not tear those details away:
        // the page behind them is re-rendered, the page switch is skipped.
        const cryptoDetailsOnTop = this.app.cryptoDetailsPage.style.display !== 'none' &&
                                   this.app.cryptoDetailsReturnPage === this.app.liveLinkPage;

        if (!cryptoDetailsOnTop)
            this.app.showPage(this.app.liveLinkPage);

        const cardDiv = this.app.liveLinkPage.querySelector<HTMLDivElement>('#liveLinkCard');

        if (cardDiv == null)
            return;

        cardDiv.replaceChildren();

        //#region Description and creation timestamp of the document

        const descriptionDiv     = chargyLib.CreateDiv(cardDiv, "description");
        descriptionDiv.innerText = this.chargy.GetLocalizedText(liveLinkInfo.description) ??
                                   this.chargy.GetLocalizedMessage('liveLinkLabel');

        if (typeof(liveLinkInfo.created) === "string" && liveLinkInfo.created !== "")
        {
            const timestampDiv     = chargyLib.CreateDiv(cardDiv, "created");
            timestampDiv.innerText = this.chargy.GetLocalizedMessage("Timestamp") + " " +
                                     chargyLib.time2human(liveLinkInfo.created);
        }

        //#endregion

        const liveLinkDiv = chargyLib.CreateDiv(cardDiv, "chargingSession");
        liveLinkDiv.classList.add("chargeTransparencyLiveLink");

        //#region What the live link knows about its charging session

        // A live link describes exactly one charging session, so it carries
        // single objects where a charge transparency record carries lists.
        // None of these properties is part of IChargeTransparencyLiveLink yet,
        // hence the untyped reads.
        const chargingStation    = chargyLib.asJSONObject(liveLinkInfo["chargingStation"]);
        const evse               = chargyLib.asJSONObject(chargingStation?.["EVSE"]);
        const connector          = chargyLib.asJSONObject(evse?.["connector"]);
        const contract           = chargyLib.asJSONObject(liveLinkInfo["contract"]);
        const geoLocation        = chargyLib.asJSONObject(chargingStation?.["geoLocation"]);

        const chargingSession    = meterValues?.chargingSessions?.[0];
        const measurement        = chargingSession?.measurements?.[0];
        const measurementValues  = measurement != null
                                       ? distinctValuesInTimeOrder(measurement.values)
                                       : [];
        const firstValue         = measurementValues[0];
        const lastValue          = measurementValues[measurementValues.length - 1];

        //#endregion

        // When the charging session began. Where a finished session also shows
        // when it ended, a live link cannot: it has not ended yet.
        if (chargingSession?.begin != null)
        {
            const dateDiv     = liveLinkDiv.appendChild(document.createElement('div'));
            dateDiv.className = "date";
            dateDiv.innerHTML = chargyLib.time2human(chargingSession.begin);
        }

        const tableDiv     = liveLinkDiv.appendChild(document.createElement('div'));
        tableDiv.className = "table";

        // How long it has been charging and how much energy the meter has seen
        // so far: the same two lines a finished charging session shows here.
        if (measurement != null && firstValue != null && lastValue != null)
        {

            const elapsed = chargyLib.parseUTC(lastValue. timestamp).valueOf() -
                            chargyLib.parseUTC(firstValue.timestamp).valueOf();

            const energy  = getMeasurementValueInKWh(measurement, lastValue).
                                minus(getMeasurementValueInKWh(measurement, firstValue));

            this.appendLiveLinkInfoRow(
                tableDiv,
                "productInfos",
                '<i class="fas fa-chart-pie"></i>',
                [
                    elapsed > 0
                        ? this.chargy.GetLocalizedMessage("chargingDurationLabel") + " " + this.formatChargingDuration(elapsed)
                        : "",
                    chargyLib.measurementName2human(measurement.name) + " " +
                        parseFloat(energy.toFixed(10)).toString() + " kWh"
                ].filter(line => line !== "").join("\n")
            );

        }

        const contractId = chargyLib.asString(contract?.["@id"]);

        if (contractId != null && contractId !== "")
            this.appendLiveLinkInfoRow(
                tableDiv,
                "contractInfos",
                '<i class="fas fa-id-card"></i>',
                contractId
            );

        const evseId        = chargyLib.asString(evse?.["@id"]);
        const connectorText = connector == null
                                  ? ""
                                  : [
                                        chargyLib.asString(connector["standard"]),
                                        chargyLib.asString(connector["format"]),
                                        chargyLib.asString(connector["powerType"]),
                                        chargyLib.asString(connector["maxPower"])
                                    ].filter(value => value != null && value !== "").join(", ");

        if ((evseId != null && evseId !== "") || connectorText !== "")
            this.appendLiveLinkInfoRow(
                tableDiv,
                "chargingStationInfos",
                '<i class="fas fa-charging-station"></i>',
                [ evseId ?? "", connectorText ].filter(line => line !== "").join("\n")
            );

        const latitude  = chargyLib.asNumber(geoLocation?.["lat"]);
        const longitude = chargyLib.asNumber(geoLocation?.["lng"]);

        if (latitude != null && longitude != null)
            this.appendLiveLinkInfoRow(
                tableDiv,
                "locationInfos",
                '<i class="fas fa-map-marker-alt"></i>',
                this.chargy.GetLocalizedMessage("liveLinkLocationLabel") + " " +
                    latitude.toString() + ", " + longitude.toString()
            );

        const transports = this.liveLinkTransports(liveLinkInfo);

        if (transports.length > 0)
        {
            const transportsDiv     = document.createElement('div');
            transportsDiv.className = "liveLinkTransports";

            for (const transport of transports)
                transportsDiv.appendChild(this.createLiveLinkTransportDiv(transport));

            this.appendLiveLinkInfoRow(
                tableDiv,
                "transportInfos",
                '<i class="fas fa-satellite-dish"></i>',
                transportsDiv
            );
        }

        //#region Whether live reloading is active, blocked or waiting for consent

        // Only when there is something to reload: an https transport stating a
        // refresh period. Filled in asynchronously, once conf, store or the
        // user have spoken.
        if (transports.some(transport => transport.type === "https"            &&
                                         typeof transport.refresh === "number" &&
                                         transport.refresh > 0))
        {

            const trustContentDiv        = document.createElement('div');

            this.liveLinkTrustContentDiv = trustContentDiv;
            this.liveLinkTrustRowDiv     = this.appendLiveLinkInfoRow(
                                               tableDiv,
                                               "trustInfos",
                                               '<i class="fas fa-shield-alt"></i>',
                                               trustContentDiv
                                           );

            this.liveLinkTrustRowDiv.style.display = "none";

        }

        //#endregion

        if (liveLinkInfo.imageURLs && liveLinkInfo.imageURLs.length > 0)
        {
            const imagesDiv = document.createElement('div');

            for (const imageURL of liveLinkInfo.imageURLs)
                imagesDiv.appendChild(this.createLiveLinkAnchor(imageURL, imageURL));

            this.appendLiveLinkInfoRow(
                tableDiv,
                "imageInfos",
                '<i class="fas fa-image"></i>',
                imagesDiv
            );
        }

        // The operator's signatures over the document itself, and whether they
        // checked out. This belongs directly under the transports and the trust
        // row, because it is what says how much those URLs are worth: they are
        // only the operator's if the signature covering them verifies.
        this.appendLiveLinkSignatureRow(tableDiv, liveLinkInfo);

        // And the verdict over all of it, in the corner of the card - the same
        // badge a charge transparency record carries.
        this.appendLiveLinkVerificationStatus(liveLinkDiv, liveLinkInfo, meterValues);

        //#region Show the signed meter values the live link already carries

        // Every single meter value, right below the card, exactly like those
        // of a finished session: one that arrived a moment ago is read and
        // verified just like one from an archive. A live link describes a
        // single charging session, so there is no session list to choose from
        // and the details are shown right away.
        const measurementInfoDiv    = this.app.liveLinkPage.querySelector<HTMLDivElement>('#liveLinkMeasurementInfo');
        const measurementValuesDiv  = this.app.liveLinkPage.querySelector<HTMLDivElement>('#liveLinkMeasurementValues');
        const validationWarningsDiv = this.app.liveLinkPage.querySelector<HTMLDivElement>('#liveLinkValidationWarnings');

        if (measurementInfoDiv    != null &&
            measurementValuesDiv  != null &&
            validationWarningsDiv != null)
        {

            measurementInfoDiv.innerHTML    = '';
            measurementValuesDiv.innerHTML  = '';
            validationWarningsDiv.innerHTML = '';

            if (chargingSession != null)
            {
                chargingSession.ctr = meterValues ?? undefined;
                this.showChargingSessionDetails(chargingSession, {
                    info:      measurementInfoDiv,
                    values:    measurementValuesDiv,
                    warnings:  validationWarningsDiv
                });
            }

        }

        //#endregion

        this.startLiveLinkRefresh(liveLinkInfo);

    }

    //#endregion

    //#region Reloading a live link

    // A live link points at a charging session that is still running, so an
    // https transport may say how often to ask for the document again. Every
    // "refresh" seconds it is fetched in the background: a newer document is
    // processed and displayed like any other, the same one changes nothing.
    //
    // Neither does a request that fails. The transports belong to the operator,
    // and a station that is unreachable for a while must not take a document
    // that was loaded successfully off the screen.
    private startLiveLinkRefresh(liveLinkInfo:  liveLink.IChargeTransparencyLiveLink,
                                 reconsider:    boolean = false): void
    {

        // stopLiveLinkRefresh() bumps the generation, so any prepare or poll
        // still suspended from a previous start abandons itself the moment it
        // resumes: no second timer chain, and no re-arm after the view has
        // moved on or a decision was revoked.
        this.stopLiveLinkRefresh();

        void this.prepareLiveLinkRefresh(liveLinkInfo, this.liveLinkRefreshGeneration, reconsider);

    }

    // Whether the refresh started by this generation is still the one that
    // should be running: the document has not been replaced, and no newer
    // start has superseded it.
    private isLiveLinkRefreshCurrent(liveLinkInfo:  liveLink.IChargeTransparencyLiveLink,
                                     generation:    number): boolean
    {
        return this.currentLiveLink            === liveLinkInfo &&
               this.liveLinkRefreshGeneration  === generation;
    }

    // The mobile app ships its own "externalURLs.conf" (if any) next to its
    // index.html, exactly like a web installation would: a fork built for one
    // operator can pre-approve that operator's servers there. An app without
    // the file simply has no pre-approved prefixes.
    private async loadExternalURLConfigText(): Promise<string>
    {

        const response = await fetch("externalURLs.conf", {
            headers: { "Accept": "text/plain" }
        });

        if (!response.ok)
            return "";

        return response.text();

    }

    private parseExternalURLConfig(configText: string): ExternalURLRule[]
    {
        return parseExternalURLConfig(configText);
    }

    // When reconsider is set, the origins the user has already decided are
    // offered again alongside any still-unknown ones - each with its current
    // choice pre-selected - so "change" reopens the question without first
    // throwing the existing answer away. Dismissing the dialog then keeps
    // every decision exactly as it was.
    private async prepareLiveLinkRefresh(liveLinkInfo:  liveLink.IChargeTransparencyLiveLink,
                                         generation:    number,
                                         reconsider:    boolean = false): Promise<void>
    {

        const transport = this.liveLinkTransports(liveLinkInfo).find(
                              (candidate): candidate is liveLink.TransportHTTPS =>
                                  candidate.type === "https"              &&
                                  typeof candidate.refresh === "number"   &&
                                  candidate.refresh > 0
                          );

        const refresh   = transport?.refresh;

        if (transport === undefined || refresh === undefined)
            return;

        // Whatever the document says, a reloading client hammers no one: a
        // viral QR code must not turn every phone that scans it into a flood,
        // and an enormous value must not overflow the timer delay into an
        // immediate loop at the other end of the range.
        const refreshSeconds = Math.min(Math.max(refresh, minimumRefreshSeconds), maximumRefreshSeconds);

        // A live link is a document from outside and may name any URL at all,
        // so its URLs are a trust question. It is answered in tiers: what the
        // installation allowed in "externalURLs.conf" and the installation's
        // own origin need no consent; everything else needs the user's, given
        // once per origin and remembered: trust on first use.
        //
        // Unless the installation is in strict mode: then only the listed
        // prefixes and the own origin are ever reloaded, and nothing else is
        // offered. An operator's fork that lists its own servers wants this,
        // so its drivers are never asked a trust question they cannot judge.
        const configText     = await this.loadExternalURLConfigText().catch(() => "");
        const rules          = this.parseExternalURLConfig(configText);
        const strictMode     = parseExternalURLConfigMode(configText) === "strict";

        // The developer waiver of the poll rules is meant for an application
        // SERVED from loopback - the browser build during development. The
        // native WebViews serve the app from a "localhost" scheme of their
        // own (app://localhost, https://localhost), which is an artifact of
        // the packaging, not a developer's setup - so it earns no waiver.
        const appIsLoopback  = !this.isNativePlatform() &&
                               isLoopbackHost(window.location.hostname);

        const trustedOrigins = this.loadTrustedOrigins();
        const targets        = new Array<LiveLinkPollTarget>();

        // The origins to put to the user, each with the URLs seen for it. On a
        // first ask this holds only the unknown ones; when reconsidering it
        // also holds the already-decided ones, and currentChoice remembers what
        // each was so the dialog can pre-select it.
        const askByOrigin    = new Map<string, Array<URL>>();
        const currentChoice  = new Map<string, LiveLinkOriginChoice>();

        // The origins whose remembered decision actually decided something
        // here: expiry runs on disuse, so every application of a decision
        // restarts its clock.
        const usedOrigins    = new Set<string>();

        const enqueueForAsk  = (origin: string, url: URL, choice?: LiveLinkOriginChoice): void => {

            const urls = askByOrigin.get(origin);

            if (urls !== undefined)
                urls.push(url);
            else
                askByOrigin.set(origin, [ url ]);

            if (choice !== undefined && !currentChoice.has(origin))
                currentChoice.set(origin, choice);

        };

        // The tier the trust row shows is decided by which sources are in play,
        // not by the order the URLs happen to appear in the document: a
        // user-approved origin is worth a Change button even when it sits next
        // to one the installation pre-approved. Installation-only is the
        // fallthrough, so it needs no flag of its own.
        let   hasSession   = false;
        let   hasAlways    = false;
        let   alwaysSince: string | undefined;
        let   denied       = false;

        for (const url of this.liveLinkTransportURLs(transport))
        {

            let transportURL: URL;

            try
            {
                transportURL = new URL(url, window.location.href);
            }
            catch
            {
                continue;
            }

            const rule = findExternalURLRule(transportURL, rules);

            if (rule !== null)
            {
                targets.push({ url: transportURL, maxPayloadBytes: rule.maxPayloadBytes, prefix: rule.prefix });
                continue;
            }

            // The installation asking itself is not a trust question.
            if (transportURL.origin === window.location.origin)
            {
                targets.push({ url: transportURL, maxPayloadBytes: defaultTrustedPayloadBytes });
                continue;
            }

            // Strict mode stops here: an origin the installation did not list is
            // neither offered to the user nor polled, and a decision a user may
            // have made in some earlier, non-strict session is not honoured
            // either - the deployment behaves the same on every device.
            if (strictMode)
            {
                console.log("Not reloading this charge transparency live link from '" + transportURL.origin + "': strict mode allows only the origins listed in externalURLs.conf.");
                continue;
            }

            // The structural rules come before any consent: what fails them
            // is not even asked about.
            const problem = pollTargetProblem(transportURL, appIsLoopback);

            if (problem !== null)
            {
                console.log("Not reloading this charge transparency live link from '" + transportURL.origin + "': " + problem + ".");
                continue;
            }

            if (this.liveLinkSessionAllowedOrigins.has(transportURL.origin))
            {
                if (reconsider)
                {
                    enqueueForAsk(transportURL.origin, transportURL, "once");
                    continue;
                }
                targets.push({ url: transportURL, maxPayloadBytes: defaultTrustedPayloadBytes });
                hasSession = true;
                continue;
            }

            const remembered = findTrustedOrigin(trustedOrigins, transportURL.origin);

            if (remembered?.decision === "allow")
            {
                if (reconsider)
                {
                    enqueueForAsk(transportURL.origin, transportURL, "always");
                    continue;
                }
                targets.push({ url: transportURL, maxPayloadBytes: defaultTrustedPayloadBytes });
                hasAlways    = true;
                alwaysSince ??= remembered.since;
                usedOrigins.add(transportURL.origin);
                continue;
            }

            if (remembered?.decision === "deny")
            {
                if (reconsider)
                {
                    enqueueForAsk(transportURL.origin, transportURL, "deny");
                    continue;
                }
                denied = true;
                usedOrigins.add(transportURL.origin);
                continue;
            }

            enqueueForAsk(transportURL.origin, transportURL);

        }

        //#region Using a decision restarts its idle-expiry clock

        if (usedOrigins.size > 0)
        {

            const nowDate = new Date();
            let   touched = false;

            for (const origin of usedOrigins)
                touched = touchTrustedOrigin(trustedOrigins, origin, nowDate) || touched;

            // A use is persisted no more than hourly, so a live link that
            // reloads every few seconds does not churn the storage.
            if (touched)
                this.saveTrustedOrigins(trustedOrigins);

        }

        //#endregion

        //#region Ask about the unknown origins, before any request goes out

        let anyUndecided = false;

        if (askByOrigin.size > 0 &&
            this.isLiveLinkRefreshCurrent(liveLinkInfo, generation))
        {

            const decisions = await this.askForLiveLinkTrust(
                                        liveLinkInfo,
                                        Array.from(askByOrigin.keys()),
                                        reconsider ? currentChoice : undefined
                                    );

            if (!this.isLiveLinkRefreshCurrent(liveLinkInfo, generation))
                return;

            const now            = new Date().toISOString();
            const stored         = this.loadTrustedOrigins();
            const alwaysOrigins  = new Array<{ origin: string, urls: Array<URL>, since: string }>();
            const sessionOrigins = new Array<{ origin: string, urls: Array<URL> }>();
            let   storeChanged   = false;

            // The label an entry is filed under in the settings: the operator
            // name the user just saw in the consent dialog. The origins
            // themselves are stored hashed, so this is all the settings screen
            // will have to show.
            const operatorLabel  = sanitizeTrustLabel(chargyLib.asJSONObject(liveLinkInfo["chargingStationOperator"])?.["name"]);

            for (const [ origin, urls ] of askByOrigin)
            {

                switch (decisions.get(origin))
                {

                    case "once":
                        // Session-only: an earlier "always" or "deny" for this
                        // origin is dropped so nothing about it stays remembered.
                        if (removeTrustedOrigin(stored, origin))
                            storeChanged = true;
                        sessionOrigins.push({ origin, urls });
                        break;

                    case "always":
                        // Persisted below in one write; the targets are added
                        // afterwards so the row can tell "always" from the
                        // "this session only" fallback if the write fails.
                        //
                        // A decision that has not changed is not rewritten at
                        // all: the entry keeps its salt, its label and its
                        // date. Rewriting would let any document that names an
                        // already-trusted origin replace the label the user
                        // originally consented under, and a fresh salt on every
                        // confirmation would tell two snapshots of the store
                        // apart by mere re-confirmation activity.
                        {
                            const existing = findTrustedOrigin(stored, origin);

                            if (existing?.decision === "allow")
                            {
                                storeChanged = touchTrustedOrigin(stored, origin, new Date()) || storeChanged;
                                alwaysOrigins.push({ origin, urls, since: existing.since });
                            }

                            else
                            {
                                const entry  = upsertTrustedOrigin(stored, origin, "allow", trustLabelForOrigin(operatorLabel, origin), now);
                                storeChanged = true;
                                alwaysOrigins.push({ origin, urls, since: entry.since });
                            }
                        }
                        break;

                    case "deny":
                        if (findTrustedOrigin(stored, origin)?.decision !== "deny")
                        {
                            upsertTrustedOrigin(stored, origin, "deny", trustLabelForOrigin(operatorLabel, origin), now);
                            storeChanged = true;
                        }
                        else
                            storeChanged = touchTrustedOrigin(stored, origin, new Date()) || storeChanged;
                        denied = true;
                        // A session grant made earlier must not keep the origin
                        // pollable after it has just been blocked.
                        this.liveLinkSessionAllowedOrigins.delete(origin);
                        break;

                    default:
                        // Left undecided: not remembered, not polled this time,
                        // but still offerable through the trust row.
                        anyUndecided = true;
                        break;

                }

            }

            const persisted = storeChanged ? this.saveTrustedOrigins(stored) : true;

            for (const { origin, urls } of sessionOrigins)
            {
                this.liveLinkSessionAllowedOrigins.add(origin);
                hasSession = true;
                for (const url of urls)
                    targets.push({ url: url, maxPayloadBytes: defaultTrustedPayloadBytes });
            }

            for (const { origin, urls, since } of alwaysOrigins)
            {

                // If the write did not stick, the honest tier for this origin
                // is "this session only" - which is exactly how it will behave.
                if (persisted)
                {
                    // A session grant would shadow the stored "always" on the
                    // next prepare (session is checked first), so it is cleared
                    // once the origin is remembered for good.
                    this.liveLinkSessionAllowedOrigins.delete(origin);
                    hasAlways    = true;
                    alwaysSince ??= since;
                }
                else
                {
                    this.liveLinkSessionAllowedOrigins.add(origin);
                    hasSession = true;
                }

                for (const url of urls)
                    targets.push({ url: url, maxPayloadBytes: defaultTrustedPayloadBytes });

            }

        }

        //#endregion

        if (targets.length === 0)
        {

            // Something still offerable outranks a dead end: a user who
            // dismissed can decide later, where nothing pollable never becomes
            // pollable.
            this.updateLiveLinkTrustRow(liveLinkInfo, anyUndecided ? { kind: "ask" }
                                                    : denied       ? { kind: "denied" }
                                                    :                { kind: "unavailable" });

            if (!denied && !anyUndecided)
                console.log("Not reloading this charge transparency live link: none of the URLs of its https transport may be polled.");

            return;

        }

        if      (hasAlways)   this.updateLiveLinkTrustRow(liveLinkInfo, { kind: "always", since: alwaysSince });
        else if (hasSession)  this.updateLiveLinkTrustRow(liveLinkInfo, { kind: "session" });
        else                  this.updateLiveLinkTrustRow(liveLinkInfo, { kind: "installation" });

        // A timer that fires after the view has moved on, or after a newer
        // start has superseded this one, does nothing and schedules no
        // successor.
        const poll = async (): Promise<void> => {

            if (!this.isLiveLinkRefreshCurrent(liveLinkInfo, generation))
                return;

            try
            {
                await this.reloadLiveLink(liveLinkInfo, targets, generation);
            }
            catch
            {
                // Whatever went wrong out there, what is on screen was loaded
                // successfully once and stays.
            }

            if (this.isLiveLinkRefreshCurrent(liveLinkInfo, generation))
                this.liveLinkRefreshTimer = setTimeout(() => void poll(), refreshSeconds * 1000);

        };

        if (this.isLiveLinkRefreshCurrent(liveLinkInfo, generation))
            this.liveLinkRefreshTimer = setTimeout(() => void poll(), refreshSeconds * 1000);

    }

    public stopLiveLinkRefresh(): void
    {

        // Bumping the generation is the actual stop: it cannot cancel a poll
        // already suspended mid-await, but that poll checks the generation
        // before it re-arms, so it will not schedule a successor. Clearing the
        // timer handles the common case where nothing is in flight.
        this.liveLinkRefreshGeneration++;

        if (this.liveLinkRefreshTimer !== null)
        {
            clearTimeout(this.liveLinkRefreshTimer);
            this.liveLinkRefreshTimer = null;
        }

    }

    // Leaving the live link view - for another page, another document, or the
    // start page - ends both the polling and a trust question still open.
    public onLiveLinkViewLeft(): void
    {
        this.stopLiveLinkRefresh();
        this.closeLiveLinkTrustDialog();
    }

    private clearLiveLinkState(): void
    {
        this.stopLiveLinkRefresh();
        this.closeLiveLinkTrustDialog();
        this.liveLinkTrustRowDiv        = null;
        this.liveLinkTrustContentDiv    = null;
        this.currentLiveLink            = null;
        this.currentLiveLinkMeterValues = null;
    }

    private isNativePlatform(): boolean
    {
        return typeof cordova !== 'undefined' &&
               (cordova.platformId === 'android' || cordova.platformId === 'ios');
    }

    // The well-formed transports of a live link. liveTransports is optional and
    // comes from a document written elsewhere, so it may be missing, not an
    // array, or hold entries that are not transports at all; every reader goes
    // through here, so a broken transport is simply dropped and the rest still
    // work instead of the whole live link failing over it.
    private liveLinkTransports(liveLinkInfo: liveLink.IChargeTransparencyLiveLink): Array<liveLink.Transport>
    {

        return Array.isArray(liveLinkInfo.liveTransports)
                   ? liveLinkInfo.liveTransports.filter(
                         (transport): transport is liveLink.Transport =>
                             liveLink.isTransport(transport)
                     )
                   : [];

    }

    // The URLs of a transport: the single "url" first, then the "urls" in the
    // order of their priority.
    private liveLinkTransportURLs(transport: liveLink.Transport): Array<string>
    {

        const urls = new Array<string>();

        if (transport.url != null && transport.url !== "")
            urls.push(transport.url);

        const additionalURLs = [ ...(transport.urls ?? []) ].sort(
                                   (url1, url2) => (typeof url1 === "string" ? 0 : url1.priority ?? 0) -
                                                   (typeof url2 === "string" ? 0 : url2.priority ?? 0)
                               );

        for (const additionalURL of additionalURLs)
        {

            const url = typeof additionalURL === "string" ? additionalURL : additionalURL.url;

            if (url !== "")
                urls.push(url);

        }

        return urls;

    }

    // Asks each URL in turn until one answers with a live link. A document that
    // describes a different session is ignored, and so is one that is not newer
    // than what is on screen.
    private async reloadLiveLink(liveLinkInfo:  liveLink.IChargeTransparencyLiveLink,
                                 targets:       Array<LiveLinkPollTarget>,
                                 generation:    number): Promise<void>
    {

        for (const target of targets)
        {

            const requestURL = this.liveLinkRefreshURL(target.url, liveLinkInfo);

            // Adding the timestamp must not move the URL out of the prefix or
            // origin it was allowed under.
            if (target.prefix !== undefined && !requestURL.href.startsWith(target.prefix))
                continue;

            if (requestURL.origin !== target.url.origin)
                continue;

            // "redirect: error" rather than the default "follow": the checks
            // above vetted this exact URL, and a redirect could send the
            // request to a host that was never vetted - an internal address, a
            // different origin. A live link endpoint that wants to relocate has
            // to answer directly, not bounce the WebView somewhere unchecked.
            const response = await fetch(requestURL.href,
                                         { cache: "no-store", credentials: "omit", redirect: "error" }).
                                   catch(() => null);

            if (response?.ok !== true)
                continue;

            const text = new TextDecoder().decode(
                             await readResponseWithinLimit(response, target.maxPayloadBytes)
                         );

            let reloaded: unknown;

            try
            {
                reloaded = JSON.parse(text);
            }
            catch
            {
                continue;
            }

            if (!liveLink.IsAChargeTransparencyLiveLink(reloaded) ||
                reloaded["@id"] !== liveLinkInfo["@id"])
            {
                continue;
            }

            // The user may have left the live link view while this request was
            // in flight; a page-based UI must not yank them back onto it just
            // because an answer arrived.
            if (this.isNewerLiveLink(reloaded, liveLinkInfo) &&
                this.isLiveLinkRefreshCurrent(liveLinkInfo, generation))
            {
                await this.detectContentFormat(text, () => {
                    // Whatever failed to parse, what is on screen was loaded
                    // successfully once and stays.
                });
            }

            // The endpoint answered. Whether it had something new or not, there
            // is no reason to ask the next one.
            return;

        }

    }

    // The request says which version the client already has, as
    // "lastUpdated=<timestamp>" next to whatever the URL already carries. A
    // server that keeps track of that can answer with less than the whole
    // document; one that does not care ignores the parameter.
    private liveLinkRefreshURL(url:           URL,
                               liveLinkInfo:  liveLink.IChargeTransparencyLiveLink): URL
    {

        const refreshURL  = new URL(url.href);
        const lastUpdated = chargyLib.asString(liveLinkInfo["lastUpdated"]);

        if (lastUpdated !== undefined && lastUpdated !== "")
            refreshURL.searchParams.set("lastUpdated", lastUpdated);

        return refreshURL;

    }

    // "lastUpdated" is what a document says about its own recency, and it is
    // what decides here. A document that does not carry it cannot be told apart
    // from the one already loaded, so it is left alone.
    private isNewerLiveLink(reloaded:  liveLink.IChargeTransparencyLiveLink,
                            current:   liveLink.IChargeTransparencyLiveLink): boolean
    {

        const reloadedLastUpdated = chargyLib.asString(reloaded["lastUpdated"]);

        if (reloadedLastUpdated === undefined)
            return false;

        const currentLastUpdated  = chargyLib.asString(current["lastUpdated"]);

        if (currentLastUpdated === undefined)
            return true;

        return chargyLib.parseUTC(reloadedLastUpdated).valueOf() >
               chargyLib.parseUTC(currentLastUpdated). valueOf();

    }

    //#endregion

    //#region The remembered decisions

    private static readonly trustedOriginsStorageKey = "chargyLiveLinkTrustedOrigins";

    private loadTrustedOrigins(): ITrustedOriginsStore
    {

        try
        {

            const raw    = localStorage.getItem(ChargyApp.trustedOriginsStorageKey);
            const store  = parseTrustedOriginsStore(raw);

            // Every load is also the moment expired decisions actually go: a
            // pruned entry is written back right away, so it does not linger
            // in storage until the next decision happens to be saved.
            const pruned = pruneExpiredTrustedOrigins(store, new Date());

            // And whatever is stored that is not exactly the parsed store is
            // rewritten as the parsed store. This is what actually deletes the
            // plain text origins an earlier version kept under this very key:
            // they parse as an empty store, and leaving the old bytes behind
            // would preserve forever precisely what the hashing is for.
            if (pruned || (raw !== null && raw !== serializeTrustedOriginsStore(store)))
                this.saveTrustedOrigins(store);

            return store;

        }
        catch
        {
            // A WebView that refuses storage simply asks again next time.
            return emptyTrustedOriginsStore();
        }

    }

    // Returns whether the decisions were actually persisted. A WebView that
    // refuses storage (private mode, quota, cleared site data) is no worse than
    // a repeated question - but the caller must not then claim the decision was
    // remembered, so the failure is reported rather than swallowed.
    private saveTrustedOrigins(store: ITrustedOriginsStore): boolean
    {

        try
        {
            localStorage.setItem(ChargyApp.trustedOriginsStorageKey, serializeTrustedOriginsStore(store));
            return true;
        }
        catch
        {
            return false;
        }

    }

    //#endregion

    //#region The trust dialog

    // Asks about each unknown origin on its own row, so a document cannot make
    // one "allow" carry an origin the user did not mean to trust: allowing the
    // operator's server it recognises does not silently allow an attacker's
    // server listed beside it. Resolves once every origin has a decision, or
    // earlier if the user dismisses - undecided origins are then absent from
    // the result and polled by no one.
    private async askForLiveLinkTrust(liveLinkInfo:  liveLink.IChargeTransparencyLiveLink,
                                      origins:       Array<string>,
                                      current?:      Map<string, LiveLinkOriginChoice>): Promise<Map<string, LiveLinkOriginChoice>>
    {

        this.closeLiveLinkTrustDialog();

        const description = this.chargy.GetLocalizedText(liveLinkInfo.description);
        const operator    = chargyLib.asString(chargyLib.asJSONObject(liveLinkInfo["chargingStationOperator"])?.["name"]);

        this.liveLinkTrustDocumentDiv.innerText = [
                                                      description ?? chargyLib.asString(liveLinkInfo["@id"]) ?? "",
                                                      operator    ?? ""
                                                  ].filter(line => line !== "").join(" · ");

        // Reconsidering ("change") seeds every origin with its current choice,
        // so the dialog opens already decided and only what the user actually
        // changes is changed. A first ask starts blank and every origin has to
        // be answered.
        const decisions = new Map<string, LiveLinkOriginChoice>(current);
        const undecided = new Set<string>(origins.filter(origin => !decisions.has(origin)));

        this.liveLinkTrustDecisions            = decisions;
        this.liveLinkTrustOriginsDiv.innerText = "";

        for (const origin of origins)
        {

            const rowDiv        = chargyLib.CreateDiv(this.liveLinkTrustOriginsDiv, "trustOrigin");

            // As text, not as markup: CreateDiv's third parameter is innerHTML,
            // and what the user consents to must be displayed exactly as it is.
            const originDiv     = chargyLib.CreateDiv(rowDiv, "origin");
            originDiv.innerText = origin;

            const buttonsDiv    = chargyLib.CreateDiv(rowDiv, "trustOriginButtons");

            const chosen        = decisions.get(origin);

            const addButton     = (labelKey: string, choice: LiveLinkOriginChoice): void => {

                const button     = buttonsDiv.appendChild(document.createElement('button'));
                button.className = "trustChoice " + choice + (choice === chosen ? " chosen" : "");
                button.innerText = this.chargy.GetLocalizedMessage(labelKey);
                button.onclick   = (): void => {

                    decisions.set(origin, choice);
                    undecided.delete(origin);

                    for (const sibling of Array.from(buttonsDiv.children))
                        sibling.classList.toggle("chosen", sibling === button);

                    rowDiv.classList.add("decided");

                    // Answering the last still-open origin closes the dialog and
                    // the awaiting caller applies every choice - a clicked button
                    // ends the dialog, as one expects. Reconsidering pre-answers
                    // every origin, so the first click closes; the pre-filled
                    // decisions make that close apply the current choice to
                    // anything left untouched, so nothing is lost.
                    if (undecided.size === 0)
                        this.resolveLiveLinkTrust();

                };

            };

            addButton("allowOnceLabel",   "once");
            addButton("allowAlwaysLabel", "always");
            addButton("doNotAllowLabel",  "deny");

            if (chosen !== undefined)
                rowDiv.classList.add("decided");

        }

        this.liveLinkTrustDialogDiv.style.display = 'flex';

        return new Promise(resolve => {
            this.liveLinkTrustResolve = resolve;
        });

    }

    private resolveLiveLinkTrust(): void
    {

        const resolve   = this.liveLinkTrustResolve;
        const decisions = this.liveLinkTrustDecisions ?? new Map<string, LiveLinkOriginChoice>();

        this.liveLinkTrustResolve                 = null;
        this.liveLinkTrustDecisions               = null;
        this.liveLinkTrustDialogDiv.style.display = 'none';

        resolve?.(decisions);

    }

    // Loading another document while the dialog is open counts as no further
    // answer: whatever was decided so far is delivered, and whoever awaits the
    // dialog sees the view has moved on.
    public closeLiveLinkTrustDialog(): void
    {
        if (this.liveLinkTrustResolve !== null)
            this.resolveLiveLinkTrust();
    }

    // The Android hardware back button dismisses the dialog the same way the
    // back arrow inside it does.
    public isLiveLinkTrustDialogOpen(): boolean
    {
        return this.liveLinkTrustDialogDiv.style.display === 'flex';
    }

    public dismissLiveLinkTrustDialog(): void
    {
        this.resolveLiveLinkTrust();
    }

    //#endregion

    //#region The trust row under the live link

    private updateLiveLinkTrustRow(liveLinkInfo:  liveLink.IChargeTransparencyLiveLink,
                                   state:         LiveLinkTrustState): void
    {

        const rowDiv     = this.liveLinkTrustRowDiv;
        const contentDiv = this.liveLinkTrustContentDiv;

        if (rowDiv === null || contentDiv === null || this.currentLiveLink !== liveLinkInfo)
            return;

        contentDiv.innerText = "";

        const message = (key: string): string => this.chargy.GetLocalizedMessage(key);

        let   statusText:  string;
        let   buttonLabel: string | null = null;

        switch (state.kind)
        {

            case "installation":
                statusText  = message("liveReloadActive") + " (" + message("allowedByThisInstallation") + ")";
                break;

            case "session":
                statusText  = message("liveReloadActive") + " – " + message("thisSessionOnly");
                buttonLabel = message("changeLabel");
                break;

            case "always":
                statusText  = message("liveReloadActive") +
                              (state.since != null && state.since !== ""
                                   ? " – " + message("trustedSince") + " " + new Date(state.since).toLocaleDateString(this.UILanguage)
                                   : "");
                buttonLabel = message("changeLabel");
                break;

            case "denied":
                statusText  = message("liveReloadBlocked");
                buttonLabel = message("changeLabel");
                break;

            case "ask":
                statusText  = message("liveReloadNotActive");
                buttonLabel = message("allowLabel");
                break;

            case "unavailable":
                statusText  = message("liveReloadNotPossible");
                break;

        }

        chargyLib.CreateDiv(contentDiv, "status", statusText);

        if (buttonLabel !== null)
        {

            const changeButton     = contentDiv.appendChild(document.createElement('button'));
            changeButton.className = "linkButton trustChange";
            changeButton.innerText = buttonLabel;

            // Reopens the dialog with every origin's current choice
            // pre-selected, so changing one answer keeps the others and simply
            // dismissing the dialog leaves every decision as it was. The button
            // is only a way back into the question, never itself a change.
            changeButton.onclick   = (): void => {
                this.startLiveLinkRefresh(liveLinkInfo, true);
            };

        }

        rowDiv.style.display = "";

    }

    //#endregion

    //#region The remembered origins on the settings page

    public showSettingsMenu(): void
    {
        this.settingsMenuDiv.style.display           = "block";
        this.settingsTrustedOriginsDiv.style.display = "none";
    }

    // One level back within the settings page, not out of it: from the trusted
    // origins sub-page to the settings menu. Returns whether the step was
    // consumed here; if not, the caller leaves the settings page itself.
    public settingsPageGoBack(): boolean
    {

        if (this.settingsTrustedOriginsDiv.style.display !== "none")
        {
            this.showSettingsMenu();
            return true;
        }

        return false;

    }

    public refreshTrustedOriginsList(): void
    {

        const store = this.loadTrustedOrigins();

        //#region The retention controls

        this.trustRetentionEnabledInput.checked = store.retentionMonths !== null;
        this.trustRetentionMonthsInput.disabled = store.retentionMonths === null;

        if (store.retentionMonths !== null)
            this.trustRetentionMonthsInput.value = store.retentionMonths.toString();

        //#endregion

        // Sorted by operator, then by age; entries without a label at the end.
        const entries = [ ...store.origins ].sort(
                            (entry1, entry2) => (entry1.label === "" ? 1 : 0) - (entry2.label === "" ? 1 : 0) ||
                                                entry1.label.localeCompare(entry2.label)                      ||
                                                entry1.since.localeCompare(entry2.since));

        this.trustedOriginsListDiv.innerText   = "";
        this.noTrustedOriginsDiv.style.display = entries.length > 0 ? "none" : "block";

        for (const entry of entries)
        {

            const rowDiv       = chargyLib.CreateDiv(this.trustedOriginsListDiv, "trustedOrigin");

            const infosDiv     = chargyLib.CreateDiv(rowDiv, "infos");

            // The origin itself is stored hashed, so the row is named after the
            // operator whose document the user consented to. That label is text
            // from an outside document: assigned as text, never as markup.
            const labelDiv     = chargyLib.CreateDiv(infosDiv, "origin");
            labelDiv.innerText = entry.label !== ""
                                     ? entry.label
                                     : this.chargy.GetLocalizedMessage("unknownOperatorLabel");

            const detailsDiv   = chargyLib.CreateDiv(infosDiv, "details");

            const decisionDiv     = chargyLib.CreateDiv(detailsDiv, "decision");
            decisionDiv.innerHTML = entry.decision === "allow"
                                        ? '<i class="fas fa-check-circle"></i> ' + this.chargy.GetLocalizedMessage("allowedLabel")
                                        : '<i class="fas fa-times-circle"></i> ' + this.chargy.GetLocalizedMessage("blockedLabel");

            if (entry.since !== "")
                chargyLib.CreateDiv(detailsDiv, "since",
                                    this.chargy.GetLocalizedMessage("sinceLabel") + " " +
                                    new Date(entry.since).toLocaleDateString(this.UILanguage));

            const expiry = trustedOriginExpiry(entry, store.retentionMonths);

            if (expiry !== null)
                chargyLib.CreateDiv(detailsDiv, "expires",
                                    this.chargy.GetLocalizedMessage("expiresLabel") + " " +
                                    expiry.toLocaleDateString(this.UILanguage));

            const deleteButton     = rowDiv.appendChild(document.createElement('button'));
            deleteButton.className = "delete";
            deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
            deleteButton.title     = this.chargy.GetLocalizedMessage("deleteLabel");
            deleteButton.onclick   = (): void => {

                // Salt and hash identify the entry; a plain origin to delete by
                // does not exist here, which is the point of the hashing. For
                // the same reason a session grant given under this origin
                // cannot be cleared from the settings - it ends with the
                // session either way.
                const stored   = this.loadTrustedOrigins();
                stored.origins = stored.origins.filter(candidate => candidate.hash !== entry.hash ||
                                                                    candidate.salt !== entry.salt);
                this.saveTrustedOrigins(stored);

                this.refreshTrustedOriginsList();

                // Revoking a decision has to reach an already-running poll: a
                // live link loaded before this deletion keeps polling with the
                // targets it captured then, including the origin just removed.
                // Stopping is enough - the settings page has replaced the live
                // link view, so there is nothing to re-poll until a document is
                // shown again, which prepares afresh. Restarting here instead
                // would pop the trust dialog over the settings page for the
                // very origin the user is removing.
                this.stopLiveLinkRefresh();

            };

        }

    }

    //#endregion

    //#region Live link card building blocks

    private appendLiveLinkInfoRow(tableDiv:   HTMLDivElement,
                                  className:  string,
                                  iconHTML:   string,
                                  content:    string|HTMLElement): HTMLDivElement
    {

        const rowDiv      = tableDiv.appendChild(document.createElement('div'));
        rowDiv.className  = className;

        const iconDiv     = rowDiv.appendChild(document.createElement('div'));
        iconDiv.className = "icon";
        iconDiv.innerHTML = iconHTML;

        const textDiv     = rowDiv.appendChild(document.createElement('div'));
        textDiv.className = "text";

        if (typeof content === "string")
            textDiv.innerText = content;
        else
            textDiv.appendChild(content);

        return rowDiv;

    }

    // How many signatures a document carries, as a sentence rather than a number.
    private liveLinkSignatureCountText(count: number): string
    {

        return count === 1
                   ? this.chargy.GetLocalizedMessage("documentOneSignatureLabel")
                   : this.chargy.GetLocalizedMessageWithParameter("documentSignaturesLabel", count);

    }

    // The signatures over the whole document and what became of them.
    //
    // Says only what was actually established. A document nobody signed is not
    // the same as one whose signature does not match, and neither is the same as
    // a signature this application cannot judge because it does not know the
    // algorithm - so each gets its own wording, and the detail lines come from
    // ChargyCore, which knows which of the three it found.
    private appendLiveLinkSignatureRow(tableDiv:      HTMLDivElement,
                                       liveLinkInfo:  liveLink.IChargeTransparencyLiveLink): void
    {

        const verification   = liveLinkInfo.signatureVerification;
        const signatureCount = Array.isArray(liveLinkInfo.signatures) ? liveLinkInfo.signatures.length : 0;

        // A document read by a ChargyCore that does not verify document
        // signatures carries no verdict. Counting the signatures is then still
        // honest; claiming anything about them would not be.
        if (verification === undefined)
        {

            if (signatureCount > 0)
                this.appendLiveLinkInfoRow(
                    tableDiv,
                    "signatureInfos",
                    '<i class="fas fa-file-signature"></i>',
                    this.liveLinkSignatureCountText(signatureCount)
                );

            return;

        }

        const contentDiv = document.createElement('div');
        const statusDiv  = chargyLib.CreateDiv(contentDiv, "signatureStatus");

        const describe   = (state:      string,
                            iconClass:  string,
                            text:       string): void => {

            statusDiv.classList.add(state);

            const iconElement     = statusDiv.appendChild(document.createElement('i'));
            iconElement.className = iconClass;

            // As a text node, not as markup: none of this is meant to be read
            // as HTML, and part of it comes from a document written elsewhere.
            statusDiv.appendChild(document.createTextNode(" " + text));

        };

        const countAnd   = (message: string): string =>
                               this.liveLinkSignatureCountText(signatureCount) + " · " + message;

        // The colour says how bad it is, the wording says what happened. Naming
        // the ratio is the only honest headline when some verified and some did
        // not, because neither "verified" nor "not verified" is then true of the
        // document as a whole.
        const state    = documentSignatureState(verification);

        const headline = verification.status === "unsigned"
                             ? this.chargy.GetLocalizedMessage("documentNotSignedLabel")
                             : verification.status === "allValid"
                                   ? countAnd(this.chargy.GetLocalizedMessage("documentSignaturesVerifiedLabel"))
                                   : verification.status === "someValid"
                                         ? countAnd(this.chargy.GetLocalizedMessageWithParameter(
                                                        "documentSignaturesPartiallyVerifiedLabel",
                                                        verification.validCount.toString() + "/" + signatureCount.toString()
                                                    ))
                                         : countAnd(this.chargy.GetLocalizedMessage("documentSignaturesNotVerifiedLabel"));

        describe(state,
                 state === "valid"     ? "fas fa-check-circle"
                 : state === "invalid" ? "fas fa-times-circle"
                 :                       "fas fa-exclamation-circle",
                 headline);

        // Why, in ChargyCore's words: that the signature does not match, that
        // the key is not in the document, that the algorithm is unknown.
        //
        // Several signatures failing the same way say one thing, not several,
        // so the same sentence is never printed twice - whatever the core that
        // produced the warnings did about it.
        const shown = new Set<string>();

        for (const warning of liveLinkInfo.warnings ?? [])
        {

            const text = this.chargy.GetLocalizedText(warning.message);

            if (text != null && text !== "" && !shown.has(text))
            {

                shown.add(text);

                const warningDiv     = chargyLib.CreateDiv(contentDiv, "signatureWarning");
                warningDiv.innerText = text;

            }

        }

        this.appendLiveLinkInfoRow(
            tableDiv,
            "signatureInfos",
            '<i class="fas fa-file-signature"></i>',
            contentDiv
        );

    }

    // The one verdict over the whole live link, the counterpart of the badge a
    // charge transparency record carries: everything verified, something that
    // could not be judged, or something that demonstrably does not hold.
    //
    // Two independent things have to hold for green, and both are signatures:
    // the ones over the document - which make the transport URLs and the listed
    // keys the operator's - and the ones over every single meter value. The
    // worst of the two decides, because a verdict over the whole is only ever
    // as good as its weakest part.
    private liveLinkOverallState(liveLinkInfo:  liveLink.IChargeTransparencyLiveLink,
                                 meterValues:   chargeTransparencyRecord.IChargeTransparencyRecord|null): LiveLinkOverallState
    {

        const states       = new Array<LiveLinkOverallState>();
        const verification = liveLinkInfo.signatureVerification;

        //#region What the signatures over the document say

        if (verification !== undefined)
            states.push(documentSignatureState(verification));

        //#endregion

        //#region What the signatures over the meter values say

        const chargingSession = meterValues?.chargingSessions?.[0];

        if (chargingSession != null)
        {

            const sessionState = meterValueSessionState(chargingSession.verificationResult?.status);

            if (sessionState === "valid")
                states.push(hasSessionWarnings(chargingSession) ? "warning" : "valid");

            else if (sessionState !== null)
                states.push(sessionState);

            // The session verdict is an aggregate; the badge claims something
            // about every single meter value, so every single one is looked at.
            for (const measurement of chargingSession.measurements ?? [])
                for (const measurementValue of measurement.values)
                    states.push(measurementValueState(measurementValue.result?.status));

        }

        //#endregion

        // Nothing to go on at all - no verification of the document, and no
        // meter values yet.
        return worstLiveLinkState(states);

    }

    // The badge in the top right corner of the live link, built exactly like
    // the one of a charge transparency record so that it reads the same.
    private appendLiveLinkVerificationStatus(liveLinkDiv:   HTMLDivElement,
                                             liveLinkInfo:  liveLink.IChargeTransparencyLiveLink,
                                             meterValues:   chargeTransparencyRecord.IChargeTransparencyRecord|null): void
    {

        const statusDiv     = liveLinkDiv.appendChild(document.createElement('div'));
        statusDiv.className = "verificationStatus";

        const describe      = (iconClass: string, messageKey: string): void => {

            const iconElement     = statusDiv.appendChild(document.createElement('i'));
            iconElement.className = iconClass;

            statusDiv.appendChild(document.createTextNode(" " + this.chargy.GetLocalizedMessage(messageKey)));

        };

        switch (this.liveLinkOverallState(liveLinkInfo, meterValues))
        {

            case "valid":
                describe("fas fa-check-circle",       "liveLinkValidLabel");
                break;

            case "warning":
                statusDiv.classList.add("warning");
                describe("fas fa-exclamation-circle", "liveLinkWarningsLabel");
                break;

            case "invalid":
                describe("fas fa-times-circle",       "liveLinkInvalidLabel");
                break;

            case "unvalidated":
                describe("fas fa-question-circle",    "Unvalidated");
                break;

        }

    }

    private createLiveLinkTransportDiv(transport: liveLink.Transport): HTMLDivElement {

        const transportDiv         = document.createElement('div');
        transportDiv.className     = "liveLinkTransport";

        const transportTypeDiv     = transportDiv.appendChild(document.createElement('div'));
        transportTypeDiv.className = "type";
        transportTypeDiv.innerText = transport.type;

        if (transport.url)
            transportDiv.appendChild(this.createLiveLinkAnchor(transport.url, transport.url));

        if (transport.urls)
        {
            for (const urlInfo of transport.urls)
            {
                const url       = typeof urlInfo === "string" ? urlInfo : urlInfo.url;
                const labelInfo = typeof urlInfo === "string"
                                      ? ""
                                      : [
                                            urlInfo.priority != null ? this.chargy.GetLocalizedMessage("priorityLabel") + " " + urlInfo.priority.toString() : "",
                                            urlInfo.weight   != null ? this.chargy.GetLocalizedMessage("weightLabel")   + " " + urlInfo.weight.  toString() : ""
                                        ].filter(value => value !== "").join(", ");

                transportDiv.appendChild(this.createLiveLinkAnchor(url, labelInfo !== "" ? url + " (" + labelInfo + ")" : url));
            }
        }

        if (transport.totp)
        {
            const totpDiv     = transportDiv.appendChild(document.createElement('div'));
            totpDiv.className = "totp";
            totpDiv.innerText = "TOTP: " + transport.totp.timeStep.toString() + " s";
        }

        return transportDiv;

    }

    // On android and iOS an external URL belongs into the system browser, not
    // into the WebView the app itself lives in - so the anchor delegates to
    // the app shell instead of navigating.
    private createLiveLinkAnchor(url:   string,
                                 text:  string): HTMLAnchorElement {

        const anchor     = document.createElement('a');
        anchor.href      = url;
        anchor.target    = "_blank";
        anchor.rel       = "noopener";
        anchor.innerText = text;
        anchor.onclick   = (event: MouseEvent): void => {
            event.preventDefault();
            event.stopPropagation();
            this.app.openExternalURL(url);
        };

        return anchor;

    }

    private formatChargingDuration(milliseconds: number): string
    {

        const duration = moment.duration(milliseconds);
        const message  = (key: string): string => this.chargy.GetLocalizedMessage(key);

        if (Math.floor(duration.asDays())    > 1) return duration.days()    + " " + message("daysLabel")        + " " + duration.hours()   + " " + message("hourShortLabel")   + " " + duration.minutes() + " " + message("minuteShortLabel") + " " + duration.seconds() + " " + message("secondShortLabel");
        if (Math.floor(duration.asDays())    > 0) return duration.days()    + " " + message("dayLabel")         + " " + duration.hours()   + " " + message("hourShortLabel")   + " " + duration.minutes() + " " + message("minuteShortLabel") + " " + duration.seconds() + " " + message("secondShortLabel");
        if (Math.floor(duration.asHours())   > 0) return duration.hours()   + " " + message("hourShortLabel")   + " " + duration.minutes() + " " + message("minuteShortLabel") + " " + duration.seconds() + " " + message("secondShortLabel");
        if (Math.floor(duration.asMinutes()) > 0) return duration.minutes() + " " + message("minuteShortLabel") + " " + duration.seconds() + " " + message("secondShortLabel");
        if (Math.floor(duration.asSeconds()) > 0) return duration.seconds() + " " + message("secondShortLabel");

        return "";

    }

    //#endregion

    //#endregion

    private setInfoPageTitle(page: HTMLDivElement, titleKey: string): void
    {
        const title = page.querySelector<HTMLHeadingElement>('h1');
        if (title != null)
            title.innerText = this.chargy.GetLocalizedMessage(titleKey);
    }

    private appendPublicKeyInfoRow(table: HTMLDivElement,
                                   icon: string,
                                   labelKey: string,
                                   value: string,
                                   isKey: boolean = false): void
    {
        const row       = chargyLib.CreateDiv(table, 'publicKeyInfo');
        const iconDiv   = chargyLib.CreateDiv(row, 'icon');
        iconDiv.innerHTML = '<i class="fas ' + icon + '"></i>';

        const text      = chargyLib.CreateDiv(row, 'text');
        const label     = chargyLib.CreateDiv(text, 'label');
        label.innerText = this.chargy.GetLocalizedMessage(labelKey);
        const valueDiv  = chargyLib.CreateDiv(text, isKey ? 'value keyValue' : 'value');
        valueDiv.innerText = value;
    }

    private formatPublicKeyValue(value: unknown): string
    {
        if (typeof value === 'string')
            return value;

        if (Array.isArray(value))
            return value.filter(item => typeof item === 'string').join(', ');

        if (chargyLib.isObject(value))
        {
            if (chargyLib.isOIDInfo(value))
                return value.name + ' (' + value.oid + ')';

            return Object.entries(value)
                         .map(([ key, item ]) => key + ': ' + (Array.isArray(item) ? item.join(', ') : String(item)))
                         .join(' · ');
        }

        return value == null ? '' : String(value);
    }

    //#endregion

    private formatChargingProgressTimestamp(timestamp: number): string {
        return chargyLib.parseUTC(new Date(timestamp).toISOString()).format('HH:mm:ss');
    }

    private isValidMeasurementValueSignature(measurementValue: chargeTransparencyRecord.IMeasurementValue): boolean {
        switch (measurementValue.result?.status) {
            case iface.VerificationResult.ValidSignature:
            case iface.VerificationResult.ValidStartValue:
            case iface.VerificationResult.ValidIntermediateValue:
            case iface.VerificationResult.ValidStopValue:
                return true;
            default:
                return false;
        }
    }

    private getMeasurementValueSignatureStatusText(measurementValue: chargeTransparencyRecord.IMeasurementValue): string {

        if (measurementValue.result == null)
            return this.chargy.GetLocalizedMessage("Invalid signature");

        switch (measurementValue.result.status) {
            case iface.VerificationResult.ValidationError:
                if (measurementValue.errors?.[0] != null)
                    return measurementValue.errors[0].toString();
                if (measurementValue.result.errors?.[0] != null)
                    return measurementValue.result.errors[0].toString();
                return this.chargy.GetLocalizedMessage("GeneralError");
            case iface.VerificationResult.UnknownCTRFormat:
                return this.chargy.GetLocalizedMessage("Unknown charge transparency data format!");
            case iface.VerificationResult.EnergyMeterNotFound:
                return this.chargy.GetLocalizedMessage("Energy meter not found");
            case iface.VerificationResult.PublicKeyNotFound:
                return this.chargy.GetLocalizedMessage("Public key not found");
            case iface.VerificationResult.InvalidPublicKey:
                return this.chargy.GetLocalizedMessage("Invalid public key");
            case iface.VerificationResult.InvalidSignature:
                return this.chargy.GetLocalizedMessage("Invalid signature");
            case iface.VerificationResult.InvalidStartValue:
                return this.chargy.GetLocalizedMessage("Invalid start value");
            case iface.VerificationResult.InvalidIntermediateValue:
                return this.chargy.GetLocalizedMessage("Invalid intermediate value");
            case iface.VerificationResult.InvalidStopValue:
                return this.chargy.GetLocalizedMessage("Invalid stop value");
            case iface.VerificationResult.NoOperation:
                return this.chargy.GetLocalizedMessage("Meter value");
            case iface.VerificationResult.StartValue:
                return this.chargy.GetLocalizedMessage("Start value");
            case iface.VerificationResult.IntermediateValue:
                return this.chargy.GetLocalizedMessage("Intermediate value");
            case iface.VerificationResult.StopValue:
                return this.chargy.GetLocalizedMessage("End value");
            case iface.VerificationResult.ValidSignature:
                return this.chargy.GetLocalizedMessage("Valid signature");
            case iface.VerificationResult.ValidStartValue:
                return this.chargy.GetLocalizedMessage("Valid start value");
            case iface.VerificationResult.ValidIntermediateValue:
                return this.chargy.GetLocalizedMessage("Valid intermediate value");
            case iface.VerificationResult.ValidStopValue:
                return this.chargy.GetLocalizedMessage("Valid stop value");
            default:
                return this.chargy.GetLocalizedMessage("Invalid signature");
        }

    }

    private getChargingProgressChartData(measurement: chargeTransparencyRecord.IMeasurement,
                                         mode: ChargingProgressChartMode): ChargingProgressChartData | null {

        const measurementValues = distinctValuesInTimeOrder(measurement.values);

        if (!shouldShowMeasurementChart(measurementValues.length))
            return null;

        const points: ChargingProgressChartPoint[] = [];
        const tickTimestamps: number[] = [];
        const tickStatuses: ChargingProgressTickStatus[] = [];
        let previousValue = null;
        let previousTimestamp: number | null = null;

        for (const measurementValue of measurementValues) {
            const currentValue     = getMeasurementValueInKWh(measurement, measurementValue);
            const currentTimestamp = chargyLib.parseUTC(measurementValue.timestamp).valueOf();

            // A measurement value that does not advance the clock cannot describe an
            // interval. The classic OCMF transaction document repeats the start reading
            // next to the end reading, so a session assembled from separate documents
            // carries that reading a second time and out of order. Charting it would
            // draw one bar running backwards and a second one spanning the whole
            // session. Such a value is skipped and the last one still stands.
            if (previousTimestamp !== null && currentTimestamp <= previousTimestamp)
                continue;

            tickTimestamps.push(currentTimestamp);
            tickStatuses.push({
                timestamp:        currentTimestamp,
                isValidSignature: this.isValidMeasurementValueSignature(measurementValue)
            });

            if (previousValue !== null && previousTimestamp !== null) {
                const chargedEnergy = currentValue.minus(previousValue);
                const elapsedHours  = (currentTimestamp - previousTimestamp) / 3600000;
                const chartValue    = mode === "power" && elapsedHours > 0
                                          ? chargedEnergy.div(elapsedHours)
                                          : chargedEnergy;

                points.push({
                    x:                   previousTimestamp + (currentTimestamp - previousTimestamp) / 2,
                    y:                   parseFloat(chartValue.toFixed(3)),
                    start:               previousTimestamp,
                    end:                 currentTimestamp,
                    intervalLabel:       this.formatChargingProgressTimestamp(previousTimestamp) + " - " +
                                         this.formatChargingProgressTimestamp(currentTimestamp),
                    isValidSignature:    this.isValidMeasurementValueSignature(measurementValue),
                    signatureStatusText: this.getMeasurementValueSignatureStatusText(measurementValue)
                });
            }

            previousValue     = currentValue;
            previousTimestamp = currentTimestamp;
        }

        if (points.length === 0)
            return null;

        return mode === "power"
            ? {
                  points,
                  tickTimestamps,
                  tickStatuses,
                  unit:         "KW",
                  datasetLabel: this.chargy.GetLocalizedMessage("chargingProgressPowerDatasetLabel"),
                  yAxisLabel:   this.chargy.GetLocalizedMessage("chargingProgressPowerYAxisLabel")
              }
            : {
                  points,
                  tickTimestamps,
                  tickStatuses,
                  unit:         "kWh",
                  datasetLabel: this.chargy.GetLocalizedMessage("chargingProgressEnergyDatasetLabel"),
                  yAxisLabel:   this.chargy.GetLocalizedMessage("chargingProgressEnergyYAxisLabel")
              };

    }

    private createChargingProgressChart(chartFrame: HTMLDivElement,
                                        measurement: chargeTransparencyRecord.IMeasurement,
                                        mode: ChargingProgressChartMode): ChargingProgressChart | null {

        const chartData = this.getChargingProgressChartData(measurement, mode);
        if (!chartData)
            return null;

        const canvas                = chartFrame.appendChild(document.createElement('canvas'));
        const unit                  = chartData.unit;
        const lastTickIndex         = chartData.tickTimestamps.length - 1;
        const lastTickTimestamp     = chartData.tickTimestamps[lastTickIndex];
        const previousTickTimestamp = chartData.tickTimestamps[lastTickIndex - 1] ?? lastTickTimestamp;
        const rightAxisPadding      = Math.max(1, lastTickTimestamp - previousTickTimestamp) * 0.35;

        const intervalBarPlugin: Plugin<'bar'> = {
            id: "chargingProgressIntervalBars",
            afterBuildTicks: (_chart, args): void => {
                if (args.scale.id === "x")
                    args.scale.ticks = chartData.tickTimestamps.map(timestamp => ({ value: timestamp }));
            },
            beforeDatasetsDraw: (chart): void => {
                const xScale = chart.scales["x"];
                const meta   = chart.getDatasetMeta(0);
                if (xScale == null)
                    return;

                meta.data.forEach((element, index) => {
                    const point = chartData.points[index];
                    if (point == null)
                        return;
                    const startX = xScale.getPixelForValue(point.start);
                    const endX   = xScale.getPixelForValue(point.end);
                    const bar    = element as unknown as { x: number; width: number };
                    bar.x        = startX + (endX - startX) / 2;
                    bar.width    = Math.max(1, Math.abs(endX - startX));
                });
            },
            afterDraw: (chart): void => {
                const xScale = chart.scales["x"];
                if (xScale == null)
                    return;

                const ctx         = chart.ctx;
                const radius      = 6;
                const tickCenterY = chart.chartArea.bottom + 18;
                ctx.save();
                ctx.font         = "11px sans-serif";
                ctx.textBaseline = "middle";

                for (const tickStatus of chartData.tickStatuses) {
                    const tickLabel   = this.formatChargingProgressTimestamp(tickStatus.timestamp);
                    const tickX       = xScale.getPixelForValue(tickStatus.timestamp);
                    const textWidth   = ctx.measureText(tickLabel).width;
                    const iconCenterX = Math.min(chart.width - radius - 2, tickX + textWidth / 2 + radius + 5);

                    ctx.beginPath();
                    ctx.fillStyle = tickStatus.isValidSignature ? "#5aad31" : "#d94841";
                    ctx.arc(iconCenterX, tickCenterY, radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth   = 1.7;
                    ctx.lineCap     = "round";
                    ctx.lineJoin    = "round";
                    ctx.beginPath();

                    if (tickStatus.isValidSignature) {
                        ctx.moveTo(iconCenterX - 3.2, tickCenterY - 0.2);
                        ctx.lineTo(iconCenterX - 1.0, tickCenterY + 2.3);
                        ctx.lineTo(iconCenterX + 3.4, tickCenterY - 3.0);
                    }
                    else {
                        ctx.moveTo(iconCenterX - 2.6, tickCenterY - 2.6);
                        ctx.lineTo(iconCenterX + 2.6, tickCenterY + 2.6);
                        ctx.moveTo(iconCenterX + 2.6, tickCenterY - 2.6);
                        ctx.lineTo(iconCenterX - 2.6, tickCenterY + 2.6);
                    }
                    ctx.stroke();
                }
                ctx.restore();
            }
        };

        const chart = new Chart(canvas, {
            type: 'bar',
            data: {
                datasets: [{
                    label:              chartData.datasetLabel,
                    data:               chartData.points as unknown as number[],
                    backgroundColor:    "rgba(48, 126, 181, 0.72)",
                    borderColor:        "rgba(44, 74, 96, 0.95)",
                    borderWidth:        1,
                    borderRadius:       0,
                    borderSkipped:      false,
                    categoryPercentage: 1,
                    barPercentage:      1
                }]
            },
            options: {
                responsive:          true,
                maintainAspectRatio: false,
                layout: { padding: { right: 18 } },
                parsing: { xAxisKey: "x", yAxisKey: "y" },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        displayColors: false,
                        callbacks: {
                            title: (context: Array<TooltipItem<'bar'>>): string => {
                                const raw = context[0]?.raw as ChargingProgressChartPoint | undefined;
                                return raw?.intervalLabel ?? "";
                            },
                            label: (context: TooltipItem<'bar'>): string[] => {
                                const value = typeof context.parsed.y === "number" ? context.parsed.y : Number(context.raw);
                                const raw = context.raw as ChargingProgressChartPoint | undefined;
                                const valueText = mode === "power"
                                    ? "Ø " + value.toString() + " " + unit
                                    : (value >= 0 ? "+" : "") + value.toString() + " " + unit;
                                return [
                                    valueText,
                                    (raw?.isValidSignature === true ? "✅ " : "❌ ") +
                                    (raw?.signatureStatusText ?? this.chargy.GetLocalizedMessage("Invalid signature"))
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: "linear",
                        min: chartData.tickTimestamps[0],
                        max: lastTickTimestamp + rightAxisPadding,
                        offset: false,
                        grid: { offset: false },
                        ticks: {
                            callback: (value): string => {
                                const timestamp = typeof value === "number" ? value : parseFloat(value);
                                return Number.isFinite(timestamp)
                                    ? this.formatChargingProgressTimestamp(timestamp)
                                    : value.toString();
                            }
                        },
                        title: { display: true, text: this.chargy.GetLocalizedMessage("Timestamp") }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: chartData.yAxisLabel + " (" + unit + ")" }
                    }
                }
            },
            plugins: [ intervalBarPlugin ]
        });

        this.measurementChart = chart;
        return chart;

    }

    private createMeasurementValuesViewLinks(viewLinksDiv: HTMLDivElement,
                                             measurementRowsDiv: HTMLDivElement,
                                             chartDiv: HTMLDivElement,
                                             chartFrame: HTMLDivElement,
                                             measurement: chargeTransparencyRecord.IMeasurement): void {

        const setActive = (activeButton: HTMLButtonElement): void => {
            for (const button of [ measurementsButton, energyButton, powerButton ]) {
                button.classList.toggle("activated", button === activeButton);
                button.disabled = button === activeButton;
            }
        };

        const showRows = (): void => {
            this.measurementValuesViewMode   = "measurements";
            measurementRowsDiv.style.display = "";
            chartDiv.style.display           = "none";
            setActive(measurementsButton);
        };

        const showChart = (mode: ChargingProgressChartMode, button: HTMLButtonElement): void => {
            this.measurementValuesViewMode    = mode;
            measurementRowsDiv.style.display = "none";
            chartDiv.style.display           = "block";
            this.clearMeasurementChart();
            chartFrame.innerHTML = "";
            this.createChargingProgressChart(chartFrame, measurement, mode);
            setActive(button);
        };

        const measurementsButton       = viewLinksDiv.appendChild(document.createElement('button'));
        measurementsButton.type        = "button";
        measurementsButton.className   = "viewLink";
        measurementsButton.textContent = this.chargy.GetLocalizedMessage("Meter Values");

        const energyButton             = viewLinksDiv.appendChild(document.createElement('button'));
        energyButton.type              = "button";
        energyButton.className         = "viewLink";
        energyButton.textContent       = this.chargy.GetLocalizedMessage("chargingProgressEnergyLinkLabel");

        const powerButton              = viewLinksDiv.appendChild(document.createElement('button'));
        powerButton.type               = "button";
        powerButton.className          = "viewLink";
        powerButton.textContent        = this.chargy.GetLocalizedMessage("chargingProgressPowerLinkLabel");

        measurementsButton.onclick = showRows;
        energyButton.onclick       = () => { showChart("energy", energyButton); };
        powerButton.onclick        = () => { showChart("power", powerButton); };
        chartDiv.style.display     = "none";

        switch (this.measurementValuesViewMode) {
            case "energy": showChart("energy", energyButton); break;
            case "power":  showChart("power",  powerButton);  break;
            default:       showRows();                         break;
        }

    }

    //#endregion

    //#region showChargingSessionDetails

    public showChargingSessionDetails(chargingSession: chargeTransparencyRecord.IChargingSession,
                                      targets?:        ChargingSessionDetailsTargets): void
    {

        this.currentChargingSession = chargingSession;

        const measurementInfoTarget    = targets?.info     ?? this.app.measurementInfosPage.querySelector<HTMLDivElement>('#measurementInfo');
        const measurementValuesTarget  = targets?.values   ?? this.app.measurementInfosPage.querySelector<HTMLDivElement>('#measurementValues');
        const validationWarningsTarget = targets?.warnings ?? this.app.measurementInfosPage.querySelector<HTMLDivElement>('#sessionValidationWarnings');

        const me = this;

        function checkMeasurementCrypto(measurementValue: chargeTransparencyRecord.IMeasurementValue): string
        {

            const result = measurementValue.result ??
                           measurementValue.measurement?.verificationResult ?? {
                               status: iface.VerificationResult.Unvalidated
                           };

            switch (result.status)
            {

                    case iface.VerificationResult.UnknownCTRFormat:
                        return '<i class="fas fa-times-circle"></i> ' + me.chargy.GetLocalizedMessage("Unknown charge transparency data format!");

                    case iface.VerificationResult.EnergyMeterNotFound:
                        return '<i class="fas fa-times-circle"></i> ' + me.chargy.GetLocalizedMessage("Invalid energy meter");

                    case iface.VerificationResult.PublicKeyNotFound:
                        return '<i class="fas fa-times-circle"></i> ' + me.chargy.GetLocalizedMessage("Public key not found");

                    case iface.VerificationResult.InvalidPublicKey:
                        return '<i class="fas fa-times-circle"></i> ' + me.chargy.GetLocalizedMessage("Invalid public key");

                    case iface.VerificationResult.InvalidSignature:
                        return '<i class="fas fa-times-circle"></i> ' + me.chargy.GetLocalizedMessage("Invalid signature");

                    case iface.VerificationResult.ValidStartValue:
                    case iface.VerificationResult.ValidIntermediateValue:
                    case iface.VerificationResult.ValidStopValue:
                    case iface.VerificationResult.ValidSignature:
                        return '<i class="fas fa-check-circle"></i> ' + me.chargy.GetLocalizedMessage("Valid signature");


                    default:
                        return '<i class="fas fa-times-circle"></i> ' + me.chargy.GetLocalizedMessage("Invalid signature");

            }

        }


        try
        {

            this.clearMeasurementChart();

            //this.app.measurementInfosPage.style.display = 'block';
            //this.evseTarifInfosDiv.innerHTML = "";

            if (chargingSession.measurements)
            {

                for (const measurement of chargingSession.measurements)
                {

                    measurement.chargingSession      = chargingSession;

                    const MeasurementInfoDiv           = measurementInfoTarget;
                    MeasurementInfoDiv.innerHTML     = '';
                    // chargyLib.CreateDiv(this.evseTarifInfosDiv,  "measurementInfo");

                    chargyLib.CreateDiv(MeasurementInfoDiv, "headline",
                                        this.chargy.GetLocalizedMessage("Charging Session Information"));

                    const energyMeterInfosDiv = chargyLib.CreateDiv(MeasurementInfoDiv, "energyMeterInfos");
                                                chargyLib.CreateDiv(energyMeterInfosDiv, "headline2",
                                                                    this.chargy.GetLocalizedMessage("Energy Meter"));

                    const meter = this.chargy.GetMeter(measurement.energyMeterId);

                    chargyLib.CreateDiv2(
                        energyMeterInfosDiv,
                        "meterId",
                        this.chargy.GetLocalizedMessage(meter != null ? "Serial Number" : "Meter serial number"),
                        measurement.energyMeterId
                    );

                    if (meter != null) {

                        const manufacturer = meter.manufacturer?.name;
                        const model        = meter.model?.name;
                        const hardware     = meter.hardware?.revision;
                        const firmware     = meter.firmware?.version;

                        if (manufacturer)
                            chargyLib.CreateDiv2(energyMeterInfosDiv, "meterManufacturer",
                                                 this.chargy.GetLocalizedMessage("Manufacturer"),
                                                 manufacturer);

                        if (model)
                            chargyLib.CreateDiv2(energyMeterInfosDiv, "meterModel",
                                                 this.chargy.GetLocalizedMessage("Model"),
                                                 model);

                        if (hardware)
                            chargyLib.CreateDiv2(energyMeterInfosDiv, "meterHardwareVersion",
                                                 this.chargy.GetLocalizedMessage("Hardware Version"),
                                                 hardware);

                        if (firmware)
                            chargyLib.CreateDiv2(energyMeterInfosDiv, "meterFirmwareVersion",
                                                 this.chargy.GetLocalizedMessage("Firmware Version"),
                                                 firmware);

                    }

                    chargyLib.CreateDiv2(energyMeterInfosDiv, "measurement",
                                         this.chargy.GetLocalizedMessage("Measurement"),
                                         measurement.name);

                    chargyLib.CreateDiv2(energyMeterInfosDiv, "OBIS",
                                         this.chargy.GetLocalizedMessage("OBIS code"),
                                         formatOBISForDisplay(measurement.obis));

                    //#region Show measurement values...

                    const measurementValues          = distinctValuesInTimeOrder(measurement.values);

                    if (measurementValues.length > 0)
                    {

                        const MeasurementValuesDiv         = measurementValuesTarget;
                        MeasurementValuesDiv.innerHTML   = '';
                        chargyLib.CreateDiv(MeasurementValuesDiv, "headline2",
                                            this.chargy.GetLocalizedMessage("Meter Values"));
                        const MeasurementValueViewsDiv   = shouldShowMeasurementChart(measurementValues.length)
                                                               ? chargyLib.CreateDiv(MeasurementValuesDiv, "measurementValueViews")
                                                               : null;
                        const MeasurementValueRowsDiv    = chargyLib.CreateDiv(MeasurementValuesDiv, "measurementValueRows");

                        if (MeasurementValueViewsDiv !== null) {
                            const chartDiv   = chargyLib.CreateDiv(MeasurementValuesDiv, "chargingProgressChart");
                            const chartFrame = chargyLib.CreateDiv(chartDiv, "chartFrame");
                            this.createMeasurementValuesViewLinks(
                                MeasurementValueViewsDiv,
                                MeasurementValueRowsDiv,
                                chartDiv,
                                chartFrame,
                                measurement
                            );
                        }

                        let previousDisplayValue         = undefined;

                        for (const measurementValue of measurementValues)
                        {

                            measurementValue.measurement     = measurement;

                            const MeasurementValueDiv          = chargyLib.CreateDiv(MeasurementValueRowsDiv, "measurementValue");
                            MeasurementValueDiv.onclick      = this.captureMeasurementCryptoDetails(measurementValue);

                            const timestamp                    = chargyLib.parseUTC(measurementValue.timestamp);

                            chargyLib.CreateDiv(MeasurementValueDiv, "timestamp",
                                                 timestamp.format('HH:mm:ss') + this.chargy.GetLocalizedMessage("timeSuffix"));


                            // Show the meter's native value and unit. A prescribed
                            // display prefix/precision takes precedence, just as in
                            // the ChargyWebApp.
                            const displayValue               = getMeasurementDisplayValue(measurement, measurementValue);

                            chargyLib.CreateDiv(MeasurementValueDiv, "value1", displayValue.text);
                            chargyLib.CreateDiv(MeasurementValueDiv, "unit1",  displayValue.unit);

                            // Show the difference in the same display unit.
                            chargyLib.CreateDiv(
                                MeasurementValueDiv,
                                "value2",
                                getMeasurementDifferenceText(
                                    displayValue.value,
                                    previousDisplayValue,
                                    measurementValue.value_displayPrecision
                                )
                            );
                            chargyLib.CreateDiv(
                                MeasurementValueDiv,
                                "unit2",
                                previousDisplayValue === undefined ? "" : displayValue.unit
                            );

                            // Show signature status
                            chargyLib.CreateDiv(MeasurementValueDiv, "verificationStatus",
                                                 checkMeasurementCrypto(measurementValue));

                            previousDisplayValue             = displayValue.value;

                        }

                    }

                    //#endregion

                }
;
            }

            const sessionWarnings             = getSessionWarnings(chargingSession);
            const validationWarningsDiv       = validationWarningsTarget;
            validationWarningsDiv.innerHTML   = '';

            if (sessionWarnings.length > 0) {

                chargyLib.CreateDiv(validationWarningsDiv, "headline2",
                                    this.chargy.GetLocalizedMessage("sessionValidationLabel"));

                const warningRowsDiv = chargyLib.CreateDiv(validationWarningsDiv, "warningRows");

                for (const warning of sessionWarnings) {

                    const warningRowDiv = chargyLib.CreateDiv(warningRowsDiv, "warningRow " + warning.level);
                    const levelDiv      = chargyLib.CreateDiv(warningRowDiv, "level");
                    const textDiv       = chargyLib.CreateDiv(warningRowDiv, "text");

                    levelDiv.innerText  = this.chargy.GetLocalizedMessage("warningLevel_" + warning.level);
                    textDiv.innerText   = this.chargy.GetLocalizedText(warning.message) ?? chargyLib.firstValue(warning.message) ?? "";

                }

            }

        }
        catch (exception)
        {
            console.log("Could not show charging session details: " + exception);
        }

    }

    //#region Capture the correct charging session and its context!

    public captureChargingSession(cs: chargeTransparencyRecord.IChargingSession): (this: HTMLDivElement, ev: MouseEvent) => void {

        const me = this;

        return function(this: HTMLDivElement, _ev: MouseEvent) {

            //#region Highlight the selected charging session...

            // var AllChargingSessionsDivs = document.getElementsByClassName("chargingSession");
            // for(var i=0; i<AllChargingSessionsDivs.length; i++)
            //     AllChargingSessionsDivs[i].classList.remove("activated");

            // this.classList.add("activated");

            //this.parentElement.parentElement.style.display = 'none';

            //#endregion

            if (me.app.chargingSessionsPage.style.display != 'none')
            {
                me.app.showPage(me.app.measurementInfosPage);
                me.showChargingSessionDetails(cs);
            }

        };
    }

    //#endregion

    //#endregion



    //#region showMeasurementCryptoDetails

    public async showMeasurementCryptoDetails(measurementValue: chargeTransparencyRecord.IMeasurementValue): Promise<void>
    {

        this.currentMeasurementValue = measurementValue;

        const cryptoDiv             = this.app.cryptoDetailsPage;
        const errorDiv              = cryptoDiv.querySelector<HTMLDivElement>('#error');
        const introDiv              = cryptoDiv.querySelector<HTMLDivElement>('#intro');
        const cryptoDataDiv         = cryptoDiv.querySelector<HTMLDivElement>('#cryptoData');
        const bufferValue           = cryptoDiv.querySelector<HTMLDivElement>('#buffer .value');
        const hashedBufferValue     = cryptoDiv.querySelector<HTMLDivElement>('#hashedBuffer .value');
        const publicKeyValue        = cryptoDiv.querySelector<HTMLDivElement>('#publicKey .value');
        const signatureExpectedValue = cryptoDiv.querySelector<HTMLDivElement>('#signatureExpected .value');
        const signatureCheckValue   = cryptoDiv.querySelector<HTMLDivElement>('#signatureCheck');

        const doError = (text: string): void => {
            errorDiv.innerHTML     = '<i class="fas fa-times-circle"></i> ' + text;
            introDiv.style.display = 'none';
        };

        if (!errorDiv               || !introDiv            || !cryptoDataDiv       ||
            !bufferValue            || !hashedBufferValue   || !publicKeyValue      ||
            !signatureExpectedValue || !signatureCheckValue)
        {
            console.error('The measurement crypto details page is incomplete.');
            return;
        }

        errorDiv.innerHTML     = '';
        introDiv.style.display = 'block';

        if (measurementValue             == null ||
            measurementValue.measurement == null)
        {
            doError(this.chargy.GetLocalizedMessage("unknownMeasurementDataFormat"));
            return;
        }


        //#region Show data and result on overlay

        cryptoDataDiv.innerHTML           = '';
        bufferValue.innerHTML             = '';
        hashedBufferValue.innerHTML       = '<span class="error">0x00000000000000000000000000000000000</span>';
        publicKeyValue.innerHTML          = '<span class="error">0x00000000000000000000000000000000000</span>';
        signatureExpectedValue.innerHTML  = '<span class="error">0x00000000000000000000000000000000000</span>';
        signatureCheckValue.innerHTML     = '';

        if (measurementValue.method)
        {
            try {
                const error = await measurementValue.method.ViewMeasurement(
                    measurementValue,
                    errorDiv,
                    introDiv,
                    cryptoDataDiv,
                    bufferValue,
                    hashedBufferValue,
                    publicKeyValue,
                    signatureExpectedValue,
                    signatureCheckValue
                );

                if (error)
                    doError(error.message);
            }
            catch (exception) {
                doError(exception instanceof Error
                            ? exception.message
                            : this.chargy.GetLocalizedMessage("unknownMeasurementDataFormat"));
            }
        }

        else
        {
            doError(this.chargy.GetLocalizedMessage("unknownMeasurementDataFormat"));
        }

        //#endregion

    }

    //#region Capture the correct measurement value and its context!

    public captureMeasurementCryptoDetails(measurementValue: chargeTransparencyRecord.IMeasurementValue): (this: HTMLDivElement, ev: MouseEvent) => void {
        const me = this;
        return function(this: HTMLDivElement, _ev: MouseEvent) {

                   // The crypto details of a live link's meter value lead back
                   // to the live link page, those of an archived session back
                   // to the measurement infos page.
                   me.app.cryptoDetailsReturnPage = me.app.liveLinkPage.style.display !== 'none'
                                                        ? me.app.liveLinkPage
                                                        : me.app.measurementInfosPage;

                   me.app.showPage(me.app.cryptoDetailsPage);
                   void me.showMeasurementCryptoDetails(measurementValue);
               };
    }

    //#endregion

    //#endregion

}
