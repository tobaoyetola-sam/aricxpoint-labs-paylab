# PayLab on AWS with Terraform

One `terraform apply` creates the whole PayLab stack: network, database, IAM, ECR, ECS (5 Fargate services),
service discovery, load balancer + HTTPS + DNS, and the 5 CI/CD pipelines. One `terraform destroy` removes it.

The five services are one map in `locals.tf` (port, health path, CPU/memory, env vars, needs the DB?, which target group,
Cloud Map yes/no). Most resources use `for_each` over that map, so adding a service is one new map entry.

## Two ways to run it: with or without a domain

| | No domain (default) | Your own domain |
|---|---|---|
| `terraform.tfvars` | leave `domain_zone` out | `domain_zone`, `web_host`, `api_host` |
| Site URL | `http://<ALB DNS name>` (see `terraform output web_url`) | `https://pay.<your zone>` |
| Load balancer | `:80` -> web, `/api/*` -> api-gateway | `:80` -> 301 to HTTPS, `:443` with your ACM certificate |
| Extra things you create first | nothing | a public Route 53 zone + an ISSUED ACM certificate (same region) for both hostnames |

The class demo ran in domain mode (`pay.lab.aricxpoint.co`). Start with no domain: everything else is identical.

## What stays outside Terraform (create once, never destroyed)

| Thing | How Terraform uses it |
|---|---|
| GitHub connection (Developer Tools > Settings > Connections, status **Available**) | `connection_arn` in `terraform.tfvars` |
| ECS service-linked role `AWSServiceRoleForECS` | Not managed (it usually exists already). In a brand-new account set `create_ecs_service_linked_role = true`. |
| Domain mode only: public hosted zone, e.g. `lab.example.com` | `data "aws_route53_zone"`. Only the two alias A records for `web_host` and `api_host` are managed. |
| Domain mode only: ACM certificate for `web_host` + `api_host` (ISSUED) | `data "aws_acm_certificate"` (domain `web_host`, status ISSUED, most recent) |

## Prerequisites

1. Terraform >= 1.6 (tested with 1.13.3) and AWS CLI v2.
2. Your own fork of `aricxpoint-labs-paylab` on GitHub (keep the folder names). All five pipelines read that one repo;
   each starts only when a push changes its own folder (`web/**`, `api-gateway/**`, ...).
3. The GitHub connection above, with access to your fork.
4. Credentials for **your** AWS account in your shell:
   ```bash
   export AWS_PROFILE=default        # or your SSO profile; run `aws sso login` first if needed
   aws sts get-caller-identity       # note the Account id
   ```
   `allowed_account_ids` in the provider makes Terraform refuse to run against any other account.
5. `cp terraform.tfvars.example terraform.tfvars` and fill in your account id, connection ARN and `github_repo`
   (`terraform.tfvars` is git-ignored).
6. Nothing named `paylab-*`, `alb-sg`, `app-sg`, `db-sg`, `ecsTaskExecutionRole`, ... already exists in the account
   (for example from an earlier attempt). Same names would clash.

## Apply

```bash
cd infra/terraform
terraform init
terraform apply          # review the plan, type "yes"
```

### What happens, and how long it takes

1. **`terraform apply`: ~12-15 min.** RDS takes most of that. Everything else takes a minute or two.
2. ECR starts **empty**. The task definitions point at `paylab/<service>:latest` (variable `bootstrap_image_tag`),
   so the ECS tasks **fail to pull at first**. That's expected.
3. Each new pipeline starts its **first run automatically**: GitHub source -> CodeBuild pushes `:<sha>` and `:latest`
   -> ECS deploy. **~5-8 min.** The services then start and become healthy, and the site is live.
4. After that, every `git push` to `main` that changes a service folder builds and deploys that service. Terraform ignores the task definition
   revision and desired count on the ECS services (`lifecycle.ignore_changes`), so it never fights the pipelines.

Total from `apply` to working site: **about 20-25 minutes**.

## Verify

```bash
terraform output                                   # URLs and helper commands
eval "$(terraform output -raw watch_pipelines_command)"   # every stage should reach Succeeded
eval "$(terraform output -raw watch_services_command)"    # runningCount 1 for all five
curl -s "$(terraform output -raw web_url)/health"  # ok
curl -s "$(terraform output -raw api_health_url)" # domain: {"status":"ok",...}  no domain: [] or the wallet list
open "$(terraform output -raw web_url)"
```

If a pipeline's first run failed (for example, IAM permissions still propagating a few seconds after creation), just re-run it:

```bash
aws codepipeline start-pipeline-execution --name paylab-wallet-svc-pipeline
```

Look inside the database with the one-off psql task (prints wallets and the latest payments to the logs):

```bash
eval "$(terraform output -raw psql_run_task_command)"
```

## Destroy

```bash
terraform destroy        # type "yes"; ~10 min (RDS deletion dominates)
```

It removes everything Terraform created: ECR repos with their images (`force_delete`), the artifact bucket with its
contents (`force_destroy`), Cloud Map services with leftover instances (`force_destroy`), RDS without a final snapshot,
the SSM parameters, log groups, IAM roles, ALB, the two DNS records (domain mode) and the security groups (after the
services, ALB and RDS that use them). The zone, the certificate and the GitHub connection are untouched.

## State

State is **local** (`terraform.tfstate` in this folder) and must **stay on this laptop**. Without it Terraform can't
update or destroy the stack (you would have to delete everything by hand in the console). It also contains the generated DB
password, so don't commit or share it (`.gitignore` excludes it). `.terraform.lock.hcl` pins the provider versions
(aws 6.x, random 3.x) and should be committed.
