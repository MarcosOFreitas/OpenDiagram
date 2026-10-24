# Security & TLS

## Read-only by design

- **PostgreSQL**: the session starts with `default_transaction_read_only=on` and runs inside `BEGIN READ ONLY`, with a 30-second statement timeout.
- **Oracle**: the session runs `SET TRANSACTION READ ONLY` with a call timeout.
- **MySQL**: the session is set to `READ ONLY` and every use runs inside `START TRANSACTION READ ONLY`, with a 30-second limit per query. The connection never lets the server ask for one of your local files, and never runs code built from what the server sends.
- Only **catalog / dictionary views** are queried (`pg_catalog`, `ALL_*`, `information_schema`). Your tables are never read.

## Privilege warnings

When you test a connection, OpenDiagram checks what the user can do. If it can do more than read metadata, you get a warning, for example:

- it is a superuser, or can create roles or databases;
- it can `INSERT` / `UPDATE` / `DELETE` in the selected schemas, or create objects there;
- (Oracle) it owns the schema, or holds powerful roles.
- (MySQL) it holds any privilege other than `USAGE`, `SELECT`, `SHOW VIEW` and `SHOW DATABASES`, on the whole server or on a selected database, directly or through an active role (`EXECUTE` included, since a procedure can write); the warning names the privilege and where it applies. For a clean MySQL user: `GRANT SELECT, SHOW VIEW ON shop.* TO 'reader'@'%';`.

Prefer a **dedicated read-only user**. To refuse risky credentials altogether, tick **Block credentials with write privileges (strict)**: the import is then blocked with an explanation. A check that cannot be completed is reported as a warning, never treated as safe.

## TLS

| Mode | Behavior |
|------|----------|
| **off** | no encryption |
| **on, verify certificate** | validates the certificate chain and the host name |
| **on, do not verify** | PostgreSQL: encrypts but does not check the certificate (not recommended). Oracle: skips only the host-name check; the chain is still validated |

- **PostgreSQL or MySQL, private or self-signed CA** (an RDS or other cloud CA bundle, a company CA): paste its PEM in the **CA certificate** field, shown with *verify certificate*. Paste the root CA. If the database server does not send the issuing (intermediate) CA, paste the root and the intermediate one after the other. The intermediate alone is refused.
- **Oracle** is reached through a **connection string over TLS** (TCPS): host, port, service name and the TLS mode. **Wallets are not supported.** The server certificate is always validated against the certificate authorities that the **server** (the OpenDiagram process) trusts; there is no per-connection CA for Oracle. For a private CA, the administrator mounts a PEM file into the `app` service and sets `NODE_EXTRA_CA_CERTS` to its path there (`docker-compose.demo-tls.yml` does this for the demo certificate); `.env` does not pass this variable. The file holds the company's **root** CA. If the database server sends only its own certificate and not the issuing (intermediate) CA, add the intermediate to the same file, after the root. The intermediate alone is not enough: the chain must end at a root in that file.
- **Oracle TLS modes:** *verify* checks the chain **and** that the certificate matches the host name; the optional **expected server certificate DN** (for example `CN=db.example.com`) replaces the host-name check with that DN. *Do not verify* skips only the name check: the chain is still validated, so a self-signed or unknown CA is still refused.
- **Oracle Autonomous Database without wallet** works with *on, verify certificate*, using the host, the TLS port (usually 1522) and the service name.

> **Warning** With TLS set to *off* against a TCPS port, the server just closes the connection and the error looks like `NJS-500 ... closed or broken` or `NJS-521 ... end-of-file`. If you see it, check the TLS mode first. A certificate the OpenDiagram server cannot validate (an unknown CA, a missing intermediate) shows as `NJS-506 ... TLS handshake failure`, with *verify* and with *do not verify*: check the `NODE_EXTRA_CA_CERTS` file first.

## Where connections may point

The administrator decides which hosts users can reach with the `DB_HOST_POLICY` setting: `open` (default), `public-only` (blocks private, loopback and link-local addresses) or `allowlist`. See [Self-hosting](self-hosting).

With `open`, anyone with an account can make the server try any host and port through **Test connection**, and the answer (refused, no answer, not found) tells them whether something listens there. That is fine when everyone with an account is trusted, and usual for a team whose databases sit on private addresses; otherwise list the database hosts with `allowlist`.

The connection is opened by the **server**, so a database behind a VPN or a firewall is reachable only if the server is. People who use the app do not need the VPN. Internal and VPN addresses are private, so `public-only` blocks them. See [Self-hosting → Databases behind a VPN or a firewall](self-hosting).

## Shared connections

A connection registered by an administrator can be used by people and groups without showing them the user or the password. It is always used exactly as registered (a request cannot redirect it to another host), and every use is recorded in the [audit log](administration#audit-log). See [Shared connections](shared-connections).

## Secrets

Saved passwords and CA certificates are encrypted with the instance key (`APP_SECRET`) and are never returned by the API or written to logs.
