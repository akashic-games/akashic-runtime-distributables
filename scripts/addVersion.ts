import { writeFile } from "node:fs/promises";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import semver from "semver";
import type { VersionInfo, VersionsInfoDependency } from "./types.js";
import { readVersionsJson } from "./utils.js";

const exec = promisify(execCallback);

export interface AddVersionOptions {
	versionsJsonPath: string;
	baseVersion: string;
	versionsInfo?: Partial<VersionsInfoDependency>;
}

/**
 * versions.json に指定のバージョンを追加する。
 * "x.y.z" を追加した場合、versions.json の中から x.y.z-n の中から最も大きい n の値を取得して "x.y.z-{n+1}" のフィールドを追加する。
 * x.y.z-n が存在しない場合 "x.y.z-0" のフィールドを追加する。
 * @param options オプション
 * @returns newVersion 追加したバージョン
 */
export async function addVersion(options: AddVersionOptions): Promise<string> {
	// 1. versions.json を読み込む
	const versionsJsonPath = options.versionsJsonPath;
	const versionsJson = await readVersionsJson(versionsJsonPath);

	// 2. 最新バージョンを取得
	if (!versionsJson.versions || versionsJson.versions.length === 0) {
		throw new Error("No versions found in versions.json. Please add the first version manually.");
	}

	// 3. 新しいバージョン番号を計算
	console.error(); // この関数の利用元で stdout をコマンド結果として扱うため、 stderr に出力
	console.error(`=== Adding version based on ${options.baseVersion} ===`);
	console.error();
	const newVersion = calculateVersionFromBase(versionsJson.versions, options.baseVersion);
	console.error(`New version: ${newVersion}`);
	console.error();

	// 4. 新しいバージョンの engine-files を決定
	// x.y.z-n -> x.y.z
	const parsed = semver.parse(newVersion);
	if (!parsed) {
		throw new Error(`Invalid version format: ${newVersion}`);
	}
	const engineFilesVersion = `${parsed.major}.${parsed.minor}.${parsed.patch}`;

	// 5. playlog-client と pdi-game-runner のバージョンを取得
	// pdi-game-runner は versionsInfo で指定がない場合、engine-files のメジャーバージョンの最新を取得
	console.error("Fetching latest versions of dependencies...");
	const playlogClientVersion = await resolveNpmVersion("@akashic/playlog-client", options.versionsInfo?.["@akashic/playlog-client"]);
	const pdiGameRunnerVersion = await resolveNpmVersion(
		"@akashic/pdi-game-runner",
		options.versionsInfo?.["@akashic/pdi-game-runner"] ?? `${parsed.major}`
	);

	console.error(`  @akashic/engine-files: ${engineFilesVersion}`);
	console.error(`  @akashic/playlog-client: ${playlogClientVersion}`);
	console.error(`  @akashic/pdi-game-runner: ${pdiGameRunnerVersion}`);
	console.error();

	// 6. 同一の依存バージョンの組み合わせがすでに存在するかチェック
	const duplicated = versionsJson.versions.find(
		v =>
			v.dependencies["@akashic/engine-files"] === engineFilesVersion &&
			v.dependencies["@akashic/playlog-client"] === playlogClientVersion &&
			v.dependencies["@akashic/pdi-game-runner"] === pdiGameRunnerVersion
	);
	if (duplicated) {
		console.error(`Dependency already exists (version ${duplicated.version}). Skipping.`);
		return duplicated.version;
	}

	// 7. engine-files のバージョンが存在するかチェック
	const engineFilesExists = await checkNpmVersionExists("@akashic/engine-files", engineFilesVersion);
	if (!engineFilesExists) {
		throw new Error(
			`@akashic/engine-files@${engineFilesVersion} does not exist on npm.\n` +
				`Please ensure the version exists before adding it to versions.json.`
		);
	}

	// 8. 新しいバージョン情報のエントリを作成
	const newVersionInfoEntry = {
		version: newVersion,
		dependencies: {
			"@akashic/engine-files": engineFilesVersion,
			"@akashic/playlog-client": playlogClientVersion,
			"@akashic/pdi-game-runner": pdiGameRunnerVersion,
		},
		created_at: new Date().toISOString(),
	} satisfies VersionInfo;

	// 9. versions 配列の先頭に追加
	versionsJson.versions.unshift(newVersionInfoEntry);

	// 10. versions.json に書き込む
	const updatedContent = JSON.stringify(versionsJson, null, 2) + "\n";
	await writeFile(versionsJsonPath, updatedContent, "utf-8");

	console.error("✓ Version added successfully to versions.json");

	return newVersion;
}

/**
 * versions.json にもとづき、 engine-files のバージョンから akashic-runtime のバージョン番号を計算して返す。
 * e.g. 3.13.4 -> 3.13.4-0
 */
export function calculateVersionFromBase(versions: VersionInfo[], baseVersion: string): string {
	const parsed = semver.parse(baseVersion);
	if (!parsed || parsed.prerelease.length > 0) {
		throw new Error(`Invalid version format: ${baseVersion}. Expected format: x.y.z (e.g., 3.13.4)`);
	}

	// x.y.z-n のうち x.y.z が一致するバージョンを列挙
	const existingVersions = versions
		.map(v => v.version)
		.filter(v => {
			const vParsed = semver.parse(v);
			if (!vParsed) return false;
			// major.minor.patch が一致し、prerelease が存在するものを探す
			return (
				vParsed.major === parsed.major &&
				vParsed.minor === parsed.minor &&
				vParsed.patch === parsed.patch &&
				vParsed.prerelease.length > 0
			);
		});

	if (existingVersions.length === 0) {
		// 既存のバージョンがない場合は -0 を追加
		parsed.prerelease = [0];
		return parsed.format();
	} else {
		// 既存のバージョンから最大の amendment 番号を取得
		const maxAmendment = existingVersions.reduce((max, v) => {
			const parsed = semver.parse(v);
			if (!parsed) return max;

			const [amendment] = parsed.prerelease;
			return typeof amendment === "number" ? Math.max(max, amendment) : max;
		}, 0);

		parsed.prerelease = [maxAmendment + 1];
	}

	return parsed.format();
}

/**
 * npm パッケージのバージョンを解決して返す。version が未指定の場合は latest を取得する。
 * 複数バージョンにマッチする場合（e.g. メジャーバージョン指定）は最新のバージョンを返す。
 */
async function resolveNpmVersion(packageName: string, version: string = "latest") {
	try {
		const { stdout } = await exec(`npm view ${packageName}@${version} version --json`);
		const parsed: unknown = JSON.parse(stdout.trim());
		if (Array.isArray(parsed)) {
			// 複数バージョンにマッチした場合、最後（最新）のバージョンを返す
			return parsed[parsed.length - 1] as string;
		}
		return parsed as string;
	} catch (error) {
		throw new Error(
			`Failed to fetch version of ${packageName}@${version}.\n` + `Error: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

/**
 * npm パッケージの特定バージョンが存在するかチェック
 */
async function checkNpmVersionExists(packageName: string, version: string): Promise<boolean> {
	try {
		await exec(`npm view ${packageName}@${version} version`);
		return true;
	} catch (error) {
		return false;
	}
}
