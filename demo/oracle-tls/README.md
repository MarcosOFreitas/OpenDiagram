# Demo TLS certificate for the Oracle TCPS tests

`server.pem` / `server.key` are a **throw-away, self-signed demo certificate** (CN `oracle.demo.test`, only that name in the SAN). The private key is committed on purpose: it protects nothing, it only lets `demo-oracle-tls` (a `socat` TLS proxy in front of `demo-oracle`, `--profile oracle`) speak TCPS so the Oracle TLS modes can be tested. Never reuse it.

The `app` container trusts it only when you add `docker-compose.demo-tls.yml` (`NODE_EXTRA_CA_CERTS`; the Oracle thin driver has no per-connection CA: a private CA is trusted by the whole server process). It is off by default because the key is public: with it on, the app would accept certificates forged with that key. Never turn it on for an instance other people use.
