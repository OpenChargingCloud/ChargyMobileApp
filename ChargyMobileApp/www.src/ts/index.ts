/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
//import 'core-js';
import chargy from './chargy';

declare let cordova: any;

// @ts-ignore
var leaflet: any = L;

let appVersion:         string;

export default class App {

    public importantInfo:               HTMLDivElement;
    public startPage:                   HTMLDivElement;
    public chargingSessionsPage:        HTMLDivElement;
    public measurementInfosPage:        HTMLDivElement;
    public cryptoDetailsPage:           HTMLDivElement;
    public issueTrackerPage:            HTMLDivElement;
    public aboutPage:                   HTMLDivElement;

    public map: any;


    chargingSessionsPage_MovementStartX  = null;
    measurementInfosPage_MovementStartX  = null;
    cryptoDetailsPage_MovementStartX     = null;

    _chargy: chargy;

    start() {
	console.log("Meter ID:");
        document.addEventListener('deviceready', () => this.onDeviceReady(),  false);
        document.addEventListener('resume',      () => this.onDeviceResume(), false);
        document.addEventListener('pause',       () => this.onPause(),        false);

        if (cordova.getAppVersion != null) {
            cordova.getAppVersion.getVersionNumber((version) => {
                appVersion = version;
            });
        }

    }

    showPage(page: HTMLDivElement) {

      this.hideAllPages();

      if (page == this.startPage)
      {

          //document.getElementById("importantInfo").style.display = "none";
          //document.getElementById("MenuBar").style.display       = "none";

          //window.localStorage.removeItem('MenuBar');
          //window.localStorage.removeItem('login');
          //window.localStorage.removeItem('password');
          //window.localStorage.removeItem('name');
          //window.localStorage.removeItem('email');
          //window.localStorage.removeItem('mobilePhone');
          //window.localStorage.removeItem('userProfile');

      }

        // else if (page == this.userProfilePage) {
        //   _userAPI.getUserProfile();
        // }

        page.style.display = 'block';

        if (page == this.chargingSessionsPage)
            this.refreshMap();

    }

    refreshMap(fitBounds?: any) {

        if (this.map == null)
            return;

        window.requestAnimationFrame(() => {
            this.map.invalidateSize();

            if (fitBounds != null)
                this.map.fitBounds(fitBounds,
                                   { padding: [40, 40] });
        });

    }

    hidePage(page: HTMLDivElement) {
        page.style.display = 'none';
    }

    hideAllPages() {

        this.startPage.style.display                  = 'none';
        this.chargingSessionsPage.style.display       = 'none';
        this.measurementInfosPage.style.display       = 'none';
        this.cryptoDetailsPage.style.display          = 'none';
        this.issueTrackerPage.style.display           = 'none';
        this.aboutPage.style.display                  = 'none';

    }


