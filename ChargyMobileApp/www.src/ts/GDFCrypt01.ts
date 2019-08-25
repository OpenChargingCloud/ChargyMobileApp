import * as elliptic  from 'elliptic';
import * as ACrypt    from './ACrypt';
import * as chargyLib from './chargyLib';
import * as iface     from './chargyInterfaces';

interface IGDFMeasurementValue extends iface.IMeasurementValue
{
    prevSignature:                 string,
}

interface IGDFCrypt01Result extends iface.ICryptoResult
{
    sha256value?:                  any,
    meterId?:                      string,
    meter?:                        iface.IMeter,
    timestamp?:                    string,
    obis?:                         string,
    unitEncoded?:                  string,
    scale?:                        string,
    value?:                        string,
    authorizationStart?:           string,
    authorizationStartTimestamp?:  string,
    publicKey?:                    string,
    publicKeyFormat?:              string,
    signature?:                    iface.IECCSignature
}

export default class GDFCrypt01 extends ACrypt.ACrypt {

    readonly curve  = new elliptic.ec('p256');
    readonly lib    = new chargyLib.default();

    constructor(GetMeter:                      iface.GetMeterFunc,
                CheckMeterPublicKeySignature:  iface.CheckMeterPublicKeySignatureFunc) {

        super("ECC secp256r1",
              GetMeter,
              CheckMeterPublicKeySignature);

    }


    GenerateKeyPair(options?: elliptic.ec.GenKeyPairOptions)
    {
        return this.curve.genKeyPair(options);
        // privateKey     = keypair.getPrivate();
        // publicKey      = keypair.getPublic();
        // privateKeyHEX  = privateKey.toString('hex').toLowerCase();
        // publicKeyHEX   = publicKey.encode('hex').toLowerCase();
    }


    async SignMeasurement(measurementValue:  IGDFMeasurementValue,
                          privateKey:        any,
                          publicKey:         any): Promise<IGDFCrypt01Result>
    {

        var buffer                       = new ArrayBuffer(320);
        var cryptoBuffer                 = new DataView(buffer);

        var cryptoResult:IGDFCrypt01Result = {
            status:                       iface.VerificationResult.InvalidSignature,
            meterId:                      this.lib.SetText     (cryptoBuffer, measurementValue.measurement.energyMeterId,                                  0),
            timestamp:                    this.lib.SetTimestamp(cryptoBuffer, measurementValue.timestamp,                                                 10),
            obis:                         this.lib.SetHex      (cryptoBuffer, measurementValue.measurement.obis,                                          23, false),
            unitEncoded:                  this.lib.SetInt8     (cryptoBuffer, measurementValue.measurement.unitEncoded,                                   29),
            scale:                        this.lib.SetInt8     (cryptoBuffer, measurementValue.measurement.scale,                                         30),
            value:                        this.lib.SetUInt64   (cryptoBuffer, measurementValue.value,                                                     31, true),
            authorizationStart:           this.lib.SetHex      (cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart["@id"],     41),
            authorizationStartTimestamp:  this.lib.SetTimestamp(cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart.timestamp, 169)
        };

        cryptoResult.sha256value  = await this.sha256(cryptoBuffer);

        cryptoResult.publicKey    = publicKey.encode('hex').
                                              toLowerCase();

        const signature           = this.curve.keyFromPrivate(privateKey.toString('hex')).
                                               sign(cryptoResult.sha256value);

        switch (measurementValue.measurement.signatureInfos.format)
        {

            case iface.SignatureFormats.DER:

                cryptoResult.signature = {
                    algorithm:  measurementValue.measurement.signatureInfos.algorithm,
                    format:     measurementValue.measurement.signatureInfos.format,
                    value:      signature.toDER('hex'),
                    r:          null,
                    s:          null
                };

                return cryptoResult;


            case iface.SignatureFormats.rs:

                cryptoResult.signature = {
                    algorithm:  measurementValue.measurement.signatureInfos.algorithm,
                    format:     measurementValue.measurement.signatureInfos.format,
                    r:          signature.r.toString(),
                    s:          signature.s.toString()
                };

                return cryptoResult;


            //default:


        }

        cryptoResult.status = iface.VerificationResult.ValidSignature;
        return cryptoResult;

    }


