import type {
	Issue,
	State,
	StatsPeriod,
	StatsResult,
	WorkspaceStatsResult,
} from "./config.js";

export function escapeHtmlText(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

export function formatIssue(issue: Issue, projKey: string): string {
	const state = issue.state as State | string;
	const stateName = typeof state === "object" ? state.name : "?";
	const stateGroup = typeof state === "object" ? state.group : "?";
	const seqPad = String(issue.sequence_id).padStart(3, " ");
	const groupPad = stateGroup.padEnd(10, " ");
	const namePad = stateName.padEnd(12, " ");
	return `${projKey}-${seqPad}  [${groupPad}]  ${namePad}  ${issue.name}`;
}

function formatPeriod(period?: StatsPeriod): string {
	if (!period || (!period.since && !period.until)) {
		return "";
	}
	return ` (${period.since ?? "..."} to ${period.until ?? "..."})`;
}

function formatInlineCounts(counts: Record<string, number>): string {
	return Object.entries(counts)
		.filter(([, count]) => count > 0)
		.map(([label, count]) => `${label}=${count}`)
		.join(", ");
}

function formatProjectStats(data: StatsResult): string {
	const lines: string[] = [];
	lines.push(`${data.project} Stats${formatPeriod(data.period)}`);
	lines.push(`  Total issues:    ${data.total_issues}`);
	lines.push(`  By state group:  ${formatInlineCounts(data.by_state_group)}`);
	lines.push(`  By priority:     ${formatInlineCounts(data.by_priority)}`);
	lines.push(
		`  Created:         ${data.created_in_range}${data.period ? " (in range)" : ""}`,
	);
	lines.push(
		`  Completed:       ${data.completed_in_range}${data.period ? " (in range)" : ""}`,
	);
	lines.push(
		`  Assignee spread: ${data.assigned} assigned, ${data.unassigned} unassigned`,
	);
	return lines.join("\n");
}

function formatWorkspaceStats(data: WorkspaceStatsResult): string {
	const lines: string[] = [];
	lines.push(`Workspace ${data.workspace} Stats${formatPeriod(data.period)}`);
	lines.push(`  Total issues:    ${data.total_issues}`);
	lines.push(`  By state group:  ${formatInlineCounts(data.by_state_group)}`);
	lines.push(`  By priority:     ${formatInlineCounts(data.by_priority)}`);
	lines.push(
		`  Created:         ${data.created_in_range}${data.period ? " (in range)" : ""}`,
	);
	lines.push(
		`  Completed:       ${data.completed_in_range}${data.period ? " (in range)" : ""}`,
	);
	lines.push(
		`  Assignee spread: ${data.assigned} assigned, ${data.unassigned} unassigned`,
	);
	if (data.projects.length > 0) {
		lines.push("");
		lines.push("Projects:");
		for (const project of data.projects) {
			lines.push(
				`  ${project.project}: total=${project.total_issues}, created=${project.created_in_range}, completed=${project.completed_in_range}`,
			);
		}
	}
	if (data.skipped_projects && data.skipped_projects.length > 0) {
		lines.push("");
		lines.push(`Skipped projects: ${data.skipped_projects.join(", ")}`);
	}
	return lines.join("\n");
}

export function formatStats(data: StatsResult | WorkspaceStatsResult): string {
	if ("workspace" in data) {
		return formatWorkspaceStats(data);
	}
	return formatProjectStats(data);
}
