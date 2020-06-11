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
import * as pako from 'pako';

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
    public logo:                        HTMLDivElement;

    public map: any;


    chargingSessionsPage_MovementStartX  = null;
    measurementInfosPage_MovementStartX  = null;
    cryptoDetailsPage_MovementStartX     = null;

    _chargy: chargy;

    start() {

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
        this.logo.style.display = 'block';

    }

    hidePage(page: HTMLDivElement) {
        page.style.display = 'none';
    }

    hideAllPages() {
        this.logo.style.display                       = 'none';
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
        this.logo                       = document.getElementById("logo")                       as HTMLDivElement;
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

        var scannerButton                 = <HTMLButtonElement> document.getElementById('scannerButton');
        scannerButton.onclick             = (event) => this.scanQRCode();


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
    L.tileLayer('https://{s}.tiles.mapbox.com/v4/ahzf.nc811hb2/{z}/{x}/{y}.png?' +
                'access_token=pk.eyJ1IjoiYWh6ZiIsImEiOiJOdEQtTkcwIn0.Cn0iGqUYyA6KPS8iVjN68w',
                {
                  maxZoom:      18,
                  attribution:  '<a href="http://openstreetmap.org">OSM</a> contr., ' +
                                '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                                'Imagery © <a href="http://mapbox.com">Mapbox</a>'
                }).addTo(this.map);

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

  //#region Read and parse CTR file

  readAndParseFile(file: File) {

    if (!file)
        return;

    var me = this;
    var reader = new FileReader();

    reader.onload = function(event) {
        try
        {
            me._chargy.detectContentFormat(JSON.parse((event.target as any).result)).
                       catch((exception) => {
                         me.doGlobalError("Fehlerhafter Transparenzdatensatz!", exception);
                       });
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
  //#region Scan QR Code

  private processQRCodeResult(content: string): void {

    //Example base64 Data
    // const content = "H4sICBEg3l4CA3Rlc3RkYXRhLnNob3J0LnR4dADtV22L20YQ/iuuPobzMfu+6296zZkmvXJ1EpoSjpU0ckRkyUhy0vTIf++sfNe8lH5oaKGFCCPY2dnZeXlmHvkuOna+wm3fDNHmLtrj8GSo/NwOfVh2fo420l6CUEywi6gLYgaXCrRQHy4iX9cjTlNQneYRkbSjZMR2xr7EcU+yyxWPLqJ5eEcHo6dtX2P3GtsDyX5rj+lQI4mtMcxFZA7fTritSZLlj5Ls+lFugSshpHT8EQ8KU7vvsX6KM47PfXdCuvmXu2huDzjN/nAk35SSzFrJ3EV0CGoPgTXteHjnR3yO47QEFzEuyIvjqeza6nt8TxKXx1Y7U6hUMK5zq2NhuFNK60xpyHKbx9qB4Mo4lro0iY3LBGjGE9qxOYADWyRxpoSRlvFMqSxNRWbBpSIWOv30up8oEj+fxvsQlsBG8uH6iP0qfe3HfdvvV2k3nOovvATpbdNAbTkD4zhXnCOQkGlTVVrZBhAbCbZSwKFxFo3nmqkSBdeomVVca00pF0I1srG18+CN0hXXDVSuKQUdZlIwybQvSyUYmYVG1YbJWgBpYSjox5RHHJhbg14L2AFslt9LUqmGwwH7OSQfQ76vsOuG1bth7OrvQi37YU6wGUY8m7BrxtYgd0xvpNkACyZIJW7mJS8cuFiDWDO+Y2Kj5IbxoDEccVzQesYgZTHFcW6bljAcUtv4bsIzbj5DzTyekHwY8e092p/dbEMlXhGmu/0wtvPrA906YXXkSr9hdBW5egjtQOC8oeXbYIlWgnoDOLOsrpCqIShttZaohOZlZbGUGuu64cLXVWmksLzUwJE1dMYBYOWtKpmXtqxYo2XNlVMMnTSVQWkbDyUYKC1HXnmUjBL3CViqgBPc7laHoWy7dn7/DSrfoPIRKq8eZmAYqTScmFQykxbosSIHo0N13h+Da3j1crV9YfNV/vSKpAffnxpfhfkUMhqElIJ59P1EUsrBYvI8bBlnUkq2WTOnFYGKxrWwtGO1FRu+VLenk9VS3vvrboptdruLH99us08REqinW9S+nOh0iQv0Q/vXTTMFotFAxUI/Df1HyYeLvyKDNjhsQdF0j2PluAMZQjqQAQoyoO+cpeVhwe37rfr5uXp3/6ybD5jQmmug2059GwDzIt7tbq+unwXYTGSFVNbsXnt3zt22n3GPo5b3p/K+Ihol5wX8EZDv6+DfEjSwEBGjd1GERvGHYCX/Ib95/PPt7noXP4nOTN6GwvrugTEDV/+K00OchAOtQNkQ3j4ZhjfnbOmFlmeisikIbFiex9KPQ3tu6Wlo5s+pV1zCJVeXHKx7YPWFC2nLsMLo2ELBDBTWaEPlyhOCFugkybizQqkii00CVpEK8CLOBKc3GCJmlWQ2cYYlmXZJUYBiSRo7IagxaDjxXKTLAP1T3RwX/L/5wfCtgb+qgcVXNjCHAIS/1cCEO/O/aWBr2L/cwDorgGVGg0gT6ZLEaPo8KGyuTSIMo/8RSUFLk9IrE5Z6W2iA2ElBTZHmQB1EWNGZLBKXOWUJ8kYrFquMLoszlxOtffgd5MIUk7UMAAA=";

    //compressed base64 data to 
    const data = Uint8Array.from(atob(content), c => c.charCodeAt(0))
    var decompressedData = pako.ungzip(data, { to: 'string' })
    try {
      this._chargy.detectContentFormat(JSON.parse(decompressedData)).
        catch((exception) => {
          this.doGlobalError("Fehlerhafter Transparenzdatensatz!", exception);
        });
    }
    catch (exception) {
      this.doGlobalError("Fehlerhafter Transparenzdatensatz!", exception);
    }
  }

  async scanQRCode() {
    this.hideAllPages();
    QRScanner.scan(this.displayContents.bind(this));
    QRScanner.show();
  }
  
  displayContents = function (err, result) {
    QRScanner.hide();
    QRScanner.destroy();
    if (err) {
      alert(JSON.stringify(err));
      this.showPage(this.startPage);
    } else {
      this.processQRCodeResult(result);
    }
  }
  //#endregion
  //#region Process pasted CTR file

  async PasteFile() {

    //@ts-ignore
    var clipText = await navigator.clipboard.readText();

    this.importantInfo.style.display  = 'none';
    this.importantInfo.innerHTML      = '';

    try {

      await this._chargy.detectContentFormat(JSON.parse(clipText));

    }
    catch(exception) {
      this.doGlobalError("Fehlerhafter Transparenzdatensatz!", exception);
    }

  }

//#endregion
  
}

let app = new App();
app.start();
