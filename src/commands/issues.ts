import { Command, Options, Args } from "@effect/cli";
import { Console, Effect } from "effect";
import { api, decodeOrFail } from "../api.js";
import { IssuesResponseSchema } from "../config.js";
import { formatIssue } from "../format.js";
import { getMemberId, resolveProject } from "../resolve.js";
import type { State } from "../config.js";
import { jsonMode, xmlMode, toXml } from "../output.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription(
		"Project identifier — see 'plane projects list' for available identifiers",
	),
);

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

export const issuesList = Command.make(
	"list",
	{
		state: stateOption,
		assignee: assigneeOption,
		priority: priorityOption,
		project: projectArg,
	},
	({ project, state, assignee, priority }) =>
		Effect.gen(function* () {
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
				const memberId = yield* getMemberId(assignee.value);
				filtered = filtered.filter(
					(i) => Array.isArray(i.assignees) && i.assignees.includes(memberId),
				);
			}

			if (priority._tag === "Some") {
				filtered = filtered.filter((i) => i.priority === priority.value);
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
		}),
).pipe(
	Command.withDescription(
		"List issues for a project ordered by sequence ID. Each line shows: REF  [state-group]  state-name  title",
	),
);

export const issues = Command.make("issues").pipe(
	Command.withDescription(
		"List and filter issues. Use 'plane issues list --help' for filtering options.",
	),
	Command.withSubcommands([issuesList]),
);
