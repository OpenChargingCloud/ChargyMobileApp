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
    ChargeTransparencyRecord as chargeTransparencyRecord
}                                      from '@open-charging-cloud/chargy-core';
import * as chargyLib                  from '@open-charging-cloud/chargy-core';
import * as elliptic                   from 'elliptic';
import moment                          from 'moment';
import base32Decode                    from 'base32-decode';
import * as asn1                       from 'asn1.js';
import Chart, { ChartConfiguration }   from 'chart.js/auto';
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
    getMeasurementDifferenceText,
    getMeasurementDisplayValue,
    getMeasurementValueInKWh,
    shouldShowMeasurementChart
}                                      from './measurementPresentation';

// @ts-ignore
var leaflet: any = L;

interface MobileApp {
    importantInfo:        HTMLDivElement;
    startPage:            HTMLDivElement;
    chargingSessionsPage: HTMLDivElement;
    measurementInfosPage: HTMLDivElement;
    cryptoDetailsPage:    HTMLDivElement;
    issueTrackerPage:     HTMLDivElement;
    aboutPage:            HTMLDivElement;
    map:                  any;
    showPage(page: HTMLDivElement): void;
    refreshMap(fitBounds?: any): void;
    hidePage(page: HTMLDivElement): void;
}

export default class ChargyApp {

