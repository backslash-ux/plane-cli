import type { Issue, State } from "./config.js"

export function formatIssue(issue: Issue, projKey: string): string {
  const state = issue.state as State | string
  const stateName = typeof state === "object" ? state.name : "?"
  const stateGroup = typeof state === "object" ? state.group : "?"
  const seqPad = String(issue.sequence_id).padStart(3, " ")
  const groupPad = stateGroup.padEnd(10, " ")
  const namePad = stateName.padEnd(12, " ")
  return `${projKey}-${seqPad}  [${groupPad}]  ${namePad}  ${issue.name}`
}
