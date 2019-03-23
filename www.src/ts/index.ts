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
import 'core-js';
import chargy from './chargy';

declare let cordova: any;

// @ts-ignore
var leaflet: any = L;

let appVersion:         string;

export default class App {

  public importantInfo:               HTMLDivElement;
  public startPage: 		              HTMLDivElement;
  public chargingSessionsPage:        HTMLDivElement;
  public cryptoDetailsPage:           HTMLDivElement;
  public issueTrackerPage:            HTMLDivElement;
  public aboutPage: 		              HTMLDivElement;

  public map: any;
  

  chargingSessionsPage_MovementStartX = null;

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

  }

  hidePage(page: HTMLDivElement) {
    page.style.display = 'none';
  }

  hideAllPages() {

    this.startPage.style.display                  = 'none';
    this.chargingSessionsPage.style.display       = 'none';
    this.cryptoDetailsPage.style.display          = 'none';
    this.issueTrackerPage.style.display           = 'none';
    this.aboutPage.style.display                  = 'none';

  }
  
  
  onDeviceReady() {

    var me = this;
    
    this.importantInfo              = document.getElementById("importantInfo")              as HTMLDivElement;
    this.startPage                  = document.getElementById("startPage")                  as HTMLDivElement;
    this.chargingSessionsPage       = document.getElementById("chargingSessionsPage")       as HTMLDivElement;
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

    function lock(e) {

      me.chargingSessionsPage_MovementStartX = (e.changedTouches
                                                    ? e.changedTouches[0]
                                                    : e).clientX;

    };

    function move(e) {

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

    this.chargingSessionsPage.addEventListener('mousedown',  lock, false);
    this.chargingSessionsPage.addEventListener('touchstart', lock, false);

    this.chargingSessionsPage.addEventListener('mouseup',    move, false);
    this.chargingSessionsPage.addEventListener('touchend',   move, false);

    //#endregion

    //#region Create the map

    var ACCESS_TOKEN = "pk.eyJ1IjoiYWh6ZiIsImEiOiJOdEQtTkcwIn0.Cn0iGqUYyA6KPS8iVjN68w";

    //@ts-ignore
    leaflet = L;
    //@ts-ignore
    this.map     = L.map('map').setView([49.7325504,10.1424442], 13);

    //@ts-ignore
    L.tileLayer('https://{s}.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=' + ACCESS_TOKEN, {
        maxZoom: 18,
        attribution: '<a href="http://openstreetmap.org">OSM</a> contr., ' +
        '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
        'Imagery © <a href="http://mapbox.com">Mapbox</a>',
        id: 'ahzf.nc811hb2'
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
