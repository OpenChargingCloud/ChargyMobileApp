import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Match the WebApp budget for genuine PQ signatures across POI live chains.
        testTimeout: 30000,
        include: [
            "tests/**/*.{test,tests}.?(c|m)[jt]s"
        ]
    }
});
