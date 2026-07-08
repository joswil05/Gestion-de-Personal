import sys
import os
import re
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 9)
        self.setFillColor(colors.HexColor("#718096"))
        
        # Draw header (on all pages except page 1)
        if self._pageNumber > 1:
            self.drawString(inch * 0.75, 10.5 * inch, "SmartAssign - Especificación Técnica de Ingeniería")
            self.setStrokeColor(colors.HexColor("#E2E8F0"))
            self.setLineWidth(0.5)
            self.line(inch * 0.75, 10.4 * inch, 7.75 * inch, 10.4 * inch)
            
        # Draw footer
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.5)
        self.line(inch * 0.75, 0.75 * inch, 7.75 * inch, 0.75 * inch)
        
        page_text = f"Página {self._pageNumber} de {page_count}"
        self.drawRightString(7.75 * inch, 0.55 * inch, page_text)
        self.drawString(inch * 0.75, 0.55 * inch, "Confidencial - Solo para uso interno de IT")
        self.restoreState()

def build_pdf(md_path, pdf_path):
    print(f"Reading markdown from {md_path}...")
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=inch * 0.75,
        rightMargin=inch * 0.75,
        topMargin=inch * 1.0,
        bottomMargin=inch * 1.0
    )

    styles = getSampleStyleSheet()
    
    # Custom colors
    primary_color = colors.HexColor("#1A365D")  # Deep Navy
    secondary_color = colors.HexColor("#2C5282")  # Medium Blue
    text_color = colors.HexColor("#2D3748")  # Charcoal
    code_bg = colors.HexColor("#F7FAFC")
    code_border = colors.HexColor("#E2E8F0")

    # Define custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=primary_color,
        spaceAfter=15
    )

    h1_style = ParagraphStyle(
        'H1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=primary_color,
        spaceBefore=15,
        spaceAfter=10,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'H2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=secondary_color,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )

    h3_style = ParagraphStyle(
        'H3',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#2B6CB0"),
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=text_color,
        spaceAfter=8
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=text_color,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4
    )

    code_style = ParagraphStyle(
        'CodeText',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#2D3748"),
    )

    alert_style = ParagraphStyle(
        'AlertText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#2C5282")
    )

    story = []
    
    in_code_block = False
    code_lines = []
    in_alert_block = False
    alert_lines = []
    
    # Title Page Header
    story.append(Spacer(1, 15))
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Code block handling
        if stripped.startswith("```"):
            if in_code_block:
                # End of code block
                code_text = "".join(code_lines).rstrip()
                # Replace tabs with spaces for reportlab
                code_text = code_text.replace("\t", "    ")
                
                # Protect special XML characters in ReportLab Paragraph
                code_text = code_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                
                p = Paragraph(f"<pre>{code_text}</pre>", code_style)
                
                # Wrap in a single column table for background color and border
                t = Table([[p]], colWidths=[7.0 * inch])
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,-1), code_bg),
                    ('BOX', (0,0), (-1,-1), 0.5, code_border),
                    ('PADDING', (0,0), (-1,-1), 8),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 8),
                    ('TOPPADDING', (0,0), (-1,-1), 8),
                ]))
                
                story.append(KeepTogether([t, Spacer(1, 8)]))
                in_code_block = False
                code_lines = []
            else:
                in_code_block = True
            i += 1
            continue
            
        if in_code_block:
            code_lines.append(line)
            i += 1
            continue

        # Alert block handling
        if stripped.startswith("> [!"):
            in_alert_block = True
            alert_type = re.search(r'\[!(.*?)\]', stripped).group(1)
            # Fetch the alert content
            alert_lines = [stripped.split("]")[-1].strip()]
            i += 1
            while i < len(lines) and lines[i].strip().startswith(">"):
                alert_lines.append(lines[i].strip().replace(">", "").strip())
                i += 1
                
            alert_text = " ".join(alert_lines)
            alert_text = alert_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            
            # Highlight alert type
            alert_header = f"<b>{alert_type.upper()}:</b> "
            p = Paragraph(alert_header + alert_text, alert_style)
            
            # Alert borders
            border_color = colors.HexColor("#3182CE")  # default blue
            bg_color = colors.HexColor("#EBF8FF")
            if alert_type.upper() == "IMPORTANT" or alert_type.upper() == "WARNING":
                border_color = colors.HexColor("#DD6B20")  # orange
                bg_color = colors.HexColor("#FFFAF0")
            elif alert_type.upper() == "CAUTION":
                border_color = colors.HexColor("#E53E3E")  # red
                bg_color = colors.HexColor("#FFF5F5")
                
            t = Table([[p]], colWidths=[7.0 * inch])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), bg_color),
                ('BOX', (0,0), (-1,-1), 0.5, border_color),
                ('PADDING', (0,0), (-1,-1), 10),
                ('LINELEFT', (0,0), (0,-1), 4, border_color),
            ]))
            story.append(KeepTogether([t, Spacer(1, 10)]))
            in_alert_block = False
            continue

        # Headings
        if stripped.startswith("# "):
            title_text = stripped[2:]
            story.append(Paragraph(title_text, title_style))
            story.append(Spacer(1, 10))
            i += 1
            continue
        elif stripped.startswith("## "):
            heading_text = stripped[3:]
            story.append(Paragraph(heading_text, h1_style))
            i += 1
            continue
        elif stripped.startswith("### "):
            heading_text = stripped[4:]
            story.append(Paragraph(heading_text, h2_style))
            i += 1
            continue
        elif stripped.startswith("#### "):
            heading_text = stripped[5:]
            story.append(Paragraph(heading_text, h3_style))
            i += 1
            continue

        # List items
        if stripped.startswith("* ") or stripped.startswith("- "):
            list_text = stripped[2:]
            
            # Support basic bold markdown
            list_text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', list_text)
            list_text = re.sub(r'\[(.*?)\]\((.*?)\)', r'<font color="#2B6CB0"><u>\1</u></font>', list_text)
            
            story.append(Paragraph(f"&bull; {list_text}", bullet_style))
            i += 1
            continue

        if re.match(r'^\d+\.\s', stripped):
            list_text = re.sub(r'^\d+\.\s', '', stripped)
            list_text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', list_text)
            list_text = re.sub(r'\[(.*?)\]\((.*?)\)', r'<font color="#2B6CB0"><u>\1</u></font>', list_text)
            num = re.match(r'^(\d+)\.\s', stripped).group(1)
            story.append(Paragraph(f"{num}. {list_text}", bullet_style))
            i += 1
            continue

        # Horizontal rules
        if stripped == "---":
            # Add a visual divider line
            t = Table([[""]], colWidths=[7.0 * inch], rowHeights=[2])
            t.setStyle(TableStyle([
                ('LINEBELOW', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E0")),
                ('BOTTOMPADDING', (0,0), (-1,-1), 0),
                ('TOPPADDING', (0,0), (-1,-1), 0),
            ]))
            story.append(Spacer(1, 10))
            story.append(t)
            story.append(Spacer(1, 10))
            i += 1
            continue

        # Regular paragraph
        if stripped:
            text = stripped
            # Support bold markdown
            text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
            # Support links markdown
            text = re.sub(r'\[(.*?)\]\((.*?)\)', r'<font color="#2B6CB0"><u>\1</u></font>', text)
            # Inline code markdown
            text = re.sub(r'`(.*?)`', r'<font name="Courier"><b>\1</b></font>', text)
            
            # Simple mermaid check (we skip displaying empty lines in mermaid, or handle separately)
            if "graph TD" in text or "sequenceDiagram" in text:
                # Skip the raw diagram code since it is rendered inside code blocks, or format it
                story.append(Paragraph("<i>[Diagrama de flujo omitido en PDF - Ver versión web/Markdown para renderizado interactivo]</i>", body_style))
                # Skip subsequent diagram lines
                while i + 1 < len(lines) and (lines[i+1].strip().startswith("graph") or lines[i+1].strip().startswith("sequence") or "-->" in lines[i+1] or "participant" in lines[i+1] or "loop" in lines[i+1] or "alt" in lines[i+1] or "end" in lines[i+1]):
                    i += 1
            else:
                story.append(Paragraph(text, body_style))
                
        i += 1

    print(f"Building PDF document into {pdf_path}...")
    doc.build(story, canvasmaker=NumberedCanvas)
    print("PDF build successful.")

if __name__ == "__main__":
    brain_dir = r"C:\Users\espin\.gemini\antigravity\brain\d840a7af-aeea-46ee-a01e-13fadfba0487"
    md_file = os.path.join(brain_dir, "smartassign_especificacion_tecnica.md")
    pdf_file = os.path.join(brain_dir, "smartassign_especificacion_tecnica.pdf")
    
    build_pdf(md_file, pdf_file)
