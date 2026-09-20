import { validateEnvironment } from "../src/config/environment.ts";

try {
  const configuration = validateEnvironment(process.env);
  console.log(`Environment configuration accepted: ${configuration.environment}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Environment configuration rejected.");
  process.exitCode = 1;
}