    onDeviceReady() {

        var me = this;

        this.importantInfo              = document.getElementById("importantInfo")              as HTMLDivElement;
        this.startPage                  = document.getElementById("startPage")                  as HTMLDivElement;
        this.chargingSessionsPage       = document.getElementById("chargingSessionsPage")       as HTMLDivElement;
        this.measurementInfosPage       = document.getElementById("measurementInfosPage")       as HTMLDivElement;
        this.cryptoDetailsPage          = document.getElementById("cryptoDetailsPage")          as HTMLDivElement;
        this.issueTrackerPage           = document.getElementById("issueTrackerPage")           as HTMLDivElement;
        this.aboutPage                  = document.getElementById("aboutPage")                  as HTMLDivElement;

        var fileInputButton             = <HTMLButtonElement> document.getElementById('fileInputButton');
        var fileInput                   = <HTMLInputElement>  document.getElementById('fileInput');
        fileInputButton.onclick         = (event) => {
            this.importantInfo.style.display  = 'none';
            this.importantInfo.innerHTML      = '';
            fileInput.value = '';
            fileInput.click();
        }

        // @ts-ignore
        fileInput.onchange              = (event) => this.readAndParseFile(event.target.files[0]);

        var pasteButton                 = <HTMLButtonElement> document.getElementById('pasteButton');
        pasteButton.onclick             = (event) => this.PasteFile();



    //#region ChargingSessions Back-Swipe

    function getChargingSessionsPagePosition(e) {

      me.chargingSessionsPage_MovementStartX = (e.changedTouches
                                                    ? e.changedTouches[0]
                                                    : e).clientX;

    };

    function releaseChargingSessionsPagePosition(e) {

      let distance = (e.changedTouches
                          ? e.changedTouches[0]
                          : e).clientX - me.chargingSessionsPage_MovementStartX;

      if (e.target.id == "map")
        return;
      
      if (e.target.parentElement    != null)
      {

        if (e.target.parentElement.id == "map")
          return;

        if (e.target.parentElement.parentElement != null)
        {

          if (e.target.parentElement.parentElement.id == "map")
            return;

          if (e.target.parentElement.parentElement.parentElement != null)
          {

            if (e.target.parentElement.parentElement.parentElement.id == "map")
              return;

            if (e.target.parentElement.parentElement.parentElement.parentElement != null)
            {

              if (e.target.parentElement.parentElement.parentElement.parentElement.id == "map")
                return;

            }

          }

        }

      }

      if (distance > me.chargingSessionsPage.clientWidth / 2)
      {
        app.showPage(me.startPage);
        e.preventDefault();
        e.stopPropagation();
      }

    };

    this.chargingSessionsPage.addEventListener('mousedown',  getChargingSessionsPagePosition,     false);
    this.chargingSessionsPage.addEventListener('touchstart', getChargingSessionsPagePosition,     false);

    this.chargingSessionsPage.addEventListener('mouseup',    releaseChargingSessionsPagePosition, false);
    this.chargingSessionsPage.addEventListener('touchend',   releaseChargingSessionsPagePosition, false);

    //#endregion

    //#region measurementInfosPage Back-Swipe

    function getmeasurementInfosPagePosition(e) {

        me.measurementInfosPage_MovementStartX = (e.changedTouches
                                                    ? e.changedTouches[0]
                                                    : e).clientX;

    };

    function releasemeasurementInfosPagePosition(e) {

        let distance = (e.changedTouches
                          ? e.changedTouches[0]
                          : e).clientX - me.measurementInfosPage_MovementStartX;

        if (e.target.id == "map")
        return;
        
        if (e.target.parentElement    != null)
        {

        if (e.target.parentElement.id == "map")
            return;

        if (e.target.parentElement.parentElement != null)
        {

            if (e.target.parentElement.parentElement.id == "map")
            return;

            if (e.target.parentElement.parentElement.parentElement != null)
            {

            if (e.target.parentElement.parentElement.parentElement.id == "map")
                return;

            if (e.target.parentElement.parentElement.parentElement.parentElement != null)
            {

                if (e.target.parentElement.parentElement.parentElement.parentElement.id == "map")
                return;

            }

            }

          }

        }

        if (distance > me.measurementInfosPage.clientWidth / 2)
        {
            app.showPage(app.chargingSessionsPage);
            e.preventDefault();
            e.stopPropagation();
        }

    };    

    this.measurementInfosPage.addEventListener('mousedown',  getmeasurementInfosPagePosition,     false);
    this.measurementInfosPage.addEventListener('touchstart', getmeasurementInfosPagePosition,     false);

    this.measurementInfosPage.addEventListener('mouseup',    releasemeasurementInfosPagePosition, false);
    this.measurementInfosPage.addEventListener('touchend',   releasemeasurementInfosPagePosition, false);

    //#endregion

    //#region cryptoDetailsPage Back-Swipe

    function getCryptoDetailsPagePosition(e) {

        me.cryptoDetailsPage_MovementStartX = (e.changedTouches
                                                    ? e.changedTouches[0]
                                                    : e).clientX;

    };

    function releaseCryptoDetailsPagePosition(e) {

        let distance = (e.changedTouches
                          ? e.changedTouches[0]
                          : e).clientX - me.cryptoDetailsPage_MovementStartX;

        if (e.target.id == "map")
        return;
        
        if (e.target.parentElement    != null)
        {

        if (e.target.parentElement.id == "map")
            return;

        if (e.target.parentElement.parentElement != null)
        {

            if (e.target.parentElement.parentElement.id == "map")
            return;

            if (e.target.parentElement.parentElement.parentElement != null)
            {

            if (e.target.parentElement.parentElement.parentElement.id == "map")
                return;

            if (e.target.parentElement.parentElement.parentElement.parentElement != null)
            {

                if (e.target.parentElement.parentElement.parentElement.parentElement.id == "map")
                return;

            }

            }

          }

        }

        if (distance > me.cryptoDetailsPage.clientWidth / 2)
        {
            app.showPage(app.measurementInfosPage);
            e.preventDefault();
            e.stopPropagation();
        }

    };    

    this.cryptoDetailsPage.addEventListener('mousedown',  getCryptoDetailsPagePosition,     false);
    this.cryptoDetailsPage.addEventListener('touchstart', getCryptoDetailsPagePosition,     false);

    this.cryptoDetailsPage.addEventListener('mouseup',    releaseCryptoDetailsPagePosition, false);
    this.cryptoDetailsPage.addEventListener('touchend',   releaseCryptoDetailsPagePosition, false);

    //#endregion
  

    //#region Create the map

    //@ts-ignore
    leaflet  = L;

    //@ts-ignore
    this.map = L.map('map').setView([49.7325504,10.1424442], 13);

    //@ts-ignore
    
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '<a href="http://openstreetmap.org">OSM</a> contr., ' +
                '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                'Imagery © <a href="http://mapbox.com">Mapbox</a>'
        }).addTo(this.map);
    
    /*L.tileLayer('https://{s}.tiles.mapbox.com/v4/ahzf.nc811hb2/{z}/{x}/{y}.png?' +
                'access_token=pk.eyJ1IjoiYWh6ZiIsImEiOiJOdEQtTkcwIn0.Cn0iGqUYyA6KPS8iVjN68w',
                {
                  maxZoom:      18,
                  attribution:  '<a href="http://openstreetmap.org">OSM</a> contr., ' +
                                '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                                'Imagery © <a href="http://mapbox.com">Mapbox</a>'
                }).addTo(this.map);
*/
    //#endregion

    this._chargy = new chargy(this);

	  app.showPage(this.startPage);
    
  }
  
  onPause() {

  }

  onDeviceResume() {

  }



  //#region Global error handling...

  doGlobalError(text:      String,
                context?:  any)
  {

    //this.hideAllPages();
    //inputInfosDiv.style.display             = 'flex';
    //chargingSessionReportDiv.style.display  = 'none';
    //chargingSessionReportDiv.innerHTML      = '';
    this.importantInfo.style.display              = 'block';
    this.importantInfo.innerHTML                  = '<i class="fas fa-times-circle"></i> ' + text;

    console.log(text);
    console.log(context);

  }

  //#endregion

