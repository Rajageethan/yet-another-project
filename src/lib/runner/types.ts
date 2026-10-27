export type CaseResult = {
  args: unknown[];
  expected: unknown;
  got?: unknown;
  passed: boolean;
  error?: string;
};

export type RunResult = {
  cases: CaseResult[];
  /** Compile/load error or timeout that stopped the whole run */
  error?: string;
  stdout?: string;
  ms?: number;
};
