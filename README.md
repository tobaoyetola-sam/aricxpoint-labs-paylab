<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/aricxpoint-labs-logo-white.png">
    <img alt="aricxpoint labs" src=".github/aricxpoint-labs-logo-black.png" width="360">
  </picture>
</p>

# PayLab: Payment Web App Deployment

The student lab for the aricxpoint labs DevOps class. PayLab is a small payment app made of five services.
You deploy it to **your own AWS account** on ECS Fargate with one `terraform apply`. After that, every `git push`
rebuilds and redeploys only the service whose folder you changed.

Follow the **PayLab Workguide (PDF)** from the class pack step by step. This README is the map of the repo.

| Folder | Port | What it is |
|---|---|---|
| [`web/`](web/README.md) | 3000 | The payment page: create a wallet, send money to another handle, see history |
| [`api-gateway/`](api-gateway/README.md) | 8080 | Public API. The load balancer sends `/api/*` here |
| [`payment-svc/`](payment-svc/README.md) | 8081 | Records payments (idempotent on `reference`), asks wallet-svc to move the money |
| [`wallet-svc/`](wallet-svc/README.md) | 8082 | Balances and the ledger; debits the payer and credits the payee in one DB transaction |
| [`notify-svc/`](notify-svc/README.md) | 8083 | Logs "sent" and "received" receipts |
| [`infra/terraform/`](infra/terraform/README.md) | | All the AWS resources: VPC wiring, RDS, ECS, Cloud Map, ALB, ECR, IAM, CodeBuild, CodePipeline |
| [`infra/docs/`](infra/docs/paylab-architecture.drawio) | | Architecture diagram (open at https://app.diagrams.net) |

## How a push deploys

```
git push (main) ──► CodePipeline paylab-<service>-pipeline   (only if <service>/** changed)
                      Source (this repo) ─► CodeBuild <service>/buildspec.yml ─► ECR paylab/<service>:<commit>
                                                                              ─► ECS service <service> (rolling)
```

Each service has its own Dockerfile, `buildspec.yml`, ECR repository, ECS service and pipeline.
They share one Git repo so you only fork once.

## Quick start

```bash
# 1. Fork this repo on GitHub (keep the name), then:
git clone https://github.com/<you>/aricxpoint-labs-paylab.git
cd aricxpoint-labs-paylab/infra/terraform
cp terraform.tfvars.example terraform.tfvars   # account id, region, connection ARN, github_repo
terraform init && terraform apply
terraform output web_url                       # open it ~8 min after apply finishes
# ... test, push a change ...
terraform destroy                              # always, when you're done
```

Running the stack costs about **US$0.15 per hour**. Destroy it the same day.
