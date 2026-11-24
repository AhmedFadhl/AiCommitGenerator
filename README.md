# (AJ) AI Commit Generator Pro 🚀

**Stop wasting time thinking about commit messages.** Generate semantic, context-aware commit messages in seconds using AI — with multi-provider support (cloud, free-tier, and local offline LLMs), Google AI Studio OAuth sign-in, security & diff noise filtering, multilingual commits, smart issue linking, and one-click PR/MR Auto-Deploy.

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/AhmedAJ.aj-ai-commit-generator.svg?style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=AhmedAJ.aj-ai-commit-generator)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/AhmedAJ.aj-ai-commit-generator.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=AhmedAJ.aj-ai-commit-generator)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/AhmedAJ.aj-ai-commit-generator.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=AhmedAJ.aj-ai-commit-generator)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

---

## ✨ Features

### 🧠 Multi-Provider AI Engine (Cloud, Free-Tier & Local)
- **8 Active AI Providers** out of the box, with seamless switching from the Status Bar or Command Palette:
  - **Google Gemini** (`gemini`): Supports both **Google AI Studio OAuth 2.0 PKCE** (`Account` mode) and static **API Key** mode.
  - **Groq Cloud** (`groq`): Ultra-fast LPU inference (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`, `allam-2-7b`).
  - **OpenRouter** (`openrouter`): Zero-cost `:free` auto-routing (`openrouter/free` default plus curated free presets).
  - **Mistral Studio / Codestral** (`mistral`): `codestral-latest`, `mistral-small-latest`, `mistral-large-latest`, `ministral-8b-latest`.
  - **APInex** (`apinex`): Multi-model gateway (`free/deepseek-v4.1-flash`, `free/glm-5.3-flash`, `free/gemini-4-hydrogen`, `free/qwen-3.8-max`, `free/claude-sonnet-4.6`, etc.).
  - **OpenAI** (`openai`): `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`, and reasoning models.
  - **DeepSeek** (`deepseek`): `deepseek-chat`, `deepseek-coder`, and reasoning models with `<think>` block sanitization.
  - **Ollama** (`ollama`): Local, private offline inference via `http://localhost:11434` (`gemma2:9b`, `llama3`, `mistral`, or any local model).
- **Custom Models per Provider**: Pick `custom` or manage custom model lists right inside the interactive **Select AI Model** QuickPick.
- **Resilient Error Handling**: Fail-fast on non-retryable auth/billing errors (`401`/`402`/`403`) with automatic API key redaction in logs/errors, plus adaptive handling for parameter differences across reasoning models.

### 📝 Flexible Commit Generation & Languages
- **Commit Formats**: Supports `conventional` (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`), `simple`, and `smart` formats.
- **Multilingual Commits**: Generate commits in **English** (`en`), **Arabic** (`ar`), or **Bilingual** (`bilingual` — English subject line with Arabic body explanation).
- **Multi-Style Variations** (`enableMultiStyle`): Optionally preview and pick from 3 generated styles (**Concise**, **Detailed**, **Gitmoji**) in a QuickPick menu.

### 🛡️ Security & Smart Diff Pipeline
- **Pre-Commit Secret Scanner** (`enableSecretScanner`): Pre-scans staged changes for leaked API keys, tokens, JWTs, and private keys before sending diffs to an AI provider.
- **Smart Diff Noise Filter** (`enableSmartDiffFilter`): Automatically excludes noisy lockfiles (`package-lock.json`, `yarn.lock`), minified files, and compiled/binary assets to save tokens and keep prompts focused (falling back safely if all files would be filtered).

### 🔗 Multi-Platform Git Hosting, Issues & Auto-Deploy
- **Git Platforms**: Auto-detects or configures **GitHub**, **GitHub Enterprise**, **GitLab**, and **Gitea / Forgejo** (with `customGitApiUrl` and `gitToken` support for self-hosted instances).
- **Smart Issue Linking & Creation**: Matches your changes against open issues (`Closes #ID` / `Relates to #ID`), supports multi-issue matching, and creates new issues directly from your diff (`Ctrl+Alt+I` / `Cmd+Shift+I`).
- **Auto-Deploy (Create & Merge PR/MR)**: One-click Source Control command that runs pre-flight Git checks (detached HEAD, ongoing merge/rebase, branch divergence), creates or finds a PR/MR, polls mergeability with backoff, merges with your preferred strategy (`merge`, `squash`, or `rebase`), and falls back to a deterministic PR title/body if AI generation fails.

### ⚡ Integrated Workflow & Quick Settings Hub
- **Status Bar Hub**: Shows the active `provider:model` (and signed-in Google account when active) — click it anytime to open **Configure Features & Toggles**.
- **Source Control Action Bar**: Dedicated buttons right in the Git Source Control title bar for Generating Commits, Selecting Models, Creating Issues, and Auto-Deploying PRs.

---

## ⚙️ Quick Setup

1. **Install** `(AJ) AI Commit Generator Pro` from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AhmedAJ.aj-ai-commit-generator).
2. **Choose your AI Provider & Auth**:
   - **Fastest Free Option (Google AI Studio OAuth)**: Run `AI Commit: Sign in with Google (AI Studio)` from the Command Palette (`Ctrl+Shift+P`), or click the Status Bar item and toggle **Google AI Studio Account Auth**.
   - **API Key / Other Providers**: Open Settings (`Ctrl+,`) -> `AI Commit Generator Pro`, pick `aiCommitGenerator.provider`, and set `aiCommitGenerator.apiKey` (or a provider-specific key like `groqApiKey`, `openrouterApiKey`, `mistralApiKey`, `apinexApiKey`).
   - **Local Offline (Ollama)**: Set `aiCommitGenerator.provider` to `ollama` and point `ollamaEndpoint` to your local Ollama server (`http://localhost:11434`).
3. **Git Hosting / Issue Integration** *(Optional)*:
   - Set `aiCommitGenerator.issueTracker` to `github` (or configure `gitProvider`, `customGitApiUrl`, and `gitToken` for GitHub Enterprise, GitLab, or Gitea).

---

## 🚀 Usage & Shortcuts

| Action | Command ID | Shortcut (Win/Linux) | Shortcut (macOS) |
|--------|-----------|----------------------|------------------|
| Generate AI Commit Message | `ai-commit-generator.generateCommitMessage` | `Ctrl+Alt+C` | `Cmd+Shift+C` |
| Create Issue from Changes | `ai-commit-generator.createIssueFromChanges` | `Ctrl+Alt+I` | `Cmd+Shift+I` |
| Select AI Model | `ai-commit-generator.selectModel` | Command Palette / SCM bar | Command Palette / SCM bar |
| Configure Features & Toggles | `ai-commit-generator.configureFeatures` | Status Bar click | Status Bar click |
| Auto-Deploy (Create & Merge PR) | `ai-commit-generator.createAndMergePR` | SCM bar | SCM bar |
| Sign in with Google (AI Studio) | `ai-commit-generator.signInWithGoogle` | Command Palette | Command Palette |
| Sign out from Google Account | `ai-commit-generator.signOutGoogle` | Command Palette | Command Palette |
| Sign in to GitHub | `ai-commit-generator.githubLogin` | Command Palette | Command Palette |

1. **Stage Changes** in the VS Code Source Control view (or leave changes unstaged — the extension falls back to unstaged diffs automatically).
2. Click the ✨ sparkle icon in Source Control or press `Ctrl+Alt+C` (`Cmd+Shift+C`).
3. Review the generated message (or pick one of the 3 variations if Multi-Style is enabled) and commit!

---

## 🛠️ Key Configuration Settings (`aiCommitGenerator.*`)

| Setting | Description | Default |
|---------|-------------|---------|
| `provider` | Active AI provider (`gemini`, `groq`, `openrouter`, `mistral`, `apinex`, `openai`, `deepseek`, `ollama`) | `gemini` |
| `googleAuthMode` | Google Gemini auth method (`ApiKey` or `Account` for OAuth 2.0 PKCE) | `ApiKey` |
| `apiKey` | Default API key (fallback when provider-specific key is empty) | `""` |
| `groqApiKey` / `openrouterApiKey` / `mistralApiKey` / `apinexApiKey` | Dedicated per-provider API keys | `""` |
| `ollamaEndpoint` / `ollamaModel` | Local Ollama endpoint and model name | `http://localhost:11434` / `gemma2:9b` |
| `customModel` | Custom model override when a provider model is set to `custom` | `""` |
| `commitFormat` | Commit style format (`conventional`, `simple`, `smart`) | `conventional` |
| `commitLanguage` | Generated commit language (`en`, `ar`, `bilingual`) | `en` |
| `enableMultiStyle` | Present 3 commit variations (Concise, Detailed, Gitmoji) via QuickPick | `false` |
| `enableSecretScanner` | Scan diffs for leaked secrets/tokens before calling AI | `false` |
| `enableSmartDiffFilter` | Exclude lockfiles and binary/compiled assets from diff prompts | `true` |
| `maxTokens` / `maxRetries` | Completion token cap (`100`–`16000`) and retry limit (`1`–`10`) | `2000` / `3` |
| `gitProvider` | Git hosting provider (`auto`, `github`, `github-enterprise`, `gitlab`, `gitea`) | `auto` |
| `customGitApiUrl` / `gitToken` | API base URL and PAT for self-hosted Git instances | `""` |
| `autoDeployMergeMethod` | Merge strategy used by Auto-Deploy (`merge`, `squash`, `rebase`) | `merge` |
| `issueTracker` | Enable issue linking/creation (`github` activates integration across GitHub, GHES, GitLab, and Gitea remotes; `none` disables) | `none` |
| `autoCreateIssues` / `includeIssueInCommit` | Auto-create missing issues and append issue links to commits | `true` / `true` |
| `projectContext` | Optional project prefix/label associated with created issues | `""` |

---

## 🤝 Contributing & Feedback

Love the extension? Star it on [GitHub](https://github.com/AhmedFadhl/AiCommitGenerator)! 🌟  
Found a bug or have a feature idea? Open an [issue](https://github.com/AhmedFadhl/AiCommitGenerator/issues).

---

## 📜 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

*Crafted with ❤️ by Ahmed Fadhl & Antigravity (Advanced Agentic Coding)*
