import { describe, test, expect } from "vitest";
import type { VersionInfo, VersionsJson } from "../types";
import { getMinMaxVersionsByMajor } from "../utils";

const schema_version = "dummy";
const created_at = "dummy";
const dependencies = {
	"@akashic/engine-files": "dummy",
	"@akashic/playlog-client": "dummy",
	"@akashic/pdi-game-runner": "dummy",
} satisfies VersionInfo["dependencies"];

describe("getMinMaxVersionsByMajor", () => {
	test("should return min and max versions for each major version", () => {
		const versionsJson: VersionsJson = {
			schema_version,
			versions: [
				{ version: "3.13.0-2", created_at, dependencies },
				{ version: "3.13.0-1", created_at, dependencies },
				{ version: "3.13.0-0", created_at, dependencies },
				{ version: "3.1.0-1", created_at, dependencies },
				{ version: "3.1.0-0", created_at, dependencies },
				{ version: "2.5.0-1", created_at, dependencies },
				{ version: "2.5.0-0", created_at, dependencies },
				{ version: "1.2.0-0", created_at, dependencies },
			],
		};

		const result = getMinMaxVersionsByMajor(versionsJson);

		expect(result.get(3)).toEqual({ min: "3.1.0-0", max: "3.13.0-2" });
		expect(result.get(2)).toEqual({ min: "2.5.0-0", max: "2.5.0-1" });
		expect(result.get(1)).toEqual({ min: "1.2.0-0", max: "1.2.0-0" });
	});

	test("should handle prerelease versions correctly with semver.compare", () => {
		const versionsJson: VersionsJson = {
			schema_version,
			versions: [
				{ version: "3.13.0-3", created_at, dependencies },
				{ version: "3.13.0-10", created_at, dependencies },
				{ version: "3.13.0-2", created_at, dependencies },
				{ version: "3.13.0-1", created_at, dependencies },
			],
		};

		const result = getMinMaxVersionsByMajor(versionsJson);

		// 順不同であることを確認
		expect(result.get(3)).toEqual({ min: "3.13.0-1", max: "3.13.0-10" });
	});

	test("should skip invalid version formats", () => {
		const versionsJson: VersionsJson = {
			schema_version,
			versions: [
				{ version: "3.13.0-1", created_at, dependencies },
				{ version: "invalid-version", created_at, dependencies },
				{ version: "3.13.0-0", created_at, dependencies },
			],
		};

		const result = getMinMaxVersionsByMajor(versionsJson);

		// 不正なバージョンはスキップされる
		expect(result.get(3)).toEqual({ min: "3.13.0-0", max: "3.13.0-1" });
	});

	test("should handle single version per major", () => {
		const versionsJson: VersionsJson = {
			schema_version,
			versions: [{ version: "3.13.0-0", created_at, dependencies }],
		};

		const result = getMinMaxVersionsByMajor(versionsJson);

		expect(result.get(3)).toEqual({ min: "3.13.0-0", max: "3.13.0-0" });
	});

	test("should handle empty versions array", () => {
		const versionsJson: VersionsJson = {
			schema_version,
			versions: [],
		};

		const result = getMinMaxVersionsByMajor(versionsJson);

		expect(result.size).toBe(0);
	});
});
