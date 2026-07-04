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

//import 'core-js';
import ChargyApp                         from './chargyApp';
import { readQRCodeTextFromImageData }  from '@open-charging-cloud/chargy-core';
import {
    isSupportedLanguage,
    resolveInitialUILanguage,
    SupportedLanguage
}                                      from './i18n';
import {
    browserFileNameFromNameAndType,
    browserFileTypeFromNameOrData,
    normalizeDroppedSVGImageData
}                                      from './browserFiles';
import {
    readClipboardContent,
    readCordovaClipboardContent
}                                      from './clipboard';

declare let cordova: any;
declare const __APP_PACKAGE__: { version: string; dependencies: Record<string, string>; devDependencies: Record<string, string> };
declare const __NPM_PACKAGE_VERSIONS__: Record<string, string>;
declare const __CHARGY_CORE_VERSION__: string;
declare const __CHARGY_CORE_SHA512__: string;

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

    private UILanguage:                  SupportedLanguage;
    private languageButton:              HTMLButtonElement;
    private languageMenuDiv:             HTMLDivElement;
    private languageFlagImage:           HTMLImageElement;
    private aboutButton:                 HTMLButtonElement;

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
        this.UILanguage = this.getInitialUILanguage();
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

        this._chargyApp                 = new ChargyApp(this, this.UILanguage);

        this.languageButton             = document.getElementById('languageButton')             as HTMLButtonElement;
        this.languageMenuDiv            = document.getElementById('languageMenu')               as HTMLDivElement;
        this.languageFlagImage          = document.getElementById('languageFlag')               as HTMLImageElement;
        this.aboutButton                = document.getElementById('aboutButton')                 as HTMLButtonElement;
        this.setupLanguageSelector();
        void this.setUILanguage(this.UILanguage, false);
        this.setupAboutPage();

        var fileInputButton             = <HTMLButtonElement> document.getElementById('fileInputButton');
        var fileInput                   = <HTMLInputElement>  document.getElementById('fileInput');
        fileInputButton.onclick         = (event) => {
            this.importantInfo.style.display  = 'none';
            this.importantInfo.innerHTML      = '';
            fileInput.value = '';
            fileInput.click();
        }

        fileInput.onchange = async (event: Event) => {
            const input = event.target;
            if (input instanceof HTMLInputElement && input.files != null)
                await this.readAndParseFiles(input.files);
        };

        this.setupBrowserDragAndDrop();

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
                this.setQRCodeScannerStatus(this.t('urlWasOpened'));
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

	  app.showPage(this.startPage);
    
  }

  //#region UI language handling

  private getInitialUILanguage(): SupportedLanguage
  {
    return resolveInitialUILanguage(
      localStorage.getItem('ChargyUILanguage'),
      [ navigator.language, ...(navigator.languages ?? []) ]
    );
  }

  private setupLanguageSelector(): void
  {
    this.languageButton.onclick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const isOpen = this.languageMenuDiv.classList.toggle('open');
      this.languageButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    };

    for (const languageMenuButton of Array.from(this.languageMenuDiv.querySelectorAll<HTMLButtonElement>('button[data-language]')))
    {
      languageMenuButton.onclick = async (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const language = languageMenuButton.dataset['language'];
        if (isSupportedLanguage(language))
          await this.setUILanguage(language);
      };
    }

    document.addEventListener('click', () => {
      this.languageMenuDiv.classList.remove('open');
      this.languageButton.setAttribute('aria-expanded', 'false');
    });
  }

  private async setUILanguage(language: SupportedLanguage,
                              persist:  boolean = true): Promise<void>
  {
    this.UILanguage = language;
    this._chargyApp.setUILanguage(language);

    if (persist)
      localStorage.setItem('ChargyUILanguage', language);

    this.applyTranslations();

    if (this.qrScanButton != null)
      await this.updateQRCodeScannerAvailability();
  }

  private applyTranslations(): void
  {
    document.documentElement.lang = this.UILanguage;

    for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-i18n-key]')))
    {
      const key = element.dataset['i18nKey'];
      if (key != null)
        element.innerHTML = this.t(key);
    }

    for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-i18n-title-key]')))
    {
      const key = element.dataset['i18nTitleKey'];
      if (key != null)
        element.title = this.t(key);
    }

    for (const element of Array.from(document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder-key]')))
    {
      const key = element.dataset['i18nPlaceholderKey'];
      if (key != null)
        element.placeholder = this.t(key);
    }

    for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-i18n-aria-label-key]')))
    {
      const key = element.dataset['i18nAriaLabelKey'];
      if (key != null)
        element.setAttribute('aria-label', this.t(key));
    }

    this.languageButton.title = this.t('languageButtonTitle');
    this.languageButton.setAttribute('aria-label', this.languageButton.title);
    this.languageMenuDiv.classList.remove('open');
    this.languageButton.setAttribute('aria-expanded', 'false');
    this.languageFlagImage.src = 'images/flags/' + this.UILanguage + '.svg';

    const chargyCoreHashText = this.aboutPage?.querySelector<HTMLDivElement>('#chargyCoreHash #text');
    if (chargyCoreHashText != null)
      chargyCoreHashText.textContent = this.t('chargyCoreHashLabel').replace('{version}', __CHARGY_CORE_VERSION__);

    for (const languageMenuButton of Array.from(this.languageMenuDiv.querySelectorAll<HTMLButtonElement>('button[data-language]')))
    {
      const isActive = languageMenuButton.dataset['language'] === this.UILanguage;
      languageMenuButton.classList.toggle('active', isActive);
      languageMenuButton.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  private t(key: string): string
  {
    return this._chargyApp.getLocalizedMessage(key);
  }

  //#endregion
  
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
      this.setQRCodeScannerButtonAvailability(false, this.t('cameraAccessUnsupported'));
      return;
    }

    if (typeof mediaDevices.enumerateDevices !== 'function')
    {
      this.setQRCodeScannerButtonAvailability(true, this.t('scanQRCodeWithCamera'));
      return;
    }

    try
    {
      const devices   = await mediaDevices.enumerateDevices();
      const hasCamera = devices.some(device => device.kind === 'videoinput');

      this.setQRCodeScannerButtonAvailability(
        hasCamera,
        hasCamera
          ? this.t('scanQRCodeWithCamera')
          : this.t('noCameraAvailable')
      );
    }
    catch
    {
      // Some WebViews do not expose their devices before the first permission request.
      this.setQRCodeScannerButtonAvailability(true, this.t('scanQRCodeWithCamera'));
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

    this.resetQRCodeScannerDialog(this.t('cameraPermissionRequested'));
    this.qrCodeScannerDiv.style.display = 'flex';

    if (!await this.requestAndroidCameraPermission())
    {
      this.closeQRCodeScanner();
      this.doGlobalError(this.t('cameraAccessDeniedSettings'));
      return;
    }

    this.setQRCodeScannerStatus(this.t('cameraStarting'));

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
          ? this.t('cameraAccessDenied')
          : this.t('cameraCouldNotStart'),
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
    this.resetQRCodeScannerDialog(this.t('cameraReady'));

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
    this.setQRCodeScannerStatus(this.t('qrCodeDetected'));

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
        ? this.t('qrCodeContainsURL')
        : this.t('qrCodeContainsNoRecord')
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

  private setupBrowserDragAndDrop(): void {
    if (typeof cordova !== 'undefined' &&
        (cordova.platformId === 'android' || cordova.platformId === 'ios'))
      return;

    this.startPage.addEventListener('dragenter', (event: DragEvent) => {
      event.preventDefault();
      this.startPage.classList.add('over');
    }, false);

    this.startPage.addEventListener('dragover', (event: DragEvent) => {
      event.stopPropagation();
      event.preventDefault();
      if (event.dataTransfer != null)
        event.dataTransfer.dropEffect = 'copy';
      this.startPage.classList.add('over');
    }, false);

    this.startPage.addEventListener('dragleave', (event: DragEvent) => {
      if (event.relatedTarget == null || !this.startPage.contains(event.relatedTarget as Node))
        this.startPage.classList.remove('over');
    }, false);

    this.startPage.addEventListener('drop', (event: DragEvent) => {
      event.stopPropagation();
      event.preventDefault();
      this.startPage.classList.remove('over');

      if (event.dataTransfer?.files != null && event.dataTransfer.files.length > 0)
        void this.readAndParseFiles(event.dataTransfer.files);
    }, false);
  }

  private setupAboutPage(): void {
    const version = (value?: string) => value?.replace(/^[^0-9]*/, '') ?? '';
    (document.getElementById('appVersion') as HTMLSpanElement).textContent = __APP_PACKAGE__.version;
    const versions: Record<string, string> = {
      chargyMobileVersion: __APP_PACKAGE__.version,
      chargyCoreVersion: __CHARGY_CORE_VERSION__,
      typeScript: version(__APP_PACKAGE__.devDependencies.typescript), SASS: version(__APP_PACKAGE__.devDependencies.sass),
      cordova: version(__APP_PACKAGE__.devDependencies.cordova), momentJS: version(__APP_PACKAGE__.dependencies.moment),
      cordovaInAppBrowser: version(__APP_PACKAGE__.devDependencies['cordova-plugin-inappbrowser']),
      elliptic: version(__APP_PACKAGE__.dependencies.elliptic), asn1JS: version(__APP_PACKAGE__.dependencies['asn1.js']),
      base32Decode: version(__APP_PACKAGE__.dependencies['base32-decode']), bufferJS: version(__APP_PACKAGE__.dependencies.buffer),
      chartJS: version(__APP_PACKAGE__.dependencies['chart.js']), leafletJS: version(__APP_PACKAGE__.dependencies.leaflet),
      leafletAwesomeMarkers: version(__APP_PACKAGE__.dependencies['leaflet.awesome-markers']),
      pdfjsdist: version(__APP_PACKAGE__.dependencies['pdfjs-dist']), webpack: version(__APP_PACKAGE__.devDependencies.webpack),
      seekBzip: __NPM_PACKAGE_VERSIONS__['seek-bzip'] ?? '', fileType: __NPM_PACKAGE_VERSIONS__['file-type'] ?? '',
      jsQR: __NPM_PACKAGE_VERSIONS__.jsqr ?? '', decimalJS: __NPM_PACKAGE_VERSIONS__['decimal.js'] ?? '',
      fontAwesome: '5.2.0'
    };
    for (const [id, packageVersion] of Object.entries(versions))
      for (const element of Array.from(document.querySelectorAll<HTMLSpanElement>(`#${id}`)))
        element.textContent = packageVersion;

    (this.aboutPage.querySelector('#chargyCoreHash #value') as HTMLDivElement).textContent = this.formatHash(__CHARGY_CORE_SHA512__);

    for (const link of Array.from(this.aboutPage.querySelectorAll<HTMLElement>('[href]'))) {
      link.onclick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const url = link.getAttribute('href');
        if (url != null)
          this.openExternalURL(url);
      };
    }

    this.aboutButton.onclick = () => { this.showPage(this.aboutPage); void this.calculateApplicationHash(); };
    (document.getElementById('aboutBackButton') as HTMLButtonElement).onclick = () => this.showPage(this.startPage);
  }

  private formatHash(hash: string): string { return hash.match(/.{1,8}/g)?.join(' ') ?? hash; }

  private openExternalURL(url: string): void {
    let externalURL: URL;

    try {
      externalURL = new URL(url);
    } catch {
      return;
    }

    if (externalURL.protocol !== 'https:' && externalURL.protocol !== 'http:')
      return;

    if (typeof cordova !== 'undefined' &&
        (cordova.platformId === 'android' || cordova.platformId === 'ios') &&
        cordova.InAppBrowser?.open != null)
      cordova.InAppBrowser.open(externalURL.href, '_system');
    else
      window.open(externalURL.href, '_blank', 'noopener,noreferrer');
  }

  private async calculateApplicationHash(): Promise<void> {
    const target = this.aboutPage.querySelector('#applicationHash #value') as HTMLDivElement;
    if (target.dataset.ready === 'true') return;
    try {
      const files = ['index.html', 'css/chargy.css', 'js/bundle.js'];
      const hashes = await Promise.all(files.map(async file => crypto.subtle.digest('SHA-512', await (await fetch(file)).arrayBuffer())));
      const length = hashes.reduce((sum, hash) => sum + hash.byteLength, 0);
      const combined = new Uint8Array(length); let offset = 0;
      for (const hash of hashes) { combined.set(new Uint8Array(hash), offset); offset += hash.byteLength; }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-512', combined)), byte => byte.toString(16).padStart(2, '0')).join('');
      target.textContent = this.formatHash(hash); target.dataset.ready = 'true';
    } catch (error) { target.textContent = 'Hashwert konnte nicht berechnet werden.'; console.error(error); }
  }

  //#region Read and parse CTR file

  async readAndParseFiles(files: FileList | readonly File[]) {
    const filesToLoad = Array.from(files);

    if (filesToLoad.length === 0)
      return;

    this.importantInfo.style.display = 'none';
    this.importantInfo.innerHTML = '';

    try {
      const fileInfos = await Promise.all(filesToLoad.map(async file => {
        const name = file.name.trim() !== '' ? file.name : 'unknown';
        const rawData = await file.arrayBuffer();
        const type = browserFileTypeFromNameOrData(name, file.type, rawData);
        const normalizedName = browserFileNameFromNameAndType(name, type);

        return {
          name: normalizedName,
          path: 'file://' + normalizedName,
          type,
          data: normalizeDroppedSVGImageData(normalizedName, type, rawData)
        };
      }));

      await this._chargyApp.detectContentFormat(fileInfos);
    }
    catch (exception) {
      this.doGlobalError(this.t('invalidChargeTransparencyRecord'), exception);
    }
  }

  //#endregion

  //#region Process pasted CTR file

  async PasteFile() {

    this.importantInfo.style.display  = 'none';
    this.importantInfo.innerHTML      = '';

    try {
      const usesNativeClipboard = typeof cordova !== 'undefined' &&
                                  (cordova.platformId === 'android' || cordova.platformId === 'ios');
      const content = usesNativeClipboard
        ? await readCordovaClipboardContent(cordova.exec.bind(cordova))
        : await readClipboardContent(navigator.clipboard);

      if (content.kind === 'file')
        await this.processFile(content.blob, content.fileName);
      else
        await this._chargyApp.detectContentFormat(content.text);

    }
    catch(exception) {
      this.doGlobalError(this.t('clipboardReadFailed'), exception);
    }

  }

//#endregion
  
}

let app = new App();
app.start();
