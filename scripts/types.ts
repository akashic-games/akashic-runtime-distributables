export interface VersionInfo {
	version: string;
	dependencies: {
		"@akashic/engine-files": string;
		"@akashic/playlog-client": string;
		"@akashic/pdi-game-runner": string;
	};
	created_at: string;
}

export type VersionsInfoDependency = Omit<VersionInfo["dependencies"], "@akashic/engine-files">;

export interface VersionsJson {
	schema_version: string;
	versions: VersionInfo[];
}
