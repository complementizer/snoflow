/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_OPENAI_MODEL: string;
  readonly VITE_AZURE_OPENAI_ENDPOINT: string;
  readonly VITE_AZURE_OPENAI_API_KEY: string;
  readonly VITE_AZURE_OPENAI_DEPLOYMENT_NAME: string;
  readonly VITE_AZURE_OPENAI_API_VERSION: string;
  readonly VITE_SNOWSTORM_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
