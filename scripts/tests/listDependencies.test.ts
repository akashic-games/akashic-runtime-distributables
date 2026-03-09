import { Dependency, listDependencies } from "../listDependencies";

describe("listDependencies", () => {
	test("can list dependencies", async () => {
		const input: Dependency = require("./fixtures/npm-ls-result-1.json");
		const output = await listDependencies(input, /^@akashic\/engine\-files/, 0, "* ");
		expect(output).toBe(
			"* @akashic/engine-files: 3.0.0\n" +
				"  * @akashic/akashic-engine: 3.0.0-beta.30\n" +
				"  * @akashic/game-driver: 2.0.0-beta.9\n" +
				"  * @akashic/pdi-types: 1.1.0\n" +
				"  * @akashic/playlog-client: 7.0.42\n" +
				"* @akashic/playlog-client: 7.2.1"
		);
	});
});
