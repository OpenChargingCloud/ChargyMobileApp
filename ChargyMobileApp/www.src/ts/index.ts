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
import { transformToExpectedFormat } from './chargeDataParser';
import { extractTransparencyRecordsFromPdf } from './pdfAttachmentExtractor';

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
    return transformToExpectedFormat(raw);
}

  async processTransparencyRecord(raw: any) {
    const fixed = this.transformToExpectedFormat(raw);
    await this._chargy.detectContentFormat(fixed);
  }

  async processPdfFile(file: File) {
    const records = await extractTransparencyRecordsFromPdf(await file.arrayBuffer());

    for (const record of records)
      await this.processTransparencyRecord(record.content);
  }

  async processPdfBlob(blob: Blob) {
    const records = await extractTransparencyRecordsFromPdf(await blob.arrayBuffer());

    for (const record of records)
      await this.processTransparencyRecord(record.content);
  }

  isPdfFile(file: File): boolean {
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  }


//______

  //#region Read and parse CTR file

  async readAndParseFile(file: File) {

    if (!file)
        return;

    if (this.isPdfFile(file)) {
        try {
            await this.processPdfFile(file);
        }
        catch (exception) {
            this.doGlobalError("Fehlerhafter PDF/A-3 Transparenzdatensatz!", exception);
        }
        return;
    }

    var me = this;
    var reader = new FileReader();
    console.log("ReadAndParseFile:"+file);

    reader.onload = function(event) {
        try
        {
          if(file){

            //--CB--Aufruf der Prüfstrucktur ob OCMF

            const raw = JSON.parse((event.target as any).result);
            me.processTransparencyRecord(raw).
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

    this.importantInfo.style.display  = 'none';
    this.importantInfo.innerHTML      = '';

    try {

      if ((navigator.clipboard as any).read) {
        try {
          const clipboardItems = await (navigator.clipboard as any).read();

          for (const clipboardItem of clipboardItems) {
            if (clipboardItem.types && clipboardItem.types.indexOf("application/pdf") >= 0) {
              const pdfBlob = await clipboardItem.getType("application/pdf");
              await this.processPdfBlob(pdfBlob);
              return;
            }
          }
        }
        catch (exception) {
          console.log("Clipboard PDF read failed, falling back to text clipboard.");
          console.log(exception);
        }
      }

      //@ts-ignore
      var clipText = await navigator.clipboard.readText();

      //--CB--Aufruf der Prüfstrucktur ob OCMF

      //await this._chargy.detectContentFormat(JSON.parse(clipText));
        const raw = JSON.parse(clipText);

        await this.processTransparencyRecord(raw);
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
