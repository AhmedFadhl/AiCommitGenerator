# 📋 Subtask Specification: 1.3: Subtask 1.3: Implement interactive Select AI Model QuickPick palette in src/extension.ts

**Subtask ID:** `da36a578-f8b5-4dba-b513-16894b2be544` (1.3)  
**Parent Master Task:** `bb95fef6-d7f5-4b4d-94da-7fedffa5c38c`  
**Technical Stack:** `Web` | **Assigned Specialist:** 💻 Lead Web Developer  
**Hierarchy Level:** Level 1 (Leaf Execution Task)  
**Execution Status:** ⏳ In Progress  

---

## 1. 📌 Task Metadata & Explicit AST File Locks
The following files are strictly locked for this task. Developers are prohibited from editing files outside this perimeter:
- [extension.ts](file:///home/aj/projects/AICommit/AJAICommitGenerator/src/extension.ts) (`L140-L210`): Implement interactive QuickPick palette for selecting, adding, and removing custom models

### 🔎 Alex AST Verification Block
> [!NOTE]
> **Alex AST Verification Status:** Pre-execution AST exploration verified by Codebase Analyst Alex (`@codebase_analyst`). Line bounds, signatures, and blast radius locked against Graphify AST nodes.

---

## 2. 🎯 Architectural Context & Specific Objective
1. Implement and register ai-commit-generator.selectModel command handler in activate().\n2. Display native VS Code QuickPick with active model, custom models from settings, built-in presets, 'Add New Custom Model...', and 'Remove Custom Model...'.\n3. 'Add New Custom Model...' prompts with showInputBox, validates and deduplicates, updates configuration globally, and activates model.\n4. 'Remove Custom Model...' presents custom models for 1-click removal.

---

## 3. 🧠 Data Schemas & Precise DTO Contracts
No modifications to data schemas or DTO contracts for this task.

---

## 4. ⚙️ Step-by-Step Implementation Flow & Developer Guidance
Target classes, methods, and explicit implementation instructions:
1. Execute architectural and functional requirements with zero defects.
2. Ensure backwards compatibility and preserve existing stable functionality.

---

## 5. 🛡️ Security Perimeter, STRIDE Threat Mitigation & RBAC
- Validate all inputs against injection vulnerabilities (SQL/Command Injection).
- Verify authorization perimeters and apply Least Privilege Access.

---

## 6. ⚠️ Boundary Conditions, Failure Traps & Edge Cases
- Handle connection dropouts, concurrency races, and resource unavailability safely.
- Verify boundary conditions, null/undefined payloads, and corrupted inputs.

---

## 7. 🚀 Performance Latency SLAs & Scalability
- Target Latency SLA: Sub-150ms instant response time for concurrent operations.
- Maximize defined index utilization; avoid Full Table Scans or N+1 queries.

---

## 8. 🛡️ QA & Security 5-Gate Review Protocol (Strict Developer DoD Prohibition)
> [!IMPORTANT]
> **Zero Developer Self-DoD / Self-Testing:**
> In accordance with Invariant 12 of Sora MCP-First Protocol v2.3, the Definition of Done (DoD) is strictly excised from developer duties. Developers must NEVER perform self-validation, assert DoD completeness, or sign off on test suites.
> 
> All verification, automated regression testing, STRIDE security audit, and acceptance criteria validation are conducted exclusively through the **5-Gate Post-Code Submission Review Pipeline** by QA and Security Specialists:
> - **Gate 1: Architectural Integrity Review** — Marcus (`@software_architect`)
> - **Gate 2: STRIDE Security & RBAC Audit** — Maya (`@security_qa`)
> - **Gate 3: Automated Unit Testing Gate** — Automated Test Runner (`/tests/unit`)
> - **Gate 4: Dynamic Platform-Aware QA Gate** — Omar / Zaid (`@frontend_qa_tester` / `@backend_benchmark_engineer`)
> - **Gate 5: Checkpoint Commit & Incremental Graphify AST Sync** — Sora Review Gateway

