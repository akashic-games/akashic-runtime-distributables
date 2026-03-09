import { describe, test, expect } from "vitest";
import { calculateVersionFromBase } from "../addVersion.js";
import type { VersionInfo } from "../types.js";

describe("calculateVersionFromBase", () => {
	test("new base version: add -0", () => {
		const versions: VersionInfo[] = [];
		expect(calculateVersionFromBase(versions, "3.13.0")).toBe("3.13.0-0");
	});

	test("existing version: increment amendment", () => {
		const versions: VersionInfo[] = [
			{
				version: "3.13.0-0",
				dependencies: {
					"@akashic/engine-files": "3.13.0",
					"@akashic/playlog-client": "7.3.0",
					"@akashic/pdi-game-runner": "3.26.2",
				},
				created_at: "2026-02-03T00:00:00Z",
			},
		];
		expect(calculateVersionFromBase(versions, "3.13.0")).toBe("3.13.0-1");
	});

	test("multiple existing versions: increment from max", () => {
		const versions: VersionInfo[] = [
			{
				version: "3.13.0-2",
				dependencies: {
					"@akashic/engine-files": "3.13.0",
					"@akashic/playlog-client": "7.3.0",
					"@akashic/pdi-game-runner": "3.26.2",
				},
				created_at: "2026-02-03T00:00:00Z",
			},
			{
				version: "3.13.0-0",
				dependencies: {
					"@akashic/engine-files": "3.13.0",
					"@akashic/playlog-client": "7.3.0",
					"@akashic/pdi-game-runner": "3.26.2",
				},
				created_at: "2026-02-01T00:00:00Z",
			},
		];
		expect(calculateVersionFromBase(versions, "3.13.0")).toBe("3.13.0-3");
	});
});
