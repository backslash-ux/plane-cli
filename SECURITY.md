# Security Policy

## Reporting A Vulnerability

Please do not open a public issue for suspected security vulnerabilities.

Instead, report the issue privately to the maintainers through the repository contact channels and include:

- a clear description of the issue
- affected commands, files, or workflows
- steps to reproduce
- proof of concept or logs if available
- any suggested mitigation or fix

The maintainer goal is to acknowledge reports promptly, investigate the issue, and coordinate a fix before public disclosure when the report is valid.

## Scope

Security reports are especially helpful for issues involving:

- credential handling or config exposure
- unsafe command execution paths
- malformed API response handling
- output injection risks in machine-readable or human-readable modes
- dependency or packaging risks that affect users of the published CLI

## Supported Versions

The project currently prioritizes fixes on the latest code in the default branch and the latest published package version.

## Disclosure Expectations

Please allow time for investigation and remediation before public disclosure. If the issue is accepted, the fix and any user guidance can be documented in a coordinated release.