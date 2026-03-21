# Source Tree Analysis

```text
ai-vector-memories/
├── dist/                # Compiled output directory
├── docs/                # Generated project documentation
├── src/                 # Main source code
│   ├── adapters/        # Integration with external platforms
│   │   └── opencode/    # OpenCode AI plugin specific integration and hooks
│   ├── config/          # Configuration management logic
│   ├── extraction/      # Asynchronous queue and memory extraction handlers
│   ├── memory/          # Core memory, embedding, and NLP logic
│   │   ├── classifier.ts
│   │   ├── embeddings.ts
│   │   └── reconsolidate.ts
│   ├── storage/         # Database persistence layer
│   │   ├── database.ts
│   │   └── sqlite-adapter.ts
│   ├── templates/       # Default template files
│   ├── types/           # Core TypeScript type definitions
│   └── utils/           # Shared utility functions
├── package.json         # Project manifest and dependencies
└── tsconfig.json        # TypeScript configuration
```

## Critical Folders

- **`src/adapters/opencode/`**: The main entry point for the plugin hooks (e.g., chat interceptions, workspace tracking).
- **`src/memory/`**: Contains the logic for classification, vector embeddings (`ruvector`, `@huggingface/transformers`), and pattern matching.
- **`src/storage/`**: Implements SQLite operations to persist the semantic memory.