You are an Edge Case Hunter. Review this diff against the base code. Walk every branching path and boundary condition in content, report only unhandled edge cases.

Content to review:
```
diff --git a/src/adapters/opencode/injection.ts b/src/adapters/opencode/injection.ts
index c135648..d703493 100644
--- a/src/adapters/opencode/injection.ts
+++ b/src/adapters/opencode/injection.ts
@@ -93,80 +93,83 @@ function applyTokenBudget(
 }
 
 interface SelectionTelemetry {
-  worktree: string;
-  selected: number;
-  pool: number;
-  embeddingsEnabled: boolean;
-  queryContextLength: number;
-  mode: SelectionMode;
-  limits: {
-    maxMemories: number;
-    maxTokens: number;
-  };
-  tokens: {
-    used: number;
-    percent: number;
-  };
-  scope: {
-    global: number;
-    project: number;
-  };
-  classifications: Record<string, number>;
-}
+   worktree: string;
+   selected: number;
+   pool: number;
+   embeddingsEnabled: boolean;
+   queryContextLength: number;
+   mode: SelectionMode;
+   limits: {
+     maxMemories: number;
+     maxTokens: number;
-   };
-  tokens: {
-    used: number;
-    percent: number;
-  };
-  scope: {
-    global: number;
-    project: number;
-  };
-  classifications: Record<string, number>;
-}
+   };
+   tokens: {
+     used: number;
+     percent: number;
+   };
+   scope: {
+     global: number;
+     project: number;
+   };
+   classifications: Record<string, number>;
+   latencyMs: number;
+ }
 
 function buildSelectionTelemetry(params: {
-  worktree: string;
-  selectedMemories: MemoryUnit[];
-  allMemories: MemoryUnit[];
-  embeddingsEnabled: boolean;
-  queryContext: string;
-  mode: SelectionMode;
-  totalTokens: number;
-  maxTokens: number;
-  maxMemories: number;
-}): SelectionTelemetry {
-  const classificationCounts: Record<string, number> = {};
-  let globalCount = 0;
-  let projectCount = 0;
-
-  for (const memory of params.selectedMemories) {
-    classificationCounts[memory.classification] =
-      (classificationCounts[memory.classification] ?? 0) + 1;
-
-    if (memory.projectScope === null) {
-      globalCount++;
-    } else {
-      projectCount++;
-    }
-  }
-
-  const tokenPercent =
-    params.maxTokens > 0
-      ? Math.min(100, Math.round((params.totalTokens / params.maxTokens) * 100))
-      : 0;
-
-  return {
-    worktree: params.worktree,
-    selected: params.selectedMemories.length,
-    pool: params.allMemories.length,
-    embeddingsEnabled: params.embeddingsEnabled,
-    queryContextLength: params.queryContext.length,
-    mode: params.mode,
-    limits: {
-      maxMemories: params.maxMemories,
-      maxTokens: params.maxTokens,
-    },
-    tokens: {
-      used: params.totalTokens,
-      percent: tokenPercent,
-    },
-    scope: {
-      global: globalCount;
-      project: projectCount;
-    },
-    classifications: classificationCounts,
-  };
-}
+   worktree: string;
+   selectedMemories: MemoryUnit[];
+   allMemories: MemoryUnit[];
+   embeddingsEnabled: boolean;
+   queryContext: string;
+   mode: SelectionMode;
+   totalTokens: number;
+   maxTokens: number;
+   maxMemories: number;
+   latencyMs: number;
+ }): SelectionTelemetry {
+   const classificationCounts: Record<string, number> = {};
+   let globalCount = 0;
+   let projectCount = 0;
+
+   for (const memory of params.selectedMemories) {
+     classificationCounts[memory.classification] =
+       (classificationCounts[memory.classification] ?? 0) + 1;
+
+     if (memory.projectScope === null) {
+       globalCount++;
+     } else {
+       projectCount++;
+     }
+   }
+
+   const tokenPercent =
+     params.maxTokens > 0
+       ? Math.min(100, Math.round((params.totalTokens / params.maxTokens) * 100))
+       : 0;
+
+   return {
+     worktree: params.worktree,
+     selected: params.selectedMemories.length,
+     pool: params.allMemories.length,
+     embeddingsEnabled: params.embeddingsEnabled,
+     queryContextLength: params.queryContext.length,
+     mode: params.mode,
+     limits: {
+       maxMemories: params.maxMemories,
+       maxTokens: params.maxTokens,
-     },
-    tokens: {
-      used: number;
-      percent: number;
-    },
-    scope: {
-      global: number;
-      project: number;
-    },
-    classifications: Record<string, number>;
-  };
-}
+     },
+    tokens: {
+      used: number;
+      percent: number;
+    },
+    scope: {
+      global: number;
+      project: number;
+    },
+    classifications: Record<string, number>;
+    latencyMs: number;
+   };
+ }
 
 /**
  * Wrap memories in XML format with persona boundary
  *
@@ -305,17 +308,18 @@ export function extractProjectContext(memories: MemoryUnit[]): MemoryUnit[] {
  * Tier 3: semantic, episodic (low priority, by query relevance)
  */
 export async function selectMemoriesForInjection(
-  db: MemoryDatabase,
-  worktree: string,
-  queryContext: string,
-  embeddingsEnabled: boolean,
-  maxMemories: number = 20,
-  maxTokens: number = 4000,
-): Promise<MemoryUnit[]> {
-  const memories: MemoryUnit[] = [];
-  const selectedIds = new Set<string>();
-  let totalTokens = 0;
-  let selectionMode: SelectionMode = "none";
+   db: MemoryDatabase,
+   worktree: string,
+   queryContext: string,
+   embeddingsEnabled: boolean,
+   maxMemories: number = 20,
+   maxTokens: number = 4000,
+ ): Promise<MemoryUnit[]> {
+   const startTime = Date.now();
+   const memories: MemoryUnit[] = [];
+   const selectedIds = new Set<string>();
+   let totalTokens = 0;
+   let selectionMode: SelectionMode = "none";
 
   // Scale quotas proportionally
   const MIN_GLOBAL = Math.floor(maxMemories * 0.3);
@@ -454,18 +458,38 @@ export async function selectMemoriesForInjection(
     );
   }
 
-  const telemetry = buildSelectionTelemetry({
-    worktree,
-    selectedMemories: memories,
-    allMemories,
-    embeddingsEnabled,
-    queryContext,
-    mode: selectionMode,
-    totalTokens,
-    maxTokens,
-    maxMemories,
-  });
-  log(`Selection telemetry: ${JSON.stringify(telemetry)}`);
+let telemetry;
+     const latencyMs = Date.now() - startTime;
+     try {
+       telemetry = buildSelectionTelemetry({
+         worktree,
+         selectedMemories: memories,
+         allMemories,
+         embeddingsEnabled,
+         queryContext,
+         mode: selectionMode,
+         totalTokens,
+         maxTokens,
+         maxMemories,
+         latencyMs,
+       });
+     } catch (error) {
+       log(`Error building selection telemetry: ${error instanceof Error ? error.message : String(error)}`);
+       // Provide minimal telemetry to maintain fail-open behavior
+       telemetry = {
+         worktree,
+         selected: memories.length,
+         allMemories: allMemories.length,
+         embeddingsEnabled,
+         queryContextLength: queryContext.length,
+         mode: selectionMode,
+         totalTokens,
+         maxTokens,
+         maxMemories,
+         latencyMs,
+       };
+     }
+     log(`Selection telemetry: ${JSON.stringify(telemetry)}`);
 
   return memories;
 }
```

Output findings as a JSON array following the exact format:
[{
  "location": "file:start-end (or file:line when single line, or file:hunk when exact line unavailable)",
  "trigger_condition": "one-line description (max 15 words)",
  "guard_snippet": "minimal code sketch that closes the gap (single-line escaped string, no raw newlines or unescaped quotes)",
  "potential_consequence": "what could actually go wrong (max 15 words)"
}]

Only report unhandled edge cases - paths that lack explicit guards in the diff.