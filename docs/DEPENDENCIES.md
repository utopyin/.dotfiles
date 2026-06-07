# Dependency provenance and updates

This repo is public and should remain reproducible without vendoring official Pi
runtime packages.

## Policy

- Official Pi runtime/SDK/coding-agent packages stay pinned in package manager
  lockfiles and are not vendored as source.
- Small custom or non-official Pi extensions may be vendored when behavior,
  maintainability, or supply-chain risk justify it.
- Vendored code must include provenance: upstream repository, upstream commit or
  release, import date, local changes, and refresh instructions.
- Secrets, OAuth tokens, generated sessions, auth caches, and local app export
  bundles are never dependency inputs and remain ignored.

## Current package manifests

- Dot CLI dependencies: `package.json` + `bun.lock`
- System/app dependencies: `packages/Brewfile`
- Pi extension package dependencies: `home/.pi/agent/npm/package.json` +
  `home/.pi/agent/npm/package-lock.json`

## Vendoring Pi code

Use `dot pi add <owner/repo|git-url> [--ref <ref>]` to clone a package into
`vendor/pi/`, remove VCS/dependency/cache/local-env artifacts, write provenance,
and add the local package path to tracked Pi settings.

## Refresh checklist for vendored Pi code

1. Record the upstream URL and commit/release before importing.
2. Copy only source/config needed by this repo; omit `.git`, generated build
   output, caches, sessions, auth files, and local environment files.
3. Run the Pi cleanup/conversion pass planned for `dot pi add` once available.
4. Adapt formatting, TypeScript, Effect services, and public-safety conventions.
5. Update this document or a colocated `PROVENANCE.md` with local changes.
6. Run:

   ```bash
   bun run check
   bun audit --audit-level=high
   bun run dot doctor
   ```

7. Re-scan for common secret/token patterns before pushing.

## Audit

`dot doctor` runs `bun audit --audit-level=high` for the dot CLI lockfile. Pi
extension dependency lockfiles should be reviewed when they change, especially
before publishing newly vendored extensions.
