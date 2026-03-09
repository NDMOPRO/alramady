#!/usr/bin/env python3
"""Project-to-Spec Alignment: Map executable features to actual project code."""
import json
import os
import re

# Load executable subset
with open("C:/DATA_AI/rasid/docs/01_registries/Official_Executable_Subset.json", "r", encoding="utf-8") as f:
    exec_subset = json.load(f)

# Service directories
services_dir = "C:/DATA_AI/rasid/services"
frontend_dir = "C:/DATA_AI/rasid/frontend"

def count_files(directory, extensions=None):
    """Count files in directory matching extensions."""
    count = 0
    if not os.path.exists(directory):
        return 0
    for root, dirs, files in os.walk(directory):
        # Skip node_modules and .git
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'dist', 'build', '__pycache__')]
        for f in files:
            if extensions:
                if any(f.endswith(ext) for ext in extensions):
                    count += 1
            else:
                count += 1
    return count

def list_files(directory, extensions=None, max_depth=4):
    """List files in directory."""
    results = []
    if not os.path.exists(directory):
        return results
    base_depth = directory.rstrip('/\\').count(os.sep)
    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'dist', 'build', '__pycache__')]
        current_depth = root.count(os.sep) - base_depth
        if current_depth > max_depth:
            continue
        for f in files:
            if extensions:
                if any(f.endswith(ext) for ext in extensions):
                    results.append(os.path.join(root, f))
            else:
                results.append(os.path.join(root, f))
    return results

def find_routes(service_dir):
    """Find route files and extract endpoints."""
    routes = []
    route_files = list_files(service_dir, ['.ts', '.js'])
    for fpath in route_files:
        fname = os.path.basename(fpath)
        if 'route' in fname.lower() or 'router' in fname.lower():
            routes.append(fpath.replace('\\', '/'))
    return routes

def find_services(service_dir):
    """Find service files."""
    svcs = []
    svc_files = list_files(service_dir, ['.ts', '.js'])
    for fpath in svc_files:
        fname = os.path.basename(fpath)
        if 'service' in fname.lower() and 'node_modules' not in fpath:
            svcs.append(fpath.replace('\\', '/'))
    return svcs

def find_controllers(service_dir):
    """Find controller files."""
    ctrls = []
    ctrl_files = list_files(service_dir, ['.ts', '.js'])
    for fpath in ctrl_files:
        fname = os.path.basename(fpath)
        if 'controller' in fname.lower():
            ctrls.append(fpath.replace('\\', '/'))
    return ctrls

def find_tests(service_dir):
    """Find test files."""
    tests = []
    test_files = list_files(service_dir, ['.test.ts', '.spec.ts', '.test.js', '.spec.js'])
    for fpath in test_files:
        if '__test' in fpath.lower() or 'test' in os.path.basename(fpath).lower():
            tests.append(fpath.replace('\\', '/'))
    return tests

# Engine to backend service mapping
engine_service_map = {
    "Engine_01_Data_Files": "data-service",
    "Engine_02_Excel": "excel-service",
    "Engine_03_Dashboards": "dashboard-service",
    "Engine_04_Reports": "reporting-service",
    "Engine_05_Presentations_Infographics": ["presentation-service", "infographic-service"],
    "Engine_06_Literal_Match": "replication-service",
    "Engine_07_Localization": "localization-service",
    "Engine_08_Conversion": "conversion-service",
    "Engine_09_AI_Intelligence": "ai-service",
    "Engine_10_Governance": "governance-service"
}

# Engine to frontend pages mapping
engine_frontend_map = {
    "Engine_01_Data_Files": ["/data", "/data/[id]", "/data/import"],
    "Engine_02_Excel": ["/excel", "/excel/[id]", "/excel/matching", "/literal-match"],
    "Engine_03_Dashboards": ["/dashboard", "/dashboard/[id]", "/dashboard/editor", "/dashboard/easy-mode", "/dashboard/advanced-mode", "/dashboard/drag-elements", "/dashboard/post-edit", "/dashboard/simulation", "/dashboard/templates", "/dashboard/performance"],
    "Engine_04_Reports": ["/reports", "/reports/[id]", "/reports/easy-mode", "/reports/advanced-mode", "/reports/compare", "/reports/templates"],
    "Engine_05_Presentations_Infographics": ["/presentations", "/presentations/[id]", "/infographics", "/infographics/[id]"],
    "Engine_06_Literal_Match": ["/replication", "/replication/core-principle", "/replication/dual-verify", "/replication/image-matching", "/replication/match-phases", "/replication/match-scope", "/replication/print-lock"],
    "Engine_07_Localization": ["/localization"],
    "Engine_08_Conversion": ["/convert"],
    "Engine_09_AI_Intelligence": ["/ai", "/ai/training", "/ai/knowledge-base", "/observer"],
    "Engine_10_Governance": ["/admin", "/admin/users", "/admin/settings", "/admin/audit", "/settings"]
}

