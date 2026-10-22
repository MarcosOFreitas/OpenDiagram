# Hosting requirements

What it takes to run OpenDiagram, measured. The numbers come from the scripts in the repository, so you can repeat them on your own hardware (see [How it was measured](#how-it-was-measured)).

## In short

| | Minimum | Comfortable |
|---|---|---|
| **Server (the container)** | 0.5 vCPU, 512 MB of memory | 1 vCPU, 1 GB |
| **Disk** | 1 GB (image 470 MB + data) | 5 GB, on a volume that is backed up |
| **People at the same time** | up to about 150 with a diagram open | more only with 2 vCPU or more |
| **Browser (each person)** | any current Chrome, Edge, Firefox or Safari | a recent PC for diagrams over 100 tables (about 100 MB of browser memory at 100 tables, 400 MB at 400) |

OpenDiagram is **one Node.js process with an SQLite file**: no separate database, cache or queue. It uses little CPU, and one instance serves a team. It is **not** designed to run as several replicas on the same data volume.

## What the server uses

Measured with a limit of 1 vCPU and 512 MB, 150 people signed in at once with the same 200-table diagram open (a heartbeat every 4 seconds each, one in ten saving every 20 seconds):

| | Value |
|---|---|
| Container image | 468 MB |
| Start-up (container started until it answers) | 1.3 to 3.5 s |
| Memory with nobody connected | about 165 MB |
| Memory at the peak (150 people) | about 220 MB |
| CPU in steady state, 150 people | 15 % of one core on average, 27 % at the busiest second |
| CPU in steady state, 50 people | 5 % of one core |
| Time to stop (`docker stop`) | about 1 s, exit code 0 |

**Memory** is the first limit to size: Node.js itself takes about 160 MB. A limit of 256 MB still worked in the test (peak 228 MB) but leaves almost no room; use 512 MB or more.

**CPU** is spent mostly on **signing in**: passwords are hashed with scrypt on purpose, about 40 ms of one core per sign-in (80 ms on half a core). If everybody signs in in the same second (a meeting that starts), the last person waits:

| People signing in at the same moment | 1 vCPU | 2 vCPU | 0.5 vCPU |
|---|---|---|---|
| 10 | 0.4 s | 0.2 s | 1.1 s |
| 50 | 2.1 s | 1.6 s | 4.3 s |
| 150 | 6.7 s | 5.7 s | 13.7 s |

Everything after the sign-in is cheap.

## Time of the main calls

Median (p50) and 95th percentile (p95), in milliseconds, measured on the server side of one request, with 1 vCPU and 512 MB. A diagram of 38 tables is 23 KB of DBML, one of 200 tables is 122 KB and one of 600 tables is 369 KB.

| Call | p50 | p95 |
|---|---|---|
| Health check, list of diagrams, history list | 2 | 3 |
| Presence heartbeat | 2 | 3 |
| Open a diagram of 38 / 200 / 600 tables | 3 / 4 / 10 | 4 / 5 / 14 |
| Save a diagram of 38 / 200 / 600 tables | 10 / 18 / 28 | 16 / 119 / 102 |
| Sign in | 38 | 43 |

The slowest saves are the first ones of a diagram (they create the first history entry). With 150 people connected the p95 of a heartbeat was 234 ms and of a save 270 ms: still invisible to a person.

## What the browser uses

The diagram is drawn in the browser, so large diagrams cost the **person's** machine, not the server. Measured in Chrome with the full detail level, on a development PC (12 cores), for tables of 12 columns each:

| Tables | Columns | Time until every table is drawn | JavaScript heap | Frames per second while zooming |
|---|---|---|---|---|
| 38 | 456 | 0.6 s | 88 MB | 55 |
| 100 | 1,200 | 0.7 s | 97 MB | 57 |
| 200 | 2,400 | 1.4 s | 218 MB | 13 |
| 400 | 4,800 | 2.3 s | 394 MB | 9 |

Up to about **100 tables** the diagram is smooth. Beyond that, moving and zooming get heavier: use the **View → Detail** levels (tables only), **hide** or **collapse** the tables you are not working on, and **TableGroups**, or split the model into several diagrams. A slower PC than the one above will feel it earlier.

## Disk

- The image is **470 MB**. Data lives in the `/data` volume: one `app.db` file (SQLite, WAL mode).
- A diagram is stored as its DBML text, once for the current version and once more in each **history entry** (the last 60 unnamed versions are kept, named ones always). Estimate for one diagram: **size of the DBML × up to 61** in the worst case, and much less in practice because saves by the same person within 10 minutes share an entry. For a 200-table diagram (122 KB) that is under 8 MB.
- The audit log keeps 180 days, at most 200,000 rows (a few hundred bytes each), and the last 50,000 failed sign-ins.
- Back it up with `node src/cli.js backup`, which makes a consistent copy while the app runs (see [Self-hosting](self-hosting)); a backup is about the size of `app.db`.

## Network

- The browser talks to the server over HTTPS (put a reverse proxy in front, see [Self-hosting](self-hosting)). Every open diagram makes **one small request every 4 seconds** (presence), 0.25 requests per second per person; 150 people make about 40 requests per second.
- The first visit downloads the app once: about **1.6 MB** with brotli, 2.9 MB with gzip (the main file is 16 MB uncompressed, most of it the DBML parser). The server sends the files already compressed and lets the browser keep them for a year (their names change with every build), so later visits download only the small `index.html`. A reverse proxy does not need to compress them again.
- A saved diagram sends the whole DBML (23 to 369 KB for the sizes above), at most once per edit pause.
- The server must reach your databases (PostgreSQL, Oracle) on their ports. Importing reads only the catalog.

## How it was measured

On one Windows 11 PC (12 cores, 7.6 GB for Docker), with the Docker image of this repository and synthetic diagrams. Treat them as orders of magnitude, not guarantees: repeat them on your hardware.

```bash
# server: a throw-away container with a CPU and memory limit
docker run -d --name bench-app --network rea_dbdiagram_default -p 3200:3000 --cpus 1 --memory 512m -e APP_SECRET=$(openssl rand -hex 24) -e COOKIE_SECURE=0 rea_dbdiagram-app
docker exec bench-app node src/cli.js create-admin bench@example.com 'bench-password-123'
BASE=http://127.0.0.1:3200 BENCH_CONTAINER=bench-app BENCH_EMAIL=bench@example.com BENCH_PASSWORD=bench-password-123 node server/bench.mjs

# browser: time to draw and frames per second for several diagram sizes (needs Chrome)
BASE=http://127.0.0.1:3200 BENCH_EMAIL=bench@example.com BENCH_PASSWORD=bench-password-123 node web/benchclient.mjs
```

Not measured yet: importing a very large schema (hundreds of tables) from a real PostgreSQL or Oracle server, the scheduled refresh with many linked diagrams, and a server shared by several organizations.
