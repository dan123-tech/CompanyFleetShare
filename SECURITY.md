# Security policy

## Where the technical write-up lives

The **maintained, in-repository** security overview for operators is in **[README.md — Security](README.md#security)** (secrets, auth rate limits, lockout, CSRF, CSP/HSTS, supply chain).

A longer historical note file may exist on maintainer machines as `docs/SECURITY.md`; that path is **not shipped in this Git repository** (see `.gitignore`) to keep clones small. Use the README section above as the source of truth for what is in `main`.

## Reporting a vulnerability

Please **do not** open a public GitHub issue with exploit details before a fix is available.

- Prefer **[GitHub Security Advisories](https://github.com/dan123-tech/CompanyFleetShare/security/advisories/new)** (private report) if enabled for this repo, **or**
- Contact the maintainers through your usual production / project channel.

Include affected versions or commit, reproduction steps, and impact if you can.

## Supported versions

Security fixes are applied to the **default branch** (`main`) and deployed through your normal release process. Tag or pin releases in your own environment if you need long-term support lines.
