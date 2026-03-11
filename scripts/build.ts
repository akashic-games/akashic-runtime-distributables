import { exec as execCallback } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { copyFile, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { globSync } from "glob";
import semver from "semver";
import { validateModule } from "./validateModule.js";
import { listDependencies, type Dependency } from "./listDependencies.js";
import type { VersionInfo } from "./types.js";

const exec = promisify(execCallback);

export interface PrebuiltDistZip {
	filePath: string;
	entries: string[];
}

export interface BuildOptions {
	rootDir: string;
	distDir: string;
	keepTemp?: boolean;
	prebuiltDistZip?: PrebuiltDistZip;
}

// インストール対象として許可されたモジュール
const allowedModules = ["@akashic/engine-files", "@akashic/playlog-client", "@akashic/pdi-game-runner"];

async function installDependencies(versionInfo: VersionInfo, cwd: string) {
	// 指定のモジュール以外が含まれていないか確認
	const dependencyKeys = Object.keys(versionInfo.dependencies);
	const unexpectedModules = dependencyKeys.filter(dep => !allowedModules.includes(dep));

	if (unexpectedModules.length > 0) {
		throw new Error(
			`Unexpected dependencies found: ${unexpectedModules.join(", ")}\n` +
				`Only the following modules are allowed: ${allowedModules.join(", ")}`
		);
	}

	const tempBase = resolve(cwd, "temp");
	await mkdir(tempBase, { recursive: true });
	const tempDir = await mkdtemp(join(tempBase, `${versionInfo.version}_`));

	// package.json を作成
	await writeFile(
		resolve(tempDir, "package.json"),
		JSON.stringify(
			{
				name: "temp-build",
				private: true,
				version: versionInfo.version,
				dependencies: versionInfo.dependencies,
			},
			null,
			2
		)
	);

	// .npmrc があればコピー
	const npmrcPath = resolve(cwd, ".npmrc");
	if (existsSync(npmrcPath)) {
		await copyFile(npmrcPath, resolve(tempDir, ".npmrc"));
	}

	console.log(`Installing dependencies for version ${versionInfo.version}...`);
	try {
		await exec("npm install --ignore-scripts", { cwd: tempDir });
	} catch (error) {
		await rm(tempDir, { recursive: true, force: true });
		throw error;
	}
	console.log("Dependencies installed successfully");

	return tempDir;
}

async function generateManifestMarkdown(versionInfo: VersionInfo, tempDir: string, dist: string) {
	console.log("Generating manifest...");

	const { stdout } = await exec("npm ls --prod --all --json --depth 1", { cwd: tempDir });
	const lsResult = JSON.parse(stdout);

	// @akashic/engine-files のみその依存を表示
	const dependencyTree = await listDependencies(lsResult as Dependency, /^@akashic\/engine-files/, 0, "* ");

	const markdown = [`# akashic-runtime v${versionInfo.version}\n\n`, "```", "\n", dependencyTree, "\n", "```", "\n"].join("");

	// dist ディレクトリに MANIFEST.md として出力
	await writeFile(resolve(dist, "MANIFEST.md"), markdown);
	console.log("MANIFEST.md saved");
}

export async function validateDistDir(distDir: string, versionInfo: VersionInfo): Promise<void> {
	// ディレクトリが空でないか確認する
	const files = readdirSync(distDir);
	if (files.length === 0) {
		throw new Error(`validateDistDir: directory is empty: ${distDir}`);
	}

	// 必須ファイル
	const requiredFiles: (string | RegExp)[] = [
		"MANIFEST.md",
		"bundle_info.txt",
		"bootstrap.js",
		"entry.js",
		"akashic-engine.js",
		"game-driver.js",
		/^playlogClientV.+\.js$/,
		/^engineFilesV.+\.js$/,
	];
	// オプショナルファイル
	const optionalFiles: (string | RegExp)[] = [
		"pdi-common-impl.js", // v3 以降にのみ存在
	];

	const matchesRequired = (file: string, required: string | RegExp) =>
		typeof required === "string" ? file === required : required.test(file);
	for (const required of requiredFiles) {
		if (!files.some(f => matchesRequired(f, required))) {
			throw new Error(`validateDistDir: required file not found: ${required}`);
		}
	}

	// 必須・オプショナルファイル以外が存在しないか確認
	const allowedFiles = [...requiredFiles, ...optionalFiles];
	const unexpectedFiles = files.filter(f => !allowedFiles.some(allowed => matchesRequired(f, allowed)));
	if (unexpectedFiles.length > 0) {
		throw new Error(`validateDistDir: unexpected file(s) found: ${unexpectedFiles.join(", ")}`);
	}

	// ファイルの内容を簡易的に確認
	for (const file of files) {
		const { size } = await stat(resolve(distDir, file));
		if (size === 0) {
			throw new Error(`validateDistDir: file is empty: ${file}`);
		}
	}

	// bundle_info.txt に engine-files と pdi-game-runner のバージョン行が含まれるか確認する
	const bundleInfo = await readFile(resolve(distDir, "bundle_info.txt"), "utf-8");
	const engineFilesMatch = bundleInfo.match(/^engine-files: (.+)$/m);
	const pdiGameRunnerMatch = bundleInfo.match(/^pdi-game-runner: (.+)$/m);
	if (!engineFilesMatch) {
		throw new Error(`validateDistDir: bundle_info.txt is missing "engine-files" line`);
	}
	if (!pdiGameRunnerMatch) {
		throw new Error(`validateDistDir: bundle_info.txt is missing "pdi-game-runner" line`);
	}

	// bundle_info.txt に記載されたバージョンが versions.json の定義と一致するか確認する
	const expectedEngineFiles = versionInfo.dependencies["@akashic/engine-files"];
	const expectedPdiGameRunner = versionInfo.dependencies["@akashic/pdi-game-runner"];
	if (engineFilesMatch[1] !== expectedEngineFiles) {
		throw new Error(`validateDistDir: engine-files version mismatch: expected ${expectedEngineFiles}, got ${engineFilesMatch[1]}`);
	}
	if (pdiGameRunnerMatch[1] !== expectedPdiGameRunner) {
		throw new Error(
			`validateDistDir: pdi-game-runner version mismatch: expected ${expectedPdiGameRunner}, got ${pdiGameRunnerMatch[1]}`
		);
	}
}

export async function validateDistZip(filePath: string): Promise<PrebuiltDistZip> {
	// zip 内の成果物が dist/ 以下にあること検証
	const { stdout } = await exec(`unzip -Z1 ${filePath}`);
	const entries = stdout.trim().split("\n").filter(Boolean);
	const invalidEntries = entries.filter(entry => !entry.startsWith("dist/"));
	if (invalidEntries.length > 0) {
		throw new Error(`Invalid zip file: all entries must start with "dist/". Invalid entries: ${invalidEntries.slice(0, 5).join(", ")}`);
	}
	return { filePath, entries };
}

async function extractVersionFromZip(prebuiltDistZip: PrebuiltDistZip, version: string, rootDir: string): Promise<boolean> {
	const { filePath, entries } = prebuiltDistZip;

	// dist 以下にバージョンディレクトリが存在するか確認
	const versionEntry = `dist/${version}/`;
	const canvasVersionEntry = `dist/${version}-canvas/`;
	if (!entries.includes(versionEntry)) {
		return false;
	}

	// 対象のバージョンのみ展開
	const patterns = [`"dist/${version}/*"`];
	if (entries.includes(canvasVersionEntry)) {
		patterns.push(`"dist/${version}-canvas/*"`);
	}
	await exec(`unzip -o ${filePath} ${patterns.join(" ")} -d ${rootDir}`);
	const extracted = [version, ...(entries.includes(canvasVersionEntry) ? [`${version}-canvas`] : [])];
	console.log(`Extracted: ${extracted.join(", ")}`);
	return true;
}

export async function buildVersion(versionInfo: VersionInfo, options: BuildOptions): Promise<boolean> {
	const version = versionInfo.version;
	const rootDir = options.rootDir;
	const distDir = resolve(options.distDir, version);

	if (existsSync(distDir)) {
		console.warn(`Warning: ${distDir} already exists, overwriting...`);
	}

	// dist-file-path が指定されている場合は zip から展開を試みる
	if (options.prebuiltDistZip) {
		const extracted = await extractVersionFromZip(options.prebuiltDistZip, version, options.rootDir);
		if (extracted) {
			await validateDistDir(distDir, versionInfo);
			return false;
		}
		console.log(`Version ${version} not found in zip, building from source...`);
	}

	await rm(distDir, { recursive: true, force: true });
	await mkdir(distDir, { recursive: true });

	console.log();
	console.log(`=== Building version ${version} ===`);
	console.log();

	// 一時ディレクトリに依存関係をインストール
	const tempDir = await installDependencies(versionInfo, rootDir);

	// 中間ファイルの出力先ディレクトリ
	const buildDir = resolve(tempDir, "build");
	await mkdir(buildDir, { recursive: true });

	const engineFilesPackageJSON = JSON.parse(
		await readFile(resolve(tempDir, "node_modules", "@akashic", "engine-files", "package.json"), "utf-8")
	);

	// Canvas版が利用可能かどうか (v2以降)
	const hasCanvasVersion = semver.gte(engineFilesPackageJSON.version, "2.0.0");
	const akashicRuntimeCanvasDir = resolve(options.distDir, `${version}-canvas`);

	try {
		// akashic-runtime (engine-files + playlog-client) のビルド
		{
			// 1. playlog-client のビルド
			console.log("bundle playlog-client");
			const playlogClientEntryPath = resolve(tempDir, "node_modules", "@akashic", "playlog-client", "lib", "index.js");
			const playlogClientPackageJSON = JSON.parse(
				await readFile(resolve(tempDir, "node_modules", "@akashic", "playlog-client", "package.json"), "utf-8")
			);
			const playlogClientFilename = `playlogClientV${playlogClientPackageJSON.version.replace(/[\.-]/g, "_")}`;

			await exec(
				`npx browserify ${playlogClientEntryPath} -t [babelify] -s ${playlogClientFilename} -o ${buildDir}/${playlogClientFilename}.js`,
				{ cwd: rootDir }
			);
			await exec(`npx uglifyjs ${buildDir}/${playlogClientFilename}.js --comments -o ${buildDir}/${playlogClientFilename}.min.js`, {
				cwd: rootDir,
			});
			await validateModule(resolve(buildDir, `${playlogClientFilename}.js`));
			await validateModule(resolve(buildDir, `${playlogClientFilename}.min.js`));

			console.log("playlog-client is bundled successfully");

			// 2. engine-files のビルド
			console.log("bundle engine-files");

			// 2.1. 通常版
			const engineFilesFilename = `engineFilesV${engineFilesPackageJSON.version.replace(/[\.-]/g, "_")}`;
			const engineFilesEntryPath = resolve(
				tempDir,
				"node_modules",
				"@akashic",
				"engine-files",
				"dist",
				"raw",
				"release",
				"full",
				`${engineFilesFilename}.js`
			);
			await copyFile(engineFilesEntryPath, resolve(buildDir, `${engineFilesFilename}.js`));
			await validateModule(resolve(buildDir, `${engineFilesFilename}.js`));

			// 2.2. canvas版（v2以降のみ）
			const engineFilesCanvasFilename = `${engineFilesFilename}_Canvas`;

			if (hasCanvasVersion) {
				const engineFilesCanvasEntryPath = resolve(
					tempDir,
					"node_modules",
					"@akashic",
					"engine-files",
					"dist",
					"raw",
					"release",
					"canvas",
					`${engineFilesCanvasFilename}.js`
				);
				await copyFile(engineFilesCanvasEntryPath, resolve(buildDir, `${engineFilesCanvasFilename}.js`));
				await validateModule(resolve(buildDir, `${engineFilesCanvasFilename}.js`));
			} else {
				console.log("Canvas version not available for v1, skipping...");
			}

			console.log("engine-files is bundled successfully");

			// 3. akashic-runtime ディレクトリの作成
			console.log("generate akashic-runtime directory");

			// 3.1. 通常版のファイルをコピー
			await copyFile(resolve(buildDir, `${playlogClientFilename}.min.js`), resolve(distDir, `${playlogClientFilename}.js`));
			await copyFile(resolve(buildDir, `${engineFilesFilename}.js`), resolve(distDir, `${engineFilesFilename}.js`));

			// 3.2. Canvas版のファイルをコピー（v2以降のみ）
			if (hasCanvasVersion) {
				console.log("generate akashic-runtime-canvas directory");
				await mkdir(akashicRuntimeCanvasDir, { recursive: true });

				await copyFile(
					resolve(buildDir, `${playlogClientFilename}.min.js`),
					resolve(akashicRuntimeCanvasDir, `${playlogClientFilename}.js`)
				);
				await copyFile(
					resolve(buildDir, `${engineFilesCanvasFilename}.js`),
					resolve(akashicRuntimeCanvasDir, `${engineFilesCanvasFilename}.js`)
				);

				console.log(`akashic-runtime-canvas directory is created successfully`);
			}
		}

		// entrypoint の作成
		{
			// 1. pdi-game-runner の配布物をコピー
			console.log("copy @akashic/pdi-game-runner distributions");
			const pdiGameRunnerDistPath = resolve(tempDir, "node_modules", "@akashic", "pdi-game-runner", "build");
			const copiedFilepaths = globSync(join(pdiGameRunnerDistPath, "*"));
			const outputPath = resolve(buildDir, "entry");
			await mkdir(outputPath);
			for (const copiedFilepath of copiedFilepaths) {
				if (extname(copiedFilepath) !== ".js") continue; // .js 以外 (.map など) は除外
				await copyFile(copiedFilepath, resolve(outputPath, basename(copiedFilepath)));
			}

			// 2. pdi-game-runner の配布物のうち、engine-files 関連のファイルを上書き・追加
			//
			// この上書きは、クライアント向け (dist/engineFilesV〜.js) とサーバ向け (dist/entry/*.js) のエンジンのバージョンを揃えるためのもの。
			// 本来 pdi-game-runner の dependencies を正しく (engine-files 更新のたびに都度) 更新していれば不要なはずだが、
			// 歴史的経緯からここで上書きして辻褄を合わせている。
			// (環境間でバージョンの不整合が絶対に起きないというメリットがある。一方 (滅多にないが) エンジンのインターフェースが変わった時は動かない)
			//
			// 特に pdi-common-impl.js は、 pdi-game-runner 自身の配布物には (必要にも関わらず) 含まれていないことに注意。
			// すなわち上書きではなく、ここで初めて追加されるファイルになっている (pdi-game-runner@3.20.0 現在) 。
			await exec(`npx browserify -r @akashic/akashic-engine -o ${outputPath}/akashic-engine.js`, { cwd: tempDir });
			await validateModule(resolve(outputPath, "akashic-engine.js"));
			await exec(`npx browserify -r @akashic/game-driver -o ${outputPath}/game-driver.js -x @akashic/akashic-engine`, {
				cwd: tempDir,
			});
			await validateModule(resolve(outputPath, "game-driver.js"));

			// pdi-common-impl は v3 以降のみ存在
			const hasPdiCommonImpl = semver.gte(engineFilesPackageJSON.version, "3.0.0");
			if (hasPdiCommonImpl) {
				await exec(`npx browserify -r @akashic/pdi-common-impl -o ${outputPath}/pdi-common-impl.js`, { cwd: tempDir });
				await validateModule(resolve(outputPath, "pdi-common-impl.js"));
			} else {
				console.log("pdi-common-impl not available for v1/v2, skipping...");
			}

			// 3. bundle_info.txt を作成
			console.log("create bundle_info.txt");
			await writeFile(
				join(outputPath, "bundle_info.txt"),
				`engine-files: ${versionInfo.dependencies["@akashic/engine-files"]}\n` +
					`pdi-game-runner: ${versionInfo.dependencies["@akashic/pdi-game-runner"]}`
			);

			// 4. entrypoint のファイルを dist にコピー
			const filepaths = globSync(resolve(outputPath, "*"));
			for (const filepath of filepaths) {
				await copyFile(filepath, resolve(distDir, basename(filepath)));
			}

			// 4.1. Canvas版ディレクトリにもコピー
			if (hasCanvasVersion) {
				for (const filepath of filepaths) {
					await copyFile(filepath, resolve(akashicRuntimeCanvasDir, basename(filepath)));
				}
			}
			console.log(`entrypoint for akashic-runtime v${version} is generated successfully`);
		}

		// MANIFEST.md を生成
		await generateManifestMarkdown(versionInfo, tempDir, distDir);

		// Canvas版ディレクトリにもコピー
		if (hasCanvasVersion) {
			await copyFile(resolve(distDir, "MANIFEST.md"), resolve(akashicRuntimeCanvasDir, "MANIFEST.md"));
		}

		await validateDistDir(distDir, versionInfo);

		console.log();
		console.log(`✓ Version ${version} built successfully in ${distDir}`);
	} finally {
		// 一時ディレクトリをクリーンアップ
		if (options.keepTemp) {
			console.log(`Temporary directory kept at: ${tempDir}`);
		} else {
			console.log("Cleaning up temporary directory...");
			await rm(tempDir, { recursive: true, force: true });
		}
	}

	return true;
}
