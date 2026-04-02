import { Args, Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { api, decodeOrFail } from "../api.js";
import type {
	Issue,
	State,
	StatsPeriod,
	StatsResult,
	WorkspaceStatsResult,
} from "../config.js";
import {
	PaginatedIssuesResponseSchema,
	ProjectsResponseSchema,
} from "../config.js";
import { formatStats } from "../format.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import {
	getMemberId,
	requireProjectFeature,
	resolveCycle,
	resolveModule,
	resolveProject,
} from "../resolve.js";
import { getConfig } from "../user-config.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription(
		"Project identifier — see 'plane projects list' for available identifiers. Use '@current' for the saved default project.",
	),
	Args.withDefault(""),
);

const sinceOption = Options.optional(Options.text("since")).pipe(
	Options.withDescription(
		"Only count issues created on or after this date (YYYY-MM-DD)",
	),
);

const untilOption = Options.optional(Options.text("until")).pipe(
	Options.withDescription(
		"Only count issues created before this date (YYYY-MM-DD)",
	),
);

const cycleOption = Options.optional(Options.text("cycle")).pipe(
	Options.withDescription("Scope stats to a cycle (name or UUID)"),
);

const moduleOption = Options.optional(Options.text("module")).pipe(
	Options.withDescription("Scope stats to a module (name or UUID)"),
);

const assigneeOption = Options.optional(Options.text("assignee")).pipe(
	Options.withDescription(
		"Scope stats to an assignee (display name, email, or member UUID)",
	),
);

const EMPTY_STATE_COUNTS: Record<string, number> = {
	backlog: 0,
	unstarted: 0,
	started: 0,
	completed: 0,
	cancelled: 0,
};

const EMPTY_PRIORITY_COUNTS: Record<string, number> = {
	urgent: 0,
	high: 0,
	medium: 0,
	low: 0,
	none: 0,
};

function getPeriod(
	since: Option.Option<string>,
	until: Option.Option<string>,
): Effect.Effect<StatsPeriod | undefined, Error> {
	return Effect.sync(() => {
		const period: StatsPeriod = {};
		if (since._tag === "Some") {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(since.value)) {
				throw new Error("Invalid --since date. Expected YYYY-MM-DD.");
			}
			period.since = since.value;
		}
		if (until._tag === "Some") {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(until.value)) {
				throw new Error("Invalid --until date. Expected YYYY-MM-DD.");
			}
			period.until = until.value;
		}
		if (!period.since && !period.until) {
			return undefined;
		}
		if (
			period.since &&
			period.until &&
			new Date(period.since) >= new Date(period.until)
		) {
			throw new Error("--since must be earlier than --until.");
		}
		return period;
	});
}

function isDateInRange(
	value: string | null | undefined,
	period?: StatsPeriod,
): boolean {
	if (!value) {
		return false;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return false;
	}
	if (period?.since && date < new Date(period.since)) {
		return false;
	}
	if (period?.until && date >= new Date(period.until)) {
		return false;
	}
	return true;
}

function aggregateStats(
	issues: readonly Issue[],
	projKey: string,
	period?: StatsPeriod,
): StatsResult {
	const byStateGroup: Record<string, number> = { ...EMPTY_STATE_COUNTS };
	const byPriority: Record<string, number> = { ...EMPTY_PRIORITY_COUNTS };
	let assigned = 0;
	let unassigned = 0;
	let createdInRange = 0;
	let completedInRange = 0;

	for (const issue of issues) {
		const state = issue.state as State | string;
		const group = typeof state === "object" ? state.group : "unknown";
		byStateGroup[group] = (byStateGroup[group] ?? 0) + 1;
		byPriority[issue.priority] = (byPriority[issue.priority] ?? 0) + 1;

		if (Array.isArray(issue.assignees) && issue.assignees.length > 0) {
			assigned++;
		} else {
			unassigned++;
		}

		if (isDateInRange(issue.created_at, period)) {
			createdInRange++;
		}

		if (isDateInRange(issue.completed_at, period)) {
			completedInRange++;
		}
	}

	return {
		project: projKey,
		...(period ? { period } : {}),
		total_issues: issues.length,
		by_state_group: byStateGroup,
		by_priority: byPriority,
		created_in_range: period ? createdInRange : issues.length,
		completed_in_range: period
			? completedInRange
			: issues.filter((issue) => issue.completed_at).length,
		assigned,
		unassigned,
	};
}

