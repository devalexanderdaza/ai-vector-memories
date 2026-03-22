import { writeFileSync } from 'fs';

import { InjectionMetricsCollector } from '../memory/injection-metrics.js';
import type { ReportFormat } from '../memory/injection-metrics.js';

export interface MetricsReportCommandOptions {
  format: ReportFormat;
  output?: string;
}

export interface MetricsReportCommandDeps {
  collector: Pick<InjectionMetricsCollector, 'generateReport'>;
  writeFile: (path: string, content: string) => void;
  stdout: (content: string) => void;
  stderr: (content: string) => void;
}

function isSupportedFormat(value: string): value is ReportFormat {
  return value === 'json' || value === 'markdown';
}

export function parseMetricsReportArgs(argv: string[]): MetricsReportCommandOptions {
  let format: ReportFormat = 'markdown';
  let output: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--format') {
      const value = argv[i + 1];
      if (!value || !isSupportedFormat(value)) {
        throw new Error('Invalid --format value. Use: json | markdown');
      }
      format = value;
      i++;
      continue;
    }

    if (arg === '--output') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --output');
      }
      output = value;
      i++;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      throw new Error('HELP_REQUESTED');
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { format, output };
}

export function runMetricsReportCommand(
  argv: string[],
  deps?: Partial<MetricsReportCommandDeps>,
): number {
  const runtimeDeps: MetricsReportCommandDeps = {
    collector: deps?.collector ?? InjectionMetricsCollector.getInstance(),
    writeFile: deps?.writeFile ?? ((path, content) => writeFileSync(path, content, 'utf-8')),
    stdout: deps?.stdout ?? ((content) => process.stdout.write(content)),
    stderr: deps?.stderr ?? ((content) => process.stderr.write(content)),
  };

  try {
    const options = parseMetricsReportArgs(argv);
    const report = runtimeDeps.collector.generateReport(options.format);

    if (options.output) {
      runtimeDeps.writeFile(options.output, `${report}\n`);
      runtimeDeps.stdout(`Metrics report written to ${options.output}\n`);
      return 0;
    }

    runtimeDeps.stdout(`${report}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'HELP_REQUESTED') {
      runtimeDeps.stdout('Usage: bun run metrics:report [--format json|markdown] [--output <file>]\n');
      return 0;
    }
    runtimeDeps.stderr(`metrics:report failed: ${message}\n`);
    return 1;
  }
}

if (import.meta.main) {
  const exitCode = runMetricsReportCommand(process.argv.slice(2));
  process.exit(exitCode);
}
