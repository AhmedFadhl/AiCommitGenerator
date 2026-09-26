# 📋 Subtask Specification: 1.2: Subtask 1.2: Centralize model resolution and reasoning tag stripping in src/extension.ts

**Subtask ID:** `8ea5658d-7508-4b59-b690-ffbdb76de54e` (1.2)  
**Parent Master Task:** `bb95fef6-d7f5-4b4d-94da-7fedffa5c38c`  
**Technical Stack:** `Web` | **Assigned Specialist:** 💻 Lead Web Developer  
**Hierarchy Level:** Level 1 (Leaf Execution Task)  
**Execution Status:** ⏳ In Progress  

---

## 1. 📌 Task Metadata & Explicit AST File Locks
The following files are strictly locked for this task. Developers are prohibited from editing files outside this perimeter:
- [extension.ts](file:///home/aj/projects/AICommit/AJAICommitGenerator/src/extension.ts) (`L135-L310, L830-L940`): Centralize model resolution and reasoning tag cleanup

### 🔎 Alex AST Verification Block
> [!NOTE]
> **Alex AST Verification Status:** Pre-execution AST exploration verified by Codebase Analyst Alex (`@codebase_analyst`). Line bounds, signatures, and blast radius locked against Graphify AST nodes.

---

## 2. 🎯 Architectural Context & Specific Objective
1. Implement getActiveModel(provider, config) in src/extension.ts that reads active model, resolves custom models, trims whitespace, and falls back safely.\n2. Update cleanCommitMessage to strip <think>...</think> reasoning blocks.\n3. Integrate getActiveModel into generateCommitMessage and createIssueFromChanges across all providers.

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

