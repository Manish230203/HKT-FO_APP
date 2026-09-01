import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../../services/api";
import html2pdf from "html2pdf.js";
import { toast } from "sonner";

export function GeneralVisitReportTemplate({ report, hideTitle = false, hideLogo = false, hideHeader = false }) {
  const clientName = report?.clientName || "N/A";
  const siteName = report?.siteName || "N/A";
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

  const formatTo12Hour = (time24) => {
    if (!time24 || time24 === "N/A") return "N/A";
    try {
      const [hoursStr, minutesStr] = time24.split(":");
      const hours = parseInt(hoursStr, 10);
      const minutes = parseInt(minutesStr, 10);
      if (isNaN(hours) || isNaN(minutes)) return time24;
      const ampm = hours >= 12 ? "PM" : "AM";
      const hours12 = hours % 12 || 12;
      return `${hours12.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")} ${ampm}`;
    } catch (e) { return time24; }
  };

  const reportIdStr = report?.formattedReportId || `${report?.reportIndex || "01"}-${clientName}-${siteName}-OGV-${formatDateToDMY(visitDate)}`;

  const isEagle = 
    report?.companyId === 4 || 
    Number(report?.companyId) === 4 || 
    String(report?.companyName || '').toLowerCase().includes('eagle') || 
    String(report?.companyShortName || '').toLowerCase().includes('eispl') || 
    String(report?.officer || '').toLowerCase().includes('anil bhosale') || 
    String(report?.officer || '').toLowerCase().includes('bhosale');

  const compName = isEagle ? "Eagle Industrial Services Pvt. Ltd." : (report?.companyName || "Unique Delta Force Security Pvt. Ltd.");
  const compLogo = isEagle ? "/eagle_logo.png" : "/udf_logo.png";

  return (
    <div className="report-template-content bg-white text-slate-900 mb-0 p-2">
      {!hideHeader && (
        <div className="border-b-2 border-[#1e3a8a] pb-4 mb-4">
          {!hideLogo && (
            <div className="flex items-center gap-3 mb-4">
              <div className="shrink-0">
                <img src={compLogo} alt={compName} className="h-8 object-contain" />
              </div>
              <div><h2 className="text-sm font-black tracking-tight text-slate-900 leading-none">{compName}</h2></div>
            </div>
          )}
          <div className="flex justify-between items-start gap-4">
            <div className="flex flex-col min-w-0 shrink max-w-[65%]">
              {!hideTitle && <h1 className="text-sm font-black text-[#1e3a8a] leading-tight uppercase tracking-tight w-fit">FIELD OFFICER GENERAL VISIT REPORT</h1>}
              <span className="text-[10px] font-bold text-slate-800 mt-1 uppercase font-mono break-all">REPORT ID : {reportIdStr}</span>
            </div>
            <div className="text-right text-[10px] font-bold text-slate-800 leading-normal uppercase font-mono shrink-0 whitespace-nowrap">DATE : {formatDateToDMY(visitDate)} {formatTo12Hour(report?.startTime)} - {formatTo12Hour(report?.endTime)}</div>
          </div>
        </div>
      )}

      <div className="mb-6 pdf-avoid-card">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">General Information</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border border-t-0 border-slate-200 bg-slate-50/70 rounded-b-lg">
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Client Name</label><span className="text-[13px] font-extrabold text-slate-900 break-words">{clientName}</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Site Name</label><span className="text-[13px] font-extrabold text-slate-900 break-words">{siteName}</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Visit Date</label><span className="text-[13px] font-extrabold text-slate-900">{formatDateToDMY(visitDate)}</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Visit Type</label><span className="text-[13px] font-extrabold text-slate-900">General Visit</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Officer Name</label><span className="text-[13px] font-extrabold text-slate-900 break-words">{report?.officer || "—"}</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Start Time</label><span className="text-[13px] font-extrabold text-slate-900">{formatTo12Hour(report?.startTime || "—")}</span></div>
          <div><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">End Time</label><span className="text-[13px] font-extrabold text-slate-900">{formatTo12Hour(report?.endTime || "—")}</span></div>
          <div className="col-span-2 md:col-span-4"><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Photo Evidence</label><span className="text-[13px] font-extrabold text-slate-900">{photoCount} {photoCount === 1 ? "Photo" : "Photos"}</span></div>
        </div>
      </div>

      <div className="mb-6 pdf-avoid-card">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">Visit Parameters & Scope</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 border border-t-0 border-slate-200 bg-slate-50/70 rounded-b-lg">
          <div className="col-span-1"><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Person Visited</label><span className="text-[13px] font-extrabold text-slate-900 break-words">{report?.personVisited || "N/A"}</span></div>
          <div className="col-span-3"><label className="block text-[7px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Reason of Visit</label><span className="text-xs font-semibold text-slate-900 whitespace-pre-line break-words">{report?.reasonOfVisit || "Routine Inspection"}</span></div>
        </div>
      </div>

      <div className="mb-6 pdf-avoid-card">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">Remarks & Inspector Notes</div>
        <div className="flex flex-col justify-center border border-t-0 border-slate-200 rounded-b-lg p-3 bg-slate-50 text-xs text-slate-700 min-h-[80px] whitespace-pre-line shadow-sm break-words">{(report?.remark || "No remarks recorded.").trim()}</div>
      </div>

      <div className="pdf-avoid-card">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">Photo Evidence</div>
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
    </div>
  );
}

export default function GeneralVisitPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reportRef = useRef(null);
  const [report, setReport] = useState(null);
  const [reportsList, setReportsList] = useState([]);
  const [clients, setClients] = useState([]);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await api.get(`/general-visits`);
        const allVisits = res.data || [];
        setReportsList(allVisits);
        const match = allVisits.find((r) => r.id === id);
        if (match) {
          setReport(match);
        }
      } catch (err) {
        console.error("Failed to fetch general visit details:", err);
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
    fetchClients();
  }, [id]);

  if (!report) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground text-sm">Report not found.</p>
        <Button
          onClick={() => navigate("/general-visits")}
          variant="outline"
          className="text-xs rounded-lg"
        >
          Back to Reports
        </Button>
      </div>
    );
  }

  const clientName = report.clientName || "N/A";

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
      .sort((a, b) => (a.created_on || a.createdOn || 0) - (b.created_on || b.createdOn || 0));
    const idx = siteVisits.findIndex(r => r.id === report.id);
    return idx !== -1 ? String(idx + 1).padStart(2, '0') : '01';
  })();

  const formattedReportId = `${reportIndex}-${clientName}-${report.siteName}-OGV-${formatDateToDMY(report.visitDate || report.createdOn)}`;

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
    <div className="space-y-6 max-w-4xl mx-auto pb-12 print:p-0 print:m-0 print:max-w-full">
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
          onClick={() => navigate("/general-visits")}
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-2 w-fit text-xs font-semibold"
        >
          <ArrowLeft className="h-4.5 w-4.5" /> Back to Reports
        </Button>
        <div className="flex gap-2">
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

      {/* Main Report Document Container */}
      <div
        ref={reportRef}
        className="report-sheet"
      >
        <GeneralVisitReportTemplate report={fullReportData} />
      </div>
    </div>
  );
}
