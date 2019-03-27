import * as ACrypt from './ACrypt';

export interface IApp {

    importantInfo:               HTMLDivElement;
    startPage: 		             HTMLDivElement;
    chargingSessionsPage:        HTMLDivElement;
    measurementInfosPage:        HTMLDivElement;
    cryptoDetailsPage:           HTMLDivElement;
    issueTrackerPage:            HTMLDivElement;
    aboutPage: 		             HTMLDivElement;

    map: any;
    showPage(page: HTMLDivElement): void;
    hidePage(page: HTMLDivElement): void;
    
}

export interface GetChargingPoolFunc {
    (Id: String): IChargingPool;
}

export interface GetChargingStationFunc {
    (Id: String): IChargingStation;
}

export interface GetEVSEFunc {
    (Id: String): IEVSE;
}

export interface GetMeterFunc {
    (Id: String): IMeter;
}

export interface IChargeTransparencyRecord
{
    "@id":                      string;
    "@context":                 string;
    begin:                      string;
    end:                        string;
    description:                {};
    contract:                   IContract;
    chargingStationOperators:   Array<IChargingStationOperator>;
    chargingPools:              Array<IChargingPool>;
    chargingStations:           Array<IChargingStation>;
    chargingSessions:           Array<IChargingSession>;
    eMobilityProviders:         Array<IEMobilityProvider>;
    mediationServices:          Array<IMediationService>;
}

export interface IContract
{
    "@id":                      string;
    username:                   string;
    email:                      string
}

export interface IChargingStationOperator
{
    "@id":                      string;
    "@context":                 string;
    description:                {};
    address:                    IAddress;
    geoLocation?:               IGeoLocation;
    chargingPools:              Array<IChargingPool>;
    chargingStations:           Array<IChargingStation>;
    EVSEs:                      Array<IEVSE>;
    tariffs:                    Array<ITariff>;
}

export interface IChargingPool
{
    "@id":                      string;
    "@context":                 string;
    description:                {};
    address:                    IAddress;
    geoLocation?:               IGeoLocation;
    chargingStationOperator:    IChargingStationOperator;
    chargingStations:           Array<IChargingStation>;
    tariffs:                    Array<ITariff>;
}

export interface IChargingStation
{
    "@id":                      string;
    "@context":                 string;
    begin:                      string;
    end:                        string;
    description:                {};
    address:                    IAddress;
    geoLocation?:               IGeoLocation;
    chargingStationOperator:    IChargingStationOperator;
    chargingPoolId:             string;
    chargingPool:               IChargingPool;
    EVSEs:                      Array<IEVSE>;
    EVSEIds:                    Array<string>;
    meters:                     Array<IMeter>;
    tariffs:                    Array<ITariff>;
}

export interface IEVSE
{
    "@id":                      string;
    "@context":                 string;
    description:                {};
    chargingStation:            IChargingStation;
    chargingStationId:          string;
    meters:                     Array<IMeter>;
    tariffs:                    Array<ITariff>;
}

export interface IMeter
{
    "@id":                      string;
    "@context":                 string;
    description:                {};
    model:                       string;
    vendor:                     string;
    firmwareVersion:            string;
    chargingStation:            IChargingStation;
    chargingStationId:          string;
    EVSE:                       IEVSE;
    EVSEId:                     string;
    publicKeys:                 Array<IPublicKey>;
}

export interface IEMobilityProvider
{
    "@id":                      string;
    "@context":                 string;
    description:                {};
    tariffs:                    Array<ITariff>;
}

export interface ITariff
{
    "@id":                      string;
    "@context":                 string;
    description:                {};
}

export interface IMediationService
{
    "@id":                      string;
    "@context":                 string;
    description:                {};
}

export interface IChargingSession
{
    "@id":                      string;
    "@context":                 string;
    GUI:                        HTMLDivElement;
    begin:                      string;
    end:                        string;
    description:                {};
    chargingPoolId:             string;
    chargingPool:               IChargingPool;
    chargingStationId:          string;
    chargingStation:            IChargingStation;
    EVSEId:                     string;
    EVSE:                       IEVSE;
    tariff:                     ITariff;
    authorizationStart:         IAuthorization;
    authorizationStop:          IAuthorization;
    product:                    IChargingProduct;
    measurements:               Array<IMeasurement>;
    method:                     ACrypt.ACrypt;
}

export interface IChargingProduct
{
    "@id":                      string;
    "@context":                 string;
}

export interface IAuthorization
{
    "@id":                      string;
    "@context":                 string;
    type:                       string;
    timestamp:                  string;
    chargingStationOperator:    string;
    roamingNetwork:             string;
    eMobilityProvider:          string;
}

export interface IMeasurement
{
    "@context":                 string;
    chargingSession:            IChargingSession;
    energyMeterId:              string;
    name:                       string;
    obis:                       string;
    unit:                       string;
    unitEncoded:                number;
    valueType:                  string;
    scale:                      number;
    verifyChain:                boolean;
    signatureInfos:             ISignatureInfos;
    values:                     Array<IMeasurementValue>;
}

export interface ISignatureInfos {
    hash:                       string;
    hashTruncation:             number;
    algorithm:                  string;
    curve:                      string;
    format:                     SignatureFormats;
}

export enum SignatureFormats {
    DER,
    rs
}

export interface IMeasurementValue
{
    measurement:                IMeasurement;
    method:                     ACrypt.ACrypt;
    result:                     ICryptoResult;

    timestamp:                  string;
    value:                      number;
    signatures:                 Array<ISignature>;
}

export interface ISessionCryptoResult
{
    status:                     SessionVerificationResult;
}

export interface ICryptoResult
{
    status:                     VerificationResult;
}

export interface IPublicKey
{
    algorithm:                  string;
    format:                     string;
    previousValue:              string;
    value:                      string;
}

export interface ISignature
{
    algorithm:                  string;
    format:                     SignatureFormats;
    previousValue?:             string;
    value?:                     string;
}

export interface IECCSignature extends ISignature
{
    algorithm:                  string;
    format:                     SignatureFormats;
    previousValue?:             string;
    value?:                     string;
    r:                          string;
    s:                          string;
}

export interface IAddress {
    "@context":         	    string;
    city:                       any;
    street:                     string;
    houseNumber:                string;
    floorLevel:                 string;
    postalCode:                 string;
    country:                    string;
    comment:                    any;
}

export interface IGeoLocation {
    lat:                        number;
    lng:                        number;
}


export enum SessionVerificationResult {
    UnknownSessionFormat,
    PublicKeyNotFound,
    InvalidPublicKey,
    InvalidSignature,
    ValidSignature
}

export enum VerificationResult {
    UnknownCTRFormat,
    EnergyMeterNotFound,
    PublicKeyNotFound,
    InvalidPublicKey,
    InvalidSignature,
    ValidSignature
}
