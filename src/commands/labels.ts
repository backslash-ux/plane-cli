import { Args, Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
import { api, decodeOrFail } from "../api.js";
import { LabelSchema, LabelsResponseSchema } from "../config.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import { resolveLabel, resolveProject } from "../resolve.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription(
		"Project identifier (e.g. PROJ, WEB, OPS). Use '@current' for the saved default project.",
	),
);

const listProjectArg = projectArg.pipe(Args.withDefault(""));

// --- labels list ---

export function labelsListHandler({ project }: { project: string }) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		const raw = yield* api.get(`projects/${id}/labels/`);
		const { results } = yield* decodeOrFail(LabelsResponseSchema, raw);
		if (jsonMode) {
			yield* Console.log(JSON.stringify(results, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(results));
			return;
		}
		if (results.length === 0) {
			yield* Console.log("No labels found");
			return;
		}
		const lines = results.map(
			(l) => `${l.id}  ${(l.color ?? "").padEnd(8)}  ${l.name}`,
		);
		yield* Console.log(lines.join("\n"));
	});
}

export const labelsList = Command.make(
	"list",
	{ project: listProjectArg },
	labelsListHandler,
);

// --- labels create ---

const nameArg = Args.text({ name: "name" }).pipe(
	Args.withDescription("Label name"),
);
const colorOption = Options.optional(Options.text("color")).pipe(
	Options.withDescription("Hex color e.g. #ff0000"),
);
const labelArg = Args.text({ name: "label" }).pipe(
	Args.withDescription(
		"Label UUID or exact name (from 'plane labels list PROJECT')",
	),
);

export const labelsCreate = Command.make(
	"create",
	{ color: colorOption, project: projectArg, name: nameArg },
	labelsCreateHandler,
);

export function labelsCreateHandler({
	project,
	name,
	color,
}: {
	project: string;
	name: string;
	color: { _tag: "Some"; value: string } | { _tag: "None" };
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		interface LabelPayload {
			name: string;
			color?: string;
		}
		const body: LabelPayload = { name };
		if (color._tag === "Some") body.color = color.value;
		const raw = yield* api.post(`projects/${id}/labels/`, body);
		const label = yield* decodeOrFail(LabelSchema, raw);
		yield* Console.log(`Created label: ${label.name} (${label.id})`);
	});
}

export function labelsDeleteHandler({
	project,
	label,
}: {
	project: string;
	label: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		const resolvedLabel = yield* resolveLabel(id, label);
		yield* api.delete(`projects/${id}/labels/${resolvedLabel.id}/`);
		yield* Console.log(
			`Deleted label: ${resolvedLabel.name} (${resolvedLabel.id})`,
		);
	});
}

export const labelsDelete = Command.make(
	"delete",
	{ project: projectArg, label: labelArg },
	labelsDeleteHandler,
).pipe(
	Command.withDescription(
		`Delete a label by UUID or exact name.

Example:
  plane labels delete PROJ bug`,
	),
);

export const labels = Command.make("labels").pipe(
	Command.withSubcommands([labelsList, labelsCreate, labelsDelete]),
);
