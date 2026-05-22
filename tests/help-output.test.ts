import { describe, expect, it } from "bun:test";

describe("generated help output", () => {
	it("shows structured output flags on issue list help", async () => {
		const output = await runHelp(["issues", "list", "--help"]);
		expect(output).toContain("--json");
		expect(output).toContain("--xml");
	});

	it("shows bulk validation flags", async () => {
		const output = await runHelp(["issues", "bulk-create", "--help"]);
		expect(output).toContain("--file");
		expect(output).toContain("--dry-run");
		expect(output).toContain("--dedupe");
		expect(output).toContain("--json");
	});

	it("shows project context command help", async () => {
		const output = await runHelp(["project", "context", "--help"]);
		expect(output).toContain("--json");
		expect(output).toContain("project-context.json");
	});
});

async function runHelp(args: string[]): Promise<string> {
	const proc = Bun.spawn(["bun", "src/bin.ts", ...args], {
		cwd: process.cwd(),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	expect(exitCode).toBe(0);
	return `${stdout}\n${stderr}`;
}