//--CB--Prüfung ob das eingelesene JSON vom PTB ist, daraufhin dann umbauen auf das Format was Chargy möchte

transformToExpectedFormat(raw: any): any {

    if (!raw || raw.format !== "ptb") {
        return raw;
    }

    function parseOCMF(ocmfString: string) {
        const parts = ocmfString.split("|");
        const data = JSON.parse(parts[1]);
        const signature = JSON.parse(parts[2]).SD;

        const rd = data.RD[0];

        function parseTimestamp(ts: string): number {
            // Beispiel: "2026-04-16T11:16:49,000+0200 I"

            // 1. Komma ersetzen
            ts = ts.replace(",", ".");

            // 2. Alles nach dem Offset entfernen (z.B. " I")
            ts = ts.replace(/ [A-Z]$/, "");

            // 3. ISO-konform machen: "+0200" → "+02:00"
            ts = ts.replace(/(\+|-)(\d{2})(\d{2})$/, "$1$2:$3");

            // Jetzt ist es gültig für Date.parse()
            return Date.parse(ts) / 1000;
        }

        const ts = parseTimestamp(rd.TM);

        return {
            timestamp: ts,
            meterInfo: {
                firmwareVersion: data.MF,
                publicKey: raw.publicKey,
                meterId: data.ID,
                type: data.MM,
                manufacturer: data.MV
            },
            transactionId: data.PG,
            contract: {
                type: "RFID_TAG_ID",
                timestampLocal: {
                    timestamp: ts,
                    localOffset: 60,
                    seasonOffset: 0
                },
                timestamp: ts,
                id: data.ID.substring(0, 8)
            },
            measurementId: "00000001",
            measuredValue: {
                timestampLocal: {
                    timestamp: ts,
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

    const OCMF1 = raw.ocmfBegin;
    const OCMF2 = raw.ocmfEnd;
    const PKey  = raw.publicKey;

    const begin = parseOCMF(raw.ocmfBegin);
    const end = parseOCMF(raw.ocmfEnd);

    return {
        signedMeterValues: [begin, end],

        // Rohdaten für die OCMF-Klasse
        ocmfRaw: {
            S: OCMF1,
            E: OCMF2,
            P: PKey
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


//______

  //#region Read and parse CTR file

  readAndParseFile(file: File) {

    if (!file)
        return;

    var me = this;
    var reader = new FileReader();
    console.log("ReadAndParseFile:"+file);

    reader.onload = function(event) {
        try
        {
          if(file){

            //--CB--Aufruf der Prüfstrucktur ob OCMF

            const raw = JSON.parse((event.target as any).result);
            const fixed = me.transformToExpectedFormat(raw);

            //me._chargy.detectContentFormat(JSON.parse((event.target as any).result)).
                        //catch((exception) => {
                            //me.doGlobalError("Fehlerhafter Transparenzdatensatz!", exception);
                                   //});

            me._chargy.detectContentFormat(fixed).
                        catch((exception) => {
                         me.doGlobalError("Fehlerhafter Transparenzdatensatz!", exception);
                       });

            //______

            }
        }
        catch (exception) {
            me.doGlobalError("Fehlerhafter Transparenzdatensatz!", exception);
        }
    }

    reader.onerror = function(event) {
        me.doGlobalError("Fehlerhafter Transparenzdatensatz!", event);
    }

    reader.readAsText(file, 'UTF-8');

  }

  //#endregion

  //#region Process pasted CTR file

  async PasteFile() {

    //@ts-ignore
    var clipText = await navigator.clipboard.readText();

    this.importantInfo.style.display  = 'none';
    this.importantInfo.innerHTML      = '';

    try {

      //--CB--Aufruf der Prüfstrucktur ob OCMF

      //await this._chargy.detectContentFormat(JSON.parse(clipText));
        const raw = JSON.parse(clipText);
        const fixed = this.transformToExpectedFormat(raw);

        await this._chargy.detectContentFormat(fixed);
      //______

    }
    catch(exception) {
      this.doGlobalError("Fehlerhafter Transparenzdatensatz!", exception);
    }

  }

//#endregion
  
}

let app = new App();
app.start();
