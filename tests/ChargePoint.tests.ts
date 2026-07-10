import { describe, test } from "vitest";
import {
    expectArchiveVerificationReport,
    expectMultiArchiveVerificationReport
} from "./testHelper";

describe("ChargePoint", () => {

    test("processes the 2020-02 BZIP2 payload", async () => {
        await expectArchiveVerificationReport(
            "ChargePoint/Testdata-2020-02/0024b1000002e300_2_123017065_payload.tar.bz2",
            "ChargePoint/Testdata-2020-02/0024b1000002e300_2_123017065_payload.expected.txt"
        );
    });

    test("processes the BZIP2 payload with a PEM public key", async () => {
        await expectMultiArchiveVerificationReport(
            [
                "ChargePoint/Testdata-2020-02/0024b1000002e300_2_123017065_payload.tar.bz2",
                "ChargePoint/Testdata-2020-02/0024b1000002e300_2.pem"
            ],
            "ChargePoint/Testdata-2020-02/0024b1000002e300_2_123017065_payload-withPublicKey.expected.txt"
        );
    });

    test("processes the BZIP2 payload with a complete Chargy public key", async () => {
        await expectMultiArchiveVerificationReport(
            [
                "ChargePoint/Testdata-2020-02/0024b1000002e300_2_123017065_payload.tar.bz2",
                "ChargePoint/Testdata-2020-02/0024b1000002e300_2-publicKey.chargy"
            ],
            "ChargePoint/Testdata-2020-02/0024b1000002e300_2_123017065_payload-withPublicKey.expected.txt"
        );
    });

    test("processes the BZIP2 payload with a minimal Chargy public key", async () => {
        await expectMultiArchiveVerificationReport(
            [
                "ChargePoint/Testdata-2020-02/0024b1000002e300_2_123017065_payload.tar.bz2",
                "ChargePoint/Testdata-2020-02/0024b1000002e300_2-publicKey_minimal.chargy"
            ],
            "ChargePoint/Testdata-2020-02/0024b1000002e300_2_123017065_payload-withPublicKey.expected.txt"
        );
    });

    test("processes the complete Chargy archive", async () => {
        await expectArchiveVerificationReport(
            "ChargePoint/Testdata-2020-02/0024b1000002e300_2.chargy",
            "ChargePoint/Testdata-2020-02/0024b1000002e300_2_123017065_payload-withPublicKey.expected.txt"
        );
    });

    test("processes the ZIP archive containing its public key", async () => {
        await expectArchiveVerificationReport(
            "ChargePoint/Testdata-2020-02/0024b1000002e300_2_123017065_withPublicKey.zip",
            "ChargePoint/Testdata-2020-02/0024b1000002e300_2_123017065_payload-withPublicKey.expected.txt"
        );
    });

});
