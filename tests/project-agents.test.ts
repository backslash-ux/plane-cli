import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getLocalAgentsFilePath,
	hasSkillSectionInAgentsFile,
	importSkillIntoAgentsFile,
	readPackageSkillContent,
	writeLocalProjectAgentsFile,
} from "@/project-agents";
import type { ProjectContextSnapshot } from "@/project-context";

describe("project agents file helpers", () => {
	it("writes and refreshes the managed project context section", async () => {
		const dir = await mkdtemp(join(tmpdir(), "plane-agents-test-"));
		await mkdir(join(dir, ".plane"));
		const agentsPath = getLocalAgentsFilePath(dir);
		await Bun.write(agentsPath, "Existing guidance\n");
		writeLocalProjectAgentsFile(snapshot("ACME"), dir);
		writeLocalProjectAgentsFile(snapshot("WEB"), dir);
		const content = await readFile(agentsPath, "utf8");
		expect(content).toContain("Existing guidance");
		expect(content).toContain("Plane project WEB");
		expect(content).not.toContain("Plane project ACME");
	});

	it("imports and detects the skill section", async () => {
		const dir = await mkdtemp(join(tmpdir(), "plane-skill-test-"));
		await mkdir(join(dir, ".plane"));
		expect(hasSkillSectionInAgentsFile(dir)).toBe(false);
		importSkillIntoAgentsFile("# Skill\n\nUse plane.", dir);
		expect(hasSkillSectionInAgentsFile(dir)).toBe(true);
		const content = await readFile(getLocalAgentsFilePath(dir), "utf8");
		expect(content).toContain("# Skill");
	});

	it("replaces an existing skill section without duplicating it", async () => {
		const dir = await mkdtemp(join(tmpdir(), "plane-skill-replace-test-"));
		await mkdir(join(dir, ".plane"));
		importSkillIntoAgentsFile("# Old Skill", dir);
		importSkillIntoAgentsFile("# New Skill", dir);

		const content = await readFile(getLocalAgentsFilePath(dir), "utf8");
		expect(content).toContain("# New Skill");
		expect(content).not.toContain("# Old Skill");
		expect(content.match(/plane-cli skill start/g)?.length).toBe(1);
	});

	it("imports a skill section into an empty AGENTS file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "plane-empty-skill-test-"));
		await mkdir(join(dir, ".plane"));
		importSkillIntoAgentsFile("# Skill Only", dir);

		const content = await readFile(getLocalAgentsFilePath(dir), "utf8");
		expect(content.startsWith("<!-- plane-cli skill start -->")).toBe(true);
		expect(content).toContain("# Skill Only");
	});

	it("does not treat partial skill markers as an installed section", async () => {
		const dir = await mkdtemp(join(tmpdir(), "plane-partial-skill-test-"));
		await mkdir(join(dir, ".plane"));
		await Bun.write(
			getLocalAgentsFilePath(dir),
			"<!-- plane-cli skill start -->",
		);

		expect(hasSkillSectionInAgentsFile(dir)).toBe(false);
	});

	it("reads the packaged SKILL.md content", () => {
		const content = readPackageSkillContent();
		expect(content).toContain("# Plane CLI");
	});
});

function snapshot(identifier: string): ProjectContextSnapshot {
	return {
		generatedAt: "2026-05-22T00:00:00.000Z",
		project: {
			id: `proj-${identifier.toLowerCase()}`,
			identifier,
			name: identifier === "ACME" ? "Acme" : "Web",
		},
		features: {
			cycles: true,
			modules: true,
			views: true,
			pages: true,
			intake: true,
			estimates: false,
		},
		helpers: {
			states: { total: 0, byName: {}, byGroup: {} },
			labels: { total: 0, byName: {} },
			estimate: { enabled: false, points: [], pointsByValue: {} },
		},
	};
}
