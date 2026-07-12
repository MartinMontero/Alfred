# Security Policy

## Reporting a vulnerability

Please report vulnerabilities **privately** via GitHub's private vulnerability reporting on this
repository (Security → "Report a vulnerability"). Do not open public issues for security reports.

<!-- Maintainer: optionally add a direct security contact email here before beta launch. -->

## Response targets

- Acknowledgement: within **72 hours**.
- Triage + severity assessment: within **7 days**.
- Fix or documented mitigation: target **90 days**, prioritized by severity; actively exploited
  issues are handled immediately.

## Supported versions

| Version | Supported |
|---|---|
| latest beta release | yes |
| anything older | no — update to the latest beta |

Alfred is pre-1.0: only the most recent beta release receives fixes.

## Scope notes for researchers

- The provider denylist (Meta/OpenAI/xAI) is **default-safe, not tamper-proof** — a user editing
  their own goose config to reach an excluded host is out of scope; Alfred silently *sending*
  traffic to an excluded vendor is in scope and serious.
- The vault is plaintext-at-rest by design (OS user boundary; NIP-44 applies to relay sync).
  Local-process attacks on the vault are out of scope; anything that makes Alfred exfiltrate
  vault content (including via telemetry, which is designed born-redacted) is in scope and
  critical.
- The skills/recipes channel and the tool-permission gate are prime targets; see
  `docs/threat-model.md` for the current model and known findings.
