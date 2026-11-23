# Licensing for `docs/spec/`

The application in this repository is licensed **AGPL-3.0-only** (see the root `LICENSE`).

Everything in **this directory** — the interchange specification and any wire formats,
event-kind definitions, and schemas it describes — is licensed **Apache-2.0**
(see `LICENSE` in this directory) instead.

The split is deliberate. The app is copyleft so a modified hosted version cannot be
enclosed: run it as a service, publish your changes. The spec is permissive because a
wire format nobody can freely adopt is not a standard. Any independent implementation of
kind `30079` / `30082` — in any language, under any license, by anyone — is exactly the
outcome this directory exists to enable.
