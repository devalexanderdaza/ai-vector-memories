import { describe, expect, it } from 'vitest';

import {
  parseMetricsReportArgs,
  runMetricsReportCommand,
} from './metrics-report.js';

describe('metrics-report command args', () => {
  it('uses markdown as default format', () => {
    const options = parseMetricsReportArgs([]);
    expect(options.format).toBe('markdown');
    expect(options.output).toBeUndefined();
  });

  it('parses format and output flags', () => {
    const options = parseMetricsReportArgs(['--format', 'json', '--output', 'report.json']);
    expect(options.format).toBe('json');
    expect(options.output).toBe('report.json');
  });

  it('fails with invalid format', () => {
    expect(() => parseMetricsReportArgs(['--format', 'xml'])).toThrow(
      'Invalid --format value. Use: json | markdown',
    );
  });
});

describe('metrics-report command runtime', () => {
  it('writes report to stdout when no output file is provided', () => {
    let stdout = '';
    let stderr = '';

    const exitCode = runMetricsReportCommand(['--format', 'markdown'], {
      collector: {
        generateReport: () => '# Report',
      },
      writeFile: () => {
        throw new Error('writeFile should not be called');
      },
      stdout: (content) => {
        stdout += content;
      },
      stderr: (content) => {
        stderr += content;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('# Report');
  });

  it('writes report to file when output is provided', () => {
    let stdout = '';
    let writtenPath = '';
    let writtenContent = '';

    const exitCode = runMetricsReportCommand(['--format', 'json', '--output', 'tmp-report.json'], {
      collector: {
        generateReport: () => '{"ok":true}',
      },
      writeFile: (path, content) => {
        writtenPath = path;
        writtenContent = content;
      },
      stdout: (content) => {
        stdout += content;
      },
      stderr: () => {
        throw new Error('stderr should not be called');
      },
    });

    expect(exitCode).toBe(0);
    expect(writtenPath).toBe('tmp-report.json');
    expect(writtenContent).toBe('{"ok":true}\n');
    expect(stdout).toContain('Metrics report written to tmp-report.json');
  });
});
