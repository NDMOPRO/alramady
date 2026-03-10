# STRICT 1:1 PixelPerfect Engine — Implementation Map

## Architecture Overview

```
services/replication-service/src/strict/
├── index.ts                          # Engine init + registry + exports
├── routes.ts                         # Express routes: /api/v1/strict/*
├── cdr/
│   ├── types.ts                      # CDR 7-layer type system (Section 6)
│   ├── store.ts                      # CDR in-memory store + hashing
│   └── builder.ts                    # Build CDR from PDF DOM / Image Segments
├── tools/
│   └── registry.ts                   # Tool Registry (Section 15)
├── pipeline/
│   ├── strict-pipeline.ts            # 13-step pipeline orchestrator (Section 3)
│   ├── action-graph-templates.ts     # Immutable templates (Section 15.2)
│   └── svm.ts                        # Spreadsheet Virtual Machine (Section 11)
├── extract/
│   ├── pdf-dom.ts                    # PDF DOM extraction (Section 9 + B1)
│   └── image-segments.ts             # Image segmentation (Section 8.1 + B2)
├── export/
│   └── exporters.ts                  # PPTX/DOCX/XLSX/Dashboard (Section 10 + B7)
├── render/
│   └── farm-renderer.ts              # Deterministic Farm (Section 4 + B8)
├── verify/
│   ├── pixel-diff.ts                 # PixelDiff==0 (Section 5 + B9)
│   ├── structural-equivalence.ts     # Editable Core check (Section 6.5 + B10)
│   └── determinism.ts                # Determinism validation (Section 4 + B11)
├── repair/
│   └── repair-loop.ts               # Root-cause repair (Section 12 + B12)
├── fonts/
│   └── font-embedder.ts             # Font embedding + FontSynth (Section 6.5.1 + B6)
├── arabic/
│   └── elite-shaping.ts             # Arabic ELITE typography (Section 7)
└── evidence/
    └── evidence-pack.ts             # Evidence Pack builder (Section 13)
```

## JSON Schemas

```
schemas/strict/
├── common.json                       # Common definitions (Appendix A)
└── tools/                           # Per-tool schemas (Appendix B)
    ├── extract.pdf_dom.*.json
    ├── extract.image_segments.*.json
    ├── cdr.build_design_from_pdf.*.json
    ├── cdr.build_design_from_image.*.json
    ├── cdr.build_table_from_image.*.json
    ├── fonts.embed_full_glyph.*.json
    ├── export.*.json
    ├── render.*.json
    ├── verify.*.json
    ├── diagnose.*.json
    └── repair.*.json
```

## Registered Tools (22)

| Tool ID | Determinism | Fidelity | Editable |
|---------|-------------|----------|----------|
| extract.pdf_dom | HARD | PIXEL_0 | Yes |
| extract.image_segments | HARD | PIXEL_0 | Yes |
| cdr.build_design_from_pdf | HARD | PIXEL_0 | Yes |
| cdr.build_design_from_image | HARD | PIXEL_0 | Yes |
| cdr.build_table_from_image | HARD | PIXEL_0 | Yes |
| fonts.embed_full_glyph | HARD | PIXEL_0 | Yes |
| export.pptx_from_cdr | HARD | PIXEL_0 | Yes |
| export.docx_from_cdr | HARD | PIXEL_0 | Yes |
| export.xlsx_from_table_cdr | HARD | PIXEL_0 | Yes |
| export.dashboard_from_cdr | HARD | PIXEL_0 | Yes |
| render.pdf_to_png | HARD | PIXEL_0 | No |
| render.pptx_to_png | HARD | PIXEL_0 | No |
| render.docx_to_png | HARD | PIXEL_0 | No |
| render.xlsx_to_png | HARD | PIXEL_0 | No |
| render.dashboard_to_png | HARD | PIXEL_0 | No |
| verify.pixel_diff | HARD | PIXEL_0 | No |
| verify.structural_equivalence | HARD | PIXEL_0 | Yes |
| render.validate_determinism | HARD | PIXEL_0 | No |
| diagnose.diff_attribution | HARD | PIXEL_0 | No |
| repair.quantize_geometry | HARD | PIXEL_0 | Yes |
| repair.adjust_text_metrics | HARD | PIXEL_0 | Yes |
| repair.loop_controller | HARD | PIXEL_0 | Yes |

## API Endpoints

- `POST /api/v1/strict/convert` — Full pipeline execution
- `POST /api/v1/strict/tool/execute` — Single tool execution
- `GET /api/v1/strict/tools` — List registered tools
- `POST /api/v1/strict/evidence/validate` — Validate evidence pack
- `GET /api/v1/strict/health` — Health check

## Pipeline Templates (7)

1. pdf-to-pptx-strict
2. pdf-to-docx-strict
3. pdf-to-xlsx-strict
4. image-table-to-xlsx-strict
5. image-dashboard-to-dashboard-strict
6. image-report-to-docx-strict
7. any-to-any-strict
