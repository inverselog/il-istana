import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

function getSecretNameFromResource(resourceName) {
  return resourceName?.split('/').pop();
}

function getVersionNumber(versionResourceName) {
  const raw = versionResourceName?.split('/').pop();
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : -1;
}

export async function fetchSecretsAndSetEnv() {
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error('GCP_PROJECT_ID is required to load secrets from Google Secret Manager.');
  }

  const client = new SecretManagerServiceClient();
  const parent = `projects/${projectId}`;
  let loadedSecrets = 0;

  try {
    const [secrets] = await client.listSecrets({ parent });

    for (const secret of secrets) {
      if (!secret.name) {
        continue;
      }

      const secretName = getSecretNameFromResource(secret.name);
      if (!secretName) {
        continue;
      }

      const [versions] = await client.listSecretVersions({
        parent: secret.name,
        filter: 'state=ENABLED',
      });

      const latestEnabledVersion = versions
        .filter(version => version.name)
        .sort((a, b) => getVersionNumber(b.name) - getVersionNumber(a.name))[0];

      if (!latestEnabledVersion?.name) {
        continue;
      }

      const [accessResponse] = await client.accessSecretVersion({
        name: latestEnabledVersion.name,
      });

      const payloadBuffer = accessResponse.payload?.data;
      if (payloadBuffer == null) {
        continue;
      }

      process.env[secretName] = payloadBuffer.toString('utf8');
      loadedSecrets += 1;
    }

    console.log(`Loaded ${loadedSecrets} secrets from Google Secret Manager.`);
  } finally {
    await client.close();
  }
}
