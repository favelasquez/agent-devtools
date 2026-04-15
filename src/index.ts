import { startProxy } from './proxy/server';
import { startDashboard } from './dashboard/server';
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import chalk from 'chalk';

const PROXY_PORT = 4000;
const DASHBOARD_PORT = 4001;

async function main() {
  const args = process.argv.slice(2);

  console.log(chalk.bold('\n  Agent DevTools\n'));

  await startProxy(PROXY_PORT);
  await startDashboard(DASHBOARD_PORT);

  console.log(chalk.green(`  Proxy      → http://localhost:${PROXY_PORT}`));
  console.log(chalk.green(`  Dashboard  → http://localhost:${DASHBOARD_PORT}\n`));

  if (args.length === 0) {
    console.log(
      chalk.yellow('  Tip: pasa un comando para interceptar automáticamente:\n') +
      chalk.cyan('  npx agent-devtools claude\n') +
      chalk.dim(`  O manualmente: ANTHROPIC_BASE_URL=http://localhost:${PROXY_PORT}\n`)
    );
    return;
  }

  const [cmd, ...cmdArgs] = args;

  // Claude Code (OAuth mode) ignores ANTHROPIC_BASE_URL in env.
  // Escribimos un settings file temporal para inyectarlo antes de que se inicialice el cliente.
  const isClaude = cmd === 'claude';
  let finalArgs = cmdArgs;
  if (isClaude) {
    const tmpSettings = join(tmpdir(), `agent-devtools-${Date.now()}.json`);
    writeFileSync(tmpSettings, JSON.stringify({ env: { ANTHROPIC_BASE_URL: `http://localhost:${PROXY_PORT}` } }));
    finalArgs = ['--settings', tmpSettings, ...cmdArgs];
    console.log(chalk.dim(`  Settings tmp → ${tmpSettings}\n`));
  }

  console.log(chalk.dim(`  Lanzando: ${[cmd, ...finalArgs].join(' ')}\n`));

  const child = spawn(cmd, finalArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: `http://localhost:${PROXY_PORT}`,
    },
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('Failed to start agent-devtools:', err);
  process.exit(1);
});
