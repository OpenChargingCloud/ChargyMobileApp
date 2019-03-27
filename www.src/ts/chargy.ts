import * as moment from 'moment';
import * as chart from 'chart.js'
import GDFCrypt01 from './GDFCrypt01';
import EMHCrypt01 from './EMHCrypt01';
import * as chargyLib from './chargyLib';
import * as iface from './chargyInterfaces';

// import { debug } from "util";
// import * as crypto from "crypto";
// import { readSync } from "fs";

// @ts-ignore
var leaflet: any = L;

//const { randomBytes } = require('crypto')

export default class chargy {

    chargingStationOperators  = new Array<iface.IChargingStationOperator>();
    chargingPools             = new Array<iface.IChargingPool>();
    chargingStations          = new Array<iface.IChargingStation>();
    EVSEs                     = new Array<iface.IEVSE>();
    meters                    = new Array<iface.IMeter>();
    eMobilityProviders        = new Array<iface.IEMobilityProvider>();
    mediationServices         = new Array<iface.IMediationService>();
    chargingSessions          = new Array<iface.IChargingSession>();


    private chargingSessionsPage_MovementStartX: any;

    inputInfosDiv: HTMLDivElement;
    
    // chargingSessionsPage:               HTMLDivElement;
    chargingSessionReportDiv:           HTMLDivElement;

    // measurementInfosPage:                 HTMLDivElement;
    //chartDiv:                           HTMLCanvasElement;
    
    errorTextDiv: HTMLDivElement;
    overlayDiv: HTMLDivElement;

    readonly lib    = new chargyLib.default();

    app: iface.IApp;

    constructor (app: iface.IApp) {

        this.app                       = app;
        this.chargingSessionReportDiv  = this.app.chargingSessionsPage.querySelector<HTMLDivElement>("#chargingSessionReport");
        //this.chartDiv                  = this.app.measurementInfosPage.querySelector<HTMLCanvasElement>("#chart");
        //this.evseTarifInfosDiv         = this.app.measurementInfosPage.querySelector<HTMLDivElement>("#evseTarifInfos");

    }

    // var el      = require('elliptic');
    // let moment  = require('moment');

    // // variable 'crypto' is already defined differently in Google Chrome!
    // const crypt = require('electron').remote.require('crypto');

    //#region GetMethods...

    public GetChargingPool: iface.GetChargingPoolFunc = (Id: String) => 
    {

        for (var chargingPool of this.chargingPools)
        {
            if (chargingPool["@id"] == Id)
                return chargingPool;
        }

        return null;

    }

    public GetChargingStation: iface.GetChargingStationFunc = (Id: String) =>
    {

        for (var chargingStation of this.chargingStations)
        {
            if (chargingStation["@id"] == Id)
                return chargingStation;
        }

        return null;

    }

    public GetEVSE: iface.GetEVSEFunc = (Id: String) =>
    {

        for (var evse of this.EVSEs)
        {
            if (evse["@id"] == Id)
                return evse;
        }

        return null;

    }

    public GetMeter: iface.GetMeterFunc = (Id: string) =>
    {
    
        for (var meter of this.meters)
        {
            if (meter["@id"] == Id)
                return meter;
        }
    
        return null;
    
    }    

    //#endregion



    //#region Global error handling...

