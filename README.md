# (AJ) AI Commit Generator Pro 🚀

**Stop wasting time thinking about commit messages.** Generate semantic, context-aware commit messages in seconds using state-of-the-art AI.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-2.0.1-green)

---

## ✨ Features

- **🧠 Multi-Provider AI**: Support for **Google Gemini**, **OpenAI**, and **OpenRouter** (for models like Qwen or Claude).
- **📝 Semantic Messages**: Automatically generates messages following standard conventions (feat, fix, refactor, chore, etc.).
- **🔗 Intelligent Issue Linking**: Analyzes your code changes against open GitHub issues and links them automatically (Closes #ID or Relates to #ID).
- **🚀 Multi-Issue Support**: Can identify multiple relevant issues for a single commit.
- **🛠️ Auto-Issue Creation**: If no relevant issue exists, the AI can propose and create one for you directly on GitHub.
- **⚡ Super Fast**: Dedicated Source Control button and keyboard shortcut (`Ctrl + Alt + C`).

---

## ⚙️ Setup

1. **Install** the extension from the VS Code Marketplace.
2. **Configure your AI Provider**:
   - Go to `Settings (Ctrl + ,)` -> `Extensions` -> `AI Commit Generator`.
   - Select your provider and enter your **API Key**.
3. **GitHub Integration** (Optional but Recommended):
   - Set the `Issue Tracker` to `github`.
   - Click the "GitHub Sign-In" button in the extension or provide a Personal Access Token (PAT) in settings to enable issue linking and creation.

---

## 🚀 How to Use

### 1. Stage your changes
Use the standard VS Code Git view to stage the files you want to commit.

### 2. Generate Message
- **Option A**: Click the **(AJ) Generate AI Commit Message** button in the Source Control title bar.
- **Option B**: Use the keyboard shortcut `Ctrl + Alt + C`.

### 3. Review and Commit
The message will appear in your commit box. Review it, and hit `Commit`!

---

## 🛠️ Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `provider` | Choose between Gemini, OpenAI, or OpenRouter | `gemini` |
| `apiKey` | Your AI API Key | `""` |
| `autoCreateIssues` | If no issue matches, should AI create one? | `true` |
| `includeIssueInCommit` | Automatically link issues in messages | `true` |

---

## 🤝 Contributing

Contributions are welcome! If you find a bug or have a feature request, please open an issue on our [GitHub Repository](https://github.com/AhmedFadhl/AiCommitGenerator).

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

*Powered by Advanced Agentic Coding by Ahmed Fadhl*
