import { Args, Command, Options } from "@effect/cli";
import { Console, Effect, type Option } from "effect";
import { api, decodeOrFail } from "../api.js";
import type { State } from "../config.js";
import { IssuesResponseSchema } from "../config.js";
import { formatIssue } from "../format.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import {
	getMemberId,
	requireProjectFeature,
	resolveCycle,
	resolveProject,
} from "../resolve.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription(
		"Project identifier — see 'plane projects list' for available identifiers. Use '@current' for the saved default project.",
	),
);

const listProjectArg = projectArg.pipe(Args.withDefault(""));

const stateOption = Options.optional(Options.text("state")).pipe(
	Options.withDescription(
		"Filter by state group (backlog | unstarted | started | completed | cancelled) or exact state name",
	),
);

const assigneeOption = Options.optional(Options.text("assignee")).pipe(
	Options.withDescription(
		"Filter by assignee (display name, email, or member UUID)",
	),
);

const priorityOption = Options.optional(
	Options.choice("priority", ["urgent", "high", "medium", "low", "none"]),
).pipe(Options.withDescription("Filter by priority"));

const noAssigneeOption = Options.boolean("no-assignee").pipe(
	Options.withDescription("Filter for unassigned issues"),
	Options.withDefault(false),
);

const staleOption = Options.optional(Options.integer("stale")).pipe(
	Options.withDescription("Filter issues not updated in more than N days"),
);

const cycleOption = Options.optional(Options.text("cycle")).pipe(
	Options.withDescription("Filter by cycle (name or UUID)"),
);

export function issuesListHandler({
	project,
	state,
	assignee,
	priority,
	noAssignee,
	stale,
	cycle,
}: {
	project: string;
	state: Option.Option<string>;
	assignee: Option.Option<string>;
	priority: Option.Option<string>;
	noAssignee: boolean;
	stale: Option.Option<number>;
	cycle: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		const { key, id } = yield* resolveProject(project);
		const raw = yield* api.get(`projects/${id}/issues/?order_by=sequence_id`);
		const { results } = yield* decodeOrFail(IssuesResponseSchema, raw);

		let filtered = results;

		if (state._tag === "Some") {
			filtered = filtered.filter((i) => {
				const s = i.state as State | string;
				if (typeof s !== "object") return false;
				const val = state.value.toLowerCase();
				return s.group === val || s.name.toLowerCase() === val;
			});
		}

		if (assignee._tag === "Some") {
			const isUuid =
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
					assignee.value,
				);
			const memberId = isUuid
				? assignee.value
				: yield* getMemberId(assignee.value);
			filtered = filtered.filter(
				(i) => Array.isArray(i.assignees) && i.assignees.includes(memberId),
			);
		}

		if (priority._tag === "Some") {
			filtered = filtered.filter((i) => i.priority === priority.value);
		}

		if (noAssignee) {
			filtered = filtered.filter(
				(i) => !Array.isArray(i.assignees) || i.assignees.length === 0,
			);
		}

		if (stale._tag === "Some") {
			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - stale.value);
			filtered = filtered.filter((i) => {
				if (!i.updated_at) return false;
				return new Date(i.updated_at) < cutoff;
			});
		}

		if (cycle._tag === "Some") {
			yield* requireProjectFeature(id, "cycle_view");
			const resolved = yield* resolveCycle(id, cycle.value);
			const cycleRaw = yield* api.get(
				`projects/${id}/cycles/${resolved.id}/cycle-issues/`,
			);
			const cycleData = yield* decodeOrFail(IssuesResponseSchema, cycleRaw);
			const cycleIssueIds = new Set(cycleData.results.map((i) => i.id));
			filtered = filtered.filter((i) => cycleIssueIds.has(i.id));
		}

		if (jsonMode) {
			yield* Console.log(JSON.stringify(filtered, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(filtered));
			return;
		}
		yield* Console.log(filtered.map((i) => formatIssue(i, key)).join("\n"));
	});
}

export const issuesList = Command.make(
	"list",
	{
		state: stateOption,
		assignee: assigneeOption,
		priority: priorityOption,
		noAssignee: noAssigneeOption,
		stale: staleOption,
		cycle: cycleOption,
		project: listProjectArg,
	},
	issuesListHandler,
).pipe(
	Command.withDescription(
		"List issues for a project ordered by sequence ID.\n\nFilters:\n  --state       State group or name\n  --assignee    Member name/email/UUID\n  --priority    Priority level\n  --no-assignee Unassigned issues only\n  --stale N     Issues not updated in N+ days\n  --cycle       Issues in a specific cycle",
	),
);

export const issues = Command.make("issues").pipe(
	Command.withDescription(
		"List and filter issues. Use 'plane issues list --help' for filtering options.",
	),
	Command.withSubcommands([issuesList]),
);
