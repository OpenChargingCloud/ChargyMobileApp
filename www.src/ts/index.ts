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

declare let cordova: any;

let appVersion:         string;

class App {

  public importantInfo:       HTMLDivElement;
  public inputPage: 		      HTMLDivElement;
  public cryptoDetailsPage:   HTMLDivElement;
  public issueTrackerPage:    HTMLDivElement;
  public aboutPage: 		      HTMLDivElement;

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
  
  hideAllPages() {

    this.inputPage.style.display          = 'none';
    this.cryptoDetailsPage.style.display  = 'none';
    this.issueTrackerPage.style.display   = 'none';
    this.aboutPage.style.display          = 'none';

  }
  
  showPage(page) {

    this.hideAllPages();

    if (page == this.inputPage)
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
  
  
  onDeviceReady() {

    var me = this;
    
    this.importantInfo                = document.getElementById("importantInfo")     as HTMLDivElement;
    this.inputPage                    = document.getElementById("inputPage")         as HTMLDivElement;
	  this.cryptoDetailsPage            = document.getElementById("cryptoDetailsPage") as HTMLDivElement;
	  this.issueTrackerPage             = document.getElementById("issueTrackerPage")  as HTMLDivElement;
	  this.aboutPage                    = document.getElementById("aboutPage")         as HTMLDivElement;
    
    var fileInputButton           = <HTMLButtonElement>   document.getElementById('fileInputButton');
    var fileInput                 = <HTMLInputElement>    document.getElementById('fileInput');
    fileInputButton.onclick = function (this: HTMLElement, ev: MouseEvent) {
      me.importantInfo.style.display              = 'none';
      me.importantInfo.innerHTML                  = '';
      fileInput.click();
    }
   // fileInput.onchange            = readFileFromDisk;

    var pasteButton               = <HTMLButtonElement>   document.getElementById('pasteButton');
    pasteButton.onclick           = function (this: HTMLElement, ev: MouseEvent) {
       me.PasteFile(me);
    }


	  app.showPage(this.inputPage);
	  
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

  //#region Process pasted CTR file

  PasteFile (me) {

    (navigator as any).clipboard.readText().then(function (clipText: string) {

        me.importantInfo.style.display  = 'none';
        me.importantInfo.innerHTML      = '';

        try
        {
            //detectContentFormat(JSON.parse(clipText));
            this.doGlobalError("Ein Transparenzdatensatz!");
        }
        catch (exception) {
            me.doGlobalError("Fehlerhafter Transparenzdatensatz!", exception);
        }

    });

}

//#endregion
  
}

let app = new App();
app.start();
