import { readFile, writeFile } from "node:fs/promises";
import semver from "semver";
import type { VersionInfo, VersionsJson } from "./types";

export async function readVersionsJson(path: string): Promise<VersionsJson> {
	const content = await readFile(path, "utf-8");
	return JSON.parse(content);
}

export async function writeVersionsJson(path: string, content: VersionsJson) {
	const contentString = JSON.stringify(content, null, 2) + "\n";
	await writeFile(path, contentString, "utf-8");
}

/**
 * 各メジャーバージョンの最低バージョンと最新バージョンを取得する。
 * 主にテストでの利用を想定。
 */
export function getMinMaxVersionsByMajor(versionsJson: VersionsJson): Map<number, { min: string; max: string }> {
	// メジャーバージョンごとにグループ化
	const versionsByMajor = new Map<number, VersionInfo[]>();

	for (const versionInfo of versionsJson.versions) {
		const parsed = semver.parse(versionInfo.version);
		if (!parsed) {
			console.warn(`Invalid version format: ${versionInfo.version}, skipping`);
			continue;
		}
		const major = parsed.major;

		if (!versionsByMajor.has(major)) {
			versionsByMajor.set(major, []);
		}
		versionsByMajor.get(major)!.push(versionInfo);
	}

	// 各メジャーバージョンの最低と最新を取得
	const result = new Map<number, { min: string; max: string }>();

	for (const [major, versions] of versionsByMajor) {
		// バージョンを昇順にソート
		const sortedVersions = versions.map(v => v.version).sort(semver.compare);
		const min = sortedVersions[0];
		const max = sortedVersions[sortedVersions.length - 1];
		result.set(major, { min, max });
	}

	return result;
}
