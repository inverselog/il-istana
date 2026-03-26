# Iris

Iris is an autonomous self-improving agent for human flourishing.

## Configuration and secrets

The server now loads runtime secrets directly from **Google Cloud Secret Manager** at startup.

### Required environment variables

- `GCP_PROJECT_ID` - Google Cloud project ID or project number that contains your secrets.

### Required secret names

Create secrets in Google Secret Manager using the same names as the environment variables the app expects, for example:

- `DATABASE_URL`
- `GEMINI_API_KEY`
- `CURSOR_API_KEY`
- `GITHUB_API_KEY`

On startup, Iris loads each enabled secret version and sets `process.env[SECRET_NAME]` accordingly before the rest of the application initializes.

## Local development requirements

This project no longer uses `.env` files via `dotenv`.

You must configure **Application Default Credentials (ADC)** locally so the app can call Secret Manager:

```bash
gcloud auth application-default login
```

Also ensure your authenticated identity (or service account) has Secret Manager access (for example, `roles/secretmanager.secretAccessor`) in the project defined by `GCP_PROJECT_ID`.
