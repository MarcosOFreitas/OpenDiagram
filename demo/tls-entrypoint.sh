#!/bin/bash
# demo only: Postgres with a self-signed certificate (SAN: demo-pg-tls, localhost)
set -e
mkdir -p /certs
if [ ! -f /certs/server.key ]; then
  openssl req -new -x509 -days 365 -nodes -subj "/CN=demo-pg-tls" \
    -addext "subjectAltName=DNS:demo-pg-tls,DNS:localhost" \
    -keyout /certs/server.key -out /certs/server.crt
  chown postgres:postgres /certs/server.key /certs/server.crt
  chmod 600 /certs/server.key
fi
exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/certs/server.crt -c ssl_key_file=/certs/server.key