    private readonly chargy: Chargy;
    private measurementChart: Chart;

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
                                             asn1,
                                             base32Decode,
                                             () => undefined
                                         );

        this.setUILanguage(language);

    }

    public setUILanguage(language: SupportedLanguage): void {
        this.chargy.SetUILanguages([ language ]);
        moment.locale(language);
        chargyLib.setUILocale(language);
    }

    public getLocalizedMessage(key: string): string {
        return this.chargy.GetLocalizedMessage(key);
    }


    //#region Global error handling...

    doGlobalError(text:      string,
                  context?:  any)
    {

        var importantInfo                = document.getElementById("importantInfo")     as HTMLDivElement;

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
                await processChargeTransparencyRecord(result);
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

        async function processChargeTransparencyRecord(CTR: chargeTransparencyRecord.IChargeTransparencyRecord)
        {

            //#region Data

            const me2 = me;

            me.chargingSessions          = [];

            var markers: any = [];
            var minlat                    = +1000;
            var maxlat                    = -1000;
            var minlng                    = +1000;
            var maxlng                    = -1000;

            //#endregion

            async function checkSessionCrypto(chargingSession: chargeTransparencyRecord.IChargingSession)
            {

                const result = chargingSession.verificationResult ?? {
                    status:    iface.SessionVerificationResult.Unvalidated,
                    certainty: 0
                };

                //#region Add marker to map

                var redMarker                 = leaflet.AwesomeMarkers.icon({
                    prefix:                     'fa',
                    icon:                       'exclamation',
                    markerColor:                'red',
                    iconColor:                  '#ecc8c3'
                });

                var greenMarker               = leaflet.AwesomeMarkers.icon({
                    prefix:                     'fa',
                    icon:                       'charging-station',
                    markerColor:                'green',
                    iconColor:                  '#c2ec8e'
                });

                var orangeMarker              = leaflet.AwesomeMarkers.icon({
                    prefix:                     'fa',
                    icon:                       'exclamation',
                    markerColor:                'orange',
                    iconColor:                  '#ae6a0a'
                });

                var markerIcon  = redMarker;

                switch (result.status)
                {

                    case iface.SessionVerificationResult.UnknownSessionFormat:
                        markerIcon = redMarker;
                        break;

                    case iface.SessionVerificationResult.InplausibleMeasurement:
                        markerIcon = orangeMarker;
                        break;

                    case iface.SessionVerificationResult.PublicKeyNotFound:
                    case iface.SessionVerificationResult.InvalidPublicKey:
                    case iface.SessionVerificationResult.InvalidSignature:
                        markerIcon = redMarker;
                        break;

                    case iface.SessionVerificationResult.ValidSignature:
                        markerIcon = hasSessionWarnings(chargingSession) ? orangeMarker : greenMarker;
                        break;


                    default:
                        markerIcon = redMarker;

                }

                var geoLocation  = null;

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

                    var marker = leaflet.marker([geoLocation.lat, geoLocation.lng], { icon: markerIcon }).addTo(me2.app.map);
                    markers.push(marker);

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
                            markerIcon = redMarker;

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
                let descriptionDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#description');
                descriptionDiv.innerText = me.chargy.GetLocalizedText(CTR.description) ?? chargyLib.firstValue(CTR.description);
            }

            if (CTR.begin) {
                let beginDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#begin');
                beginDiv.innerHTML = chargyLib.parseUTC(CTR.begin).format('dddd, D. MMMM YYYY');
            }

            if (CTR.end) {
                let endDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#end');
                endDiv.innerHTML   = chargyLib.parseUTC(CTR.end).format('dddd, D. MMMM YYYY');
            }

            //#endregion

            //#region Show contract infos

            if (CTR.contract)
            {
            }

            //#endregion



            //#region Show all charging sessions...

            if (CTR.chargingSessions) {

                let chargingSessionsDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#chargingSessions');
                chargingSessionsDiv.innerText = '';

                for (var chargingSession of CTR.chargingSessions)
                {





                    let chargingSessionDiv      = chargyLib.CreateDiv(chargingSessionsDiv, "chargingSession");
                    chargingSession.GUI         = chargingSessionDiv;
                    chargingSessionDiv.onclick  = me.captureChargingSession(chargingSession);

                    //#region Show session time infos

                    try {

                        if (chargingSession.begin)
                        {

                            var beginUTC = chargyLib.parseUTC(chargingSession.begin);

                            let dateDiv = chargingSessionDiv.appendChild(document.createElement('div'));
                            dateDiv.className = "date";
                            dateDiv.innerHTML = beginUTC.format('dddd, D; MMM YYYY HH:mm:ss').
                                                        replace(".", "").   // Nov. -> Nov
                                                        replace(";", ".") +  // 14;  -> 14.
                                                        me.chargy.GetLocalizedMessage("timeSuffix");

                            if (chargingSession.end)
                            {

                                var endUTC   = chargyLib.parseUTC(chargingSession.end);
                                var duration = moment.duration(endUTC.valueOf() - beginUTC.valueOf());

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

                    var tableDiv                = chargingSessionDiv.appendChild(document.createElement('div'));
                        tableDiv.className      = "table";

                    //#region Show energy infos

                    try {

                        var productInfoDiv                   = tableDiv.appendChild(document.createElement('div'));
                        productInfoDiv.className             = "productInfos";

                        var productIconDiv                   = productInfoDiv.appendChild(document.createElement('div'));
                        productIconDiv.className             = "icon";
                        productIconDiv.innerHTML             = '<i class="fas fa-chart-pie"></i>';

                        var productDiv                       = productInfoDiv.appendChild(document.createElement('div'));
                        productDiv.className                 = "text";
                        productDiv.innerHTML = chargingSession.product != null ? chargingSession.product["@id"] + "<br />" : "";

                        productDiv.innerHTML += me.chargy.GetLocalizedMessage("chargingDurationLabel") + " ";
                        if      (Math.floor(duration.asDays())    > 1) productDiv.innerHTML += duration.days()    + " " + me.chargy.GetLocalizedMessage("daysLabel")        + " " + duration.hours()   + " " + me.chargy.GetLocalizedMessage("hourShortLabel")   + " " + duration.minutes() + " " + me.chargy.GetLocalizedMessage("minuteShortLabel") + " " + duration.seconds() + " " + me.chargy.GetLocalizedMessage("secondShortLabel");
                        else if (Math.floor(duration.asDays())    > 0) productDiv.innerHTML += duration.days()    + " " + me.chargy.GetLocalizedMessage("dayLabel")         + " " + duration.hours()   + " " + me.chargy.GetLocalizedMessage("hourShortLabel")   + " " + duration.minutes() + " " + me.chargy.GetLocalizedMessage("minuteShortLabel") + " " + duration.seconds() + " " + me.chargy.GetLocalizedMessage("secondShortLabel");
                        else if (Math.floor(duration.asHours())   > 0) productDiv.innerHTML += duration.hours()   + " " + me.chargy.GetLocalizedMessage("hourShortLabel")   + " " + duration.minutes() + " " + me.chargy.GetLocalizedMessage("minuteShortLabel") + " " + duration.seconds() + " " + me.chargy.GetLocalizedMessage("secondShortLabel");
                        else if (Math.floor(duration.asMinutes()) > 0) productDiv.innerHTML += duration.minutes() + " " + me.chargy.GetLocalizedMessage("minuteShortLabel") + " " + duration.seconds() + " " + me.chargy.GetLocalizedMessage("secondShortLabel");
                        else if (Math.floor(duration.asSeconds()) > 0) productDiv.innerHTML += duration.seconds();

                        if (chargingSession.measurements)
                        {
                            for (var measurement of chargingSession.measurements)
                            {
                                //<i class="far fa-chart-bar"></i>
                                if (measurement.values && measurement.values.length > 0)
                                {

                                    var first  = Number(measurement.values[0].value);
                                    var last   = Number(measurement.values[measurement.values.length-1].value);
                                    var amount = parseFloat(((last - first) * Math.pow(10, measurement.scale)).toFixed(10));

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

                            var authorizationStartDiv            = tableDiv.appendChild(document.createElement('div'));
                                authorizationStartDiv.className  = "authorizationStart";

                            var authorizationStartIconDiv                   = authorizationStartDiv.appendChild(document.createElement('div'));
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

                            var authorizationStartIdDiv                     = authorizationStartDiv.appendChild(document.createElement('div'));
                            authorizationStartIdDiv.className               = "id";
                            authorizationStartIdDiv.innerHTML = chargingSession.authorizationStart["@id"];

                        }

                        if (chargingSession.authorizationStop != null)
                        {

                            var authorizationStopDiv            = tableDiv.appendChild(document.createElement('div'));
                                authorizationStopDiv.className  = "authorizationStop";

                            var authorizationStopIconDiv                   = authorizationStopDiv.appendChild(document.createElement('div'));
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

                            var authorizationStopIdDiv                     = authorizationStopDiv.appendChild(document.createElement('div'));
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

                            var address:iface.IAddress            = null;

                            var locationInfoDiv                   = tableDiv.appendChild(document.createElement('div'));
                            locationInfoDiv.className             = "locationInfos";

                            var locationIconDiv                   = locationInfoDiv.appendChild(document.createElement('div'));
                            locationIconDiv.className             = "icon";
                            locationIconDiv.innerHTML             = '<i class="fas fa-map-marker-alt"></i>';

                            var locationDiv                       = locationInfoDiv.appendChild(document.createElement('div'));
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

                    let verificationStatusDiv = chargingSessionDiv.appendChild(document.createElement('div'));
                    verificationStatusDiv.className = "verificationStatus";
                    verificationStatusDiv.innerHTML = await checkSessionCrypto(chargingSession);

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

    //#region showChargingSessionDetails

    public async showChargingSessionDetails(chargingSession: chargeTransparencyRecord.IChargingSession)
    {

        var me = this;

        async function checkMeasurementCrypto(measurementValue: chargeTransparencyRecord.IMeasurementValue)
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

            //this.app.measurementInfosPage.style.display = 'block';
            //this.evseTarifInfosDiv.innerHTML = "";

            if (chargingSession.measurements)
            {

                for (var measurement of chargingSession.measurements)
                {

                    measurement.chargingSession      = chargingSession;

                    let MeasurementInfoDiv           = this.app.measurementInfosPage.querySelector<HTMLDivElement>('#measurementInfo');
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

                    if (measurement.values && measurement.values.length > 0)
                    {

                        //#region Configure chart

                        let chartDiv = this.app.measurementInfosPage.querySelector<HTMLCanvasElement>('#chart');
                        const showChart = shouldShowMeasurementChart(measurement.values.length);
                        chartDiv.style.display = showChart ? '' : 'none';

                        let chartData: ChartConfiguration<'bar', number[], string> = {
                            type: 'bar',
                            data: {
                                labels: [],
                                datasets: [{
                                    label: 'kWh',
                                    data: [],
                                    backgroundColor: 'rgba(255, 159, 64, 0.35)',
                                    borderColor: 'rgba(255, 159, 64, 1)',
                                    borderWidth: 1
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        display: false
                                    },
                                    title: {
                                        display: false
                                    }
                                },
                                scales: {
                                    y: {
                                        beginAtZero: true
                                    }
                                }
                            }
                        };

                        //#endregion

                        let MeasurementValuesDiv         = this.app.measurementInfosPage.querySelector<HTMLDivElement>('#measurementValues');
                        MeasurementValuesDiv.innerHTML   = '';
                        chargyLib.CreateDiv(MeasurementValuesDiv, "headline2",
                                            this.chargy.GetLocalizedMessage("Meter Values"));
                        const MeasurementValueRowsDiv    = chargyLib.CreateDiv(MeasurementValuesDiv, "measurementValueRows");

                        let chartLabels                  = [];
                        let chartValues                  = [];
                        let previousDisplayValue         = undefined;
                        let previousChartValue           = undefined;

                        for (var measurementValue of measurement.values)
                        {

                            measurementValue.measurement     = measurement;

                            let MeasurementValueDiv          = chargyLib.CreateDiv(MeasurementValueRowsDiv, "measurementValue");
                            MeasurementValueDiv.onclick      = this.captureMeasurementCryptoDetails(measurementValue);

                            var timestamp                    = chargyLib.parseUTC(measurementValue.timestamp);
                            chartLabels.push(timestamp.format('HH:mm:ss'));

                            let timestampDiv                 = chargyLib.CreateDiv(MeasurementValueDiv, "timestamp",
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

                            // Charts continue to use kWh so values from different
                            // native meter units remain comparable.
                            const chartValue                 = getMeasurementValueInKWh(measurement, measurementValue);
                            chartValues.push(previousChartValue === undefined
                                                 ? 0
                                                 : chartValue.minus(previousChartValue).toNumber());


                            // Show signature status
                            let verificationStatusDiv        = chargyLib.CreateDiv(MeasurementValueDiv, "verificationStatus",
                                                                         await checkMeasurementCrypto(measurementValue));

                            previousDisplayValue             = displayValue.value;
                            previousChartValue               = chartValue;

                        }

                        chartData.data.labels           = chartLabels;
                        chartData.data.datasets[0].data = chartValues;

                        if (this.measurementChart)
                            this.measurementChart.destroy();

                        this.measurementChart = showChart
                                                    ? new Chart(chartDiv, chartData)
                                                    : null;

                    }

                    //#endregion

                }
;
            }

            const sessionWarnings             = getSessionWarnings(chargingSession);
            const validationWarningsDiv       = this.app.measurementInfosPage.querySelector<HTMLDivElement>('#sessionValidationWarnings');
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

    public captureChargingSession(cs: chargeTransparencyRecord.IChargingSession) {

        var me = this;

        return function(this: HTMLDivElement, ev: MouseEvent) {

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

        const cryptoDiv             = this.app.cryptoDetailsPage;
        const errorDiv              = cryptoDiv.querySelector('#error')                       as HTMLDivElement;
        const introDiv              = cryptoDiv.querySelector('#intro')                       as HTMLDivElement;
        const cryptoDataDiv         = cryptoDiv.querySelector('#cryptoData')                  as HTMLDivElement;
        const bufferValue           = cryptoDiv.querySelector('#buffer .value')               as HTMLDivElement;
        const hashedBufferValue     = cryptoDiv.querySelector('#hashedBuffer .value')         as HTMLDivElement;
        const publicKeyValue        = cryptoDiv.querySelector('#publicKey .value')            as HTMLDivElement;
        const signatureExpectedValue = cryptoDiv.querySelector('#signatureExpected .value')  as HTMLDivElement;
        const signatureCheckValue   = cryptoDiv.querySelector('#signatureCheck')              as HTMLDivElement;

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

    public captureMeasurementCryptoDetails(measurementValue: chargeTransparencyRecord.IMeasurementValue) {
        var me = this;
        return function(this: HTMLDivElement, ev: MouseEvent) {
                   me.app.showPage(me.app.cryptoDetailsPage);
                   void me.showMeasurementCryptoDetails(measurementValue);
               };
    }

    //#endregion

    //#endregion

}
