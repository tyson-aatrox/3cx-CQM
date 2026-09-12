# 3CX Call Monitoring Analyzer

Standalone Docker release of the 3CX Call Monitoring Analyzer.

## What it does

The analyzer imports a 3CX Event Log CSV and processes Call Monitor Event ID `10034` records entirely inside the user's web browser.

It provides:

- overall call-quality health
- Good / Warning / Poor / Inconclusive classification
- RTT analysis
- receive/transmit jitter
- receive/transmit packet loss
- MOS analysis
- missing RTCP handling
- transcoding identification
- likely fault-domain analysis
- endpoint/user statistics
- individual call drill-down
- A/B/C media-path analysis
- four directional audio-path summaries
- browser-localised date/time display

## Privacy

The selected CSV file is not uploaded to the Docker container.

The container only serves the HTML, CSS and JavaScript application. CSV parsing and analysis occur locally in the browser.

## Requirements

- Docker Engine
- Docker Compose plugin

## Start

Extract the release, enter the folder and run:

```bash
docker compose up -d --build
```

The container binds to localhost only by default:

```text
http://127.0.0.1:4180/
```

Expose it through the host Nginx reverse proxy rather than publishing the container directly.

## Change the port

Example using port 8080:

```bash
CALL_MONITOR_PORT=8080 docker compose up -d
```

The service will then listen on:

```text
http://127.0.0.1:8080/
```

## Check status

```bash
docker compose ps
```

## View logs

```bash
docker logs threecx-call-monitor
```

## Stop

```bash
docker compose down
```

## Upgrade

Replace the release files with the new version and run:

```bash
docker compose up -d --build
```

## Application architecture

The Docker container runs Nginx only. There is no Node.js application server, Python backend or database.

```text
Browser
  |
  | HTML / CSS / JavaScript
  v
Nginx container

CSV selected by user
  |
  v
Browser-side JavaScript parser/analyzer
  |
  v
Dashboard
```

## Version

0.4.0
