import { vi, describe, test, expect, afterEach } from "vitest";
import { type fs, vol } from "memfs";
import { validateDistDir } from "../build";
import type { VersionInfo } from "../types";

vi.mock("node:fs/promises", async () => {
	const memfs: { fs: typeof fs } = await vi.importActual("memfs");
	return memfs.fs.promises;
});

vi.mock("node:fs", async () => {
	const memfs: { fs: typeof fs } = await vi.importActual("memfs");
	return memfs.fs;
});

const versionInfo: VersionInfo = {
	version: "3.13.4-0",
	dependencies: {
		"@akashic/engine-files": "3.13.4",
		"@akashic/playlog-client": "7.3.1",
		"@akashic/pdi-game-runner": "3.26.4",
	},
	created_at: "2026-01-01T00:00:00.000Z",
};

const distDir = "/dist/3.13.4-0";

const distFiles: Record<string, string> = {
	[`${distDir}/MANIFEST.md`]: "# manifest",
	[`${distDir}/bundle_info.txt`]: "engine-files: 3.13.4\npdi-game-runner: 3.26.4",
	[`${distDir}/bootstrap.js`]: "// bootstrap",
	[`${distDir}/entry.js`]: "// entry",
	[`${distDir}/akashic-engine.js`]: "// akashic-engine",
	[`${distDir}/game-driver.js`]: "// game-driver",
	[`${distDir}/playlogClientV7_3_1.js`]: "// playlog-client",
	[`${distDir}/engineFilesV3_13_4.js`]: "// engine-files",
	[`${distDir}/pdi-common-impl.js`]: "// pdi-common-impl",
};

afterEach(() => {
	vol.reset();
});

describe("validateDistDir", () => {
	test("valid dist dir", async () => {
		vol.fromJSON(distFiles);
		await expect(validateDistDir(distDir, versionInfo)).resolves.toBeUndefined();
	});

	test("valid dist dir (without optional files)", async () => {
		const files = { ...distFiles };
		delete files[`${distDir}/pdi-common-impl.js`];
		vol.fromJSON(files);
		await expect(validateDistDir(distDir, versionInfo)).resolves.toBeUndefined();
	});

	test("empty directory", async () => {
		vol.fromJSON({ [distDir]: null });
		await expect(validateDistDir(distDir, versionInfo)).rejects.toThrow("directory is empty");
	});

	test.each(["MANIFEST.md", "bundle_info.txt", "bootstrap.js", "entry.js", "akashic-engine.js", "game-driver.js"])(
		"missing required file: %s",
		async file => {
			const files = { ...distFiles };
			delete files[`${distDir}/${file}`];
			vol.fromJSON(files);
			await expect(validateDistDir(distDir, versionInfo)).rejects.toThrow(`required file not found: ${file}`);
		}
	);

	test("missing playlogClientV*.js", async () => {
		const files = { ...distFiles };
		delete files[`${distDir}/playlogClientV7_3_1.js`];
		vol.fromJSON(files);
		await expect(validateDistDir(distDir, versionInfo)).rejects.toThrow("required file not found: /^playlogClientV.+\\.js$/");
	});

	test("missing engineFilesV*.js", async () => {
		const files = { ...distFiles };
		delete files[`${distDir}/engineFilesV3_13_4.js`];
		vol.fromJSON(files);
		await expect(validateDistDir(distDir, versionInfo)).rejects.toThrow("required file not found: /^engineFilesV.+\\.js$/");
	});

	test("empty file", async () => {
		vol.fromJSON({ ...distFiles, [`${distDir}/akashic-engine.js`]: "" });
		await expect(validateDistDir(distDir, versionInfo)).rejects.toThrow("file is empty: akashic-engine.js");
	});

	test("bundle_info.txt missing engine-files line", async () => {
		vol.fromJSON({ ...distFiles, [`${distDir}/bundle_info.txt`]: "pdi-game-runner: 3.26.4" });
		await expect(validateDistDir(distDir, versionInfo)).rejects.toThrow('missing "engine-files" line');
	});

	test("bundle_info.txt missing pdi-game-runner line", async () => {
		vol.fromJSON({ ...distFiles, [`${distDir}/bundle_info.txt`]: "engine-files: 3.13.4" });
		await expect(validateDistDir(distDir, versionInfo)).rejects.toThrow('missing "pdi-game-runner" line');
	});

	test("engine-files version mismatch", async () => {
		vol.fromJSON({ ...distFiles, [`${distDir}/bundle_info.txt`]: "engine-files: 3.0.0\npdi-game-runner: 3.26.4" });
		await expect(validateDistDir(distDir, versionInfo)).rejects.toThrow("engine-files version mismatch: expected 3.13.4, got 3.0.0");
	});

	test("pdi-game-runner version mismatch", async () => {
		vol.fromJSON({ ...distFiles, [`${distDir}/bundle_info.txt`]: "engine-files: 3.13.4\npdi-game-runner: 1.0.0" });
		await expect(validateDistDir(distDir, versionInfo)).rejects.toThrow("pdi-game-runner version mismatch: expected 3.26.4, got 1.0.0");
	});

	test("unexpected file", async () => {
		vol.fromJSON({ ...distFiles, [`${distDir}/unexpected.js`]: "// unexpected" });
		await expect(validateDistDir(distDir, versionInfo)).rejects.toThrow("unexpected file(s) found: unexpected.js");
	});
});
