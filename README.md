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

## Single branch, two environments

`master` is the only long-lived branch. One push to it produces one image,
which is then promoted:

```
push to master
  └─ scans (warn) ─┐
                   ├─ build ──► push <registry>/<app>:<sha>
                   │              └─ Deploy to test ──► tag :test
                   │                   └─ Deploy to production ──► tag :prod
```

The build happens **once**. The two deploy jobs never rebuild — they run
`docker buildx imagetools create`, which retags the existing manifest in the
registry without pulling it. So `:prod` and `:test` always point at the exact
image that was scanned, and production can only receive something that already
went through test (`needs: deploy-test`).

`:latest` is no longer published. Use `:test` and `:prod` as the moving
pointers, and `:<sha>` when you need to name one specific build.

### Approval gates

Each deploy job declares `environment: test` / `environment: production`, which
is what makes GitHub apply that environment's protection rules. Configure the
gate under *Settings → Environments → production → Required reviewers*. The run
then pauses at **Deploy to production** until someone approves.

This is deliberately not in the workflow file — adding or removing a reviewer,
or a wait timer, needs no code change. Per-environment secrets set there also
resolve inside the matching job.

To roll back, re-run the **Deploy to production** job on the older commit's
workflow run: it retags `:prod` onto that build's `:<sha>` without rebuilding.

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
| Push to `master` | warn | warn | – | off (gated) |
| PR into `master` | warn | warn | **block** | – |
| Manual run (Actions tab) | warn | warn | – | – |
| PR from a fork | skipped | skipped | skipped | – |

*warn* means a failing gate annotates the run but does not fail it; *block*
means the check fails. Blocking a **merge** additionally requires marking those
checks as required in branch protection settings.

The automated GPT review is the only check that can fail a PR. Sonar and Snyk
report findings without failing the run. To make either block again, set
`continue-on-error: ${{ github.event_name != 'pull_request' }}` on that scan
step — the comment above each one says so.

`SONAR_ORGANIZATION` and `SONAR_PROJECT_KEY` are read as a repository variable
*or* a secret (`vars.X || secrets.X`), so either placement works.

Fork PRs are skipped deliberately: they cannot read secrets, so the scans would
fail on an empty token rather than telling you anything useful.
