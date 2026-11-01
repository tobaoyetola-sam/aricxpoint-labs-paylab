<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../.github/aricxpoint-labs-logo-white.png">
    <img alt="aricxpoint labs" src="../.github/aricxpoint-labs-logo-black.png" width="320">
  </picture>
</p>

# notify-svc/

Part of **PayLab** (aricxpoint DevOps class: "Payment Web App Deployment").

The lab stand-in for an email/SMS service. `POST /notify` prints JSON **receipt** lines to stdout
(which end up in CloudWatch Logs on AWS) and returns 202. No database. Internal only.

- successful payment: a **sent** receipt for the payer and a **received** receipt for the payee,
- failed payment: one **failed** receipt for the payer.

```json
{"time":"...","level":"info","service":"notify-svc","msg":"receipt","receipt":{"type":"sent","to":"@ada","counterparty":"@bola","paymentId":1,"reference":"ref-1","amount":"₦1,500.00","note":"Lunch"}}
{"time":"...","level":"info","service":"notify-svc","msg":"receipt","receipt":{"type":"received","to":"@bola","counterparty":"@ada","paymentId":1,"reference":"ref-1","amount":"₦1,500.00","note":"Lunch"}}
{"time":"...","level":"info","service":"notify-svc","msg":"receipt","receipt":{"type":"failed","to":"@ada","counterparty":"@bola","reason":"insufficient funds","paymentId":3,"reference":"ref-2","amount":"₦999,999.00"}}
```

## Environment variables

| Variable | Default |
|---|---|
| `PORT` | `8083` |

## Run it alone with Docker

```bash
docker build -t paylab/notify-svc .
docker run --rm --name notify-svc -p 8083:8083 paylab/notify-svc

# in another terminal
curl -s -X POST localhost:8083/notify -H 'Content-Type: application/json' \
  -d '{"paymentId":1,"reference":"ref-1","status":"success","amountKobo":150000,"note":"Lunch","payer":{"walletId":1,"handle":"ada"},"payee":{"walletId":2,"handle":"bola"}}'
```

## Deployment (AWS)

This folder is deployed by its own **CodePipeline** `paylab-notify-svc-pipeline` on every push to `main` that changes `notify-svc/`:

```
git push (main) -> CodePipeline Source -> CodeBuild (buildspec.yml) -> ECR paylab/notify-svc:<commit> -> ECS service "notify-svc" in cluster "paylab"
```

| File | Purpose |
|---|---|
| `buildspec.yml` | CodeBuild steps: log in to ECR, build, push `:<short-commit>` and `:latest`, write `imagedefinitions.json`. |
| `taskdef.json` | ECS task definition template (with `<ACCOUNT_ID>`-style placeholders). Registered by `infra/terraform` (`ecs.tf`); the pipeline then registers a new revision on every deploy. |

The container name in `taskdef.json` and in `imagedefinitions.json` is `notify-svc`. They **must match**, or the deploy stage fails.

The shared AWS setup (network, database, cluster, load balancer, pipelines) lives in [`infra/terraform`](../infra/terraform/README.md).
