# 🗺️ Full Architecture Implementation Plan: Multi-Provider Free & High-Speed LLM Integration (Groq, GitHub Models, Mistral, APInex, OpenRouter Free)

> **Project Name:** `ajaicommitgenerator`  
> **Repository Root:** `/home/aj/projects/AICommit/AJAICommitGenerator`  
> **Session Code:** `WR-20261124-E49A08`  
> **Director & Engineering Lead:** 👑 Sora (Team Lead & Director)  
> **Deliberations & Rationale:** [Deliberations Log (WR-20261124-E49A08)](file:///home/aj/projects/AICommit/AJAICommitGenerator/docs/plans/deliberations.md)  
> **Protocol Compliance:** Sora MCP-First Protocol v2.4 (Dynamic Stack Alignment & 5-Gate Review Pipeline)  
> **Generated At:** 2026-11-24T01:11:04.026Z  
> **Status:** ⏳ Governed Execution Pipeline  

---

## 🏛️ 1. Executive System Context & Scope

Integrate Groq Cloud, GitHub Models (with automatic GitHub OAuth/PAT token reuse), Mistral Studio (Codestral), and APInex providers into AJAICommitGenerator, and upgrade OpenRouter presets with live verified :free models (openrouter/free, Nemotron 3.5, Gemma 4, Ling 3.2).

- **Target Personas & Stakeholders:** Multi-agent development teams, autonomous engineering specialists, and sovereign human director (Muhammad).
- **Architectural Bounded Context:** Governed MCP-first execution with strict tenant isolation, Graphify AST synchronization, and zero solo speculative analysis.

---

## 📋 2. High-Level Architectural Decisions (Synthesized from Deliberations)

> *Full deliberation dialogues, peer inquiries, and socratic critiques are archived in [deliberations.md](file:///home/aj/projects/AICommit/AJAICommitGenerator/docs/plans/deliberations.md).*

### ✅ [WF-1: Codebase Reality & AST Extraction for Multi-Provider LLM Pipeline] (Status: In Deliberation)
- **Participants:** 👑 Sora (Team Lead & Director) ➔ 🔎 Smart Codebase & System Files Analyst
- **Consensus Summary:** Completed WF-1 AST extraction and blast radius mapping across package.json, src/pipeline/config.ts, src/pipeline/llm-client.ts, and src/extension.ts (263 AST nodes, 320 edges). Established explicit file locks and declarative provider registry boundaries to decouple God Nodes.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-2: Free & High-Speed LLM Provider API Contracts, Models & Rate-Limit Resilience] (Status: In Deliberation)
- **Participants:** 👑 Sora (Team Lead & Director) ➔ 🕵️ Smart AI Researcher
- **Consensus Summary:** Completed WF-2 live API contract and free-tier verification for Groq Cloud (api.groq.com/openai/v1), GitHub Models (models.github.ai/inference), Mistral Studio (api.mistral.ai/v1), APInex (api.apinex.bond/v1), and OpenRouter (:free models with openrouter/free auto-router default). Standardized non-retryable HTTP 401/402/403 error boundaries, token redaction, and reasoning model (<think> & temperature/max_completion_tokens) adaptation.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-3: Unified Multi-Provider Architecture, GitHub Auth Reuse & Interactive QuickPick UX] (Status: In Deliberation)
- **Participants:** 👑 Sora (Team Lead & Director) ➔ 🏛️ Software Architect
- **Consensus Summary:** Completed WF-3 architectural design, adversarial audit, DBGate verification, and Dual-Stack Shared Contract alignment for the 8-provider LLM pipeline (Gemini, Groq, OpenRouter, GitHub Models, Mistral, APInex, OpenAI, DeepSeek).
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-2.1: [Ambiguity Reflex] vague_security_perimeter: Address gap in 'WF-2: Free & High-Speed LLM Provider API Contracts, Models & Rate-Limit Resilience'] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ 🛡️ Security & QA Lead
- **Consensus Summary:** Resolved WF-2.1 security perimeter: strict HTTPS endpoint pinning, token redaction in logs/errors, and least-privilege PAT guidance.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-3.1: [Ambiguity Reflex] vague_security_perimeter: Address gap in 'WF-3: Unified Multi-Provider Architecture, GitHub Auth Reuse & Interactive QuickPick UX'] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ 🛡️ Security & QA Lead
- **Consensus Summary:** Resolved WF-3.1 isolated per-provider API key bindings and 300-char sanitized error message extraction.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-1.1: [Interrogation] Socratic Inquiry & Edge Cases: WF-1: Codebase Reality & AST Extraction for Multi-] (Status: In Deliberation)
- **Participants:** 👑 Sora (Team Lead & Director) ➔ ❓ Socratic Inquirer
- **Consensus Summary:** Resolved Socratic edge-case analysis for WF-1: customModel override is scoped strictly to 'custom' preset selection, and all API keys are trimmed in getPipelineConfig().
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-1.2: [Interrogation] Proactive Innovation & Smart Features: WF-1: Codebase Reality & AST Extraction for Multi-] (Status: In Deliberation)
- **Participants:** 👑 Sora (Team Lead & Director) ➔ 💡 Out-of-the-Box Innovator
- **Consensus Summary:** Resolved proactive innovation for WF-1.2: Zero-config GitHub Models token reuse via getGitHubAccessToken(false) and provider speed/free tier badges in QuickPick.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-2.2: [Interrogation] Socratic Inquiry & Edge Cases: WF-2: Free & High-Speed LLM Provider API Contracts] (Status: In Deliberation)
- **Participants:** 👑 Sora (Team Lead & Director) ➔ ❓ Socratic Inquirer
- **Consensus Summary:** Resolved Socratic edge-case analysis for WF-2: HTTP 401/402/403 errors short-circuit the retry loop immediately with actionable server error messages, and openrouter/free is set as the default zero-cost auto-router.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-2.3: [Interrogation] Proactive Innovation & Smart Features: WF-2: Free & High-Speed LLM Provider API Contracts] (Status: In Deliberation)
- **Participants:** 👑 Sora (Team Lead & Director) ➔ 💡 Out-of-the-Box Innovator
- **Consensus Summary:** Resolved WF-2.3 innovation: openrouter/free zero-cost load balancer default and universal <think> block stripping.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-3.2: [Interrogation] Socratic Inquiry & Edge Cases: WF-3: Unified Multi-Provider Architecture, GitHub] (Status: In Deliberation)
- **Participants:** 👑 Sora (Team Lead & Director) ➔ ❓ Socratic Inquirer
- **Consensus Summary:** Resolved Socratic edge-case analysis for WF-3: Publisher-prefixed model IDs on GitHub Models and OpenRouter are supported in reasoning detection, and custom<Provider>Models keys are deterministically mapped across all 8 providers.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-3.3: [Interrogation] Proactive Innovation & Smart Features: WF-3: Unified Multi-Provider Architecture, GitHub] (Status: In Deliberation)
- **Participants:** 👑 Sora (Team Lead & Director) ➔ 💡 Out-of-the-Box Innovator
- **Consensus Summary:** Resolved WF-3.3 one-click provider and model switching in showSelectModelQuickPick() with immediate Status Bar refresh.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-1.2.1: [Ambiguity Reflex] vague_security_perimeter: Address gap in 'WF-1.2: [Interrogation] Proactive Innovation & Smart Features: WF-1: Codebase Reality & AST Extraction for Multi-'] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ 🛡️ Security & QA Lead
- **Consensus Summary:** Verified HTTPS endpoint pinning, silent non-interactive getGitHubAccessToken(false) lookup, and strict bearer token redaction for GitHub Models.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-2.1.1: [Ambiguity Reflex] vague_security_perimeter: Address gap in 'WF-2.1: [Ambiguity Reflex] vague_security_perimeter: Address gap in 'WF-2: Free & High-Speed LLM Provider API Contracts, Models & Rate-Limit Resilience''] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ 🧐 Strict Critic / Devil's Advocate
- **Consensus Summary:** Verified strict HTTPS pinning, 300-char error payload truncation with regex token redaction, and non-retryable 401/402/403 termination.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-2.3.1: [Ambiguity Reflex] unaddressed_edge_cases: Address gap in 'WF-2.3: [Interrogation] Proactive Innovation & Smart Features: WF-2: Free & High-Speed LLM Provider API Contracts'] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ ❓ Socratic Inquirer
- **Consensus Summary:** Verified regex stripping for unclosed or partial <think> blocks and soft sanitization fallback on reasoning models.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-3.1.1: [Ambiguity Reflex] vague_security_perimeter: Address gap in 'WF-3.1: [Ambiguity Reflex] vague_security_perimeter: Address gap in 'WF-3: Unified Multi-Provider Architecture, GitHub Auth Reuse & Interactive QuickPick UX''] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ 🧐 Strict Critic / Devil's Advocate
- **Consensus Summary:** Verified isolated per-provider API key resolution in PipelineConfig eliminating cross-provider credential leakage.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-3.3.1: [Ambiguity Reflex] unaddressed_edge_cases: Address gap in 'WF-3.3: [Interrogation] Proactive Innovation & Smart Features: WF-3: Unified Multi-Provider Architecture, GitHub'] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ ❓ Socratic Inquirer
- **Consensus Summary:** Verified sequential awaited config.update calls for aiProvider and <provider>Model before updateStatusBar().
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-1.3: [Ambiguity Reflex] unaddressed_edge_cases: Address gap in 'WF-1: Codebase Reality & AST Extraction for Multi-Provider LLM Pipeline'] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ ❓ Socratic Inquirer
- **Consensus Summary:** Resolved WF-1.3 edge cases, PipelineConfig DTO schema normalization, and HTTPS/token redaction security controls.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-1.4: [Ambiguity Reflex] unaddressed_edge_cases: Address gap in 'WF-1: Codebase Reality & AST Extraction for Multi-Provider LLM Pipeline'] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ ❓ Socratic Inquirer
- **Consensus Summary:** Resolved WF-1.4 network timeout and response payload validation with OpenAIChatCompletion DTO contracts.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-2.4: [Ambiguity Reflex] missing_contract_or_dto: Address gap in 'WF-2: Free & High-Speed LLM Provider API Contracts, Models & Rate-Limit Resilience'] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ 📐 Lead Systems Analyst
- **Consensus Summary:** Resolved WF-2.4 TypeScript DTO contracts (AIProviderId, OpenAIProviderDescriptor, OpenAIChatPayload) and error boundaries.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-2.5: [Ambiguity Reflex] unaddressed_edge_cases: Address gap in 'WF-2: Free & High-Speed LLM Provider API Contracts, Models & Rate-Limit Resilience'] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ ❓ Socratic Inquirer
- **Consensus Summary:** Resolved WF-2.5 adaptive HTTP 400 parameter retry vs non-retryable HTTP 401/402/403 termination.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-3.4: [Ambiguity Reflex] vague_security_perimeter: Address gap in 'WF-3: Unified Multi-Provider Architecture, GitHub Auth Reuse & Interactive QuickPick UX'] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ 🛡️ Security & QA Lead
- **Consensus Summary:** Resolved WF-3.4 GitHub Models silent authentication fallback and RBAC scope guidance.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-3.5: [Ambiguity Reflex] unaddressed_edge_cases: Address gap in 'WF-3: Unified Multi-Provider Architecture, GitHub Auth Reuse & Interactive QuickPick UX'] (Status: In Deliberation)
- **Participants:** sora_reflex ➔ ❓ Socratic Inquirer
- **Consensus Summary:** Resolved WF-3.5 unified PROVIDER_METADATA DTO mapping across QuickPick, Status Bar, and getActiveModelForProvider.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-3.6: Adversarial Failure-Trap Audit of Multi-Provider Architecture & QuickPick Switching] (Status: In Deliberation)
- **Participants:** 👑 Sora (Team Lead & Director) ➔ 🧐 Strict Critic / Devil's Advocate
- **Consensus Summary:** Completed adversarial failure-trap audit of WF-3: verified DTO contracts, non-retryable HTTP 401/402/403 short-circuiting, sequential config updates, and HTTPS/token redaction security controls.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-3.7: [DBGate] 🧠 Database Impact & ERD Schema Verification for 'WF-3: Unified Multi-Provider Architecture, GitHub Auth Reuse & Interactive QuickPick UX'] (Status: In Deliberation)
- **Participants:** 🧠 Principal DB Architect ➔ 🗄️ Database Specialist
- **Consensus Summary:** Verified No ERD Delta for stateless VS Code extension configuration and encrypted SecretStorage persistence.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

