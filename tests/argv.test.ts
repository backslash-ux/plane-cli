import { describe, expect, it } from "bun:test";
import { normalizeArgv } from "@/argv";

describe("normalizeArgv", () => {
	it("accepts list options after the project argument", () => {
		expect(
			normalizeArgv([
				"bun",
				"plane",
				"issues",
				"list",
				"@current",
				"--state",
				"Todo",
			]),
		).toEqual([
			"bun",
			"plane",
			"issues",
			"list",
			"--state",
			"Todo",
			"@current",
		]);
	});

	it("accepts create options after the project argument", () => {
		expect(
			normalizeArgv([
				"bun",
				"plane",
				"issue",
				"create",
				"@current",
				"--title",
				"Follow-up",
				"--json",
			]),
		).toEqual([
			"bun",
			"plane",
			"issue",
			"create",
			"--title",
			"Follow-up",
			"--json",
			"@current",
		]);
	});
});
