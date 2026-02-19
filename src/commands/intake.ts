import { Command, Options, Args } from "@effect/cli";
import { Console, Effect } from "effect";
import { api, decodeOrFail } from "../api.js";
import { IntakeIssuesResponseSchema } from "../config.js";
import { resolveProject } from "../resolve.js";
import { jsonMode, xmlMode, toXml } from "../output.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription("Project identifier (e.g. PROJ, WEB, OPS)"),
);

// Intake status codes: -2=rejected, -1=snoozed, 0=pending, 1=accepted, 2=duplicate
const STATUS_LABELS: Record<number, string> = {
	[-2]: "rejected",
	[-1]: "snoozed",
	[0]: "pending",
	[1]: "accepted",
	[2]: "duplicate",
};

// --- intake list ---

export const intakeList = Command.make(
	"list",
	{ project: projectArg },
	({ project }) =>
		Effect.gen(function* () {
			const { id } = yield* resolveProject(project);
			const raw = yield* api.get(`projects/${id}/intake-issues/`);
			const { results } = yield* decodeOrFail(IntakeIssuesResponseSchema, raw);
			if (jsonMode) {
				yield* Console.log(JSON.stringify(results, null, 2));
				return;
			}
			if (xmlMode) {
				yield* Console.log(toXml(results));
				return;
			}
			if (results.length === 0) {
				yield* Console.log("No intake issues");
				return;
			}
			const lines = results.map((i) => {
				const status = STATUS_LABELS[i.status ?? 0] ?? String(i.status ?? "?");
				const statusPad = status.padEnd(10);
				if (i.issue_detail) {
					const seq = String(i.issue_detail.sequence_id).padStart(3, " ");
					return `${i.id}  [${statusPad}]  ${i.issue_detail.name}`;
				}
				return `${i.id}  [${statusPad}]`;
			});
			yield* Console.log(lines.join("\n"));
		}),
).pipe(
	Command.withDescription(
		"List intake (triage) issues for a project. Shows status: pending, accepted, rejected, snoozed, duplicate.\n\nExample:\n  plane intake list PROJ",
	),
);

// --- intake accept ---

const intakeIdArg = Args.text({ name: "intake-id" }).pipe(
	Args.withDescription("Intake issue ID (from 'plane intake list')"),
);

export const intakeAccept = Command.make(
	"accept",
	{ project: projectArg, intakeId: intakeIdArg },
	({ project, intakeId }) =>
		Effect.gen(function* () {
			const { id } = yield* resolveProject(project);
			yield* api.patch(`projects/${id}/intake-issues/${intakeId}/`, {
				status: 1,
			});
			yield* Console.log(`Intake issue ${intakeId} accepted`);
		}),
).pipe(
	Command.withDescription(
		"Accept an intake issue, creating it as a tracked work item.",
	),
);

// --- intake reject ---

export const intakeReject = Command.make(
	"reject",
	{ project: projectArg, intakeId: intakeIdArg },
	({ project, intakeId }) =>
		Effect.gen(function* () {
			const { id } = yield* resolveProject(project);
			yield* api.patch(`projects/${id}/intake-issues/${intakeId}/`, {
				status: -2,
			});
			yield* Console.log(`Intake issue ${intakeId} rejected`);
		}),
).pipe(Command.withDescription("Reject an intake issue."));

// --- intake (parent) ---

export const intake = Command.make("intake").pipe(
	Command.withDescription(
		"Manage intake (incoming request triage). Subcommands: list, accept, reject\n\nExamples:\n  plane intake list PROJ\n  plane intake accept PROJ <intake-id>\n  plane intake reject PROJ <intake-id>",
	),
	Command.withSubcommands([intakeList, intakeAccept, intakeReject]),
);
