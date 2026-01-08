import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build the content script with injected configuration
 */
export function buildContentScript(config: {
  serverUrl: string;
  userId: string;
  apiKey: string;
}): string {
  const templatePath = path.join(__dirname, 'whatsapp-content.js');
  let content = fs.readFileSync(templatePath, 'utf-8');

  // Replace placeholders
  content = content.replace('__SERVER_URL__', config.serverUrl);
  content = content.replace('__USER_ID__', config.userId);
  content = content.replace('__API_KEY__', config.apiKey);

  return content;
}

/**
 * Get path to content script for injection
 */
export function getContentScriptPath(): string {
  return path.join(__dirname, 'whatsapp-content.js');
}
