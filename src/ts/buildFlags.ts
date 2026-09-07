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

// What this build allows beyond the rules that hold everywhere.
//
// A live link document comes from outside and may name any URL at all, so the
// application speaks only encrypted transports and only to hosts on the public
// internet. A test bench needs one or both of those refusals lifted - and that
// is a decision for whoever builds the application. It is taken at compile
// time, by webpack's DefinePlugin, so there is nothing here a document, a
// setting or a user could flip afterwards, and a build that was not told to
// allow it does not carry the permission at all.
//
// Only a build that asked for them has them: an ordinary development build is
// exactly as strict as a production one, and a production build refuses to take
// the switches at all, whatever asks. A test bench build asks with
// CHARGY_ALLOW_INSECURE_TRANSPORTS=1 or --env insecureTransports (and the
// privateNetworkTransports counterparts); see webpack.config.cjs. The
// environment variables also reach the Cordova prepare hook, which widens the
// Content-Security-Policy of the copied index.html to match - a build whose
// application would allow plaintext but whose WebView still refuses it would
// look exactly like a bug.
//
// The typeof guard is what makes the default "no" true everywhere the
// DefinePlugin does not run - a unit test, a bundler configured elsewhere:
// an undefined constant reads as "not allowed", never as "allowed".

declare const __CHARGY_ALLOW_INSECURE_TRANSPORTS__: boolean;
declare const __CHARGY_ALLOW_PRIVATE_NETWORK_TRANSPORTS__: boolean;

export const allowInsecureTransports: boolean =
    typeof __CHARGY_ALLOW_INSECURE_TRANSPORTS__ !== "undefined" &&
           __CHARGY_ALLOW_INSECURE_TRANSPORTS__;

export const allowPrivateNetworkTransports: boolean =
    typeof __CHARGY_ALLOW_PRIVATE_NETWORK_TRANSPORTS__ !== "undefined" &&
           __CHARGY_ALLOW_PRIVATE_NETWORK_TRANSPORTS__;