    async VerifyChargingSession(chargingSession:   iface.IChargingSession): Promise<iface.ISessionCryptoResult>
    {

        var sessionResult = iface.SessionVerificationResult.UnknownSessionFormat;

        if (chargingSession.measurements)
        {
            for (var measurement of chargingSession.measurements)
            {

                measurement.chargingSession = chargingSession;

                // Must include at least two measurements (start & stop)
                if (measurement.values && measurement.values.length > 1)
                {

                    // Validate...
                    for (var measurementValue of measurement.values)
                    {
                        measurementValue.measurement = measurement;
                        await this.VerifyMeasurement(measurementValue as IGDFMeasurementValue);
                    }


                    // Find an overall result...
                    sessionResult = iface.SessionVerificationResult.ValidSignature;

                    for (var measurementValue of measurement.values)
                    {
                        if (sessionResult                  == iface.SessionVerificationResult.ValidSignature &&
                            measurementValue.result.status != iface.VerificationResult.ValidSignature)
                        {
                            sessionResult = iface.SessionVerificationResult.InvalidSignature;
                        }
                    }

                }

                else
                    sessionResult = iface.SessionVerificationResult.AtLeastTwoMeasurementsExpected;

            }
        }

        return {
            status: sessionResult
        } ;

    }


    async VerifyMeasurement(measurementValue:  IGDFMeasurementValue): Promise<IGDFCrypt01Result>
    {

        function setResult(vr: iface.VerificationResult)
        {
            cryptoResult.status     = vr;
            measurementValue.result = cryptoResult;
            return cryptoResult;
        }

        var buffer        = new ArrayBuffer(320);
        var cryptoBuffer  = new DataView(buffer);

        var cryptoResult:IGDFCrypt01Result = {
            status:                       iface.VerificationResult.InvalidSignature,
            meterId:                      this.lib.SetText     (cryptoBuffer, measurementValue.measurement.energyMeterId,                                  0),
            timestamp:                    this.lib.SetTimestamp(cryptoBuffer, measurementValue.timestamp,                                                 10),
            obis:                         this.lib.SetHex      (cryptoBuffer, measurementValue.measurement.obis,                                          23, false),
            unitEncoded:                  this.lib.SetInt8     (cryptoBuffer, measurementValue.measurement.unitEncoded,                                   29),
            scale:                        this.lib.SetInt8     (cryptoBuffer, measurementValue.measurement.scale,                                         30),
            value:                        this.lib.SetUInt64   (cryptoBuffer, measurementValue.value,                                                     31, true),
            authorizationStart:           this.lib.SetHex      (cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart["@id"],     41),
            authorizationStartTimestamp:  this.lib.SetTimestamp(cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart.timestamp, 169)
        };

        var signatureExpected = measurementValue.signatures[0] as iface.IECCSignature;
        if (signatureExpected != null)
        {

            try
            {

                cryptoResult.signature = {
                    algorithm:  measurementValue.measurement.signatureInfos.algorithm,
                    format:     measurementValue.measurement.signatureInfos.format,
                    r:          signatureExpected.r,
                    s:          signatureExpected.s
                };

                cryptoResult.sha256value = await this.sha256(cryptoBuffer);


                const meter = this.GetMeter(measurementValue.measurement.energyMeterId);
                if (meter != null)
                {

                    cryptoResult.meter = meter;

                    var iPublicKey = meter.publicKeys[0] as iface.IPublicKey;
                    if (iPublicKey != null)
                    {

                        try
                        {

                            cryptoResult.publicKey        = iPublicKey.value.toLowerCase();
                            cryptoResult.publicKeyFormat  = iPublicKey.format;

                            try
                            {

                                if (this.curve.keyFromPublic(cryptoResult.publicKey, 'hex').
                                               verify       (cryptoResult.sha256value,
                                                             cryptoResult.signature))
                                {
                                    return setResult(iface.VerificationResult.ValidSignature);
                                }

                                return setResult(iface.VerificationResult.InvalidSignature);

                            }
                            catch (exception)
                            {
                                return setResult(iface.VerificationResult.InvalidSignature);
                            }

                        }
                        catch (exception)
                        {
                            return setResult(iface.VerificationResult.InvalidPublicKey);
                        }

                    }

                    else
                        return setResult(iface.VerificationResult.PublicKeyNotFound);

                }

                else
                    return setResult(iface.VerificationResult.EnergyMeterNotFound);

            }
            catch (exception)
            {
                return setResult(iface.VerificationResult.InvalidSignature);
            }

        }

    }


