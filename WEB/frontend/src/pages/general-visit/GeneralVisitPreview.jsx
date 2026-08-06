import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Shield, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../../services/api";
import html2pdf from "html2pdf.js";
import { toast } from "sonner";

const RibbonHeader = ({ title }) => (
  <div className="bg-[#1e3a8a] text-white text-[11px] font-black uppercase tracking-wider px-4 py-2 rounded-t-lg mb-0.5 select-none shadow-sm flex items-center justify-between border-l-4 border-indigo-400">
    <span>{title}</span>
  </div>
);

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

  const clientName = report?.clientName || "N/A";

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
    } catch (e) {
      return time24;
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

  const formattedReportId = report
    ? `${reportIndex}-${clientName}-${report.siteName}-OGV-${formatDateToDMY(report.visitDate || report.createdOn)}`
    : "general-visit-report";

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = formattedReportId;
    window.print();
    document.title = originalTitle;
  };

  const handleDownloadPDF = async () => {
    if (isDownloading) return;
    const element = reportRef.current;
    if (!element) {
      toast.error("Report content not found.");
      return;
    }
    
    setIsDownloading(true);
    const toastId = toast.loading("Generating high-resolution PDF...");
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

      const options = {
        margin: 0,
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
        pagebreak: { mode: ["avoid-all", "css", "legacy"] }
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
      setIsDownloading(false);
    }
  };;

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

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 print:p-0 print:m-0 print:max-w-full">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            body, html {
              overflow: visible !important;
              height: auto !important;
            }
            .print\:hidden {
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
        {/* PDF Header matching Night Round layout */}
        {/* PDF Header matching screenshot layout */}
        <div className="border-b-2 border-[#1e3a8a] pb-4 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="shrink-0">
              <svg
                width="60"
                height="26"
                viewBox="0 0 100 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M 5 12 L 35 12 L 30 17 L 35 22 L 5 22 Z" fill="#1A1A1A" />
                <path d="M 5 22 L 35 22 L 32 26 L 35 30 L 5 30 Z" fill="#E53E3E" />
                <circle cx="10" cy="17" r="1.5" fill="white" />
                <circle cx="20" cy="17" r="1.5" fill="white" />
                <circle cx="30" cy="17" r="1.5" fill="white" />
                <path d="M 95 12 L 65 12 L 70 17 L 65 22 L 95 22 Z" fill="#1A1A1A" />
                <path d="M 95 22 L 65 22 L 68 26 L 65 30 L 95 30 Z" fill="#E53E3E" />
                <circle cx="90" cy="17" r="1.5" fill="white" />
                <circle cx="80" cy="17" r="1.5" fill="white" />
                <circle cx="70" cy="17" r="1.5" fill="white" />
                <polygon points="50,2 54,16 68,16 57,25 61,38 50,30 39,38 43,25 32,16 46,16" fill="#00D2FF" />
                <circle cx="50" cy="21" r="7" fill="#00A3C4" />
                <text x="50" y="25" fontFamily="sans-serif" fontWeight="900" fontSize="11" fill="white" textAnchor="middle">U</text>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight text-slate-900 leading-none">
                Unique Delta Force Security Pvt. Ltd.
              </h2>
            </div>
          </div>
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <h1 className="text-sm font-black text-[#1e3a8a] leading-tight uppercase tracking-tight w-fit border-b-2 border-[#1e3a8a] pb-1.5">
                FIELD OFFICER GENERAL VISIT REPORT
              </h1>
              <span className="text-[10px] font-bold text-slate-800 mt-1 uppercase report-meta-text">
                REPORT ID : {formattedReportId}
              </span>
            </div>
            <div className="text-right text-[10px] font-bold text-slate-800 leading-normal uppercase report-meta-text">
              DATE : {report ? report.visitDate || report.createdOn : ""} {report && report.startTime && report.startTime !== "N/A" ? formatTo12Hour(report.startTime) : ""} {report && report.endTime && report.endTime !== "N/A" ? formatTo12Hour(report.endTime) : ""}
            </div>
          </div>
        </div>

        {/* General Information Block */}
        <div className="mb-6">
          <div className="report-ribbon">General Information</div>
          <div className="report-info-grid">
            <div>
              <label>Client Name</label>
              <span>{clientName}</span>
            </div>
            <div>
              <label>Site Name</label>
              <span>{report ? report.siteName || "N/A" : "N/A"}</span>
            </div>
            <div>
              <label>Visit Date</label>
              <span>{report ? formatDateToDMY(report.visitDate) : "N/A"}</span>
            </div>
            <div>
              <label>Visit Type</label>
              <span>General Visit</span>
            </div>
            
            <div>
              <label>Officer Name</label>
              <span>{report ? report.officer || "N/A" : "N/A"}</span>
            </div>
            <div>
              <label>Start Time</label>
              <span>{report && report.startTime ? formatTo12Hour(report.startTime) : "N/A"}</span>
            </div>
            <div>
              <label>End Time</label>
              <span>{report && report.endTime ? formatTo12Hour(report.endTime) : "N/A"}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Visit Parameters */}
        {(report.personVisited || report.reasonOfVisit) && (
          <div className="mb-6">
            <div className="report-ribbon">Visit Parameters & Scope</div>
            <div className="report-info-grid">
              {report.personVisited && (
                <div className="col-span-1">
                  <label>Person Visited</label>
                  <span>{report.personVisited}</span>
                </div>
              )}
              {report.reasonOfVisit && (
                <div className={report.personVisited ? "col-span-3" : "col-span-4"}>
                  <label>Reason of Visit</label>
                  <span className="whitespace-pre-line font-medium text-slate-700">{report.reasonOfVisit}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section 3: Notes & Remarks */}
        {report.remark && (
          <div className="mb-6">
            <div className="report-ribbon">Remarks & Inspector Notes</div>
            <div className="border border-slate-200  rounded-none p-4 bg-slate-50  text-xs text-slate-700  italic whitespace-pre-line shadow-sm">
              {report.remark}
            </div>
          </div>
        )}

        {/* Footer Meta */}
        <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-6">
          <span>
            System Generated Report For Unique Delta Force Security Pvt. Ltd.
          </span>
        </div>
      </div>
    </div>
  );
}
