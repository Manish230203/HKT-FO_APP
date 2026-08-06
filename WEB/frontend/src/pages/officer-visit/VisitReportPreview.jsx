import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, MapPin, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../../services/api";
import { getStoredVisitReports } from "../officer-round/mockData";
import html2pdf from "html2pdf.js";
import { toast } from "sonner";

export default function VisitReportPreview() {
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
        const res = await api.get(`/officer-visits/reports/${id}`);
        setReport(res.data);
      } catch (err) {
        console.error(
          "Failed to fetch report details from API, falling back to localStorage:",
          err,
        );
        const match = getStoredVisitReports().find((r) => r.id === id);
        if (match) {
          setReport(match);
        } else {
          console.error("Report not found in localStorage either.");
        }
      }
    };
    const fetchAllReports = async () => {
      try {
        const res = await api.get('/officer-visits/reports');
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

  const clientName = report?.clientId
    ? clients.find((c) => c.id == report.clientId)?.name ||
    `Client #${report.clientId}`
    : "N/A";

  let customerFeedbackText = "";
  let overallSuggestionsText = "";
  if (report?.suggestions) {
    try {
      const parsed = JSON.parse(report.suggestions);
      if (parsed && typeof parsed === "object") {
        customerFeedbackText = parsed.customerFeedback || "";
        overallSuggestionsText = parsed.overallSuggestions || "";
      } else {
        overallSuggestionsText = report.suggestions;
      }
    } catch (e) {
      overallSuggestionsText = report.suggestions;
    }
  }

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

  const formattedReportId = report
    ? `${reportIndex}-${clientName}-${report.unit}-ODV-${formatDateToDMY(report.visitDate)}`
    : "report";

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
          onClick={() => navigate("/officer-visit/reports")}
          variant="outline"
        >
          Back to Reports
        </Button>
      </div>
    );
  }

  const getAnswerColor = (ans) => {
    const norm = (ans || "").toLowerCase().trim();
    if (
      norm === "good" ||
      norm === "serviceable" ||
      norm === "adequate" ||
      norm === "yes"
    ) {
      return "text-emerald-600 font-bold";
    }
    if (norm === "action taken") {
      return "text-blue-600 font-bold";
    }
    if (norm === "not available" || norm === "no" || norm === "expired") {
      return "text-rose-600 font-bold";
    }
    return "text-slate-900  font-bold";
  };

  const displayObservations = report.observations || [];

  const checklistPhotos = (report.checklist || []).reduce((acc, q) => {
    if (q.photos && q.photos.length > 0) {
      acc.push(...q.photos);
    } else if (q.photo) {
      acc.push(q.photo);
    }
    return acc;
  }, []);

  const obsPhotosList = (report.observations || []).reduce((acc, obs) => {
    if (obs.photos && obs.photos.length > 0) {
      acc.push(...obs.photos);
    }
    return acc;
  }, []);

  const allPhotos = Array.from(
    new Set([...(report.photos || []), ...checklistPhotos, ...obsPhotosList]),
  );

  const formatTo12Hour = (time24) => {
    if (!time24) return "N/A";
    return time24;
  };

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
          onClick={() => navigate("/officer-visit/reports")}
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
                FIELD OFFICER DAY VISIT REPORT
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
              <span>{report ? report.unit || "N/A" : "N/A"}</span>
            </div>
            <div>
              <label>Shift</label>
              <span>{report ? report.shift || "N/A" : "N/A"}</span>
            </div>
            <div>
              <label>Visit Type</label>
              <span>Day Visit</span>
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
            <div>
              <label>GPS Location</label>
              <span>{report ? report.gps || "N/A" : "N/A"}</span>
            </div>

            <div className="col-span-4">
              <label>Photo Evidence</label>
              <span>{report ? allPhotos.length : 0}</span>
            </div>
          </div>
        </div>

        {/* Guards Present Section */}
        {report.guards && report.guards.filter((g) => g.present).length > 0 && (
          <div className="mb-8">
            <div className="report-ribbon">Guards Present on Duty</div>
            <div className="overflow-x-auto">
              <table className="report-table">
                <thead>
                  <tr className="bg-slate-200  border border-slate-400 dark:border-slate-600 text-slate-900  font-bold">
                    <th className="text-center w-[50px]">
                      Sr No
                    </th>
                    <th className="">
                      Guard Name
                    </th>
                    <th className="">
                      Employee ID / ID
                    </th>
                    <th className="text-center w-28">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.guards
                    .filter((g) => g.present)
                    .map((guard, idx) => (
                      <tr key={guard.id || idx} className="border border-slate-400 dark:border-slate-600">
                        <td className="text-center text-slate-800  font-medium">
                          {idx + 1}
                        </td>
                        <td className="font-semibold text-slate-900 ">
                          {guard.name}
                        </td>
                        <td className="text-slate-800 ">
                          {guard.employeeId}
                        </td>
                        <td className="text-center">
                          <span className="badge-status badge-status-present">
                            Present
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pre-defined Checklist Section */}
        {report.checklist &&
          report.checklist.length > 0 &&
          report.checklist.some(
            (c) => c.id && c.id.toString().startsWith("pq_") && c.status && c.status.trim() !== ""
          ) && (
            <div className="mb-8 mt-6">
              <div className="report-ribbon">A. Pre-defined Checklist Answers</div>
              <div className="overflow-x-auto">
                <table className="report-table">
                  <thead>
                    <tr className="bg-slate-200  border border-slate-400 dark:border-slate-600 text-slate-900  font-bold">
                      <th className="text-center w-[50px]">
                        Sr No
                      </th>
                      <th className="">
                        Inspection Point
                      </th>
                      <th className="">
                        Observation
                      </th>
                      <th className="text-center w-28">
                        Status (OK/Not OK)
                      </th>
                      <th className="">
                        Corrective Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.checklist
                      .filter(
                        (c) =>
                          c.status !== undefined &&
                          c.status !== null &&
                          c.status.trim() !== ""
                      )
                      .map((c, idx) => (
                        <tr key={c.id || idx} className="border border-slate-400 dark:border-slate-600">
                          <td className="text-center text-slate-800  font-medium">
                            {idx + 1}
                          </td>
                          <td className="font-semibold text-slate-900 ">
                            {c.question}
                          </td>
                          <td className="text-slate-800 ">
                            {c.observation || "-"}
                          </td>
                          <td className="text-center">
                            <span
                              className={`badge-status ${c.status === "OK" ? "badge-status-ok" : c.status === "Not OK" ? "badge-status-not-ok" : "text-slate-600"}`}
                            >
                              {c.status || "N/A"}
                            </span>
                          </td>
                          <td className="text-slate-800 ">
                            {c.correctiveAction || "-"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        <div className="report-ribbon mt-6">B. On-Spot Custom Observations</div>

        {/* Action Points Table */}
        <div className="overflow-x-auto mb-6">
          <table className="report-table">
            <thead>
              <tr className="bg-slate-200  border border-slate-400 dark:border-slate-600 text-slate-900  font-bold">
                <th className="text-center w-[50px]">
                  Sr No
                </th>
                <th className="">
                  Inspection Point
                </th>
                <th className="">Observation</th>
                <th className="">Action Required</th>
                <th className="">
                  Action Done / Status
                </th>
                <th className="">
                  Corrective Measures
                </th>
                <th className="">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {displayObservations && displayObservations.length > 0 ? (
                displayObservations.map((obs, idx) => (
                  <tr key={obs.id || idx} className="border border-slate-400 dark:border-slate-600">
                    <td className="text-center text-slate-800  font-medium">
                      {idx + 1}
                    </td>
                    <td className="font-semibold text-slate-900 ">
                      {obs.actionPoint}
                    </td>
                    <td className="text-slate-800 ">
                      {obs.observation || "N/A"}
                    </td>
                    <td className="text-slate-800 ">
                      {obs.actionRequired || "N/A"}
                    </td>
                    <td className="text-slate-800 ">
                      {obs.actionDone || "N/A"}
                    </td>
                    <td className="text-slate-800 ">
                      {obs.correctiveMeasures || "N/A"}
                    </td>
                    <td className="text-slate-800 ">
                      {obs.remarks || "N/A"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="border border-slate-400 dark:border-slate-600">
                  <td
                    colSpan={7}
                    className="p-4 text-center text-slate-500   italic"
                  >
                    No action points/observations recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Customer Feedback */}
        {customerFeedbackText && (
          <div className="mb-6">
            <div className="report-ribbon">Customer Feedback</div>
            <div className="report-feedback-box whitespace-pre-wrap font-medium">
              {customerFeedbackText}
            </div>
          </div>
        )}

        {/* Overall Suggestions */}
        {overallSuggestionsText && (
          <div className="mb-6">
            <div className="report-ribbon">Overall Suggestions</div>
            <div className="report-feedback-box whitespace-pre-wrap font-medium">
              {overallSuggestionsText}
            </div>
          </div>
        )}

        {/* Technical Snags/Observations */}
        {report.overallRemarks &&
          !report.overallRemarks.startsWith("Compiled report") ? (
          <div className="mb-6 text-sm">
            <span className="font-bold text-black ">
              Technical Snag's/Observations:
            </span>
            <span className="text-slate-800  ml-2">{report.overallRemarks}</span>
          </div>
        ) : null}

        {/* Site Visit Photos */}
        {allPhotos.length > 0 && (
          <div className="mb-6">
            <div className="report-ribbon">Site Visit Photos</div>
            <div className="grid grid-cols-2 gap-4">
              {allPhotos.map((photo, pIdx) => (
                <div
                  key={pIdx}
                  className="rounded-lg overflow-hidden border border-slate-300  bg-slate-50  aspect-video flex items-center justify-center"
                >
                  <img
                    src={photo}
                    alt={`Site Visit ${pIdx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Footer Meta */}
        <div className="pt-4 border-t border-slate-200  flex justify-between items-center text-[9px] text-slate-400  font-bold uppercase tracking-widest mt-6">
          <span>
            System Generated Report For Unique Delta Force Security Pvt. Ltd.
          </span>
        </div>
      </div>
    </div>
  );
}