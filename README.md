# (AJ) AI Commit Generator Pro 🚀

**Stop wasting time thinking about commit messages.** Generate semantic, context-aware commit messages in seconds using state-of-the-art AI. The "Pro" edition includes advanced issue tracking, multi-provider support, and intelligent change analysis.

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/AhmedFadhlAJ.aj-ai-commit-generator.svg?style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=AhmedFadhlAJ.aj-ai-commit-generator)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/AhmedFadhlAJ.aj-ai-commit-generator.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=AhmedFadhlAJ.aj-ai-commit-generator)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/AhmedFadhlAJ.aj-ai-commit-generator.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=AhmedFadhlAJ.aj-ai-commit-generator)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

---

## ✨ Features

- **🧠 Multi-Provider AI**: Native support for **Google Gemini (3.0 Flash)**, **OpenAI (GPT-4o)**, and **OpenRouter** (Claude, Qwen, etc.).
- **📝 Semantic Intelligence**: Automatically generates messages following Conventional Commits (feat, fix, refactor, chore, docs, test).
- **🔗 Smart Issue Linking**: Deeply analyzes code changes against open GitHub/Jira/Linear issues to link them automatically (`Closes #ID` or `Relates to #ID`).
- **🚀 Multi-Issue Support**: Identifies all relevant issues for complex changes involving multiple tasks.
- **🛠️ Zero-Click Issue Creation**: Proposes and creates missing issues directly on GitHub if none are found for your changes.
- **⚡ Integrated Workflow**: Dedicated Source Control button and customizable keyboard shortcuts (`Ctrl + Alt + C`).

---

## ⚙️ Quick Setup

1. **Install** the extension from the VS Code Marketplace.
2. **Configure your AI Provider**:
   - Open Settings (`Ctrl + ,`) -> `Extensions` -> `AI Commit Generator`.
   - Select your provider and enter your **API Key**.
3. **GitHub Integration** (Highly Recommended):
   - Set `Issue Tracker` to `github`.
   - Use the "Sign-In" button or provide a Personal Access Token (PAT) for seamless issue automation.

---

## 🚀 Usage

### 1. Stage Changes
Stage the files you want to include in your commit using the standard VS Code Git view.

### 2. Generate Message
- **Action Button**: Click the ✨ sparkle icon in the Source Control title bar.
- **Shortcut**: Press `Ctrl + Alt + C`.

### 3. Review & Commit
The generated message (including issue links) will appear in the input box. Hit `Commit` and you're done!

---

## 🛠️ Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `provider` | Gemini, OpenAI, or OpenRouter | `gemini` |
| `apiKey` | Your AI Provider API Key | `""` |
| `issueTracker` | github, gitlab, jira, or linear | `none` |
| `autoCreateIssues` | Automatically draft missing issues | `true` |
| `includeIssueInCommit` | Automatically append issue references | `true` |

---

## 🤝 Contributing & Feedback

Love the extension? Star it on [GitHub](https://github.com/AhmedFadhl/AiCommitGenerator)! 🌟  
Found a bug? Open an [issue](https://github.com/AhmedFadhl/AiCommitGenerator/issues).

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for details.

---

*Crafted with ❤️ by Ahmed Fadhl & Antigravity (Advanced Agentic Coding)*
