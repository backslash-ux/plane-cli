import { Args, Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { api, decodeOrFail } from "../api.js";
import { StatesResponseSchema } from "../config.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import { resolveProject } from "../resolve.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription(
		"Project identifier (e.g. PROJ, WEB, OPS). Use '@current' for the saved default project.",
	),
);

const listProjectArg = projectArg.pipe(Args.withDefault(""));

export const statesList = Command.make(
	"list",
	{ project: listProjectArg },
	({ project }) =>
		Effect.gen(function* () {
			const { id } = yield* resolveProject(project);
			const raw = yield* api.get(`projects/${id}/states/`);
			const { results } = yield* decodeOrFail(StatesResponseSchema, raw);
			if (jsonMode) {
				yield* Console.log(JSON.stringify(results, null, 2));
				return;
			}
			if (xmlMode) {
				yield* Console.log(toXml(results));
				return;
			}
			const lines = results.map(
				(s) => `${s.id}  ${s.group.padEnd(12)}  ${s.name}`,
			);
			yield* Console.log(lines.join("\n"));
		}),
);

export const states = Command.make("states").pipe(
	Command.withSubcommands([statesList]),
);
