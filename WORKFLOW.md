# YC 5-Phase Development Workflow

> **Project:** amharic-ocr-extractor
> **Date:** 2026-03-25
> **Reference:** YC CEO's Claude Skill Library (5 tools)

---

## Phase 1: The Wedge

**Target User:** Ethiopian publisher, scholar, or church archivist with scanned
Amharic manuscripts needing digitization.

**Current workarounds:** Manual retyping (slow), Google Docs OCR (poor fidel accuracy),
Tesseract (requires setup), Adobe Acrobat (weak Amharic support).

**The Wedge:** Upload scanned Amharic page → accurate editable text → export.

**"Would they pay?" test:** Would a publisher pay $10/month for 95%+ Amharic
fidel accuracy OCR? If yes, wedge validated. If no, sharpen further.

---

## Phase 2: Pressure Test

### 10-Star Scale
| Level | Experience |
|---|---|
| 1-Star | Manual retyping |
| 3-Star | Upload scan, get raw text |
| 5-Star | Text + layout zones, in-place editing |
| 7-Star | Full InDesign canvas (CURRENT BUILD) |
| 10-Star | AI publishing platform: OCR → edit → export print-ready |

### Quick Wins to Add
- [ ] Export to .txt / .docx
- [ ] OCR confidence indicator (yellow highlight for uncertain characters)
- [ ] Batch processing (upload 10 pages, process all)
- [ ] Amharic fidel correction suggestions

### Features to Defer to V2
- InDesign-style drag/resize, 8 resize handles
- Snap-to-grid with visual guides
- Multi-select (Shift+click)
- MCP server integration
- Arrow key nudging
- Cover editor / cover generation

### Adversarial Challenges
1. "Why not just use Google Cloud Vision?" → It doesn't handle Amharic fidel
   accurately and has no layout UI.
2. "What if Gemini improves native OCR?" → Value is in Amharic-specific
   post-processing, layout awareness, and domain expertise.
3. "Who pays?" → Ethiopian publishers, universities (AAU, Jimma), Orthodox
   Church archives, Amharic Bible societies, diaspora orgs.

---

## Phase 3: Design System

See `DESIGN_SYSTEM.md` — covers typography, colors, components, Amharic rules.

---

## Phase 4: Architecture

See `ARCHITECTURE.md` — covers data flow, components, DB schema, constraints.

---

## Phase 5: Documentation Discipline

### Files to Keep Updated
| File | Update Trigger |
|---|---|
| `CLAUDE.md` | Every coding session (start + end) |
| `ARCHITECTURE.md` | Any structural code change |
| `DESIGN_SYSTEM.md` | Any UI/style change |
| `CHANGELOG.md` | Every meaningful commit |
| `WORKFLOW.md` | Strategy or priority changes |

### End-of-Session Checklist
- [ ] Does CLAUDE.md "Current Priority" reflect what I just worked on?
- [ ] Does ARCHITECTURE.md match the current file structure?
- [ ] Is CHANGELOG.md updated?
- [ ] Would a fresh Claude session understand this project from docs alone?

---

## Action Plan

### This Week — Validate the Wedge
1. [x] Test Gemini OCR on 10 real Amharic document samples ✅ (88% pass rate)
2. [x] Measure fidel accuracy (compare output to ground truth) ✅ (ሀ/ሐ/ኀ, ሰ/ሠ, ጸ/ፀ all preserved)
3. [x] Add .txt export (minimal effort, high value) ✅ wired up in BottomToolbar overflow menu
4. [ ] Get ONE real user to try the core OCR flow ← **NEXT**
5. [ ] Ask: "Would you pay for this?"

### Next 2 Weeks — Harden the Wedge
6. [ ] Add confidence highlighting (yellow = needs review)
7. [x] Add .docx export ✅ (wired to BottomToolbar overflow menu alongside .txt)
8. [x] Deploy to Vercel with clean README ✅ deployed 2026-03-25
9. [ ] Create demo video showing Amharic OCR in action

### Month 2 — Expand from Wedge
10. [ ] Re-enable InDesign features IF users request layout editing
11. [ ] Add batch processing (multi-page upload)
12. [ ] Add Amharic fidel correction suggestions
13. [ ] Explore pricing model ($10/mo or per-page)
