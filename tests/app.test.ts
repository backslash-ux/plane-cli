import { describe, expect, it } from "bun:test";
import { isRootHelpRequest, renderRootHelp, VERSION } from "@/app";

describe("root help", () => {
	it("treats bare invocation as a root help request", () => {
		expect(isRootHelpRequest(["node", "bin/plane"])).toBe(true);
	});

	it("treats a lone help flag as a root help request", () => {
		expect(isRootHelpRequest(["node", "bin/plane", "--help"])).toBe(true);
		expect(isRootHelpRequest(["node", "bin/plane", "-h"])).toBe(true);
	});

	it("leaves subcommand help and other invocations to effect cli", () => {
		expect(isRootHelpRequest(["node", "bin/plane", "issue", "--help"])).toBe(
			false,
		);
		expect(isRootHelpRequest(["node", "bin/plane", "--version"])).toBe(false);
		expect(isRootHelpRequest(["node", "bin/plane", "projects", "list"])).toBe(
			false,
		);
	});

	it("renders a concise root help overview", () => {
		const help = renderRootHelp();

		expect(help).toContain(`plane ${VERSION}`);
		expect(help).toContain("plane <command> --help");
		expect(help).toContain("projects    list, current, use");
		expect(help).toContain("Add --json or --xml to list/get commands");
		expect(help).not.toContain("OPTIONS");
		expect(help).not.toContain("issue issue relation");
		expect(help).not.toContain("cycles cycles issues");
	});
});
