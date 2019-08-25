import * as chargyLib from './chargyLib';
import * as iface     from './chargyInterfaces';

export abstract class ACrypt {

    readonly description:                   string;
    readonly GetMeter:                      iface.GetMeterFunc;
    readonly CheckMeterPublicKeySignature:  iface.CheckMeterPublicKeySignatureFunc;
    readonly lib                       = new chargyLib.default();

    readonly elliptic: any;
    readonly moment:   any;

    constructor(description:                   string,
                GetMeter:                      iface.GetMeterFunc,
                CheckMeterPublicKeySignature:  iface.CheckMeterPublicKeySignatureFunc) {

        this.description                   = description;
        this.GetMeter                      = GetMeter;
        this.CheckMeterPublicKeySignature  = CheckMeterPublicKeySignature;

        this.elliptic                      = require('elliptic');
        this.moment                        = require('moment');

    }


    protected pad(text: string|undefined, paddingValue: number) {

        if (text == null || text == undefined)
            text = "";

        return (text + Array(2*paddingValue).join('0')).substring(0, 2*paddingValue);

    };


    CreateLine(id:         string,
               value:      string|number,
               valueHEX:   string,
               infoDiv:    HTMLDivElement,
               bufferDiv:  HTMLDivElement)
    {

        var lineDiv = this.lib.CreateDiv(infoDiv, "row");
                      this.lib.CreateDiv(lineDiv, "id",    id);
                      this.lib.CreateDiv(lineDiv, "value", (typeof value === "string" ? value : value.toString()));

        this.AddToVisualBuffer(valueHEX, bufferDiv, lineDiv);

    }


    protected AddToVisualBuffer(valueHEX:   string,
                                bufferDiv:  HTMLDivElement,
                                lineDiv:    HTMLDivElement)
    {

        let newText = this.lib.CreateDiv(bufferDiv, "entry", valueHEX);

        newText.onmouseenter = function(this: GlobalEventHandlers, ev: MouseEvent) {
            lineDiv.children[0].classList.add("overEntry");
            lineDiv.children[1].classList.add("overEntry");
        }

        newText.onmouseleave = function(this: GlobalEventHandlers, ev: MouseEvent) {
            lineDiv.children[0].classList.remove("overEntry");
            lineDiv.children[1].classList.remove("overEntry");
        }

        lineDiv.onmouseenter = function(this: GlobalEventHandlers, ev: MouseEvent) {
            newText.classList.add("overEntry");
        }

        lineDiv.onmouseleave = function(this: GlobalEventHandlers, ev: MouseEvent) {
            newText.classList.remove("overEntry");
        }

    }

    async sha256(message: DataView) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', message);// new TextEncoder().encode(message));
        const hashArray  = Array.from(new Uint8Array(hashBuffer));                                       // convert hash to byte array
        const hashHex    = hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join('').toLowerCase(); // convert bytes to hex string
        return hashHex;
    }

    abstract VerifyChargingSession(chargingSession:   iface.IChargingSession): Promise<iface.ISessionCryptoResult>

    abstract SignMeasurement(measurementValue:        iface.IMeasurementValue,
                             privateKey:              any,
                             publicKey:               any): Promise<iface.ICryptoResult>;

    abstract VerifyMeasurement(measurementValue:      iface.IMeasurementValue): Promise<iface.ICryptoResult>;

    abstract ViewMeasurement(measurementValue:        iface.IMeasurementValue,
                             introDiv:                HTMLDivElement,
                             infoDiv:                 HTMLDivElement,
                             bufferValue:             HTMLDivElement,
                             hashedBufferValue:       HTMLDivElement,
                             publicKeyValue:          HTMLDivElement,
                             signatureExpectedValue:  HTMLDivElement,
                             signatureCheckValue:     HTMLDivElement) : void;

}
