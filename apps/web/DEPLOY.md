# Deploy apps/web to Vercel (no dashboard needed after setup)

The site `blockbite-protocol.xyz` is served from this folder. Deploys run via the
GitHub Action `.github/workflows/deploy-web.yml`:

- **push to `main`** touching `apps/web/**` → production deploy
- **Actions tab → "Deploy Web (Vercel)" → Run workflow** → manual redeploy

## One-time setup (you must do this once, from the Vercel account that owns the project)

1. **Create a Vercel token**
   https://vercel.com/account/tokens → create token → copy it.

2. **Link this folder to the existing Vercel project** (writes the org/project IDs):
   ```bash
   cd apps/web
   npx vercel link        # pick the existing blockbite-protocol project
   cat .vercel/project.json   # shows "orgId" and "projectId"
   ```
   `.vercel/` is gitignored — that is correct, do not commit it.

3. **Add 3 repo secrets** (GitHub → Settings → Secrets and variables → Actions):
   | Secret              | Value                          |
   |---------------------|--------------------------------|
   | `VERCEL_TOKEN`      | the token from step 1          |
   | `VERCEL_ORG_ID`     | `orgId` from project.json      |
   | `VERCEL_PROJECT_ID` | `projectId` from project.json  |

Done. From now on every push to `main` deploys automatically, and you can trigger a
redeploy from the Actions tab without ever opening the Vercel dashboard.

## First deploy (fixes the live "Unexpected error")

The RPC fix that kills the create-stream "Unexpected error" is already on `main`
(commit `647feb1c` — JSON-RPC -32603 handling + 1% on-chain dev fee in balance checks).
The live site is just a stale Vercel deployment. After the setup above, run the workflow
once (Actions → Run workflow) and the fix goes live.

> Security note: `apps/web/.env.production` is still tracked on `main` and leaked a Helius
> key. Rotate that key and merge the untrack fix (branch `security/untrack-env-production`).
