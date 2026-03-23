function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  DATABASE_URL: required('DATABASE_URL'),
  LITELLM_BASE_URL: required('LITELLM_BASE_URL'),
  LITELLM_API_KEY: required('LITELLM_API_KEY'),
  EMBEDDING_MODEL: process.env['EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
  METADATA_MODEL: process.env['METADATA_MODEL'] ?? 'gpt-4o-mini',
  ADMIN_API_KEY: required('ADMIN_API_KEY'),
  SLACK_SIGNING_SECRET: process.env['SLACK_SIGNING_SECRET'],
  SLACK_BOT_TOKEN: process.env['SLACK_BOT_TOKEN'],
  PORT: process.env['PORT'] ?? '3000',
} as const;
