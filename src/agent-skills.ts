import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface AgentConfig {
	id: string;
	displayName: string;
	dirName: string;
}

export const SUPPORTED_AGENTS: readonly AgentConfig[] = [
	{ id: "windsurf", displayName: "Windsurf", dirName: ".windsurf" },
	{ id: "opencode", displayName: "OpenCode", dirName: ".opencode" },
	{ id: "claude", displayName: "Claude", dirName: ".claude" },
	{ id: "codex", displayName: "Codex", dirName: ".codex" },
] as const;

export function getAgentSkillPath(
	agentId: string,
	cwd = process.cwd(),
): string {
	const agent = SUPPORTED_AGENTS.find((a) => a.id === agentId);
	if (!agent) {
		throw new Error(`Unknown agent: ${agentId}`);
	}
	return path.join(cwd, agent.dirName, "skills", "plane-cli", "SKILL.md");
}

export function getAgentDirPath(agentId: string, cwd = process.cwd()): string {
	const agent = SUPPORTED_AGENTS.find((a) => a.id === agentId);
	if (!agent) {
		throw new Error(`Unknown agent: ${agentId}`);
	}
	return path.join(cwd, agent.dirName);
}

export function checkAgentExists(
	agentId: string,
	cwd = process.cwd(),
): boolean {
	try {
		const agentDir = getAgentDirPath(agentId, cwd);
		return fs.existsSync(agentDir);
	} catch {
		return false;
	}
}

export function detectInstalledAgents(cwd = process.cwd()): string[] {
	return SUPPORTED_AGENTS.filter((agent) =>
		checkAgentExists(agent.id, cwd),
	).map((agent) => agent.id);
}

export function writeAgentSkill(
	agentId: string,
	skillContent: string,
	cwd = process.cwd(),
): void {
	const skillPath = getAgentSkillPath(agentId, cwd);
	const skillDir = path.dirname(skillPath);

	// Create nested directory structure: .{agent}/skills/plane-cli/
	fs.mkdirSync(skillDir, { recursive: true });
	fs.writeFileSync(skillPath, skillContent, "utf8");
}

export function readPackageSkillContent(): string | null {
	// src/agent-skills.ts -> package root is one directory up
	const srcDir = path.dirname(fileURLToPath(import.meta.url));
	const skillPath = path.join(srcDir, "..", "SKILL.md");

	if (!fs.existsSync(skillPath)) {
		return null;
	}
	return fs.readFileSync(skillPath, "utf8");
}

export function hasAgentSkillInstalled(
	agentId: string,
	cwd = process.cwd(),
): boolean {
	try {
		const skillPath = getAgentSkillPath(agentId, cwd);
		return fs.existsSync(skillPath);
	} catch {
		return false;
	}
}
