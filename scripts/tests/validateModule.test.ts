import { resolve } from "node:path";
import { validateModule } from "../validateModule";

describe("validateModule", () => {
	test("normal", async () => {
		const filepath = resolve(__dirname, "fixtures", "normal.js");
		await validateModule(filepath);
	});

	test("throw error (empty code)", async () => {
		const filepath = resolve(__dirname, "fixtures", "empty.js");
		await expect(validateModule(filepath)).rejects.toThrow();
	});

	test("throw error (syntax error)", async () => {
		const filepath = resolve(__dirname, "fixtures", "syntax-error.js");
		await expect(validateModule(filepath)).rejects.toThrow(SyntaxError);
	});
});
