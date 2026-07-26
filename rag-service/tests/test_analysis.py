import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app import build_fallback_analysis


def test_build_fallback_analysis_mentions_key_findings():
    report_text = "CBC White Blood Cell count 8.5x10^3/uL. Serum Glucose 96 mg/dL. CRP 4.2 mg/L."

    analysis = build_fallback_analysis(report_text)

    assert "WBC" in analysis
    assert "glucose" in analysis.lower()
    assert "CRP" in analysis
    assert "elevated" in analysis.lower() or "normal" in analysis.lower()
