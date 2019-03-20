///<reference path="chargyInterfaces.ts" />
///<reference path="chargyLib.ts" />

abstract class ACrypt {

    readonly description:  string;
    readonly GetMeter:     GetMeterFunc;

//    readonly elliptic  = require('elliptic');
    // variable 'crypto' is already defined differently in Google Chrome!
//    readonly crypt     = require('electron').remote.require('crypto');

    constructor(description:  string,
                GetMeter:     GetMeterFunc) { 

        this.description  = description;
        this.GetMeter     = GetMeter;

    }


    CreateLine(id:         string,
               value:      string|number,
               valueHEX:   string,
               infoDiv:    HTMLDivElement,
               bufferDiv:  HTMLDivElement)
    {

        var lineDiv = CreateDiv(infoDiv, "row");
                      CreateDiv(lineDiv, "id",    id);
                      CreateDiv(lineDiv, "value", (typeof value === "string" ? value : value.toString()));

        this.AddToBuffer(valueHEX, bufferDiv, lineDiv);

    }


    AddToBuffer(valueHEX:   string,
                bufferDiv:  HTMLDivElement,
                lineDiv:    HTMLDivElement) 
    {

        let newText = CreateDiv(bufferDiv, "entry", valueHEX);

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

    async sha256(message) {
        //const msgUint8 = new TextEncoder().encode(message);                             // encode as UTF-8
        const hashBuffer = await crypto.subtle.digest('SHA-256', message);             // hash the message
        const hashArray = Array.from(new Uint8Array(hashBuffer));                       // convert hash to byte array
        const hashHex = hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join(''); // convert bytes to hex string
        return hashHex;
    }        

    abstract VerifyChargingSession(chargingSession:   IChargingSession): ISessionCryptoResult;

    abstract SignMeasurement(measurementValue:        IMeasurementValue,
                             privateKey:              any,
                             publicKey:               any): ICryptoResult;

    abstract VerifyMeasurement(measurementValue:      IMeasurementValue): ICryptoResult;

    abstract ViewMeasurement(measurementValue:        IMeasurementValue,
                             introDiv:                HTMLDivElement,
                             infoDiv:                 HTMLDivElement,
                             bufferValue:             HTMLDivElement,
                             hashedBufferValue:       HTMLDivElement,
                             publicKeyValue:          HTMLDivElement,
                             signatureExpectedValue:  HTMLDivElement,
                             signatureCheckValue:     HTMLDivElement) : void;

}
