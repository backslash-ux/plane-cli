import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectContextSnapshot } from "./project-context.js";
import { getLocalConfigDir } from "./user-config.js";

const MANAGED_SECTION_START = "<!-- plane-cli local project context start -->";
const MANAGED_SECTION_END = "<!-- plane-cli local project context end -->";

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildManagedSection(snapshot: ProjectContextSnapshot): string {
	return [
		MANAGED_SECTION_START,
		"## Plane Project Context",
		`This directory is scoped to Plane project ${snapshot.project.identifier} (${snapshot.project.name}).`,
		"",
		"When working as an AI agent in this directory:",
		"- Read `./.plane/project-context.json` before planning or applying Plane project changes.",
		"- Reuse the existing states, labels, and estimate points in that snapshot instead of creating duplicates.",
		"- Respect the feature flags in that snapshot before using cycles, modules, pages, intake, or estimates.",
		"- Prefer the `plane` CLI from this repository root for Plane project work instead of direct API calls.",
		"- Use `@current` as the default project selector once local init has been run.",
		"- If the shell may contain inherited `PLANE_*` variables, clear them before relying on `./.plane/config.json`.",
		"",
		"Common agent commands:",
		"",
		"```sh",
		"unset PLANE_HOST PLANE_WORKSPACE PLANE_API_TOKEN PLANE_PROJECT",
		"plane projects current",
		"plane issues list @current",
		`plane issue get ${snapshot.project.identifier}-12`,
		`plane issue update --state started ${snapshot.project.identifier}-12`,
		"```",
		"",
		"- Rerun `plane init --local` from this directory whenever the Plane project configuration changes so this context stays current.",
		"",
		"This section is managed by `plane-cli` and is updated by `plane init --local`.",
		MANAGED_SECTION_END,
		"",
	].join("\n");
}

function upsertManagedSection(
	existingContent: string,
	managedSection: string,
): string {
	const managedPattern = new RegExp(
		`${escapeRegExp(MANAGED_SECTION_START)}[\\s\\S]*?${escapeRegExp(MANAGED_SECTION_END)}\\n?`,
		"m",
	);

	if (managedPattern.test(existingContent)) {
		return existingContent.replace(managedPattern, managedSection);
	}

	const trimmed = existingContent.trimEnd();
	if (!trimmed) {
		return managedSection;
	}

	return `${trimmed}\n\n${managedSection}`;
}

export function getLocalAgentsFilePath(cwd = process.cwd()): string {
	return path.join(path.dirname(getLocalConfigDir(cwd)), "AGENTS.md");
}

export function writeLocalProjectAgentsFile(
	snapshot: ProjectContextSnapshot,
	cwd = process.cwd(),
): void {
	const filePath = getLocalAgentsFilePath(cwd);
	const existingContent = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf8")
		: "";
	const nextContent = upsertManagedSection(
		existingContent,
		buildManagedSection(snapshot),
	);
	fs.writeFileSync(filePath, nextContent, "utf8");
}

// ---------------------------------------------------------------------------
// SKILL section – embeds SKILL.md content into AGENTS.md so agents have the
// full CLI usage guide inline.
// ---------------------------------------------------------------------------

const SKILL_SECTION_START = "<!-- plane-cli skill start -->";
const SKILL_SECTION_END = "<!-- plane-cli skill end -->";

function buildSkillSection(skillContent: string): string {
	return [
		SKILL_SECTION_START,
		skillContent.trimEnd(),
		SKILL_SECTION_END,
		"",
	].join("\n");
}

function upsertSkillSection(
	existingContent: string,
	skillContent: string,
): string {
	const skillPattern = new RegExp(
		`${escapeRegExp(SKILL_SECTION_START)}[\\s\\S]*?${escapeRegExp(SKILL_SECTION_END)}\\n?`,
		"m",
	);
	const section = buildSkillSection(skillContent);
	if (skillPattern.test(existingContent)) {
		return existingContent.replace(skillPattern, section);
	}
	const trimmed = existingContent.trimEnd();
	if (!trimmed) {
		return section;
	}
	return `${trimmed}\n\n${section}`;
}

export function getPackageSkillPath(): string {
	// src/project-agents.ts -> package root is one directory up
	const srcDir = path.dirname(fileURLToPath(import.meta.url));
	return path.join(srcDir, "..", "SKILL.md");
}

export function readPackageSkillContent(): string | null {
	const skillPath = getPackageSkillPath();
	if (!fs.existsSync(skillPath)) {
		return null;
	}
	return fs.readFileSync(skillPath, "utf8");
}

export function importSkillIntoAgentsFile(
	skillContent: string,
	cwd = process.cwd(),
): void {
	const filePath = getLocalAgentsFilePath(cwd);
	const existingContent = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf8")
		: "";
	const nextContent = upsertSkillSection(existingContent, skillContent);
	fs.writeFileSync(filePath, nextContent, "utf8");
}

export function hasSkillSectionInAgentsFile(cwd = process.cwd()): boolean {
	const filePath = getLocalAgentsFilePath(cwd);
	if (!fs.existsSync(filePath)) return false;
	const content = fs.readFileSync(filePath, "utf8");
	return content.includes(SKILL_SECTION_START);
}
