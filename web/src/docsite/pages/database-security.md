# Security & TLS

## Read-only by design

- **PostgreSQL**: the session starts with `default_transaction_read_only=on` and runs inside `BEGIN READ ONLY`, with a 30-second statement timeout.
- **Oracle**: the session runs `SET TRANSACTION READ ONLY` with a call timeout.
- Only **catalog / dictionary views** are queried (`pg_catalog`, `ALL_*`). Your tables are never read.

## Privilege warnings

When you test a connection, OpenDiagram checks what the user can do. If it can do more than read metadata, you get a warning, for example:

- it is a superuser, or can create roles or databases;
- it can `INSERT` / `UPDATE` / `DELETE` in the selected schemas, or create objects there;
- (Oracle) it owns the schema, or holds powerful roles.

Prefer a **dedicated read-only user**. To refuse risky credentials altogether, tick **Block credentials with write privileges (strict)**: the import is then blocked with an explanation. A check that cannot be completed is reported as a warning, never treated as safe.

## TLS

| Mode | Behavior |
|------|----------|
| **off** | no encryption |
| **on, verify certificate** | validates the certificate chain and the host name |
| **on, do not verify** | PostgreSQL: encrypts but does not check the certificate (not recommended). Oracle: skips only the host-name check; the chain is still validated |

- **PostgreSQL, private or self-signed CA**: paste its PEM in the **CA certificate** field.
- **Oracle** is reached through a **connection string over TLS** (TCPS): host, port, service name and the TLS mode. **Wallets are not supported.** The server certificate is always validated against the certificate authorities that the **server** (the OpenDiagram process) trusts; there is no per-connection CA for Oracle. For a private CA, the administrator adds it to the server with `NODE_EXTRA_CA_CERTS=/path/ca.pem`.
- **Oracle TLS modes:** *verify* checks the chain **and** that the certificate matches the host name; the optional **expected server certificate DN** (for example `CN=db.example.com`) replaces the host-name check with that DN. *Do not verify* skips only the name check: the chain is still validated, so a self-signed or unknown CA is still refused.
- **Oracle Autonomous Database without wallet** works with *on, verify certificate*, using the host, the TLS port (usually 1522) and the service name.

> **Warning** With TLS set to *off* against a TCPS port, the server just closes the connection and the error looks like `NJS-521 ... end-of-file`. If you see it, check the TLS mode first.

## Where connections may point

The administrator decides which hosts users can reach with the `DB_HOST_POLICY` setting: `open` (default), `public-only` (blocks private, loopback and link-local addresses) or `allowlist`. See [Self-hosting](self-hosting).

## Shared connections

A connection registered by an administrator can be used by people and groups without showing them the user or the password. It is always used exactly as registered (a request cannot redirect it to another host), and every use is recorded in the [audit log](administration#audit-log). See [Shared connections](shared-connections).

## Secrets

Saved passwords and CA certificates are encrypted with the instance key (`APP_SECRET`) and are never returned by the API or written to logs.
