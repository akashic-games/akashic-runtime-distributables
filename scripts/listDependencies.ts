export interface Dependency {
	version: string;
	dependencies: { [name: string]: Dependency };
}

export async function listDependencies(dependency: Dependency, moduleNameFilter: RegExp, indent: number, prefix: string) {
	let ret = "";
	const depModules = Object.entries(dependency.dependencies);

	for (const [moduleName, depModule] of depModules) {
		ret += `${"  ".repeat(indent)}${prefix}${moduleName}: ${depModule.version}\n`;
		if (moduleNameFilter.test(moduleName)) {
			if (depModule.dependencies) {
				ret += await listDependencies(depModule, moduleNameFilter, indent + 1, prefix);
				ret += "\n";
			}
		}
	}

	return ret.trimEnd();
}