### ✅ [WF-3.8: [Dual-Stack Alignment] 🤝 Dual-Stack Alignment & Coordination Session (Backend + Web) for 'WF-3: Unified Multi-Provider Architecture, GitHub Auth Reuse & Interactive QuickPick UX'] (Status: In Deliberation)
- **Participants:** 🏛️ Software Architect ➔ All (General)
- **Consensus Summary:** Ratified Dual-Stack Shared Contract across PipelineConfig, llm-client.ts, extension.ts, and package.json for all 8 AI providers.
- **Architectural Impact:** Standardized contracts, zero solo analysis, and multi-tier dynamic stack alignment.

---

## 📐 3. Multi-View Architecture Diagrams Suite

Every workflow is mapped directly to its multi-view diagram suite under [`docs/architecture/diagrams/`](file:///home/aj/projects/AICommit/AJAICommitGenerator/docs/architecture/diagrams):

### 📂 Workflow Diagrams: `WR-20261124-E49A08`

---

## 🛠️ 4. Component Technical Specifications & AST File Locks

Every affected component is anchored to its exact Graphify AST node and locked file perimeter:

### 📋 File Action Matrix

*No specific modified files registered yet. Target components will be mapped during task dispatch.*

- **Architectural AST Locks:** Mapped across domain services, controllers, data models, and MCP tool handlers.
- **Blast Radius Perimeter:** Isolated to target modules with zero speculative regressions.

---

## 💡 5. Ideation, Edge Cases & Failure Traps Matrix

- **💡 Proactive Automations (Innovator):** Real-time reactive UX, automated background caching, and zero-latency retrieval.
- **❓ Edge Cases & Partition Traps (Socratic Inquirer):** Network partition resilience, concurrency race mitigation, and safe fallback states.
- **🧐 Adversarial Review & Failure Traps (Strict Critic):** Anti-Tasleek defense, mandatory companion tests, and strict index utilization.

---

## 🛠️ 6. Grouped Master Tasks & Subtasks Roadmap

*Task matrix generated directly in docs/tasks/master-tasks.md.*

---

## 🛡️ 7. Governed 5-Gate Review Pipeline & Fast-Track Policy

Every code submission must progress through the sequential 5-gate pipeline:
1. **Gate 1: Architectural Integrity Review (Marcus)** — Validates Clean Architecture, bounded context boundaries, and layer isolation.
2. **Gate 2: STRIDE Threat Modeling & Security Review (Maya)** — Audits input validation, RBAC boundaries, and data sanitization.
3. **Gate 3: Automated Unit Testing Gate** — Runs unit tests with a 15-second SIGKILL timeout (`/tests/unit`).
4. **Gate 4: Dynamic Platform-Aware QA Gate** — Scalability Lead Zaid (Backend/API) or Omar (Web/UI) executes comprehensive diagnostic checks.
5. **Gate 5: Checkpoint Commit & Incremental Graphify AST Sync** — Emits git checkpoint commit and updates Graphify AST knowledge graph.

### ⚡ Fast-Track Policy (Sora Review Gateway)
- **Fast-Track Eligible:** Documentation (`.md`), design system tokens, static UI templates, and minor style refactors. Logged with `FastTrackedBySora` in `CodeReviewAudits`.
- **Full 5-Gate Mandatory:** Backend services, database schemas, public DTO contracts, authentication, and core workflow orchestration.

---

