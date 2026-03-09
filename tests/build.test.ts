import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { describe, test, expect } from "vitest";
import type { VersionsJson } from "../scripts/types";
import { getMinMaxVersionsByMajor } from "../scripts/utils";

describe("build (e2e)", () => {
	// 以下の理由により各メジャーバージョンの最低と最高の2つをのみをビルドして妥当性を確かめる。
	// - テストのたびに全てのバージョンをビルドさせると将来的に処理時間が単調増加しつづける
	// - 最高および最低のバージョンのビルドができていれば途中のバージョンもビルドできるだろうという仮定
	test("should build min and max versions for each major version (v1, v2, v3)", async () => {
		const versionsJsonPath = join(__dirname, "..", "versions.json");
		const content = await readFile(versionsJsonPath, "utf-8");
		const versionsJson: VersionsJson = JSON.parse(content);

		const minMaxByMajor = getMinMaxVersionsByMajor(versionsJson);

		// v1, v2, v3 のみをテスト
		const majorsToTest = [1, 2, 3];

		for (const major of majorsToTest) {
			const versions = minMaxByMajor.get(major);
			if (!versions) {
				throw new Error(`No versions found for major version ${major}`);
			}

			// 最低バージョンをビルド
			console.log(`Building v${major} min version: ${versions.min}`);
			expect(() => {
				execSync(`pnpm build --version=${versions.min}`, {
					cwd: join(__dirname, ".."),
					stdio: "inherit",
				});
			}).not.toThrow();

			// 最新バージョンをビルド（最低と異なる場合のみ）
			if (versions.min !== versions.max) {
				console.log(`Building v${major} max version: ${versions.max}`);
				expect(() => {
					execSync(`npm run build -- --version=${versions.max}`, {
						cwd: join(__dirname, ".."),
						stdio: "inherit",
					});
				}).not.toThrow();
			}
		}
	}, 600000); // 10分のタイムアウト
});