function combineStats(
	label: string,
	projects: ReadonlyArray<StatsResult>,
	period?: StatsPeriod,
	skippedProjects?: ReadonlyArray<string>,
): WorkspaceStatsResult {
	const result: WorkspaceStatsResult = {
		workspace: label,
		...(period ? { period } : {}),
		total_issues: 0,
		by_state_group: { ...EMPTY_STATE_COUNTS },
		by_priority: { ...EMPTY_PRIORITY_COUNTS },
		created_in_range: 0,
		completed_in_range: 0,
		assigned: 0,
		unassigned: 0,
		projects: [...projects],
		...(skippedProjects && skippedProjects.length > 0
			? { skipped_projects: [...skippedProjects] }
			: {}),
	};

	for (const project of projects) {
		result.total_issues += project.total_issues;
		result.created_in_range += project.created_in_range;
		result.completed_in_range += project.completed_in_range;
		result.assigned += project.assigned;
		result.unassigned += project.unassigned;

		for (const [group, count] of Object.entries(project.by_state_group)) {
			result.by_state_group[group] =
				(result.by_state_group[group] ?? 0) + count;
		}

		for (const [priority, count] of Object.entries(project.by_priority)) {
			result.by_priority[priority] =
				(result.by_priority[priority] ?? 0) + count;
		}
	}

	return result;
}

function fetchIssueCollection(path: string): Effect.Effect<Issue[], Error> {
	return Effect.gen(function* () {
		const issues: Issue[] = [];
		let cursor: string | undefined;

		while (true) {
			const separator = path.includes("?") ? "&" : "?";
			const cursorPart = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
			const raw = yield* api.get(
				`${path}${separator}per_page=100${cursorPart}`,
			);
			const page = yield* decodeOrFail(PaginatedIssuesResponseSchema, raw);
			issues.push(...page.results);
			if (!page.next_page_results || !page.next_cursor) {
				break;
			}
			cursor = page.next_cursor;
		}

		return issues;
	});
}

function filterByCycleOrModule(
	projectId: string,
	issues: readonly Issue[],
	cycle: Option.Option<string>,
	module: Option.Option<string>,
) {
	return Effect.gen(function* () {
		let filtered = [...issues];

		if (cycle._tag === "Some") {
			yield* requireProjectFeature(projectId, "cycle_view");
			const resolved = yield* resolveCycle(projectId, cycle.value);
			const cycleIssues = yield* fetchIssueCollection(
				`projects/${projectId}/cycles/${resolved.id}/cycle-issues/`,
			);
			const cycleIssueIds = new Set(cycleIssues.map((i) => i.id));
			filtered = filtered.filter((i) => cycleIssueIds.has(i.id));
		}

		if (module._tag === "Some") {
			yield* requireProjectFeature(projectId, "module_view");
			const resolved = yield* resolveModule(projectId, module.value);
			const moduleIssues = yield* fetchIssueCollection(
				`projects/${projectId}/modules/${resolved.id}/module-issues/`,
			);
			const moduleIssueIds = new Set(moduleIssues.map((i) => i.id));
			filtered = filtered.filter((i) => moduleIssueIds.has(i.id));
		}

		return filtered;
	});
}