    doGlobalError(text:      String,
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

    public async detectContentFormat(Content: any) {

        var me: chargy = this;

        async function processChargeTransparencyRecord(CTR: iface.IChargeTransparencyRecord)
        {

            //#region Data

            var me2: chargy = me;

            me.chargingStationOperators  = [];
            me.chargingPools             = [];
            me.chargingStations          = [];
            me.EVSEs                     = [];
            me.meters                    = [];
            me.eMobilityProviders        = [];
            me.mediationServices         = [];
            me.chargingSessions          = [];

            var markers: any = [];
            var minlat                    = +1000;
            var maxlat                    = -1000;
            var minlng                    = +1000;
            var maxlng                    = -1000;

            //#endregion

            async function checkSessionCrypto(chargingSession: iface.IChargingSession)
            {
    
                var result = await me2.verifySessionCryptoDetails(chargingSession);

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

                var markerIcon  = redMarker;

                switch (result.status)
                {
    
                    case iface.SessionVerificationResult.UnknownSessionFormat:
                    case iface.SessionVerificationResult.PublicKeyNotFound:
                    case iface.SessionVerificationResult.InvalidPublicKey:
                    case iface.SessionVerificationResult.InvalidSignature:
                        markerIcon = redMarker;
                        break;

                    case iface.SessionVerificationResult.ValidSignature:
                        markerIcon = greenMarker;
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
                        case iface.SessionVerificationResult.PublicKeyNotFound:
                        case iface.SessionVerificationResult.InvalidPublicKey:
                        case iface.SessionVerificationResult.InvalidSignature:
                            marker.bindPopup("Ungültiger Ladevorgang!");
                            break;
    
                        case iface.SessionVerificationResult.ValidSignature:
                            marker.bindPopup("Gültiger Ladevorgang!");
                            break;
    
    
                        default:
                            markerIcon = redMarker;
    
                    }

                }

                //#endregion

                switch (result.status)
                {
    
                    case iface.SessionVerificationResult.UnknownSessionFormat:
                    case iface.SessionVerificationResult.PublicKeyNotFound:
                    case iface.SessionVerificationResult.InvalidPublicKey:
                    case iface.SessionVerificationResult.InvalidSignature:
                        return '<i class="fas fa-times-circle"></i> Ungültig';

                    case iface.SessionVerificationResult.ValidSignature:
                        return '<i class="fas fa-check-circle"></i> Gültig';


                    default:
                        return '<i class="fas fa-times-circle"></i> Ungültig';

                }
    
            }

            //#region Show CTR infos

            me.app.showPage(me.app.chargingSessionsPage);

            if (CTR.description) {
                let descriptionDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#description');
                descriptionDiv.innerText = me.lib.firstValue(CTR.description);
            }

            if (CTR.begin) {
                let beginDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#begin');
                beginDiv.innerHTML = me.lib.parseUTC(CTR.begin).format('dddd, D. MMMM YYYY');
            }

            if (CTR.end) {
                let endDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#end');
                endDiv.innerHTML   = me.lib.parseUTC(CTR.end).format('dddd, D. MMMM YYYY');
            }

            //#endregion

            //#region Show contract infos

            if (CTR.contract)
            {
            }

            //#endregion

            //#region Process CSOs, pools, stations, ...

            if (CTR.chargingStationOperators)
            {

                for (var chargingStationOperator of CTR.chargingStationOperators)
                {

                    me.chargingStationOperators.push(chargingStationOperator);

                    if (chargingStationOperator.chargingPools) {

                        for (var chargingPool of chargingStationOperator.chargingPools)
                        {

                            me.chargingPools.push(chargingPool);

                            if (chargingPool.chargingStations)
                            {

                                for (var chargingStation of chargingPool.chargingStations)
                                {

                                    me.chargingStations.push(chargingStation);

                                    if (chargingStation.EVSEs) {

                                        for (var EVSE of chargingStation.EVSEs)
                                        {

                                            EVSE.chargingStation    = chargingStation;
                                            EVSE.chargingStationId  = chargingStation["@id"];

                                            me.EVSEs.push(EVSE);

                                            if (EVSE.meters) {

                                                for (var meter of EVSE.meters)
                                                {

                                                    meter.EVSE               = EVSE;
                                                    meter.EVSEId             = EVSE["@id"];

                                                    meter.chargingStation    = chargingStation;
                                                    meter.chargingStationId  = chargingStation["@id"];

                                                    me.meters.push(meter);

                                                }

                                            }

                                        }

                                    }

                                }

                            }

                        }

                    }

                    if (chargingStationOperator.chargingStations)
                    {

                        for (var chargingStation of chargingStationOperator.chargingStations)
                        {

                            me.chargingStations.push(chargingStation);

                            if (chargingStation.EVSEs) {

                                for (var EVSE of chargingStation.EVSEs)
                                {
        
                                    EVSE.chargingStation    = chargingStation;
                                    EVSE.chargingStationId  = chargingStation["@id"];
        
                                    me.EVSEs.push(EVSE);
        
                                    if (EVSE.meters) {
        
                                        for (var meter of EVSE.meters)
                                        {
        
                                            meter.EVSE               = EVSE;
                                            meter.EVSEId             = EVSE["@id"];
        
                                            meter.chargingStation    = chargingStation;
                                            meter.chargingStationId  = chargingStation["@id"];
        
                                            me.meters.push(meter);
        
                                        }
        
                                    }
        
                                }

                            }

                        }

                    }

                    if (chargingStationOperator.EVSEs) {

                        for (var EVSE of chargingStationOperator.EVSEs)
                        {

                            // EVSE.chargingStation    = chargingStation;
                            // EVSE.chargingStationId  = chargingStation["@id"];

                            me.EVSEs.push(EVSE);

                            if (EVSE.meters) {

                                for (var meter of EVSE.meters)
                                {

                                    meter.EVSE               = EVSE;
                                    meter.EVSEId             = EVSE["@id"];

                                    // meter.chargingStation    = chargingStation;
                                    // meter.chargingStationId  = chargingStation["@id"];

                                    me.meters.push(meter);

                                }

                            }

                        }

                    }

                }

            }

            if (CTR.chargingPools) {

                for (var chargingPool of CTR.chargingPools)
                {

                    me.chargingPools.push(chargingPool);

                    if (chargingPool.chargingStations)
                    {

                        for (var chargingStation of chargingPool.chargingStations)
                        {

                            me.chargingStations.push(chargingStation);

                            if (chargingStation.EVSEs) {

                                for (var EVSE of chargingStation.EVSEs)
                                {

                                    EVSE.chargingStation    = chargingStation;
                                    EVSE.chargingStationId  = chargingStation["@id"];

                                    me.EVSEs.push(EVSE);

                                }

                            }

                        }

                    }

                }

            }

            if (CTR.chargingStations) {

                for (var chargingStation of CTR.chargingStations)
                {

                    me.chargingStations.push(chargingStation);

                    if (chargingStation.EVSEs) {

                        for (var EVSE of chargingStation.EVSEs)
                        {

                            EVSE.chargingStation    = chargingStation;
                            EVSE.chargingStationId  = chargingStation["@id"];

                            me.EVSEs.push(EVSE);

                            if (EVSE.meters) {

                                for (var meter of EVSE.meters)
                                {

                                    meter.EVSE               = EVSE;
                                    meter.EVSEId             = EVSE["@id"];

                                    meter.chargingStation    = chargingStation;
                                    meter.chargingStationId  = chargingStation["@id"];

                                    me.meters.push(meter);

                                }

                            }

                        }

                    }

                    if (chargingStation.meters) {

                        for (var meter of chargingStation.meters)
                        {

                            meter.chargingStation    = chargingStation;
                            meter.chargingStationId  = chargingStation["@id"];

                            me.meters.push(meter);

                        }

                    }

                }

            }

            //#endregion


            //#region Show all charging sessions...

            if (CTR.chargingSessions) {

                let chargingSessionsDiv = me.app.chargingSessionsPage.querySelector<HTMLDivElement>('#chargingSessions');
                chargingSessionsDiv.innerText = '';

                for (var chargingSession of CTR.chargingSessions)
                {

                    let chargingSessionDiv      = me.lib.CreateDiv(chargingSessionsDiv, "chargingSession");               
                    chargingSession.GUI         = chargingSessionDiv;
                    chargingSessionDiv.onclick  = me.captureChargingSession(chargingSession);

                    //#region Show session time infos

                    try {

                        if (chargingSession.begin)
                        {

                            var beginUTC = me.lib.parseUTC(chargingSession.begin);

                            let dateDiv = chargingSessionDiv.appendChild(document.createElement('div'));
                            dateDiv.className = "date";
                            dateDiv.innerHTML = beginUTC.format('dddd, D; MMM YYYY HH:mm:ss').
                                                        replace(".", "").   // Nov. -> Nov
                                                        replace(";", ".") +  // 14;  -> 14.
                                                        " Uhr";

                            if (chargingSession.end)
                            {

                                var endUTC   = me.lib.parseUTC(chargingSession.end);
                                var duration = moment.duration(endUTC - beginUTC);

                                dateDiv.innerHTML += " - " +
                                                    (Math.floor(duration.asDays()) > 0 ? endUTC.format("dddd") + " " : "") +
                                                    endUTC.format('HH:mm:ss') +
                                                    " Uhr";

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

                        productDiv.innerHTML += "Ladedauer ";
                        if      (Math.floor(duration.asDays())    > 1) productDiv.innerHTML += duration.days()    + " Tage " + duration.hours()   + " Std. " + duration.minutes() + " Min. " + duration.seconds() + " Sek.";
                        else if (Math.floor(duration.asDays())    > 0) productDiv.innerHTML += duration.days()    + " Tag "  + duration.hours()   + " Std. " + duration.minutes() + " Min. " + duration.seconds() + " Sek.";
                        else if (Math.floor(duration.asHours())   > 0) productDiv.innerHTML += duration.hours()   + " Std. " + duration.minutes() + " Min. " + duration.seconds() + " Sek.";
                        else if (Math.floor(duration.asMinutes()) > 0) productDiv.innerHTML += duration.minutes() + " Min. " + duration.seconds() + " Sek.";
                        else if (Math.floor(duration.asSeconds()) > 0) productDiv.innerHTML += duration.seconds();

                        if (chargingSession.measurements)
                        {
                            for (var measurement of chargingSession.measurements)
                            {
                                //<i class="far fa-chart-bar"></i>
                                if (measurement.values && measurement.values.length > 0)
                                {

                                    var first  = measurement.values[0].value;
                                    var last   = measurement.values[measurement.values.length-1].value;
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

                                    productDiv.innerHTML += "<br />" + me.lib.translateMeasurementName(measurement.name) + " " + amount.toString() + " kWh (" + measurement.values.length + " Messwerte)";

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
                                    chargingSession.EVSE = me.GetEVSE(chargingSession.EVSEId);

                                locationDiv.classList.add("EVSE");
                                locationDiv.innerHTML             = (chargingSession.EVSE   != null && chargingSession.EVSE.description != null
                                                                        ? me.lib.firstValue(chargingSession.EVSE.description) + "<br />"
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
                                    chargingSession.chargingStation = me.GetChargingStation(chargingSession.chargingStationId);

                                if (chargingSession.chargingStation != null)
                                {

                                    locationDiv.classList.add("chargingStation");
                                    locationDiv.innerHTML             = (chargingSession.chargingStation   != null && chargingSession.chargingStation.description != null
                                                                            ? me.lib.firstValue(chargingSession.chargingStation.description) + "<br />"
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
                                    chargingSession.chargingPool = me.GetChargingPool(chargingSession.chargingPoolId);

                                if (chargingSession.chargingPool != null)
                                {

                                    locationDiv.classList.add("chargingPool");
                                    locationDiv.innerHTML             = (chargingSession.chargingPool   != null && chargingSession.chargingPool.description != null
                                                                            ? me.lib.firstValue(chargingSession.chargingPool.description) + "<br />"
                                                                            : "") +
                                                                        (chargingSession.chargingPoolId != null
                                                                            ? chargingSession.chargingPoolId
                                                                            : chargingSession.chargingPool["@id"]);

                                    address = me.GetChargingPool(chargingSession.chargingPool["@id"]).address;

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

                    //#endregion


                    me.chargingSessions.push(chargingSession);

                }

                // If there is only one charging session show its details at once...
                // if (me.chargingSessions.length == 1)
                //     me.chargingSessions[0].GUI.click();

                me2.app.map.invalidateSize();

                me2.app.map.fitBounds([[minlat, minlng], [maxlat, maxlng]],
                                      { padding: [40, 40] });

            }

            //#endregion

        }

        // e.g. the current chargeIT mobility does not provide any format identifiers
        async function tryToParseAnonymousFormat(SomeJSON: any): Promise<boolean>
        {

            var me2: chargy = me;

            if (!Array.isArray(SomeJSON))
            {

                var signedMeterValues = SomeJSON.signedMeterValues as Array<any>;
                var placeInfo         = SomeJSON.placeInfo;

                // {
                //     "signedMeterValues":[{
                //         "timestamp": 1550533285,
                //         "meterInfo": {
                //            "firmwareVersion": "123",
                //            "publicKey": "08A56CF3B51DABA44F38607BB884F62FB8BE84B4EF39D09624AB9E0910354398590DC59A5B40F43FE68A9F416F65EC76",
                //            "meterId": "0901454D4800007F9F3E",
                //            "type": "eHZ IW8E EMH",
                //            "manufacturer": "EMH"
                //         },
                //         "transactionId": "1546933282548:-7209653592192971037:1",
                //         "contract": {
                //            "type": "RFID_TAG_ID",
                //            "timestampLocal": {
                //               "timestamp": 1546933284,
                //               "localOffset": 60,
                //               "seasonOffset": 0
                //            },
                //            "timestamp": 1550533284,
                //            "id": "235DD5BB"
                //         },
                //         "measurementId": "00000007",
                //         "measuredValue": {
                //            "timestampLocal": {
                //               "timestamp": 1546933285,
                //               "localOffset": 60,
                //               "seasonOffset": 0
                //            },
                //            "value": "60077",
                //            "unit": "WATT_HOUR",
                //            "scale": -1,
                //            "valueType": "Integer64",
                //            "unitEncoded": 30
                //         },
                //         "measurand": {
                //            "id": "0100011100FF",
                //            "name": "ENERGY_TOTAL"
                //         },
                //         "additionalInfo": {
                //            "indexes": {
                //               "timer": 1730275,
                //               "logBook": "0004"
                //            },
                //            "status": "88"
                //         },
                //         "signature": "13493BBB43DA1E26C88B21ADB7AA53A7AE4FC7F6F6B916E67AD3E168421D180F021D6DD458612C53FF167781892A9DF3"
                //     }],
                //
                //     "placeInfo": {
                //         "evseId": "DE*BDO*74778874*1",
                //         "address": {
                //             "street": "Musterstraße 12",
                //             "zipCode": "74789",
                //             "town": "Stadt" 
                //         },
                //         "geoLocation": {
                //             "lat": 12.3774,
                //             "lon": 1.3774
                //         }
                //     }
                // }

                try {

                    var CTRArray = [];

                    for (var i = 0; i < signedMeterValues.length; i++) {

                        var signedMeterValue = signedMeterValues[i];

                        var _timestamp = signedMeterValue["timestamp"] as number;
                        if (_timestamp == null || typeof _timestamp !== 'number')
                            throw "Missing or invalid timestamp[" + i + "]!"
                        var timestamp = me2.lib.parseUTC(_timestamp);

                        var _meterInfo = signedMeterValue["meterInfo"] as string;
                        if (_meterInfo == null || typeof _meterInfo !== 'object')
                            throw "Missing or invalid meterInfo[" + i + "]!"

                        var _meterInfo_firmwareVersion = _meterInfo["firmwareVersion"] as string;
                        if (_meterInfo_firmwareVersion == null || typeof _meterInfo_firmwareVersion !== 'string')
                            throw "Missing or invalid meterInfo firmwareVersion[" + i + "]!"

                        var _meterInfo_publicKey = _meterInfo["publicKey"] as string;
                        if (_meterInfo_publicKey == null || typeof _meterInfo_publicKey !== 'string')
                            throw "Missing or invalid meterInfo publicKey[" + i + "]!"

                        var _meterInfo_meterId = _meterInfo["meterId"] as string;
                        if (_meterInfo_meterId == null || typeof _meterInfo_meterId !== 'string')
                            throw "Missing or invalid meterInfo meterId[" + i + "]!"

                        var _meterInfo_type = _meterInfo["type"] as string;
                        if (_meterInfo_type == null || typeof _meterInfo_type !== 'string')
                            throw "Missing or invalid meterInfo type[" + i + "]!"

                        var _meterInfo_manufacturer = _meterInfo["manufacturer"] as string;
                        if (_meterInfo_manufacturer == null || typeof _meterInfo_manufacturer !== 'string')
                            throw "Missing or invalid meterInfo manufacturer[" + i + "]!"


                        var _transactionId = signedMeterValue["transactionId"] as string;
                        if (_transactionId == null || typeof _transactionId !== 'string')
                            throw "Missing or invalid transactionId[" + i + "]!"


                        var _contract = signedMeterValue["contract"];
                        if (_contract == null || typeof _contract !== 'object')
                            throw "Missing or invalid contract[" + i + "]!"

                        var _contract_type = _contract["type"] as string;
                        if (_contract_type == null || typeof _contract_type !== 'string')
                            throw "Missing or invalid contract type[" + i + "]!"

                        var _contract_timestampLocal = _contract["timestampLocal"];
                        if (_contract_timestampLocal == null || typeof _contract_timestampLocal !== 'object')
                            throw "Missing or invalid contract timestampLocal[" + i + "]!"

                        var _contract_timestampLocal_timestamp = _contract_timestampLocal["timestamp"] as number;
                        if (_contract_timestampLocal_timestamp == null || typeof _contract_timestampLocal_timestamp !== 'number')
                            throw "Missing or invalid contract timestampLocal timestamp[" + i + "]!"                            

                        var _contract_timestampLocal_localOffset = _contract_timestampLocal["localOffset"] as number;
                        if (_contract_timestampLocal_localOffset == null || typeof _contract_timestampLocal_localOffset !== 'number')
                            throw "Missing or invalid contract timestampLocal localOffset[" + i + "]!"                            
                            
                        var _contract_timestampLocal_seasonOffset = _contract_timestampLocal["seasonOffset"] as number;
                        if (_contract_timestampLocal_seasonOffset == null || typeof _contract_timestampLocal_seasonOffset !== 'number')
                            throw "Missing or invalid contract timestampLocal seasonOffset[" + i + "]!"  

                        var _contract_timestamp = _contract["timestamp"] as number;
                        if (_contract_timestamp == null || typeof _contract_timestamp !== 'number')
                            throw "Missing or invalid contract timestamp[" + i + "]!"

                        var _contract_id = _contract["id"] as string;
                        if (_contract_id == null || typeof _contract_id !== 'string')
                            throw "Missing or invalid contract type[" + i + "]!"


                        var _measurementId = signedMeterValue["measurementId"] as string;
                        if (_measurementId == null || typeof _measurementId !== 'string')
                            throw "Missing or invalid measurementId[" + i + "]!"


                        var _measuredValue = signedMeterValue["measuredValue"];
                        if (_measuredValue == null || typeof _measuredValue !== 'object')
                            throw "Missing or invalid measuredValue[" + i + "]!"

                        var _measuredValue_timestampLocal = _measuredValue["timestampLocal"];
                        if (_measuredValue_timestampLocal == null || typeof _measuredValue_timestampLocal !== 'object')
                            throw "Missing or invalid measuredValue timestampLocal[" + i + "]!"

                        var _measuredValue_timestampLocal_timestamp = _measuredValue_timestampLocal["timestamp"] as number;
                        if (_measuredValue_timestampLocal_timestamp == null || typeof _measuredValue_timestampLocal_timestamp !== 'number')
                            throw "Missing or invalid measuredValue timestampLocal timestamp[" + i + "]!"                            

                        var _measuredValue_timestampLocal_localOffset = _measuredValue_timestampLocal["localOffset"] as number;
                        if (_measuredValue_timestampLocal_localOffset == null || typeof _measuredValue_timestampLocal_localOffset !== 'number')
                            throw "Missing or invalid measuredValue timestampLocal localOffset[" + i + "]!"                            
                            
                        var _measuredValue_timestampLocal_seasonOffset = _measuredValue_timestampLocal["seasonOffset"] as number;
                        if (_measuredValue_timestampLocal_seasonOffset == null || typeof _measuredValue_timestampLocal_seasonOffset !== 'number')
                            throw "Missing or invalid measuredValue timestampLocal seasonOffset[" + i + "]!"                            

                        var _measuredValue_value = _measuredValue["value"] as string;
                        if (_measuredValue_value == null || typeof _measuredValue_value !== 'string')
                            throw "Missing or invalid measuredValue value[" + i + "]!"

                        var _measuredValue_unit = _measuredValue["unit"] as string;
                        if (_measuredValue_unit == null || typeof _measuredValue_unit !== 'string')
                            throw "Missing or invalid measuredValue unit[" + i + "]!"

                        var _measuredValue_scale = _measuredValue["scale"] as number;
                        if (_measuredValue_scale == null || typeof _measuredValue_scale !== 'number')
                            throw "Missing or invalid measuredValue scale[" + i + "]!"

                        var _measuredValue_valueType = _measuredValue["valueType"] as string;
                        if (_measuredValue_valueType == null || typeof _measuredValue_valueType !== 'string')
                            throw "Missing or invalid measuredValue valueType[" + i + "]!"

                        var _measuredValue_unitEncoded = _measuredValue["unitEncoded"] as number;
                        if (_measuredValue_unitEncoded == null || typeof _measuredValue_unitEncoded !== 'number')
                            throw "Missing or invalid measuredValue unitEncoded[" + i + "]!"


                        var _measurand = signedMeterValue["measurand"];
                            if (_measurand == null || typeof _measurand !== 'object')
                                throw "Missing or invalid measurand[" + i + "]!"

                        var _measurand_id = _measurand["id"] as string;
                        if (_measurand_id == null || typeof _measurand_id !== 'string')
                            throw "Missing or invalid measurand id[" + i + "]!"

                        var _measurand_name = _measurand["name"] as string;
                        if (_measurand_name == null || typeof _measurand_name !== 'string')
                            throw "Missing or invalid measurand name[" + i + "]!"


                        var _additionalInfo = signedMeterValue["additionalInfo"];
                            if (_additionalInfo == null || typeof _additionalInfo !== 'object')
                                throw "Missing or invalid additionalInfo[" + i + "]!"

                        var _additionalInfo_indexes = _additionalInfo["indexes"];
                        if (_additionalInfo_indexes == null || typeof _additionalInfo_indexes !== 'object')
                            throw "Missing or invalid additionalInfo indexes[" + i + "]!"

                        var _additionalInfo_indexes_timer = _additionalInfo_indexes["timer"] as number;
                        if (_additionalInfo_indexes_timer == null || typeof _additionalInfo_indexes_timer !== 'number')
                            throw "Missing or invalid additionalInfo indexes timer[" + i + "]!"

                        var _additionalInfo_indexes_logBook = _additionalInfo_indexes["logBook"] as string;
                        if (_additionalInfo_indexes_logBook == null || typeof _additionalInfo_indexes_logBook !== 'string')
                            throw "Missing or invalid additionalInfo indexes logBook[" + i + "]!"
                            
                        var _additionalInfo_status = _additionalInfo["status"] as string;
                        if (_additionalInfo_status == null || typeof _additionalInfo_status !== 'string')
                            throw "Missing or invalid additionalInfo status[" + i + "]!"


                        var _signature = signedMeterValue["signature"] as string;
                        if (_signature == null || typeof _signature !== 'string')
                            throw "Missing or invalid signature[" + i + "]!"


                        var aaa = moment.unix(_contract_timestampLocal_timestamp).utc();

                        CTRArray.push({
                                    "timestamp": _timestamp,
                                    "meterInfo": {
                                       "firmwareVersion": _meterInfo_firmwareVersion,
                                       "publicKey": _meterInfo_publicKey,
                                       "meterId": _meterInfo_meterId,
                                       "type": _meterInfo_type,
                                       "manufacturer": _meterInfo_manufacturer
                                    },
                                    "transactionId": _transactionId,
                                    "contract": {
                                       "type": _contract_type,
                                       "timestampLocal": {
                                          "timestamp": _contract_timestampLocal_timestamp,
                                          "localOffset": _contract_timestampLocal_localOffset,
                                          "seasonOffset": _contract_timestampLocal_seasonOffset
                                       },
                                       "timestamp": _contract_timestamp,
                                       "id": _contract_id
                                    },
                                    "measurementId": _measurementId,
                                    "measuredValue": {
                                       "timestampLocal": {
                                          "timestamp": _measuredValue_timestampLocal_timestamp,
                                          "localOffset": _measuredValue_timestampLocal_localOffset,
                                          "seasonOffset": _measuredValue_timestampLocal_seasonOffset
                                       },
                                       "value": _measuredValue_value,
                                       "unit": _measuredValue_unit,
                                       "scale": _measuredValue_scale,
                                       "valueType": _measuredValue_valueType,
                                       "unitEncoded": _measuredValue_unitEncoded
                                    },
                                    "measurand": {
                                       "id": _measurand_id,
                                       "name": _measurand_name
                                    },
                                    "additionalInfo": {
                                       "indexes": {
                                          "timer": _additionalInfo_indexes_timer,
                                          "logBook": _additionalInfo_indexes_logBook
                                       },
                                       "status": _additionalInfo_status
                                    },
                                    "signature": _signature
                        });

                    }


                    var evseId = placeInfo["evseId"] as string;
                    if (evseId == null || typeof evseId !== 'string')
                        throw "Missing or invalid EVSE Id!"


                    var address = placeInfo["address"];
                    if (address == null)
                        throw "Missing or invalid address!"

                    var address_street = address["street"];
                    if (address_street == null || typeof address_street !== 'string')
                        throw "Missing or invalid address street!"

                    var address_zipCode = address["zipCode"];
                    if (address_zipCode == null || typeof address_zipCode !== 'string')
                        throw "Missing or invalid address zipCode!"

                    var address_town = address["town"];
                    if (address_town == null || typeof address_town !== 'string')
                        throw "Missing or invalid address town!"

           
                    var geoLocation = placeInfo["geoLocation"];
                    if (geoLocation == null)
                        throw "Missing or invalid geoLocation!"

                    var geoLocation_lat = geoLocation["lat"];
                    if (geoLocation_lat == null || typeof geoLocation_lat !== 'number')
                        throw "Missing or invalid geoLocation latitude!"

                    var geoLocation_lon = geoLocation["lon"];
                    if (geoLocation_lon == null || typeof geoLocation_lon !== 'number')
                        throw "Missing or invalid geoLocation longitude!"


                    var n = CTRArray.length-1;
                    var _CTR: any = { //IChargeTransparencyRecord = {

                        "@id":              _transactionId,
                        "@context":         "https://open.charging.cloud/contexts/CTR+json",
                    
                        "begin":            moment.unix(CTRArray[0]["measuredValue"]["timestampLocal"]["timestamp"]).utc().format(),
                        "end":              moment.unix(CTRArray[n]["measuredValue"]["timestampLocal"]["timestamp"]).utc().format(),
                    
                        "description": {
                            "de":           "Alle Ladevorgänge"
                        },
                    
                        "contract": {
                            "@id":          CTRArray[0]["contract"]["id"],
                            "type":         CTRArray[0]["contract"]["type"],
                            "username":     "",
                            "email":        ""
                        },

                        "chargingStationOperators": [
                            {

                                "@id":                      "chargeITmobilityCSO",
                                "eMobilityIds":             [ "DE*BDO", "DE*LVF", "+49*822" ],
                                "description": {
                                    "de":                   "chargeIT mobility GmbH - Charging Station Operator Services"
                                },
                    
                                "contact": {
                                    "email":                    "info@chargeit-mobility.com",
                                    "web":                      "https://www.chargeit-mobility.com",
                                    "logoUrl":                  "http://www.chargeit-mobility.com/fileadmin/BELECTRIC_Drive/templates/pics/chargeit_logo_408x70.png",
                                    "publicKeys": [
                                        {
                                            "algorithm":        "secp192r1",
                                            "format":           "DER",
                                            "value":            "042313b9e469612b4ca06981bfdecb226e234632b01d84b6a814f63a114b7762c34ddce2e6853395b7a0f87275f63ffe3c",
                                            "signatures": [
                                                {
                                                    "keyId":      "...",
                                                    "algorithm":  "secp192r1",
                                                    "format":     "DER",
                                                    "value":      "????"
                                                }
                                            ]
                                        },
                                        {
                                            "algorithm":        "secp256k1",
                                            "format":           "DER",
                                            "value":            "04a8ff0d82107922522e004a167cc658f0eef408c5020f98e7a2615be326e61852666877335f4f8d9a0a756c26f0c9fb3f401431416abb5317cc0f5d714d3026fe",
                                            "signatures":       [ ]
                                        }
                                    ]
                                },
                    
                                "support": {
                                    "hotline":                  "+49 9321 / 2680 - 700",
                                    "email":                    "service@chargeit-mobility.com",
                                    "web":                      "https://cso.chargeit.charging.cloud/issues"
                                    // "mediationServices":        [ "GraphDefined Mediation" ],
                                    // "publicKeys": [
                                    //     {
                                    //         "algorithm":        "secp256k1",
                                    //         "format":           "DER",
                                    //         "value":            "04a8ff0d82107922522e004a167cc658f0eef408c5020f98e7a2615be326e61852666877335f4f8d9a0a756c26f0c9fb3f401431416abb5317cc0f5d714d3026fe",
                                    //         "signatures":       [ ]
                                    //     }
                                    // ]
                                },

                                "privacy": {
                                    "contact":                  "Dr. iur. Christian Borchers, datenschutz süd GmbH",
                                    "email":                    "datenschutz@chargeit-mobility.com",
                                    "web":                      "http://www.chargeit-mobility.com/de/datenschutz/"
                                    // "publicKeys": [
                                    //     {
                                    //         "algorithm":        "secp256k1",
                                    //         "format":           "DER",
                                    //         "value":            "04a8ff0d82107922522e004a167cc658f0eef408c5020f98e7a2615be326e61852666877335f4f8d9a0a756c26f0c9fb3f401431416abb5317cc0f5d714d3026fe",
                                    //         "signatures":       [ ]
                                    //     }
                                    // ]
                                },

                                "chargingStations": [
                                    {
                                        "@id":                      evseId,
                                        // "description": {
                                        //     "de":                   "GraphDefined Charging Station - CI-Tests Pool 3 / Station A"
                                        // },
                                        "geoLocation":              { "lat": geoLocation_lat, "lng": geoLocation_lon },
                                        "address": {
                                            "street":               address_street,
                                            "postalCode":           address_zipCode,
                                            "city":                 address_town
                                        },
                                        "EVSEs": [
                                            {
                                                "@id":                      evseId,
                                                // "description": {
                                                //     "de":                   "GraphDefined EVSE - CI-Tests Pool 3 / Station A / EVSE 1"
                                                // },
                                                "sockets":                  [ { } ],
                                                "meters": [
                                                    {
                                                        "@id":                      CTRArray[0]["meterInfo"]["meterId"],
                                                        "vendor":                   CTRArray[0]["meterInfo"]["manufacturer"],
                                                        "vendorURL":                "http://www.emh-metering.de",
                                                        "model":                    CTRArray[0]["meterInfo"]["type"],
                                                        "hardwareVersion":          "1.0",
                                                        "firmwareVersion":          CTRArray[0]["meterInfo"]["firmwareVersion"],
                                                        "signatureFormat":          "https://open.charging.cloud/contexts/EnergyMeterSignatureFormats/EMHCrypt01",
                                                        "publicKeys": [
                                                            {
                                                                "algorithm":        "secp192r1",
                                                                "format":           "DER",
                                                                "value":            "04" + CTRArray[0]["meterInfo"]["publicKey"]
                                                            }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]

                            }
                        ],

                        "chargingSessions": [

                            {

                                "@id":                          _transactionId,
                                "@context":                     "https://open.charging.cloud/contexts/SessionSignatureFormats/EMHCrypt01+json",
                                "begin":                        moment.unix(CTRArray[0]["measuredValue"]["timestampLocal"]["timestamp"]).utc().format(),
                                "end":                          moment.unix(CTRArray[n]["measuredValue"]["timestampLocal"]["timestamp"]).utc().format(),
                                "EVSEId":                       evseId,
                    
                                "authorizationStart": {
                                    "@id":                      CTRArray[0]["contract"]["id"],
                                    "type":                     CTRArray[0]["contract"]["type"],
                                    "timestamp":                moment.unix(CTRArray[0]["contract"]["timestampLocal"]["timestamp"]).utc().utcOffset(
                                                                            CTRArray[0]["contract"]["timestampLocal"]["localOffset"] +
                                                                            CTRArray[0]["contract"]["timestampLocal"]["seasonOffset"]).format(),
                                },

                                "signatureInfos": {
                                    "hash":                     "SHA256",
                                    "hashTruncation":           "24",
                                    "algorithm":                "ECC",
                                    "curve":                    "secp192r1",
                                    "format":                   "rs"
                                },

                                "measurements": [

                                    {

                                        "energyMeterId":        CTRArray[0]["meterInfo"]["meterId"],
                                        "@context":             "https://open.charging.cloud/contexts/EnergyMeterSignatureFormats/EMHCrypt01+json",
                                        "name":                 CTRArray[0]["measurand"]["name"],
                                        "obis":                 CTRArray[0]["measurand"]["id"],
                                        "unit":                 CTRArray[0]["measuredValue"]["unit"],
                                        "unitEncoded":          CTRArray[0]["measuredValue"]["unitEncoded"],
                                        "valueType":            CTRArray[0]["measuredValue"]["valueType"],
                                        "scale":                CTRArray[0]["measuredValue"]["scale"],

                                        "signatureInfos": {
                                            "hash":                 "SHA256",
                                            "hashTruncation":       "24",
                                            "algorithm":            "ECC",
                                            "curve":                "secp192r1",
                                            "format":               "rs"
                                        },

                                        "values": [ ]

                                    }

                                ]

                            }

                        ]

                    };

                    for (var _measurement of CTRArray)
                    {

                        _CTR["chargingSessions"][0]["measurements"][0]["values"].push(

                                                {
                                                    "timestamp":      moment.unix(_measurement["measuredValue"]["timestampLocal"]["timestamp"]).utc().utcOffset(
                                                                                  _measurement["measuredValue"]["timestampLocal"]["localOffset"] +
                                                                                  _measurement["measuredValue"]["timestampLocal"]["seasonOffset"]).format(),
                                                    "value":          _measurement["measuredValue"]["value"],
                                                    "infoStatus":     _measurement["additionalInfo"]["status"],
                                                    "secondsIndex":   _measurement["additionalInfo"]["indexes"]["timer"],
                                                    "paginationId":   _measurement["measurementId"],
                                                    "logBookIndex":   _measurement["additionalInfo"]["indexes"]["logBook"],
                                                    "signatures": [
                                                        {
                                                            "r":          _measurement["signature"].substring(0, 48),
                                                            "s":          _measurement["signature"].substring(48)
                                                        }
                                                    ]
                                                }

                        );

                    }

                    await processChargeTransparencyRecord(_CTR);
                    return true;

                }
                catch (exception)
                {
                    console.log("chargeIT mobility legacy CTR format: " + exception);
                }                

            }

            return false;

        }


        if (Content == null)
            return;

        switch (Content["@context"])
        {

            case "https://open.charging.cloud/contexts/CTR+json":
                await processChargeTransparencyRecord(Content);
                break;

            default:
                if (await !tryToParseAnonymousFormat(Content))
                    this.doGlobalError("Unbekanntes Transparenzdatensatzformat!");
                break;

        }

    }

    //#endregion

    //#region showChargingSessionDetails

    public async showChargingSessionDetails(chargingSession: iface.IChargingSession)
    {

        var me = this;

        async function checkMeasurementCrypto(measurementValue: iface.IMeasurementValue)
        {

            var result = await me.verifyMeasurementCryptoDetails(measurementValue);

            switch (result.status)
            {

                    case iface.VerificationResult.UnknownCTRFormat:
                        return '<i class="fas fa-times-circle"></i> Unbekanntes Transparenzdatenformat';

                    case iface.VerificationResult.EnergyMeterNotFound:
                        return '<i class="fas fa-times-circle"></i> Ungültiger Energiezähler';

                    case iface.VerificationResult.PublicKeyNotFound:
                        return '<i class="fas fa-times-circle"></i> Ungültiger Public Key';

                    case iface.VerificationResult.InvalidPublicKey:
                        return '<i class="fas fa-times-circle"></i> Ungültiger Public Key';

                    case iface.VerificationResult.InvalidSignature:
                        return '<i class="fas fa-times-circle"></i> Ungültige Signatur';

                    case iface.VerificationResult.ValidSignature:
                        return '<i class="fas fa-check-circle"></i> Gültige Signatur';
    

                    default:
                        return '<i class="fas fa-times-circle"></i> Ungültige Signatur';

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
                    // this.lib.CreateDiv(this.evseTarifInfosDiv,  "measurementInfo");

                    //#region Show meter vendor infos

                    var meter                        = this.GetMeter(measurement.energyMeterId);

                    if (meter != null)
                    {

                        let MeterVendorDiv           = this.lib.CreateDiv(MeasurementInfoDiv,  "meterVendor");

                        let MeterVendorIdDiv         = this.lib.CreateDiv(MeterVendorDiv,      "meterVendorId",
                                                                 "Zählerhersteller");

                        let MeterVendorValueDiv      = this.lib.CreateDiv(MeterVendorDiv,      "meterVendorIdValue",
                                                                 meter.vendor);


                        let MeterModelDiv            = this.lib.CreateDiv(MeasurementInfoDiv,  "meterModel");

                        let MeterModelIdDiv          = this.lib.CreateDiv(MeterModelDiv,       "meterModelId",
                                                                 "Model");

                        let MeterModelValueDiv       = this.lib.CreateDiv(MeterModelDiv,       "meterModelIdValue",
                                                                 meter.model);

                    }

                    //#endregion

                    //#region Show meter infos

                    let MeterDiv                    = this.lib.CreateDiv(MeasurementInfoDiv,       "meter");

                    let MeterIdDiv                  = this.lib.CreateDiv(MeterDiv,                 "meterId",
                                                                meter != null ? "Seriennummer" : "Zählerseriennummer");

                    let MeterIdValueDiv             = this.lib.CreateDiv(MeterDiv,                 "meterIdValue",
                                                                measurement.energyMeterId);

                    //#endregion

                    //#region Show measurement infos

                    let MeasurementDiv               = this.lib.CreateDiv(MeasurementInfoDiv,      "measurement");

                    let MeasurementIdDiv             = this.lib.CreateDiv(MeasurementDiv,          "measurementId",
                                                                 "Messung");

                    let MeasurementIdValueDiv        = this.lib.CreateDiv(MeasurementDiv,          "measurementIdValue",
                                                                 measurement.name + " (OBIS: " + this.lib.parseOBIS(measurement.obis) + ")");

                    //#endregion

                    //#region Show measurement values...

                    if (measurement.values && measurement.values.length > 0)
                    {

                        //#region Configure chart

                        let chartDiv           = this.app.measurementInfosPage.querySelector<HTMLCanvasElement>('#chart');

                        let chartData:chart.ChartConfiguration = {
                            type: 'bar',
                            data: {
                                labels: ['Red', 'Blue'], //, 'Yellow', 'Green', 'Purple', 'Orange'],
                                datasets: [{
                                    label: 'kWh',
                                    data: [],
                                    backgroundColor: [
                                         'rgba(255, 99, 132, 0.2)',
                                         'rgba(54, 162, 235, 0.2)'
                                    //     'rgba(255, 206, 86, 0.2)',
                                    //     'rgba(75, 192, 192, 0.2)',
                                    //     'rgba(153, 102, 255, 0.2)',
                                    //     'rgba(255, 159, 64, 0.2)'
                                    ],
                                    // borderColor: [
                                    //     'rgba(255, 99, 132, 1)',
                                    //     'rgba(54, 162, 235, 1)',
                                    //     'rgba(255, 206, 86, 1)',
                                    //     'rgba(75, 192, 192, 1)',
                                    //     'rgba(153, 102, 255, 1)',
                                    //     'rgba(255, 159, 64, 1)'
                                    // ],
                                    borderWidth: 1
                                }]
                            },
                            options: {
                                title: {
                                    display: false
                                },
                                legend: {
                                    display: false
                                },
                                scales: {
                                    yAxes: [{
                                        ticks: {
                                            beginAtZero: true
                                        }
                                    }]
                                }
                            }
                        };

                        //#endregion                        

                        let MeasurementValuesDiv         = this.app.measurementInfosPage.querySelector<HTMLDivElement>('#measurementValues');
                        MeasurementValuesDiv.innerHTML   = '';

                        let chartValues                  = [];
                        let previousValue                = 0;

                        for (var measurementValue of measurement.values)
                        {

                            measurementValue.measurement     = measurement;

                            let MeasurementValueDiv          = this.lib.CreateDiv(MeasurementValuesDiv, "measurementValue");
                            MeasurementValueDiv.onclick      = this.captureMeasurementCryptoDetails(measurementValue);

                            var timestamp                    = this.lib.parseUTC(measurementValue.timestamp);

                            let timestampDiv                 = this.lib.CreateDiv(MeasurementValueDiv, "timestamp",
                                                                         timestamp.format('HH:mm:ss') + " Uhr");


                            // Show energy counter value
                        /*     let value2Div                    = this.lib.CreateDiv(MeasurementValueDiv, "value",
                                                                         parseFloat((measurementValue.value * Math.pow(10, measurementValue.measurement.scale)).toFixed(10)).toString());

                            switch (measurement.unit)
                            {

                                case "KILO_WATT_HOURS":
                                    this.lib.CreateDiv(MeasurementValueDiv, "unit", "kWh");
                                    break;

                                // "WATT_HOURS"
                                default:
                                this.lib.CreateDiv(MeasurementValueDiv, "unit", "Wh");
                                    break;

                            } */


                            // Show energy difference
                            var currentValue                 = measurementValue.value;

                            switch (measurement.unit)
                            {

                                case "KILO_WATT_HOURS":
                                    currentValue = parseFloat((currentValue * Math.pow(10, measurementValue.measurement.scale)).toFixed(10));
                                    break;

                                // "WATT_HOURS"
                                default:
                                    currentValue = parseFloat((currentValue / 1000 * Math.pow(10, measurementValue.measurement.scale)).toFixed(10));
                                    break;

                            }

                            let value                        = (previousValue > 0
                                                                    ? parseFloat((currentValue - previousValue).toFixed(10))
                                                                    : 0);

                            //let aa = chartData.data.datasets[0].data;
                            chartValues.push(value);

                            let valueDiv                     = this.lib.CreateDiv(MeasurementValueDiv, "value",
                                                                         "+" + value);

                            let unitDiv                      = this.lib.CreateDiv(MeasurementValueDiv, "unit",
                                                                         "kWh");


                            // Show signature status
                            let verificationStatusDiv        = this.lib.CreateDiv(MeasurementValueDiv, "verificationStatus",
                                                                         await checkMeasurementCrypto(measurementValue));

                            previousValue                    = currentValue;

                        }

                        chartData.data.datasets[0].data = chartValues;
                        var myChart = new chart.Chart(chartDiv, chartData);
    
                    }

                    //#endregion

                }
;
            }

        }
        catch (exception)
        { 
            console.log("Could not show charging session details: " + exception);
        }

    }

    //#region Capture the correct charging session and its context!

    public captureChargingSession(cs: iface.IChargingSession) {

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


    //#region verifySessionCryptoDetails

    public async verifySessionCryptoDetails(chargingSession: iface.IChargingSession) : Promise<iface.ISessionCryptoResult>
    {

        var result: iface.ISessionCryptoResult = {
            status: iface.SessionVerificationResult.UnknownSessionFormat
        };

        if (chargingSession              == null ||
            chargingSession.measurements == null)
        {
            return result;
        }

        switch (chargingSession["@context"])
        {

            case "https://open.charging.cloud/contexts/SessionSignatureFormats/GDFCrypt01+json":
                chargingSession.method = new GDFCrypt01(this.GetMeter);
                return await chargingSession.method.VerifyChargingSession(chargingSession);

            case "https://open.charging.cloud/contexts/SessionSignatureFormats/EMHCrypt01+json":
                chargingSession.method = new EMHCrypt01(this.GetMeter);
                return await chargingSession.method.VerifyChargingSession(chargingSession);

            default:
                return await result;

        }

    }

    //#endregion

    //#region verifyMeasurementCryptoDetails

    public async verifyMeasurementCryptoDetails(measurementValue:  iface.IMeasurementValue) : Promise<iface.ICryptoResult>
    {

        var result: iface.ICryptoResult = {
            status: iface.VerificationResult.UnknownCTRFormat
        };

        if (measurementValue             == null ||
            measurementValue.measurement == null)
        {
            return result;
        }

        switch (measurementValue.measurement["@context"])
        {

            case "https://open.charging.cloud/contexts/EnergyMeterSignatureFormats/GDFCrypt01+json":
                 measurementValue.method = new GDFCrypt01(this.GetMeter);
                 return await measurementValue.method.VerifyMeasurement(measurementValue);

            case "https://open.charging.cloud/contexts/EnergyMeterSignatureFormats/EMHCrypt01+json":
                 if (measurementValue.measurement.chargingSession.method != null)
                 {

                    measurementValue.method = measurementValue.measurement.chargingSession.method;

                    if (measurementValue.result == null)
                        return await measurementValue.method.VerifyMeasurement(measurementValue);

                    return measurementValue.result;

                 }

                 measurementValue.method = new EMHCrypt01(this.GetMeter);
                 return await measurementValue.method.VerifyMeasurement(measurementValue);

            default:
                return result;

        }

    }

    //#endregion

    //#region showMeasurementCryptoDetails

    public showMeasurementCryptoDetails(measurementValue:  iface.IMeasurementValue) : void
    {

        function doError(text: String)
        {
            //inputInfosDiv.style.display  = 'flex';
            //errorTextDiv.style.display   = 'inline-block';
            introDiv.innerHTML           = '<i class="fas fa-times-circle"></i> ' + text;
        }


        let cryptoDiv      = this.app.cryptoDetailsPage;
        let introDiv       = cryptoDiv.querySelector('#intro')      as HTMLDivElement;
        let cryptoDataDiv  = cryptoDiv.querySelector('#cryptoData') as HTMLDivElement;

        if (measurementValue             == null ||
            measurementValue.measurement == null)
        {
            doError("Unbekanntes Messdatensatzformat!");
        }


        //#region Show data and result on overlay        

        let bufferValue               = cryptoDiv.querySelector('#buffer .value')             as HTMLDivElement;
        let hashedBufferValue         = cryptoDiv.querySelector('#hashedBuffer .value')       as HTMLDivElement;
        let publicKeyValue            = cryptoDiv.querySelector('#publicKey .value')          as HTMLDivElement;
        let signatureExpectedValue    = cryptoDiv.querySelector('#signatureExpected .value')  as HTMLDivElement;
        let signatureCheckValue       = cryptoDiv.querySelector('#signatureCheck')            as HTMLDivElement;

        //introDiv.innerHTML                = '';
        cryptoDataDiv.innerHTML           = '';
        bufferValue.innerHTML             = '';
        hashedBufferValue.innerHTML       = '0x00000000000000000000000000000000000';
        publicKeyValue.innerHTML          = '0x00000000000000000000000000000000000';
        signatureExpectedValue.innerHTML  = '0x00000000000000000000000000000000000';
        signatureCheckValue.innerHTML     = '';

        if (measurementValue.method)
            measurementValue.method.ViewMeasurement(measurementValue,
                                                    introDiv,
                                                    cryptoDataDiv,
                                                    bufferValue,
                                                    hashedBufferValue,
                                                    publicKeyValue,
                                                    signatureExpectedValue,
                                                    signatureCheckValue);

        else
        {
            doError("Unbekanntes Messdatensatzformat!");
        }

        //#endregion

    }

    //#region Capture the correct measurement value and its context!

    public captureMeasurementCryptoDetails(measurementValue: iface.IMeasurementValue) {
        var me = this;
        return function(this: HTMLDivElement, ev: MouseEvent) {
                   me.app.showPage(me.app.cryptoDetailsPage);
                   me.showMeasurementCryptoDetails(measurementValue);
               };
    }

    //#endregion

    //#endregion

}