# Build alignment report
alignment = {
    "date": "2026-03-09",
    "purpose": "Project-to-Spec Alignment - Mapping Official Features to Actual Code",
    "engines": {}
}

for engine_name, engine_features in exec_subset.items():
    svc_names = engine_service_map.get(engine_name, "unknown")
    if isinstance(svc_names, str):
        svc_names = [svc_names]

    frontend_pages = engine_frontend_map.get(engine_name, [])

    engine_report = {
        "official_feature_count": len(engine_features),
        "id_range": f"{engine_features[0]['id']} - {engine_features[-1]['id']}",
        "backend_services": {},
        "frontend_pages": frontend_pages,
        "sections": {}
    }

    # Analyze backend services
    for svc_name in svc_names:
        svc_dir = os.path.join(services_dir, svc_name)
        if os.path.exists(svc_dir):
            routes = find_routes(os.path.join(svc_dir, "src"))
            services = find_services(os.path.join(svc_dir, "src"))
            controllers = find_controllers(os.path.join(svc_dir, "src"))
            tests = find_tests(svc_dir)
            total_ts = count_files(os.path.join(svc_dir, "src"), ['.ts', '.js'])

            engine_report["backend_services"][svc_name] = {
                "exists": True,
                "src_files": total_ts,
                "route_files": len(routes),
                "service_files": len(services),
                "controller_files": len(controllers),
                "test_files": len(tests),
                "route_paths": [r.split(svc_name + "/")[-1] if svc_name in r else r for r in routes[:20]],
                "service_paths": [s.split(svc_name + "/")[-1] if svc_name in s else s for s in services[:20]],
            }
        else:
            engine_report["backend_services"][svc_name] = {"exists": False}

    # Group features by section
    sections = {}
    for feat in engine_features:
        sec = feat["section"]
        if sec not in sections:
            sections[sec] = {"count": 0, "ids": [], "sample_features": []}
        sections[sec]["count"] += 1
        sections[sec]["ids"].append(feat["id"])
        if len(sections[sec]["sample_features"]) < 5:
            sections[sec]["sample_features"].append({"id": feat["id"], "text": feat["text"][:200]})

    engine_report["sections"] = sections
    alignment["engines"][engine_name] = engine_report

# Write alignment report
with open("C:/DATA_AI/rasid/docs/01_registries/Project_Spec_Alignment.json", "w", encoding="utf-8") as f:
    json.dump(alignment, f, ensure_ascii=False, indent=2)

# Print summary
print("=== PROJECT-TO-SPEC ALIGNMENT ===\n")
for engine_name in sorted(alignment["engines"].keys()):
    eng = alignment["engines"][engine_name]
    print(f"\n{engine_name}")
    print(f"  Official Features: {eng['official_feature_count']} ({eng['id_range']})")
    print(f"  Frontend Pages: {len(eng['frontend_pages'])}")
    for svc_name, svc_info in eng["backend_services"].items():
        if svc_info.get("exists"):
            print(f"  Backend [{svc_name}]: {svc_info['src_files']} src files, {svc_info['route_files']} routes, {svc_info['service_files']} services, {svc_info['controller_files']} controllers, {svc_info['test_files']} tests")
        else:
            print(f"  Backend [{svc_name}]: NOT FOUND")
    print(f"  Sections: {len(eng['sections'])}")
    for sec_name, sec_info in sorted(eng["sections"].items()):
        print(f"    {sec_name}: {sec_info['count']} features ({sec_info['ids'][0]}-{sec_info['ids'][-1]})")

print("\nOutput: Project_Spec_Alignment.json")