function outputStats(result: StatsResult | WorkspaceStatsResult) {
	return Effect.gen(function* () {
		if (jsonMode) {
			yield* Console.log(JSON.stringify(result, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml([result]));
			return;
		}
		yield* Console.log(formatStats(result));
	});
}

function getScopedProjectIssues(
	projectId: string,
	assignee: Option.Option<string>,
	cycle: Option.Option<string>,
	module: Option.Option<string>,
): Effect.Effect<Issue[], Error> {
	return Effect.gen(function* () {
		let filtered = yield* fetchIssueCollection(
			`projects/${projectId}/issues/?order_by=sequence_id`,
		);

		if (assignee._tag === "Some") {
			const isUuid =
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
					assignee.value,
				);
			const memberId = isUuid
				? assignee.value
				: yield* getMemberId(assignee.value);
			filtered = filtered.filter(
				(issue) =>
					Array.isArray(issue.assignees) && issue.assignees.includes(memberId),
			);
		}

		return yield* filterByCycleOrModule(projectId, filtered, cycle, module);
	});
}

function workspaceStatsHandler({
	period,
}: {
	period?: StatsPeriod;
}): Effect.Effect<void, Error> {
	return Effect.gen(function* () {
		const raw = yield* api.get("projects/");
		const { results } = yield* decodeOrFail(ProjectsResponseSchema, raw);
		const projectStats: StatsResult[] = [];
		const skippedProjects: string[] = [];

		for (const project of results) {
			const issues = yield* getScopedProjectIssues(
				project.id,
				Option.none(),
				Option.none(),
				Option.none(),
			).pipe(
				Effect.catchAll((error) => {
					if (/^HTTP 403:/.test(error.message)) {
						skippedProjects.push(project.identifier);
						return Effect.succeed([]);
					}
					return Effect.fail(error);
				}),
			);
			if (issues.length === 0 && skippedProjects.includes(project.identifier)) {
				continue;
			}
			projectStats.push(aggregateStats(issues, project.identifier, period));
		}

		const result = combineStats(
			getConfig().workspace,
			projectStats,
			period,
			skippedProjects,
		);
		yield* outputStats(result);
	});
}

export function statsHandler({
	project,
	since,
	until,
	cycle,
	module,
	assignee,
}: {
	project: string;
	since: Option.Option<string>;
	until: Option.Option<string>;
	cycle: Option.Option<string>;
	module: Option.Option<string>;
	assignee: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		const period = yield* getPeriod(since, until);
		if (project.trim().toLowerCase() === "workspace") {
			if (
				cycle._tag === "Some" ||
				module._tag === "Some" ||
				assignee._tag === "Some"
			) {
				return yield* Effect.fail(
					new Error(
						"Workspace stats currently support only --since and --until.",
					),
				);
			}
			return yield* workspaceStatsHandler({ period });
		}

		const { key, id } = yield* resolveProject(project);
		const issues = yield* getScopedProjectIssues(id, assignee, cycle, module);
		const result = aggregateStats(issues, key, period);
		yield* outputStats(result);
	});
}

export const statsList = Command.make(
	"stats",
	{
		project: projectArg,
		since: sinceOption,
		until: untilOption,
		cycle: cycleOption,
		module: moduleOption,
		assignee: assigneeOption,
	},
	statsHandler,
).pipe(
	Command.withDescription(
		"Show aggregated issue statistics for a project or for the whole workspace using PROJECT='workspace'.\n\nBreaks down issues by state group, priority, assignment, and period counts.\nAll aggregation is client-side — no server analytics endpoints required.\n\nFilters:\n  --since DATE   Count created/completed issues on or after DATE (YYYY-MM-DD)\n  --until DATE   Count created/completed issues before DATE (YYYY-MM-DD)\n  --cycle NAME   Scope to a specific cycle (project stats only)\n  --module NAME  Scope to a specific module (project stats only)\n  --assignee WHO Scope to issues assigned to a member (project stats only)\n\nNote: @effect/cli requires command options before PROJECT, so use 'plane stats --since 2026-04-01 PROJ'.",
	),
);

export const stats = statsList;
