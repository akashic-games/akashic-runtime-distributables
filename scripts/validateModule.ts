import { Script } from "node:vm";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

/**
 * 対象の .js ファイルが正常かどうかを簡易的に確認する。
 * @param filepath 対象の .js ファイル
 */
export async function validateModule(filepath: string) {
	const filename = basename(filepath);
	console.log(`validating ${filename}`);
	const data = await readFile(filepath, { encoding: "utf-8" });

	// 空ファイルで無いかを確認
	if (data.trim() === "") {
		throw new Error("The file is empty.");
	}

	// 構文エラーを確認 (実行はしない)
	new Script(data);
}
