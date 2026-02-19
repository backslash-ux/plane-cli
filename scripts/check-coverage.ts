#!/usr/bin/env bun

import { execSync } from "child_process"

const THRESHOLDS = {
  lines: 95,
  functions: 95,
}

console.log("Running tests with coverage...\n")

try {
  const output = execSync("bun test --coverage 2>&1", { encoding: "utf8" })
  console.log(output)

  const coverageMatch = output.match(/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/)
  if (!coverageMatch) {
    console.log("\n⚠️  Could not parse coverage output")
    process.exit(0)
  }

  const functionsCoverage = parseFloat(coverageMatch[1])
  const linesCoverage = parseFloat(coverageMatch[2])

  console.log(`\n📊 Coverage Summary:`)
  console.log(`   Functions: ${functionsCoverage}%`)
  console.log(`   Lines: ${linesCoverage}%`)

  let failed = false
  if (functionsCoverage < THRESHOLDS.functions) {
    console.log(`\n❌ Functions coverage (${functionsCoverage}%) is below threshold (${THRESHOLDS.functions}%)`)
    failed = true
  }
  if (linesCoverage < THRESHOLDS.lines) {
    console.log(`\n❌ Lines coverage (${linesCoverage}%) is below threshold (${THRESHOLDS.lines}%)`)
    failed = true
  }

  if (failed) {
    console.log("\n❌ Coverage below threshold")
    process.exit(1)
  } else {
    console.log("\n✅ Coverage meets all thresholds!")
    process.exit(0)
  }
} catch (error: any) {
  if (error.status !== 0) {
    console.log("\n❌ Tests failed!")
    if (error.stdout) console.log(error.stdout.toString())
    process.exit(1)
  }
  console.error("Error running coverage check:", error.message)
  process.exit(1)
}
