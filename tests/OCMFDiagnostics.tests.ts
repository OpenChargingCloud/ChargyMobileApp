import { describe, expect, test, vi } from "vitest";

import { OCMF, Chargy }    from "@open-charging-cloud/chargy-core";
import coreI18n             from "@open-charging-cloud/chargy-core/i18n.json";
import type { IError }     from "@open-charging-cloud/chargy-core";

import { createTestChargy } from "./chargyTestRuntime";

vi.mock("pdfjs-dist", () => ({
    GlobalWorkerOptions: {}
}));

vi.stubGlobal("window", {
    navigator: {
        language: "en"
    }
});

const ocmf = new OCMF(createTestChargy(Chargy, { i18n: coreI18n }));

// OCMF carries verification diagnostics on the document (own result model), via
// its own AddValidationError helper exercised here directly.
type OCMFInternals = {
    AddValidationError(doc: { validationErrors?: IError[] }, reasonKey: string, detail?: unknown): void;
};

describe("OCMF verification diagnostics", () => {

    test("records a structured reason (i18n key + raw detail) on the OCMF document", () => {

        const doc: { validationErrors?: IError[] } = {};

        (ocmf as unknown as OCMFInternals).AddValidationError(doc, "Verification_SignatureMismatch", new Error("boom"));

        const error = doc.validationErrors?.[0];

        expect(error?.code).toBe("Verification_SignatureMismatch");
        expect(error?.details).toBe("boom");
        expect(error?.message["en"]).toBe("The signature does not match the signed data!");
        expect(error?.message["de"]).toBe("Die Signatur passt nicht zu den signierten Daten!");

    });

    test("omits the technical detail when none is supplied (e.g. a genuine mismatch)", () => {

        const doc: { validationErrors?: IError[] } = {};

        (ocmf as unknown as OCMFInternals).AddValidationError(doc, "Verification_SignatureMismatch");

        expect(doc.validationErrors?.[0]?.code).toBe("Verification_SignatureMismatch");
        expect(doc.validationErrors?.[0]?.details).toBeUndefined();

    });

});
