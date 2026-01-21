/**
 * Run E2E tests with automatic Cognito authentication
 *
 * Usage:
 *   E2E_TEST_PASSWORD=yourpassword npx tsx run-with-auth.ts api
 *   E2E_TEST_PASSWORD=yourpassword npx tsx run-with-auth.ts all
 */

import { spawn } from 'child_process';
import { getE2EAuthToken } from './auth';

async function main() {
  const testType = process.argv[2] || 'api';

  console.log('🔐 Authenticating with Cognito...');

  try {
    const token = await getE2EAuthToken();
    console.log('✅ Authentication successful!\n');

    // Determine which test command to run
    let testCommand: string[];
    const apiUrl = process.env.E2E_API_URL || 'https://ik6dmnn2ra.us-east-2.awsapprunner.com';
    const webUrl = process.env.E2E_WEB_URL || 'https://y6empq5whm.us-east-2.awsapprunner.com';

    switch (testType) {
      case 'api':
        testCommand = ['vitest', 'run', '--config', 'vitest.config.ts', 'api/'];
        break;
      case 'web':
        testCommand = ['playwright', 'test'];
        break;
      case 'all':
        // Run API tests first, then web tests
        console.log('🧪 Running API tests...\n');
        await runTests(['vitest', 'run', '--config', 'vitest.config.ts', 'api/'], {
          E2E_AUTH_TOKEN: token,
          E2E_API_URL: apiUrl,
        });
        console.log('\n🧪 Running Web tests...\n');
        testCommand = ['playwright', 'test'];
        break;
      default:
        console.error(`Unknown test type: ${testType}`);
        console.error('Usage: npx tsx run-with-auth.ts [api|web|all]');
        process.exit(1);
    }

    // Run the tests with the token in environment
    await runTests(testCommand, {
      E2E_AUTH_TOKEN: token,
      E2E_API_URL: apiUrl,
      E2E_WEB_URL: webUrl,
    });
  } catch (error) {
    console.error('❌ Failed:', error);
    process.exit(1);
  }
}

function runTests(
  command: string[],
  env: Record<string, string>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command;

    const child = spawn('npx', [cmd, ...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...env,
      },
      cwd: __dirname,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Tests exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

main();
