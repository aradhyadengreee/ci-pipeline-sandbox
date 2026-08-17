# pipeline-demo-api

Minimal Express service whose only job is to exercise the CI pipeline in
`.github/workflows/docker.yml`: SonarQube Cloud, Snyk, automated code review,
and the ECR build-and-push.

## Endpoints

| Method | Path        | Purpose                                                   |
| ------ | ----------- | --------------------------------------------------------- |
| `GET`  | `/healthz`  | Liveness/readiness probe.                                  |
| `GET`  | `/version`  | Reports the `GIT_COMMIT` baked in at image build time.     |
| `POST` | `/api/echo` | Echoes a validated `message` (max 280 chars).              |

## Local development

```bash
npm ci
npm test                  # 9 tests
npm test -- --coverage    # writes coverage/lcov.info, which Sonar reads
npm start                 # http://localhost:3000
```

```bash
curl localhost:3000/healthz
curl localhost:3000/version
curl -X POST localhost:3000/api/echo \
  -H 'content-type: application/json' \
  -d '{"message":"hello pipeline"}'
```

## Docker

```bash
docker build --build-arg GIT_COMMIT=$(git rev-parse HEAD) -t pipeline-demo-api:local .
docker run --rm -p 3000:3000 pipeline-demo-api:local
```

Runs as the unprivileged `node` user, ships production dependencies only, and
handles `SIGTERM` by draining in-flight connections before exiting — so a
rolling update or blue-green cutover does not shed requests.

## What the pipeline expects from this repo

Each of these is a real coupling; changing one means changing the workflow too.

| Pipeline step             | Depends on                                              |
| ------------------------- | ------------------------------------------------------- |
| `npm ci`                  | `package-lock.json` committed at the repo root          |
| SonarQube coverage        | `coverage/lcov.info` from `npm test -- --coverage`       |
| SonarQube analysis scope  | Sources in `src/`, tests matching `**/*.test.js`         |
| Snyk dependency scan      | `package.json` + lockfile                                |
| Docker build              | `Dockerfile` at the repo root                            |
| Snyk container scan       | `--file=Dockerfile`, image already pushed to ECR         |
| `/version` reporting      | `ARG GIT_COMMIT` in the Dockerfile                       |

## Deployment is currently OFF

The ECR build-and-push job is gated on a repository variable `ENABLE_DEPLOY`
that does not exist, so it is skipped and **nothing is pushed to any registry**.
Only the scan and review jobs run. No AWS credentials are needed yet.

To enable it later, set `ENABLE_DEPLOY = true` under
*Settings → Secrets and variables → Actions → Variables* and add the AWS
secrets and `DOCKER_REGISTRY` / `APP_NAME` variables. No workflow edit required.

## Required GitHub configuration

Repository **secrets** — set these as *repository* secrets, not environment
secrets. The scan and review jobs do not declare an `environment:`, so an
environment-scoped secret resolves empty there and presents as an auth failure:

| Secret | Needed for |
| --- | --- |
| `SONAR_TOKEN` | SonarQube Cloud scan |
| `SNYK_TOKEN` | Snyk dependency scan |
| `OPENAI_API_KEY` | Automated code review |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Only once `ENABLE_DEPLOY=true` |

Repository **variables**: `SONAR_ORGANIZATION` and `SONAR_PROJECT_KEY` now;
`DOCKER_REGISTRY`, `APP_NAME` and `ENABLE_DEPLOY` only when deploying.

## Which jobs run when

| Trigger | Sonar | Snyk deps | GPT review | Deploy |
| --- | :-: | :-: | :-: | :-: |
| Push to `test`/`master` | warn | warn | – | off (gated) |
| PR into `test`/`master` | **block** | **block** | yes | – |
| Manual run (Actions tab) | warn | warn | – | – |
| PR from a fork | skipped | skipped | skipped | – |

*warn* means a failing gate annotates the run but does not fail it; *block*
means the check fails. Blocking a **merge** additionally requires marking those
checks as required in branch protection settings.

Fork PRs are skipped deliberately: they cannot read secrets, so the scans would
fail on an empty token rather than telling you anything useful.
