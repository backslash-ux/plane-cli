import { Command } from "@effect/cli";
import { localInit } from "./init.js";

export const local = Command.make(".").pipe(
	Command.withDescription(
		"Manage path-local Plane config for the current directory.",
	),
	Command.withSubcommands([localInit]),
);