    ViewMeasurement(measurementValue:        iface.IMeasurementValue,
                    introDiv:                HTMLDivElement,
                    infoDiv:                 HTMLDivElement,
                    bufferValue:             HTMLDivElement,
                    hashedBufferValue:       HTMLDivElement,
                    publicKeyValue:          HTMLDivElement,
                    signatureExpectedValue:  HTMLDivElement,
                    signatureCheckValue:     HTMLDivElement)
    {

        const result    = measurementValue.result as IGDFCrypt01Result;

        const cryptoDiv = this.lib.CreateDiv(introDiv,  "row");
                          this.lib.CreateDiv(cryptoDiv, "id",    "Kryptoverfahren");
                          this.lib.CreateDiv(cryptoDiv, "value", "GDFCrypt01 (" + this.description + ")");

        hashedBufferValue.parentElement.children[0].innerHTML = "Hashed Puffer (SHA256)";

        this.CreateLine("Zählernummer",             measurementValue.measurement.energyMeterId,                                          result.meterId,                      infoDiv, bufferValue);
        this.CreateLine("Zeitstempel",              this.lib.parseUTC(measurementValue.timestamp),                                                result.timestamp,                    infoDiv, bufferValue);
        this.CreateLine("OBIS-Kennzahl",            this.lib.parseOBIS(measurementValue.measurement.obis),                                        result.obis,                         infoDiv, bufferValue);
        this.CreateLine("Einheit (codiert)",        measurementValue.measurement.unitEncoded,                                            result.unitEncoded,                  infoDiv, bufferValue);
        this.CreateLine("Skalierung",               measurementValue.measurement.scale,                                                  result.scale,                        infoDiv, bufferValue);
        this.CreateLine("Messwert",                 measurementValue.value + " Wh",                                                      result.value,                        infoDiv, bufferValue);
        this.CreateLine("Autorisierung",            measurementValue.measurement.chargingSession.authorizationStart["@id"],              result.authorizationStart,           infoDiv, bufferValue);
        this.CreateLine("Autorisierungszeitpunkt",  this.lib.parseUTC(measurementValue.measurement.chargingSession.authorizationStart.timestamp), result.authorizationStartTimestamp,  infoDiv, bufferValue);


        // Buffer
        bufferValue.parentElement.children[0].innerHTML = "Puffer";
        hashedBufferValue.innerHTML      = "0x" + result.sha256value;


        // Public Key
        publicKeyValue.parentElement.children[0].innerHTML = "Public Key";
        
        if (result.publicKeyFormat)
            publicKeyValue.parentElement.children[0].innerHTML += " (" + result.publicKeyFormat + ")";

        publicKeyValue.innerHTML         = "0x" + result.publicKey;


        // Signature
        signatureExpectedValue.parentElement.children[0].innerHTML = "Erwartete Signatur (" + result.signature.format + ")";

        if (result.signature.r && result.signature.s)
            signatureExpectedValue.innerHTML = "r: 0x" + result.signature.r.toLowerCase() + "<br />" + "s: 0x" + result.signature.s.toLowerCase();

        else if (result.signature.value)
            signatureExpectedValue.innerHTML = "0x" + result.signature.value.toLowerCase();


        // Result
        switch (result.status)
        {

            case iface.VerificationResult.UnknownCTRFormat:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Unbekanntes Transparenzdatenformat</div>';
                break;

            case iface.VerificationResult.EnergyMeterNotFound:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültiger Energiezähler</div>';
                break;

            case iface.VerificationResult.PublicKeyNotFound:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültiger Public Key</div>';
                break;

            case iface.VerificationResult.InvalidPublicKey:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültiger Public Key</div>';
                break;

            case iface.VerificationResult.InvalidSignature:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültige Signatur</div>';
                break;

            case iface.VerificationResult.ValidSignature:
                signatureCheckValue.innerHTML = '<i class="fas fa-check-circle"></i><div id="description">Gültige Signatur</div>';
                break;


            default:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültige Signatur</div>';
                break;

        }

    }

}