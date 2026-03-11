import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import semver from "semver";
import { buildVersion, validateDistZip, type BuildOptions } from "./build.js";
import { addVersion } from "./addVersion.js";
import { readVersionsJson } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = resolve(__dirname, "..");
const versionsJsonPath = resolve(rootDir, "versions.json");

async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (command === "build") {
		await runBuild(args.slice(1));
	} else if (command === "add-version") {
		await runAddVersion(args.slice(1));
	} else {
		throw new Error(`Unknown command: ${command}`);
	}
}

async function runAddVersion(args: string[]) {
	const { positionals } = parseArgs({
		args,
		allowPositionals: true,
	});

	const baseVersion = positionals[0];
	if (!baseVersion) {
		throw new Error("Base version is required (e.g., 3.13.4)");
	}

	// semver 形式かチェック
	const parsedVersion = semver.valid(baseVersion);
	if (!parsedVersion) {
		throw new Error(`Invalid version format: ${baseVersion}. Expected x.y.z format (e.g., 3.13.4)`);
	}

	const newVersion = await addVersion({ versionsJsonPath, baseVersion });
	console.log(newVersion);
}

async function runBuild(args: string[]) {
	const { values } = parseArgs({
		args,
		options: {
			version: {
				type: "string",
				short: "v",
			},
			"keep-temp": {
				type: "boolean",
				default: false,
			},
			"prebuilt-dist-zip": {
				type: "string",
			},
		},
		allowPositionals: false,
	});

	if (!values.version) {
		throw new Error("--version is required");
	}

	const versionsJson = await readVersionsJson(versionsJsonPath);
	const prebuiltDistZip = values["prebuilt-dist-zip"] ? await validateDistZip(resolve(rootDir, values["prebuilt-dist-zip"])) : undefined;
	const buildOptions = {
		cwd: rootDir,
		distDir: resolve(rootDir, "dist"),
		keepTemp: values["keep-temp"],
		prebuiltDistZip,
	} satisfies BuildOptions;

	if (values.version === "all") {
		// 全バージョンをビルド
		console.log(`Building all ${versionsJson.versions.length} versions...`);
		console.log();
		let builtCount = 0;
		for (const versionInfo of versionsJson.versions) {
			const built = await buildVersion(versionInfo, buildOptions);
			if (built) builtCount++;
		}
		if (buildOptions.prebuiltDistZip && builtCount === 0) {
			throw new Error("No versions were built: all versions were found in the zip file. The zip may be up to date already.");
		}
	} else {
		// 特定バージョンをビルド
		const targetVersion = values.version;
		const versionInfo = versionsJson.versions.find(v => v.version === targetVersion);

		if (!versionInfo) {
			throw new Error(`Version ${targetVersion} not found in versions.json`);
		}

		await buildVersion(versionInfo, buildOptions);
	}
}

main().catch(e => {
	console.error(`Error: ${e.message}`);
	process.exitCode = 1;
});
