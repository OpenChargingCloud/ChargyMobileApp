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
import ChargyApp                         from './chargyApp';
import { readQRCodeTextFromImageData }  from '@open-charging-cloud/chargy-core';

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

    private qrScanButton:                 HTMLButtonElement;
    private qrCodeScannerDiv:             HTMLDivElement;
    private qrCodeScannerVideo:           HTMLVideoElement;
    private qrCodeScannerCanvas:          HTMLCanvasElement;
    private qrCodeScannerStatusDiv:       HTMLDivElement;
    private qrCodeScannerErrorDiv:        HTMLDivElement;
    private qrCodeScannerResultDiv:       HTMLDivElement;
    private qrCodeScannerResultText:      HTMLPreElement;
    private qrCodeScannerURLActionsDiv:   HTMLDivElement;
    private qrCodeScannerOpenURLButton:   HTMLButtonElement;
    private qrCodeScannerRescanButton:    HTMLButtonElement;
    private qrCodeScannerCancelButton:    HTMLButtonElement;
    private qrCodeScannerStream:          MediaStream|null = null;
    private qrCodeScannerAnimationFrame:  number|null      = null;
    private qrCodeScannerIsProcessing:    boolean          = false;
    private qrCodeScannerLastText:        string|null      = null;
    private qrCodeScannerLastURL:         URL|null         = null;


    chargingSessionsPage_MovementStartX  = null;
    measurementInfosPage_MovementStartX  = null;
    cryptoDetailsPage_MovementStartX     = null;

    _chargyApp: ChargyApp;

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

        this.qrScanButton                        = document.getElementById('qrScanButton')                        as HTMLButtonElement;
        this.qrCodeScannerDiv                    = document.getElementById('qrCodeScanner')                       as HTMLDivElement;
        this.qrCodeScannerVideo                  = document.getElementById('qrCodeScannerVideo')                  as HTMLVideoElement;
        this.qrCodeScannerCanvas                 = document.getElementById('qrCodeScannerCanvas')                 as HTMLCanvasElement;
        this.qrCodeScannerStatusDiv              = document.getElementById('qrCodeScannerStatus')                 as HTMLDivElement;
        this.qrCodeScannerErrorDiv               = document.getElementById('qrCodeScannerError')                  as HTMLDivElement;
        this.qrCodeScannerResultDiv              = document.getElementById('qrCodeScannerResult')                 as HTMLDivElement;
        this.qrCodeScannerResultText             = document.getElementById('qrCodeScannerResultText')            as HTMLPreElement;
        this.qrCodeScannerURLActionsDiv          = document.getElementById('qrCodeScannerURLActions')            as HTMLDivElement;
        this.qrCodeScannerOpenURLButton          = document.getElementById('qrCodeScannerOpenURLButton')         as HTMLButtonElement;
        this.qrCodeScannerRescanButton           = document.getElementById('qrCodeScannerRescanButton')          as HTMLButtonElement;
        this.qrCodeScannerCancelButton           = document.getElementById('qrCodeScannerCancelButton')          as HTMLButtonElement;

        this.qrScanButton.onclick = async (event: MouseEvent) => {
            event.preventDefault();
            await this.openQRCodeScanner();
        };

        this.qrCodeScannerCancelButton.onclick = (event: MouseEvent) => {
            event.preventDefault();
            this.closeQRCodeScanner();
        };

        this.qrCodeScannerRescanButton.onclick = (event: MouseEvent) => {
            event.preventDefault();
            this.resumeQRCodeScanner();
        };

        this.qrCodeScannerOpenURLButton.onclick = (event: MouseEvent) => {
            event.preventDefault();

            if (this.qrCodeScannerLastURL != null)
            {
                window.open(this.qrCodeScannerLastURL.href, '_blank', 'noopener');
                this.setQRCodeScannerStatus('URL wurde geöffnet.');
            }
        };

        void this.updateQRCodeScannerAvailability();

        if (typeof navigator.mediaDevices?.addEventListener === 'function')
        {
            navigator.mediaDevices.addEventListener('devicechange', () => {
                void this.updateQRCodeScannerAvailability();
            });
        }



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

    this._chargyApp = new ChargyApp(this);

	  app.showPage(this.startPage);
    
  }
  
  onPause() {
    this.closeQRCodeScanner();
  }

  onDeviceResume() {
    void this.updateQRCodeScannerAvailability();
  }


  //#region QR code scanner

  private async updateQRCodeScannerAvailability(): Promise<void>
  {

    const mediaDevices = navigator.mediaDevices;

    if (mediaDevices == null || typeof mediaDevices.getUserMedia !== 'function')
    {
      this.setQRCodeScannerButtonAvailability(false, 'Kamerazugriff wird auf diesem Gerät nicht unterstützt.');
      return;
    }

    if (typeof mediaDevices.enumerateDevices !== 'function')
    {
      this.setQRCodeScannerButtonAvailability(true, 'QR-Code mit der Kamera scannen');
      return;
    }

    try
    {
      const devices   = await mediaDevices.enumerateDevices();
      const hasCamera = devices.some(device => device.kind === 'videoinput');

      this.setQRCodeScannerButtonAvailability(
        hasCamera,
        hasCamera
          ? 'QR-Code mit der Kamera scannen'
          : 'Keine Kamera verfügbar'
      );
    }
    catch
    {
      // Some WebViews do not expose their devices before the first permission request.
      this.setQRCodeScannerButtonAvailability(true, 'QR-Code mit der Kamera scannen');
    }

  }

  private setQRCodeScannerButtonAvailability(isAvailable: boolean,
                                             title:       string): void
  {
    this.qrScanButton.disabled = !isAvailable;
    this.qrScanButton.title    = title;
  }

  private async requestAndroidCameraPermission(): Promise<boolean>
  {

    if (typeof cordova === 'undefined' || cordova.platformId !== 'android')
      return true;

    const permissions = cordova.plugins?.permissions;

    if (permissions == null || typeof permissions.requestPermission !== 'function')
      return false;

    return await new Promise<boolean>(resolve => {
      permissions.requestPermission(
        permissions.CAMERA,
        (status: { hasPermission?: boolean }) => resolve(status?.hasPermission === true),
        () => resolve(false)
      );
    });

  }

  private async openQRCodeScanner(): Promise<void>
  {

    if (this.qrScanButton.disabled)
      return;

    this.resetQRCodeScannerDialog('Kameraberechtigung wird angefragt...');
    this.qrCodeScannerDiv.style.display = 'flex';

    if (!await this.requestAndroidCameraPermission())
    {
      this.closeQRCodeScanner();
      this.doGlobalError('Der Kamerazugriff wurde nicht erlaubt. Bitte erteilen Sie Chargy die Kameraberechtigung in den App-Einstellungen.');
      return;
    }

    this.setQRCodeScannerStatus('Kamera wird gestartet...');

    try
    {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' }
        }
      });

      this.qrCodeScannerStream          = stream;
      this.qrCodeScannerVideo.srcObject = stream;

      await this.qrCodeScannerVideo.play();
      this.resumeQRCodeScanner();
    }
    catch (exception)
    {
      const exceptionName = exception instanceof DOMException
                              ? exception.name
                              : '';

      this.closeQRCodeScanner();
      this.doGlobalError(
        exceptionName === 'NotAllowedError' || exceptionName === 'SecurityError'
          ? 'Der Kamerazugriff wurde nicht erlaubt. Bitte prüfen Sie die Kameraberechtigung für Chargy.'
          : 'Die Kamera konnte nicht gestartet werden.',
        exception
      );
    }

  }

  private closeQRCodeScanner(): void
  {

    if (this.qrCodeScannerAnimationFrame != null)
    {
      cancelAnimationFrame(this.qrCodeScannerAnimationFrame);
      this.qrCodeScannerAnimationFrame = null;
    }

    if (this.qrCodeScannerVideo != null)
    {
      this.qrCodeScannerVideo.pause();
      this.qrCodeScannerVideo.srcObject = null;
    }

    if (this.qrCodeScannerStream != null)
    {
      for (const track of this.qrCodeScannerStream.getTracks())
        track.stop();

      this.qrCodeScannerStream = null;
    }

    if (this.qrCodeScannerDiv != null)
      this.qrCodeScannerDiv.style.display = 'none';

    this.qrCodeScannerIsProcessing = false;
    this.qrCodeScannerLastText     = null;
    this.qrCodeScannerLastURL      = null;

  }

  private resumeQRCodeScanner(): void
  {
    this.qrCodeScannerIsProcessing = false;
    this.qrCodeScannerLastText     = null;
    this.qrCodeScannerLastURL      = null;
    this.resetQRCodeScannerDialog('Kamera bereit. QR-Code in den Rahmen halten.');

    if (this.qrCodeScannerAnimationFrame == null)
      this.scanQRCodeFrame();
  }

  private resetQRCodeScannerDialog(statusText: string): void
  {
    this.qrCodeScannerErrorDiv.textContent             = '';
    this.qrCodeScannerStatusDiv.textContent            = statusText;
    this.qrCodeScannerResultDiv.style.display          = 'none';
    this.qrCodeScannerURLActionsDiv.style.display      = 'none';
    this.qrCodeScannerResultText.textContent           = '';
  }

  private setQRCodeScannerStatus(statusText: string): void
  {
    this.qrCodeScannerStatusDiv.textContent = statusText;
  }

  private scanQRCodeFrame(): void
  {

    if (this.qrCodeScannerDiv.style.display !== 'flex')
    {
      this.qrCodeScannerAnimationFrame = null;
      return;
    }

    if (!this.qrCodeScannerIsProcessing &&
         this.qrCodeScannerVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
         this.qrCodeScannerVideo.videoWidth  > 0 &&
         this.qrCodeScannerVideo.videoHeight > 0)
    {
      const context = this.qrCodeScannerCanvas.getContext('2d', { willReadFrequently: true });

      if (context != null)
      {
        this.qrCodeScannerCanvas.width  = this.qrCodeScannerVideo.videoWidth;
        this.qrCodeScannerCanvas.height = this.qrCodeScannerVideo.videoHeight;

        context.drawImage(
          this.qrCodeScannerVideo,
          0,
          0,
          this.qrCodeScannerCanvas.width,
          this.qrCodeScannerCanvas.height
        );

        const imageData = context.getImageData(
          0,
          0,
          this.qrCodeScannerCanvas.width,
          this.qrCodeScannerCanvas.height
        );
        const qrText = readQRCodeTextFromImageData({
          data:   imageData.data,
          width:  imageData.width,
          height: imageData.height
        });

        if (qrText != null && qrText !== this.qrCodeScannerLastText)
        {
          this.qrCodeScannerLastText = qrText;
          void this.handleScannedQRCodeText(qrText);
        }
      }
    }

    this.qrCodeScannerAnimationFrame = requestAnimationFrame(() => this.scanQRCodeFrame());

  }

  private async handleScannedQRCodeText(qrText: string): Promise<void>
  {
    this.qrCodeScannerIsProcessing = true;
    this.setQRCodeScannerStatus('QR-Code erkannt. Inhalt wird geprüft...');

    const detected = await this._chargyApp.detectContentFormat(
      {
        name: 'qr-code.txt',
        type: 'text/plain',
        data: new TextEncoder().encode(qrText)
      },
      errorMessage => this.showQRCodeScannerRejectedText(qrText, errorMessage)
    );

    if (detected)
      this.closeQRCodeScanner();
  }

  private showQRCodeScannerRejectedText(qrText:      string,
                                        errorMessage: string): void
  {
    const url = this.tryParseQRCodeURL(qrText);

    this.qrCodeScannerErrorDiv.textContent        = errorMessage;
    this.qrCodeScannerResultDiv.style.display     = 'flex';
    this.qrCodeScannerResultText.textContent      = qrText;
    this.qrCodeScannerURLActionsDiv.style.display = url != null ? 'block' : 'none';
    this.qrCodeScannerLastURL                     = url;

    this.setQRCodeScannerStatus(
      url != null
        ? 'Der QR-Code enthält eine URL, aber keinen Transparenzdatensatz.'
        : 'Der QR-Code enthält keinen gültigen Transparenzdatensatz.'
    );
  }

  private tryParseQRCodeURL(qrText: string): URL|null
  {
    try
    {
      const url = new URL(qrText.trim());
      return url.protocol === 'https:' || url.protocol === 'http:'
               ? url
               : null;
    }
    catch
    {
      return null;
    }
  }

  //#endregion



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

  async processFile(file: Blob, fileName: string) {
    await this._chargyApp.detectContentFormat({
      name: fileName,
      type: file.type,
      data: new Uint8Array(await file.arrayBuffer())
    });
  }

  //#region Read and parse CTR file

  async readAndParseFile(file: File) {

    if (!file)
        return;

    try {
      await this.processFile(file, file.name);
    }
    catch (exception) {
      this.doGlobalError("Fehlerhafter Transparenzdatensatz!", exception);
    }

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
              await this.processFile(pdfBlob, "clipboard.pdf");
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

      await this._chargyApp.detectContentFormat(clipText);

    }
    catch(exception) {
      this.doGlobalError("Fehlerhafter Transparenzdatensatz!", exception);
    }

  }

//#endregion
  
}

let app = new App();
app.start();
