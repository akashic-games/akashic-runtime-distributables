import { resolve } from "node:path";
import { validateModule } from "../validateModule";

describe("validateModule", () => {
	test("normal", async () => {
		const filepath = resolve(__dirname, "fixtures", "normal.js");
		await validateModule(filepath);
	});

	test("throw error", async () => {
		const filepath = resolve(__dirname, "fixtures", "throw-error.js");
		await expect(validateModule(filepath)).rejects.toThrow();
	});

	test("throw error (empty code)", async () => {
		const filepath = resolve(__dirname, "fixtures", "empty.js");
		await expect(validateModule(filepath)).rejects.toThrow();
	});

	test("throw error (malicious code)", async () => {
		const filepath = resolve(__dirname, "fixtures", "malicious-code.js");
		await expect(validateModule(filepath)).rejects.toThrow();
	});
});
