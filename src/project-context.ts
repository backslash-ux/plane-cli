import * as fs from "node:fs";
import * as path from "node:path";
import type {
	Estimate,
	EstimatePoint,
	Label,
	ProjectDetail,
	State,
} from "./config.js";
import { isProjectIntakeEnabled } from "./config.js";
import { getLocalConfigDir } from "./user-config.js";

interface ProjectSummary {
	id: string;
	identifier: string;
	name: string;
}

interface ProjectFeaturesSummary {
	cycles: boolean;
	modules: boolean;
	views: boolean;
	pages: boolean;
	intake: boolean;
	estimates: boolean;
}

interface ProjectStateHelperEntry {
	id: string;
	name: string;
	group: string;
	color?: string;
}

interface ProjectLabelHelperEntry {
	id: string;
	name: string;
	color?: string | null;
	parent?: string | null;
}

interface ProjectEstimatePointHelperEntry {
	id: string;
	key?: number;
	value: string;
	description?: string | null;
}

export interface ProjectContextSnapshot {
	generatedAt: string;
	project: ProjectSummary;
	features: ProjectFeaturesSummary;
	helpers: {
		states: {
			total: number;
			byName: Record<string, ProjectStateHelperEntry>;
			byGroup: Record<string, ProjectStateHelperEntry[]>;
		};
		labels: {
			total: number;
			byName: Record<string, ProjectLabelHelperEntry>;
		};
		estimate: {
			enabled: boolean;
			id?: string;
			name?: string;
			type?: string;
			points: ProjectEstimatePointHelperEntry[];
			pointsByValue: Record<string, ProjectEstimatePointHelperEntry>;
		};
	};
}

function normalizeLookupKey(value: string): string {
	return value.trim().toLowerCase();
}

export function buildProjectContextSnapshot({
	project,
	detail,
	states,
	labels,
	estimate,
	estimatePoints,
}: {
	project: ProjectSummary;
	detail: ProjectDetail;
	states: readonly State[];
	labels: readonly Label[];
	estimate: Estimate | null;
	estimatePoints: readonly EstimatePoint[];
}): ProjectContextSnapshot {
	const statesByName: Record<string, ProjectStateHelperEntry> = {};
	const statesByGroup: Record<string, ProjectStateHelperEntry[]> = {};
	for (const state of states) {
		const entry: ProjectStateHelperEntry = {
			id: state.id,
			name: state.name,
			group: state.group,
			color: state.color,
		};
		statesByName[normalizeLookupKey(state.name)] = entry;
		statesByGroup[state.group] ??= [];
		statesByGroup[state.group].push(entry);
	}

	const labelsByName: Record<string, ProjectLabelHelperEntry> = {};
	for (const label of labels) {
		labelsByName[normalizeLookupKey(label.name)] = {
			id: label.id,
			name: label.name,
			color: label.color,
			parent: label.parent,
		};
	}

	const points = estimatePoints
		.map((point) => ({
			id: point.id,
			key: point.key,
			value: point.value,
			description: point.description,
		}))
		.sort((left, right) => (left.key ?? 0) - (right.key ?? 0));
	const pointsByValue = Object.fromEntries(
		points.map((point) => [normalizeLookupKey(point.value), point]),
	);

	return {
		generatedAt: new Date().toISOString(),
		project,
		features: {
			cycles: detail.cycle_view,
			modules: detail.module_view,
			views: detail.issue_views_view,
			pages: detail.page_view,
			intake: isProjectIntakeEnabled(detail),
			estimates: estimate !== null,
		},
		helpers: {
			states: {
				total: states.length,
				byName: statesByName,
				byGroup: statesByGroup,
			},
			labels: {
				total: labels.length,
				byName: labelsByName,
			},
			estimate: {
				enabled: estimate !== null,
				id: estimate?.id,
				name: estimate?.name,
				type: estimate?.type,
				points,
				pointsByValue,
			},
		},
	};
}

export function getLocalProjectContextFilePath(cwd = process.cwd()): string {
	return path.join(getLocalConfigDir(cwd), "project-context.json");
}

export function writeLocalProjectContextSnapshot(
	snapshot: ProjectContextSnapshot,
	cwd = process.cwd(),
): void {
	const filePath = getLocalProjectContextFilePath(cwd);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, {
		mode: 0o600,
	});
	fs.chmodSync(filePath, 0o600);
}
