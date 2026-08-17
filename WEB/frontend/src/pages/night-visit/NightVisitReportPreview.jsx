import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getStoredReports } from "./mockData";
import api from "../../services/api";
import html2pdf from "html2pdf.js";
import { toast } from "sonner";

export function NightVisitReportTemplate({ report, hideTitle = false, hideLogo = false, hideHeader = false }) {
  const clientName = report?.clientName || "N/A";
  const unit = report?.unit || "N/A";
  const visitDate = report?.visitDate || report?.createdOn || "";
  const photosList = Array.isArray(report?.photos) ? report.photos : [];
  const photoCount = photosList.length;

  const formatDateToDMY = (dateStr) => {
    if (!dateStr) return "DD/MM/YY";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr.replace(/-/g, "/");
      const day = d.getDate().toString().padStart(2, "0");
      const month = (d.getMonth() + 1).toString().padStart(2, "0");
      const year = d.getFullYear().toString().slice(-2);
      return `${day}/${month}/${year}`;
    } catch (e) { return dateStr; }
  };

  const reportIdStr = report?.formattedReportId || `${report?.reportIndex || "03"}-${clientName}-${unit}-ONR-${formatDateToDMY(visitDate)}`;

  const parseArray = (data, fallback) => {
    if (Array.isArray(data)) return data;
    if (typeof data === "string" && data.trim()) {
      try { const parsed = JSON.parse(data); if (Array.isArray(parsed)) return parsed; } catch (e) { }
    }
    return fallback;
  };

  const guardsList = parseArray(report?.guards, []);
  const rawChecklist = parseArray(report?.checklist, []);
  const checklistItems = rawChecklist.filter((q) => {
    const ansStr = (q.answer || q.status || "").toString().trim();
    const remStr = (q.remarks || q.observation || "").toString().trim();
    return ansStr !== "" || remStr !== "";
  });

  const lectureText = report?.lectureDetails || report?.lecture_details || "No short lecture details recorded.";
  const randomCheckText = report?.randomChecking || report?.random_checking || "No random checking recorded.";
  const suggestionsText = report?.suggestions || "No officer suggestions recorded.";

  return (
    <div className="report-template-content bg-white text-slate-900 mb-0 p-2">
      {!hideHeader && (
        <div className="border-b-2 border-[#1e3a8a] pb-4 mb-4">
          {!hideLogo && (
            <div className="flex items-center gap-3 mb-4">
              <div className="shrink-0">
                <svg width="60" height="26" viewBox="0 0 100 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M 5 12 L 35 12 L 30 17 L 35 22 L 5 22 Z" fill="#1A1A1A" />
                  <path d="M 5 22 L 35 22 L 32 26 L 35 30 L 5 30 Z" fill="#E53E3E" />
                  <circle cx="10" cy="17" r="1.5" fill="white" /><circle cx="20" cy="17" r="1.5" fill="white" /><circle cx="30" cy="17" r="1.5" fill="white" />
                  <path d="M 95 12 L 65 12 L 70 17 L 65 22 L 95 22 Z" fill="#1A1A1A" />
                  <path d="M 95 22 L 65 22 L 68 26 L 65 30 L 95 30 Z" fill="#E53E3E" />
                  <circle cx="90" cy="17" r="1.5" fill="white" /><circle cx="80" cy="17" r="1.5" fill="white" /><circle cx="70" cy="17" r="1.5" fill="white" />
                  <polygon points="50,2 54,16 68,16 57,25 61,38 50,30 39,38 43,25 32,16 46,16" fill="#00D2FF" />
                  <circle cx="50" cy="21" r="7" fill="#00A3C4" />
                  <text x="50" y="25" fontFamily="sans-serif" fontWeight="900" fontSize="11" fill="white" textAnchor="middle">U</text>
                </svg>
              </div>
              <div><h2 className="text-sm font-black tracking-tight text-slate-900 leading-none">Unique Delta Force Security Pvt. Ltd.</h2></div>
            </div>
          )}
          <div className="flex justify-between items-start gap-4">
            <div className="flex flex-col min-w-0 shrink max-w-[65%]">
              {!hideTitle && <h1 className="text-sm font-black text-[#1e3a8a] leading-tight uppercase tracking-tight w-fit">FIELD OFFICER NIGHT VISIT REPORT</h1>}
              <span className="text-[10px] font-bold text-slate-800 mt-1 uppercase font-mono break-all">REPORT ID : {reportIdStr}</span>
            </div>
            <div className="text-right text-[10px] font-bold text-slate-800 leading-normal uppercase font-mono shrink-0 whitespace-nowrap">DATE : {formatDateToDMY(visitDate)} {report?.startTime || "—"} - {report?.endTime || "—"}</div>
          </div>
        </div>
      )}

      <div className="mb-6 pdf-avoid-card">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">General Information</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border border-t-0 border-slate-200 bg-slate-50/70 rounded-b-lg">
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Client Name</label><span className="text-[13px] font-extrabold text-slate-900 break-words">{clientName}</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Site Name</label><span className="text-[13px] font-extrabold text-slate-900 break-words">{unit}</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Shift</label><span className="text-[13px] font-extrabold text-slate-900">{report?.shift || "Night Shift"}</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Visit Type</label><span className="text-[13px] font-extrabold text-slate-900">Night Visit</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Officer Name</label><span className="text-[13px] font-extrabold text-slate-900 break-words">{report?.officer || "—"}</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Start Time</label><span className="text-[13px] font-extrabold text-slate-900">{report?.startTime || "—"}</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">End Time</label><span className="text-[13px] font-extrabold text-slate-900">{report?.endTime || "—"}</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">GPS Location</label><span className="text-[13px] font-extrabold text-slate-900 break-all">{report?.gps || "—"}</span></div>
          <div className="col-span-2 md:col-span-4"><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Photo Evidence</label><span className="text-[13px] font-extrabold text-slate-900">{photoCount} {photoCount === 1 ? "Photo" : "Photos"}</span></div>
        </div>
      </div>

      <div className="mb-6">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">Guards Present on Duty</div>
        <div className="border border-t-0 border-slate-200 rounded-b-lg">
          {guardsList.length > 0 ? (
            <div className="w-full text-xs text-left">
              <div className="bg-slate-200 border-b border-slate-300 text-slate-900 font-bold grid grid-cols-12 gap-2 p-2">
                <div className="col-span-1 text-center">Sr No</div>
                <div className="col-span-6">Guard Name</div>
                <div className="col-span-3">Employee ID</div>
                <div className="col-span-2 text-center">Status</div>
              </div>
              <div className="divide-y divide-slate-200">
                {guardsList.map((g, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 py-3 px-2 items-center pdf-avoid-card">
                    <div className="col-span-1 text-center font-medium text-slate-600">{idx + 1}</div>
                    <div className="col-span-6 font-semibold text-slate-900 break-words">{g.name}</div>
                    <div className="col-span-3 text-slate-700 break-words">{g.employeeId}</div>
                    <div className="col-span-2 text-center">
                      <span className={`font-bold ${g.present !== false ? "text-emerald-600" : "text-red-600"}`}>
                        {g.present !== false ? "Present" : "Absent"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (<div className="p-4 text-xs text-slate-500 italic">No guards listed for this visit.</div>)}
        </div>
      </div>

      <div className="mb-6 pdf-avoid-card pdf-page-break pt-6">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">2. Inspection Checklist</div>
        <div className="border border-t-0 border-slate-200 rounded-b-lg">
          {checklistItems.length > 0 ? (
            <div className="w-full text-xs text-left">
              <div className="bg-slate-200 border-b border-slate-300 text-slate-900 font-bold grid grid-cols-12 gap-2 p-2">
                <div className="col-span-1 text-center">SR. NO.</div>
                <div className="col-span-5">Inspection Item</div>
                <div className="col-span-2">Answer</div>
                <div className="col-span-4">Remarks</div>
              </div>
              <div className="divide-y divide-slate-200">
                {checklistItems.map((q, idx) => {
                  const ans = (q.answer || q.status || "-").toString().trim();
                  const clean = ans.toUpperCase();
                  const isPositive = ["YES", "OK", "GOOD", "DONE", "PRESENT", "COMPLETED", "SERVICEABLE", "ADEQUATE", "SATISFACTORY"].includes(clean);
                  const isNegative = ["NO", "NOT OK", "BAD", "NOT DONE", "ABSENT", "MISSED", "UNSERVICEABLE", "INADEQUATE"].includes(clean);
                  const colorClass = isPositive ? "text-emerald-600" : isNegative ? "text-red-600" : "text-slate-900";
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 py-3 px-2 items-center pdf-avoid-card">
                      <div className="col-span-1 text-center font-medium text-slate-600">{idx + 1}</div>
                      <div className="col-span-5 font-semibold text-slate-900 break-words">{q.question}</div>
                      <div className={`col-span-2 font-bold ${colorClass}`}>{ans}</div>
                      <div className="col-span-4 text-slate-700 break-words">{q.remarks || q.observation || "-"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (<div className="p-4 text-xs text-slate-500 italic">No checklist items were answered for this visit.</div>)}
        </div>
      </div>

      <div className="mb-6 pdf-avoid-card">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">3. Photo Evidence</div>
        <div className="border border-t-0 border-slate-200 rounded-b-lg p-4 bg-slate-50 shadow-sm">
          {photoCount > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {photosList.map((photo, pIdx) => (
                <div key={pIdx} className="aspect-square rounded-lg overflow-hidden border border-slate-300 bg-slate-100 flex items-center justify-center shadow-2xs">
                  <img src={photo} alt={`Evidence ${pIdx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">No photo evidence uploaded for this visit.</div>
          )}
        </div>
      </div>

      <div className="space-y-6 mb-6">
        <div className="pdf-avoid-card">
          <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">4. Short Lecture</div>
          <div className="flex flex-col justify-center border border-t-0 border-slate-200 rounded-b-lg p-3 bg-slate-50 text-xs text-slate-700 min-h-[80px] break-words whitespace-pre-wrap">{lectureText.trim()}</div>
        </div>
        <div className="pdf-avoid-card">
          <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">5. Random Checking</div>
          <div className="flex flex-col justify-center border border-t-0 border-slate-200 rounded-b-lg p-3 bg-slate-50 text-xs text-slate-700 min-h-[80px] break-words whitespace-pre-wrap">{randomCheckText.trim()}</div>
        </div>
      </div>

      <div className="pdf-avoid-card">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">6. Officer Suggestions</div>
        <div className="flex flex-col justify-center border border-t-0 border-slate-200 rounded-b-lg p-3 bg-slate-50 text-xs text-slate-700 font-medium min-h-[80px] whitespace-pre-wrap shadow-sm break-words">{suggestionsText.trim()}</div>
      </div>
    </div>
  );
}

export default function ReportPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reportRef = useRef(null);
  const [report, setReport] = useState(null);
  const [reportsList, setReportsList] = useState([]);
  const [clients, setClients] = useState([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await api.get(`/officer-rounds/reports/${id}`);
        setReport(res.data);
      } catch (err) {
        console.error(
          "Failed to fetch report details from API, falling back to localStorage:",
          err,
        );
        const local = getStoredReports().find((r) => r.id === id);
        if (local) {
          setReport(local);
        } else {
          console.error("Report not found in localStorage either.");
        }
      }
    };
    const fetchAllReports = async () => {
      try {
        const res = await api.get('/officer-rounds/reports');
        setReportsList(res.data || []);
      } catch (err) {
        console.error("Failed to fetch reports list:", err);
      }
    };
    const fetchClients = async () => {
      try {
        const res = await api.get("/assessments/clients");
        setClients(res.data || []);
      } catch (err) {
        console.error("Failed to fetch clients:", err);
      }
    };
    fetchReport();
    fetchAllReports();
    fetchClients();
  }, [id]);

  if (!report) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground text-sm">Report not found.</p>
        <Button onClick={() => navigate("/officer-rounds")} variant="outline">
          Back to Reports
        </Button>
      </div>
    );
  }

  const clientName = report.clientId
    ? clients.find((c) => c.id == report.clientId)?.name || `Client #${report.clientId}`
    : report.clientName || "N/A";

  const formatDateToDMY = (dateStr) => {
    if (!dateStr) return "DD/MM/YY";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        return dateStr.replace(/-/g, "/");
      }
      const day = d.getDate().toString().padStart(2, "0");
      const month = (d.getMonth() + 1).toString().padStart(2, "0");
      const year = d.getFullYear().toString().slice(-2);
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  const reportIndex = (() => {
    if (reportsList.length === 0 || !report) return '01';
    const siteVisits = reportsList
      .filter((r) => r.siteId === report.siteId)
      .sort((a, b) => new Date(a.visitDate) - new Date(b.visitDate));
    const idx = siteVisits.findIndex(r => r.id === report.id);
    return idx !== -1 ? String(idx + 1).padStart(2, '0') : '01';
  })();

  const formattedReportId = `${reportIndex}-${clientName}-${report.unit}-ONR-${formatDateToDMY(report.visitDate)}`;

  const handleDownloadPDF = async () => {
    if (isDownloading) return;
    const element = reportRef.current;
    if (!element) {
      toast.error("Report content not found.");
      return;
    }

    setIsDownloading(true);
    const toastId = toast.loading("Generating high-resolution PDF...");

    // Save original styles
    const originalWidth = element.style.width;
    const originalMargin = element.style.margin;
    const originalPadding = element.style.padding;
    const originalBoxShadow = element.style.boxShadow;
    const originalBorder = element.style.border;

    try {
      // 1. Wait for all images to fully load
      const images = Array.from(element.querySelectorAll("img"));
      await Promise.all(
        images.map(
          (img) =>
            new Promise((resolve) => {
              if (img.complete) resolve();
              else {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              }
            })
        )
      );

      // 2. Wait for fonts to load
      if (document.fonts) {
        await document.fonts.ready;
      }

      // Temporarily override styles for perfect PDF alignment
      element.style.setProperty("width", "794px", "important");
      element.style.setProperty("margin", "0 auto", "important");
      element.style.setProperty("padding-top", "24px", "important");
      element.style.setProperty("padding-left", "24px", "important");
      element.style.setProperty("padding-right", "24px", "important");
      element.style.setProperty("padding-bottom", "0px", "important");
      element.style.boxShadow = "none";
      element.style.border = "none";

      const options = {
        margin: [30, 0, 30, 0],
        filename: `${formattedReportId}.pdf`.replace(/\//g, "-"),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          width: 794,
          windowWidth: 794,
          letterRendering: true,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".pdf-avoid-card"] }
      };

      const pdfBlob = await html2pdf().set(options).from(element).outputPdf("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // 1. Open preview in a new tab
      window.open(pdfUrl, "_blank");

      // 2. Trigger automatic local download
      const downloadLink = document.createElement("a");
      downloadLink.href = pdfUrl;
      downloadLink.download = `${formattedReportId}.pdf`.replace(/\//g, "-");
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      toast.success("PDF generated! Preview opened & download started.", { id: toastId });
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate PDF. Please try again.", { id: toastId });
    } finally {
      // Revert styles to keep the web exactly as it was
      if (element) {
        element.style.removeProperty("width");
        element.style.removeProperty("margin");
        element.style.removeProperty("padding-top");
        element.style.removeProperty("padding-left");
        element.style.removeProperty("padding-right");
        element.style.removeProperty("padding-bottom");
        element.style.boxShadow = originalBoxShadow;
        element.style.border = originalBorder;
      }
      setIsDownloading(false);
    }
  };

  const fullReportData = {
    ...report,
    clientName,
    reportIndex,
    formattedReportId,
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-8 print:p-0 print:m-0 print:max-w-full">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          tr, td, .pdf-avoid-card {
            page-break-inside: avoid !important;
            break-inside: avoid-page !important;
          }
          @media print {
            body, html {
              overflow: visible !important;
              height: auto !important;
            }
            .print\\:hidden {
              display: none !important;
            }
            ::-webkit-scrollbar {
              display: none !important;
            }
          }
        `,
        }}
      />
      {/* Top Controls (Hidden on Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <Button
          onClick={() => navigate("/officer-rounds")}
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-2 w-fit"
        >
          <ArrowLeft className="h-4.5 w-4.5" /> Back to Reports
        </Button>

        <div className="flex items-center gap-2">
          {report?.emailAccess === 1 || report?.email_access === 1 ? (
            <Button
              onClick={() => {
                setRecipientEmail("");
                setEmailSubject(`Night Visit Report - ${report?.unit || ""}`);
                setEmailMessage(`Dear Team,\n\nPlease find the Night Visit Report for site: ${report?.unit || ""}.\n\nBest regards,\nField Officer Management`);
                setIsEmailModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 rounded-full px-5 h-9 text-xs font-semibold shadow-sm"
            >
              <Mail className="h-4 w-4" /> Send Email
            </Button>
          ) : (
            <Button
              disabled
              className="bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-70 flex items-center gap-2 rounded-full px-5 h-9 text-xs font-semibold border border-border"
              title="Email access is disabled for this branch (email_access = 0 in BRANCH table)"
            >
              <Mail className="h-4 w-4" /> Email Disabled (Branch)
            </Button>
          )}

          <Button
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 rounded-full px-5 h-9 text-xs font-semibold animate-in fade-in"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download PDF
          </Button>
        </div>
      </div>

      {/* A4 Sheet Container */}
      <div
        ref={reportRef}
        className="report-sheet"
      >
        <NightVisitReportTemplate report={fullReportData} />
      </div>

      {/* Send Email Dialog */}
      <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
        <DialogContent className="sm:max-w-[480px] bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Mail className="h-5 w-5 text-emerald-600" /> Send Report via Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Recipient Email *</label>
              <Input
                type="email"
                placeholder="officer@company.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="text-xs bg-background border-input text-foreground h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Subject</label>
              <Input
                type="text"
                placeholder="Email Subject..."
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="text-xs bg-background border-input text-foreground h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Message</label>
              <Textarea
                rows={4}
                placeholder="Enter custom email message..."
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                className="text-xs bg-background border-input text-foreground"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEmailModalOpen(false)}
              className="text-xs border-border hover:bg-muted text-foreground h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSendingEmail}
              onClick={async () => {
                if (!recipientEmail) {
                  toast.error("Please enter a recipient email.");
                  return;
                }
                setIsSendingEmail(true);
                try {
                  await api.post("/officer-visits/send-email", {
                    email: recipientEmail,
                    subject: emailSubject,
                    message: emailMessage,
                    branchId: report?.branchId,
                    siteId: report?.siteId
                  });
                  toast.success(`Email sent successfully to ${recipientEmail}!`);
                  setIsEmailModalOpen(false);
                } catch (err) {
                  console.error("Email error:", err);
                  toast.error(err.response?.data?.detail || "Failed to send email.");
                } finally {
                  setIsSendingEmail(false);
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-9 flex items-center gap-1.5"
            >
              {isSendingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}