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

  const reportIndex = (() => {
    if (reportsList.length === 0 || !report) return '01';
    const sorted = [...reportsList];
    const idx = sorted.findIndex(r => r.id === report.id);
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
      // Wait for all images to fully load
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

      // Brief pause for stability
      await new Promise((resolve) => setTimeout(resolve, 300));

      const options = {
        margin: 0,
        filename: `${formattedReportId.replace(/\//g, "-")}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          logging: false,
          letterRendering: true,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] }
      };

      const pdfBlob = await html2pdf().set(options).from(element).outputPdf("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      // 1. Open preview in a new tab
      window.open(pdfUrl, "_blank");
      
      // 2. Trigger automatic local download
      const downloadLink = document.createElement("a");
      downloadLink.href = pdfUrl;
      downloadLink.download = `${formattedReportId.replace(/\//g, "-")}.pdf`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      toast.success("PDF preview opened & download started!", { id: toastId });
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate PDF. Please try again.", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

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
        <div className="flex justify-between items-center border-b-2 border-[#1e3a8a] pb-6 mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <svg
                width="70"
                height="30"
                viewBox="0 0 100 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M 5 12 L 35 12 L 30 17 L 35 22 L 5 22 Z"
                  fill="#1A1A1A"
                />
                <path
                  d="M 5 22 L 35 22 L 32 26 L 35 30 L 5 30 Z"
                  fill="#E53E3E"
                />
                <circle cx="10" cy="17" r="1.5" fill="white" />
                <circle cx="20" cy="17" r="1.5" fill="white" />
                <circle cx="30" cy="17" r="1.5" fill="white" />

                <path
                  d="M 95 12 L 65 12 L 70 17 L 65 22 L 95 22 Z"
                  fill="#1A1A1A"
                />
                <path
                  d="M 95 22 L 65 22 L 68 26 L 65 30 L 95 30 Z"
                  fill="#E53E3E"
                />
                <circle cx="90" cy="17" r="1.5" fill="white" />
                <circle cx="80" cy="17" r="1.5" fill="white" />
                <circle cx="70" cy="17" r="1.5" fill="white" />

                <polygon
                  points="50,2 54,16 68,16 57,25 61,38 50,30 39,38 43,25 32,16 46,16"
                  fill="#00D2FF"
                />
                <circle cx="50" cy="21" r="7" fill="#00A3C4" />
                <text
                  x="50"
                  y="25"
                  fontFamily="sans-serif"
                  fontWeight="900"
                  fontSize="11"
                  fill="white"
                  textAnchor="middle"
                >
                  U
                </text>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-extrabold tracking-tight text-slate-900  leading-none">
                Unique Delta Force Security Pvt. Ltd.
              </h2>
              <p className="text-[7.5px] text-muted-foreground uppercase font-mono tracking-wider mt-1">
                ISO 9001: 2015 certified company
              </p>
            </div>
          </div>
          <div className="text-center max-w-[40%]">
            <h3 className="text-xs font-black text-[#1e3a8a] uppercase tracking-wider border-b-2 border-[#1e3a8a] pb-1">
              FIELD OFFICER GENERAL VISIT REPORT
            </h3>
          </div>
          <div className="text-right max-w-[45%] shrink-0 pr-2">
            <span className="text-[8px] font-bold text-slate-400  uppercase block">
              Report ID
            </span>
            <span className="text-[10px] font-black text-blue-600 tracking-tight block whitespace-nowrap">
              {formattedReportId}
            </span>
          </div>
        </div>

        {/* Section 1: General Information matching Night Round design */}
        <div className="mb-6">
          <div className="report-divider"></div>
          <div className="report-ribbon">General Information</div>
          <div className="report-info-grid">
            <div>
              <label>Client</label>
              <span>{clientName}</span>
            </div>
            <div>
              <label>Unit / Site</label>
              <span>{report.siteName}</span>
            </div>
            <div>
              <label>Inspection Date</label>
              <span>{report.visitDate}</span>
            </div>
            <div>
              <label>Date Logged</label>
              <span>{report.createdOn}</span>
            </div>
            <div>
              <label>Start Time</label>
              <span>{report.startTime || "N/A"}</span>
            </div>
            <div>
              <label>End Time</label>
              <span>{report.endTime || "N/A"}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Visit Parameters */}
        <div className="mb-6">
          <div className="report-divider"></div>
          <div className="report-ribbon">Visit Parameters & Scope</div>
          <div className="report-info-grid">
            <div className="col-span-1">
              <label>Person Visited</label>
              <span>{report.personVisited}</span>
            </div>
            <div className="col-span-3">
              <label>Reason of Visit</label>
              <span className="whitespace-pre-line font-medium text-slate-700">{report.reasonOfVisit}</span>
            </div>
          </div>
        </div>

        {/* Section 3: Notes & Remarks */}
        {report.remark && (
          <div className="mb-6">
            <div className="report-ribbon">Remarks & Inspector Notes</div>
            <div className="border border-slate-200  rounded-lg p-4 bg-slate-50  text-xs text-slate-700  italic whitespace-pre-line shadow-sm">
              {report.remark}
            </div>
          </div>
        )}

        {/* Footer Meta */}
        <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-6">
          <span>
            Generated by Unique Delta Force Security Pvt. Ltd. Inspection System
          </span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}
