#!/usr/bin/env python3
"""
scripts/generate_isi_pdf.py
Generates a publication-quality PDF detailing the BeatAhead Ischemic Stress Index (ISI)
mathematical formulations, architecture, and clinical triage criteria.
"""

import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))

        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 750, "BeatAhead — Ischemic Stress Index (ISI) Mathematical Specification")
            self.drawRightString(612 - 54, 750, "Document ID: BEATAHEAD-ISI-MATH-V2.0")
            self.setStrokeColor(colors.HexColor("#e2e8f0"))
            self.setLineWidth(0.5)
            self.line(54, 744, 612 - 54, 744)

        # Footer
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(612 - 54, 36, page_str)
        self.drawString(54, 36, "CONFIDENTIAL & PROPRIETARY — BEATAHEAD RESEARCH & ENGINEERING")
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(0.5)
        self.line(54, 46, 612 - 54, 46)
        self.restoreState()


def build_pdf(filename: str):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Custom styles
    primary_color = colors.HexColor("#0f172a") # Navy 900
    accent_color = colors.HexColor("#dc2626")  # Cardiac red
    teal_color = colors.HexColor("#0d9488")    # Medical teal
    slate_bg = colors.HexColor("#f8fafc")

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=primary_color,
        spaceAfter=6
    )

    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#475569"),
        spaceAfter=14
    )

    h1_style = ParagraphStyle(
        "H1",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=primary_color,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6
    )

    formula_style = ParagraphStyle(
        "Formula",
        parent=styles["Normal"],
        fontName="Courier-Bold",
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=4,
        spaceAfter=4
    )

    callout_style = ParagraphStyle(
        "Callout",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#7f1d1d")
    )

    table_header = ParagraphStyle(
        "TH",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )

    table_cell = ParagraphStyle(
        "TD",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#1e293b")
    )

    table_cell_mono = ParagraphStyle(
        "TDMono",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0f172a")
    )

    story = []

    # Title & Metadata
    story.append(Paragraph("BeatAhead — Ischemic Stress Index (ISI)", title_style))
    story.append(Paragraph("Comprehensive Mathematical Formulations, Multimodal Sensor Fusion, and Clinical Risk Specification", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=accent_color, spaceAfter=12))

    # Metadata Strip Table
    meta_data = [
        [
            Paragraph("<b>Document ID:</b> BEATAHEAD-ISI-MATH-V2.0", table_cell),
            Paragraph("<b>Target Framework:</b> BeatAhead Web & Hardware", table_cell),
            Paragraph("<b>Frozen Threshold:</b> &tau; = 0.156742", table_cell),
        ],
        [
            Paragraph("<b>Engine Version:</b> Phase 8.1 / Phase 9", table_cell),
            Paragraph("<b>Sensors:</b> AD8232 Lead II / Photoplethysmography", table_cell),
            Paragraph("<b>Output Range:</b> Bounded [0, 100]", table_cell),
        ]
    ]
    meta_table = Table(meta_data, colWidths=[165, 175, 164])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f1f5f9")),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # Section 1: Executive Overview & Architectural Principle
    story.append(Paragraph("1. Executive Overview & Core Principles", h1_style))
    story.append(Paragraph(
        "The <b>Ischemic Stress Index (ISI)</b> is a calibrated, composite physiological metric ranging from "
        "<b>0 to 100</b>. It quantifies real-time myocardial oxygen supply-demand mismatch, electrophysiological repolarization "
        "deviations, and autonomic tone displacement before irreversible cardiac injury manifests.",
        body_style
    ))

    # Core Rule Callout Box
    core_rule_data = [[
        Paragraph(
            "<b>CRITICAL ARCHITECTURAL PRINCIPLE: Model Probability is NOT the ISI</b><br/>"
            "The prospective XGBoost model probability <i>p</i><sub>model</sub> is a conditional event probability trained on "
            "intraoperative surgical cohorts with 0.42% natural event prevalence. Directly setting <i>ISI = p &times; 100</i> collapses "
            "normal human physiology into the 0.0–1.5 range and misplaces the calibrated decision threshold (&tau; = 0.156742) at 15.67. "
            "Instead, ISI uses a multi-dimensional sigmoidal fusion combining ML evidence (45%), autonomic shift (30%), "
            "perfusion dynamics (25%), and temporal momentum.",
            callout_style
        )
    ]]
    core_rule_table = Table(core_rule_data, colWidths=[504])
    core_rule_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#fef2f2")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#f87171")),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(core_rule_table)
    story.append(Spacer(1, 10))

    # Section 2: Multimodal Formulation
    story.append(Paragraph("2. Full Multimodal Fusion Formula (Phase 8/9 Engine)", h1_style))
    story.append(Paragraph(
        "In multimodal monitoring environments (combining ECG Lead II, PPG optical plethysmography, pulse oximetry, and XGBoost inference), "
        "the composite ISI score is defined as:",
        body_style
    ))

    formula_box_1 = [[
        Paragraph(
            "<b>ISI = round( clamp( ISI<sub>base</sub> + &Delta;ISI, 0.0, 100.0 ) )</b><br/>"
            "where:<br/>"
            "&Delta;ISI = [ w<sub>model</sub> &middot; (E<sub>model</sub> - 0.20) + "
            "w<sub>auto</sub> &middot; D<sub>auto</sub> + "
            "w<sub>perf</sub> &middot; D<sub>perf</sub> + "
            "M<sub>trend</sub> ] &times; 60.0<br/>"
            "Normalized Weights: w<sub>model</sub> = 0.45,  w<sub>auto</sub> = 0.30,  w<sub>perf</sub> = 0.25,  ISI<sub>base</sub> = 40.0",
            formula_style
        )
    ]]
    f1_table = Table(formula_box_1, colWidths=[504])
    f1_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#94a3b8")),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(f1_table)
    story.append(Spacer(1, 8))

    # Subcomponents Breakdown
    story.append(Paragraph("A. Non-Linear Model Evidence Mapping (E<sub>model</sub>)", h2_style))
    story.append(Paragraph(
        "Maps model output probability <i>p</i> &isin; [0, 1] through a two-piece monotonic sigmoidal curve "
        "pinned exactly to the calibrated threshold &tau; = 0.156742 at midpoint 0.50:",
        body_style
    ))

    e_model_box = [[
        Paragraph(
            "If p &lt; &tau;:    E<sub>model</sub>(p) = 0.50 &times; ( p / &tau; )<sup>1.4</sup><br/>"
            "If p &ge; &tau;:    E<sub>model</sub>(p) = 0.50 + 0.50 &times; [ 1 - exp( -4.0 &times; (p - &tau;) / (1 - &tau;) ) ]",
            formula_style
        )
    ]]
    em_table = Table(e_model_box, colWidths=[504])
    em_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f1f5f9")),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(em_table)
    story.append(Spacer(1, 6))

    story.append(Paragraph("B. Autonomic Hemodynamic Shift (D<sub>auto</sub>)", h2_style))
    story.append(Paragraph(
        "Quantifies parasympathetic withdrawal and sympathetic activation through heart rate acceleration and HRV reduction:",
        body_style
    ))
    auto_box = [[
        Paragraph(
            "f<sub>hr</sub>  = clamp( (HR - HR<sub>base</sub>) / 25.0,  0.0, 1.0 )<br/>"
            "f<sub>hrv</sub> = clamp( (SDNN<sub>base</sub> - SDNN) / (0.60 &times; SDNN<sub>base</sub>),  0.0, 1.0 )<br/>"
            "<b>D<sub>auto</sub> = 0.50 &middot; f<sub>hr</sub> + 0.50 &middot; f<sub>hrv</sub></b>",
            formula_style
        )
    ]]
    auto_table = Table(auto_box, colWidths=[504])
    auto_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f1f5f9")),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(auto_table)
    story.append(Spacer(1, 6))

    story.append(Paragraph("C. Perfusion & Oxygenation Factor (D<sub>perf</sub>)", h2_style))
    story.append(Paragraph(
        "Combines peripheral pulse transit velocity acceleration (PAT) and microvascular desaturation:",
        body_style
    ))
    perf_box = [[
        Paragraph(
            "f<sub>spo2</sub> = clamp( (SpO2<sub>base</sub> - SpO2) / 5.0,  0.0, 1.0 )<br/>"
            "f<sub>pat</sub>  = clamp( (PAT<sub>base</sub> - PAT) / 50.0,  0.0, 1.0 )    (if PAT is valid)<br/>"
            "<b>D<sub>perf</sub> = 0.60 &middot; f<sub>spo2</sub> + 0.40 &middot; f<sub>pat</sub></b>    (or D<sub>perf</sub> = f<sub>spo2</sub> if degraded)",
            formula_style
        )
    ]]
    perf_table = Table(perf_box, colWidths=[504])
    perf_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f1f5f9")),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(perf_table)
    story.append(Spacer(1, 6))

    story.append(Paragraph("D. Temporal Momentum Modifier (M<sub>trend</sub>)", h2_style))
    story.append(Paragraph(
        "Evaluates the 5-minute directional velocity of physiological trajectory: "
        "<b>v = &Delta;ISI / &Delta;t</b> (points/min), clamped as: "
        "<b>M<sub>trend</sub> = clamp( v / 2.0, -0.15, +0.15 )</b>.",
        body_style
    ))
    story.append(Spacer(1, 10))

    # Section 3: Real-Time Single-Lead ECG Hardware Formula
    story.append(Paragraph("3. Real-Time Single-Lead ECG Hardware Formula (AD8232)", h1_style))
    story.append(Paragraph(
        "When operating with the <b>Arduino Uno & AD8232 ECG sensor</b> without auxiliary optical or pulse oximeter probes, "
        "BeatAhead computes the instantaneous ISI beat-by-beat directly from the digital signal processing pipeline:",
        body_style
    ))

    formula_box_2 = [[
        Paragraph(
            "<b>ECG Real-Time ISI Piecewise Function:</b><br/>"
            "&bull; <b>Acute Ischemia (ST &le; -1.0 mm):</b><br/>"
            "   ISI = clamp( 72 + |ST<sub>mm</sub>| &times; 12.0 + max(0, HR - 70) &times; 0.35,  72, 96 )<br/>"
            "&bull; <b>Elevated Stress / Sagging (-1.0 &lt; ST &le; -0.5 mm):</b><br/>"
            "   ISI = clamp( 48 + |ST<sub>mm</sub>| &times; 15.0 + max(0, HR - 70) &times; 0.40,  45, 68 )<br/>"
            "&bull; <b>Normal Physiological Baseline (ST &gt; -0.5 mm):</b><br/>"
            "   ISI = clamp( 12 + max(0, HR - 58) &times; 0.42 + |ST<sub>mm</sub>| &times; 14.0 + HRV<sub>mod</sub>,  11, 38 )",
            formula_style
        )
    ]]
    f2_table = Table(formula_box_2, colWidths=[504])
    f2_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#0d9488")),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(f2_table)
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "<b>Definition of Variables:</b><br/>"
        "&bull; <b>ST<sub>mm</sub></b>: Voltage difference between the PR isoelectric segment (60ms pre-R) and the J-point level (75ms post-R), "
        "scaled by standard clinical calibration: <i>1.0 mm = 0.1 mV</i>.<br/>"
        "&bull; <b>HR (BPM)</b>: Instantaneous heart rate derived beat-by-beat: <i>BPM = 60000 / RR<sub>ms</sub></i>.<br/>"
        "&bull; <b>HRV<sub>mod</sub></b>: Autonomic vagal tone modulation from RMSSD: <i>max(0, (35 - RMSSD) &times; 0.20)</i>.",
        body_style
    ))
    story.append(Spacer(1, 10))

    # Section 4: Clinical Triage Matrix Table
    story.append(Paragraph("4. Clinical Risk Tiers & Triage Action Matrix", h1_style))
    story.append(Paragraph(
        "The continuous 0–100 scale maps onto validated clinical action boundaries:",
        body_style
    ))

    triage_data = [
        [
            Paragraph("ISI Range", table_header),
            Paragraph("Risk Tier", table_header),
            Paragraph("Physiological Sign", table_header),
            Paragraph("System Action & Protocol", table_header)
        ],
        [
            Paragraph("<b>0 – 35</b>", table_cell_mono),
            Paragraph("<font color='#16a34a'><b>Normal Baseline</b></font>", table_cell),
            Paragraph("Isoelectric ST (&plusmn;0.2mm), stable HR (60–75 bpm), intact HRV", table_cell),
            Paragraph("Standard continuous background monitoring. Green status.", table_cell)
        ],
        [
            Paragraph("<b>36 – 65</b>", table_cell_mono),
            Paragraph("<font color='#d97706'><b>Elevated Stress</b></font>", table_cell),
            Paragraph("Sympathetic drive, exertional HR (100–120 bpm), mild ST sagging (-0.6mm)", table_cell),
            Paragraph("Advisory banner on Overview. Rest and hydration recommended.", table_cell)
        ],
        [
            Paragraph("<b>66 – 85</b>", table_cell_mono),
            Paragraph("<font color='#dc2626'><b>High Risk / Ischemia</b></font>", table_cell),
            Paragraph("Subendocardial ST depression (&le; -1.0mm), T-wave flattening, reduced HRV", table_cell),
            Paragraph("High-priority audio/visual alert. RapidCare clinician notification.", table_cell)
        ],
        [
            Paragraph("<b>86 – 100</b>", table_cell_mono),
            Paragraph("<font color='#991b1b'><b>Critical Event</b></font>", table_cell),
            Paragraph("Severe ST depression (&le; -1.8mm) or acute multi-sensor crisis", table_cell),
            Paragraph("Immediate 112 emergency routing, automated GPS dispatch assist.", table_cell)
        ]
    ]

    triage_table = Table(triage_data, colWidths=[64, 110, 160, 170])
    triage_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(triage_table)
    story.append(Spacer(1, 12))

    # Section 5: Numerical Verification Examples
    story.append(Paragraph("5. Worked Numerical Verification Examples", h1_style))

    examples_data = [
        [
            Paragraph("Scenario", table_header),
            Paragraph("Input Telemetry", table_header),
            Paragraph("Formula Calculation Steps", table_header),
            Paragraph("Output ISI", table_header)
        ],
        [
            Paragraph("<b>Case 1: Quiet Resting</b>", table_cell),
            Paragraph("HR = 68 bpm<br/>ST = +0.05 mm<br/>RMSSD = 42 ms", table_cell),
            Paragraph(
                "HR load = (68 - 58) &times; 0.42 = 4.2<br/>"
                "ST load = |0.05| &times; 14.0 = 0.7<br/>"
                "HRV mod = 0.0<br/>"
                "ISI = 12 + 4.2 + 0.7 = 16.9 &rarr; <b>16</b>",
                table_cell
            ),
            Paragraph("<font color='#16a34a'><b>16 / 100</b></font><br/>(Normal)", table_cell)
        ],
        [
            Paragraph("<b>Case 2: Exertional Strain</b>", table_cell),
            Paragraph("HR = 114 bpm<br/>ST = -0.62 mm<br/>RMSSD = 18 ms", table_cell),
            Paragraph(
                "Elevated branch: base = 48<br/>"
                "ST load = |-0.62| &times; 15.0 = 9.3<br/>"
                "HR load = (114 - 70) &times; 0.40 = 17.6<br/>"
                "ISI = clamp(48 + 9.3 + 17.6, 45, 68) &rarr; <b>68</b>",
                table_cell
            ),
            Paragraph("<font color='#d97706'><b>68 / 100</b></font><br/>(Elevated)", table_cell)
        ],
        [
            Paragraph("<b>Case 3: Acute Ischemia</b>", table_cell),
            Paragraph("HR = 88 bpm<br/>ST = -1.65 mm<br/>RMSSD = 12 ms", table_cell),
            Paragraph(
                "Acute branch: base = 72<br/>"
                "ST load = |-1.65| &times; 12.0 = 19.8<br/>"
                "HR load = (88 - 70) &times; 0.35 = 6.3<br/>"
                "ISI = clamp(72 + 19.8 + 6.3, 72, 96) &rarr; <b>96</b>",
                table_cell
            ),
            Paragraph("<font color='#dc2626'><b>96 / 100</b></font><br/>(Critical)", table_cell)
        ]
    ]

    ex_table = Table(examples_data, colWidths=[90, 110, 214, 90])
    ex_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), teal_color),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(ex_table)
    story.append(Spacer(1, 14))

    # Section 6: Regulatory Disclaimer
    story.append(Paragraph("6. Regulatory & Research Disclaimer", h1_style))
    story.append(Paragraph(
        "<b>NON-DIAGNOSTIC INVESTIGATIONAL PROTOTYPE:</b> "
        "The BeatAhead Ischemic Stress Index (ISI) is an experimental engineering framework designed to demonstrate multi-sensor "
        "signal synthesis and real-time biomedical telemetry streaming. The ISI metric, underlying machine learning models, "
        "and digital signal processing algorithms have not been evaluated, cleared, or approved by the United States Food and Drug "
        "Administration (FDA), European Medicines Agency (EMA), or equivalent medical regulatory authorities. "
        "ISI values must never be used for independent clinical diagnosis, triage, or alteration of patient therapy. "
        "Standard 12-lead electrocardiography, serum troponin, and direct clinical evaluation by licensed physicians remain mandatory.",
        ParagraphStyle("Legal", parent=styles["Normal"], fontName="Helvetica", fontSize=7.5, leading=10.5, textColor=colors.HexColor("#64748b"))
    ))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[+] Successfully generated: {filename}")


if __name__ == "__main__":
    out_dir = "public"
    os.makedirs(out_dir, exist_ok=True)
    pdf_path_public = os.path.join(out_dir, "BeatAhead_Ischemic_Stress_Index_Formula_Specification.pdf")
    pdf_path_root = "BeatAhead_Ischemic_Stress_Index_Formula_Specification.pdf"

    build_pdf(pdf_path_public)
    build_pdf(pdf_path_root)
