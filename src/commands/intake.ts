import { Args, Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { api, decodeOrFail } from "../api.js";
import { IntakeIssuesResponseSchema } from "../config.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import { requireProjectFeature, resolveProject } from "../resolve.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription(
		"Project identifier (e.g. PROJ, WEB, OPS). Use '@current' for the saved default project.",
	),
);

const listProjectArg = projectArg.pipe(Args.withDefault(""));

// Intake status codes: -2=pending, -1=rejected, 0=snoozed, 1=accepted, 2=duplicate
const STATUS_LABELS: Record<number, string> = {
	[-2]: "pending",
	[-1]: "rejected",
	0: "snoozed",
	1: "accepted",
	2: "duplicate",
};

function resolveIntakeMutationId(projectId: string, intakeId: string) {
	return Effect.gen(function* () {
		const raw = yield* api.get(`projects/${projectId}/intake-issues/`);
		const { results } = yield* decodeOrFail(IntakeIssuesResponseSchema, raw);
		const match = results.find(
			(item) =>
				item.id === intakeId ||
				item.issue === intakeId ||
				item.issue_detail?.id === intakeId,
		);
		if (!match) {
			return yield* Effect.fail(new Error(`Unknown intake issue: ${intakeId}`));
		}
		return match.issue ?? match.issue_detail?.id ?? match.id;
	});
}

// --- intake list ---

export function intakeListHandler({ project }: { project: string }) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "intake_view");
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
			const status =
				i.status != null
					? (STATUS_LABELS[i.status] ?? String(i.status))
					: "unknown";
			const statusPad = status.padEnd(10);
			if (i.issue_detail) {
				return `${i.id}  [${statusPad}]  ${i.issue_detail.name}`;
			}
			return `${i.id}  [${statusPad}]`;
		});
		yield* Console.log(lines.join("\n"));
	});
}

export const intakeList = Command.make(
	"list",
	{ project: listProjectArg },
	intakeListHandler,
).pipe(
	Command.withDescription(
		"List intake (triage) issues for a project. Shows status: pending, accepted, rejected, snoozed, duplicate. Omit PROJECT to use the saved current project.\n\nExample:\n  plane intake list PROJ",
	),
);

// --- intake accept ---

const intakeIdArg = Args.text({ name: "intake-id" }).pipe(
	Args.withDescription("Intake issue ID (from 'plane intake list')"),
);

export function intakeAcceptHandler({
	project,
	intakeId,
}: {
	project: string;
	intakeId: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "intake_view");
		const mutationId = yield* resolveIntakeMutationId(id, intakeId);
		yield* api.patch(`projects/${id}/intake-issues/${mutationId}/`, {
			status: 1,
		});
		yield* Console.log(`Intake issue ${intakeId} accepted`);
	});
}

export const intakeAccept = Command.make(
	"accept",
	{ project: projectArg, intakeId: intakeIdArg },
	intakeAcceptHandler,
).pipe(
	Command.withDescription(
		"Accept an intake issue, creating it as a tracked work item.",
	),
);

// --- intake reject ---

export function intakeRejectHandler({
	project,
	intakeId,
}: {
	project: string;
	intakeId: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "intake_view");
		const mutationId = yield* resolveIntakeMutationId(id, intakeId);
		yield* api.patch(`projects/${id}/intake-issues/${mutationId}/`, {
			status: -1,
		});
		yield* Console.log(`Intake issue ${intakeId} rejected`);
	});
}

export const intakeReject = Command.make(
	"reject",
	{ project: projectArg, intakeId: intakeIdArg },
	intakeRejectHandler,
).pipe(Command.withDescription("Reject an intake issue."));

// --- intake (parent) ---

export const intake = Command.make("intake").pipe(
	Command.withDescription(
		"Manage intake (incoming request triage). Subcommands: list, accept, reject\n\nExamples:\n  plane intake list PROJ\n  plane intake accept PROJ <intake-id>\n  plane intake reject PROJ <intake-id>",
	),
	Command.withSubcommands([intakeList, intakeAccept, intakeReject]),
);
