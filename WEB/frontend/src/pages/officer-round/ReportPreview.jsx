import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Download, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStoredReports } from "./mockData";
import api from "../../services/api";
import html2pdf from "html2pdf.js";
import { toast } from "sonner";

const formatTo12Hour = (timeStr) => {
  if (!timeStr) return "N/A";
  return timeStr;
};

const RibbonHeader = ({ title }) => (
  <div className="relative inline-block mb-3 print:mb-2">
    <div className="text-[#1e3a8a] text-[10px] font-black uppercase tracking-widest border-b-2 border-[#1e3a8a] pb-0.5 select-none">
      {title}
    </div>
  </div>
);

export default function ReportPreview() {
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
        <Button onClick={() => navigate("/officer-rounds")} variant="outline">
          Back to Reports
        </Button>
      </div>
    );
  }

  const clientName = report.clientId
    ? clients.find((c) => c.id == report.clientId)?.name ||
    `Client #${report.clientId}`
    : "N/A";

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

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-8">
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
          onClick={() => navigate("/officer-rounds")}
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-2 w-fit"
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

      {/* A4 Sheet Container */}
      <div
        ref={reportRef}
        className="report-sheet"
      >
        {/* PDF Header matching screenshot layout */}
        <div className="border-b-2 border-[#1e3a8a] pb-3 mb-3">
          <div className="flex items-center gap-3 mb-3">
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
                FIELD OFFICER NIGHT ROUND REPORT
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
        <div className="mb-4">
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
              <span>Night Round</span>
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
          <div className="mb-4">
            <div className="report-ribbon">Guards Present on Duty</div>
            <div className="overflow-x-auto">
              <table className="report-table">
                <thead>
                  <tr className="bg-slate-200  border border-slate-400 dark:border-slate-600 text-slate-900  font-bold">
                    <th className="w-[50px] pl-4">
                      Sr No
                    </th>
                    <th className="">
                      Guard Name
                    </th>
                    <th className="">
                      Employee ID
                    </th>
                    <th className="w-28">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.guards
                    .filter((g) => g.present)
                    .map((guard, idx) => (
                      <tr key={guard.id || idx} className="border border-slate-400 dark:border-slate-600">
                        <td className="pl-4 text-slate-800  font-medium">
                          {idx + 1}
                        </td>
                        <td className="font-semibold text-slate-900 ">
                          {guard.name}
                        </td>
                        <td className="text-slate-800 ">
                          {guard.employeeId}
                        </td>
                        <td className="">
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

        {/* Inspection Checklist Table */}
        <div className="mb-4">
          <div className="report-ribbon">2. Inspection Checklist</div>
          <div className="overflow-x-auto">
            <table className="report-table">
              <thead>
                <tr className="bg-slate-200  border border-slate-400 dark:border-slate-600 text-slate-900  font-bold">
                  <th className="text-center w-16">SR. NO.</th>
                  <th className="">Inspection Item</th>
                  <th className="w-28">Answer</th>
                  <th className="">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {report.checklist &&
                  report.checklist.filter(
                    (q) =>
                      q.answer !== undefined &&
                      q.answer !== null &&
                      q.answer !== "" &&
                      (!Array.isArray(q.answer) || q.answer.length > 0),
                  ).length > 0 ? (
                  report.checklist
                    .filter(
                      (q) =>
                        q.answer !== undefined &&
                        q.answer !== null &&
                        q.answer !== "" &&
                        (!Array.isArray(q.answer) || q.answer.length > 0),
                    )
                    .map((q, idx) => (
                      <tr
                        key={q.id}
                        className="border border-slate-400 dark:border-slate-600"
                      >
                        <td className="text-center text-slate-800  font-medium w-16">
                          {idx + 1}
                        </td>
                        <td className="font-semibold text-slate-900 ">
                          {q.question}
                        </td>
                        <td className="">
                          <span className={getAnswerColor(q.answer)}>
                            {q.answer || "N/A"}
                          </span>
                        </td>
                        <td className="text-slate-800 ">
                          {q.remarks || "-"}
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-4 text-center text-muted-foreground italic"
                    >
                      No checklist items answered.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Photo Evidence Section */}
        {allPhotos.length > 0 && (
          <div className="mb-8 mt-6">
            <div className="report-ribbon">3. Photo Evidence</div>
            <div className="border border-slate-200 rounded-none p-4 bg-white shadow-sm">
              <div className="grid grid-cols-4 gap-3">
                {allPhotos.map((photo, pIdx) => (
                  <div
                    key={pIdx}
                    className="aspect-square rounded-none overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center"
                  >
                    <img
                      src={photo}
                      alt={`Evidence ${pIdx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Short Lecture & Random Checking side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="flex flex-col">
            <div className="report-ribbon">4. Short Lecture</div>
            <div className="border border-slate-200 rounded-none p-4 bg-white flex-1 shadow-sm text-xs text-slate-600 whitespace-pre-line min-h-[100px]">
              {report.lectureDetails || "N/A"}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="report-ribbon">5. Random Checking</div>
            <div className="border border-slate-200 rounded-none p-4 bg-white flex-1 shadow-sm text-xs text-slate-600 whitespace-pre-line min-h-[100px]">
              {report.randomChecking || "N/A"}
            </div>
          </div>
        </div>

        {/* Suggestions Panel */}
        <div className="mb-8">
          <div className="report-ribbon">6. Suggestions</div>
          <div className="border border-slate-200 rounded-none p-4 bg-white shadow-sm text-xs text-slate-600">
            {report.suggestions ? (
              <ul className="list-disc pl-5 space-y-1.5">
                {report.suggestions
                  .split("\n")
                  .filter((s) => s.trim())
                  .map((s, sIdx) => (
                    <li key={sIdx}>{s}</li>
                  ))}
              </ul>
            ) : (
              <p className="text-slate-500   italic">No suggestions recorded.</p>
            )}
          </div>
        </div>

        {/* Footer Meta */}
        <div className="pt-4 border-t border-slate-200  flex justify-between items-center text-[9px] text-slate-400  font-bold uppercase tracking-widest">
          <span>
            System Generated Report For Unique Delta Force Security Pvt. Ltd.
          </span>
        </div>
      </div>
    </div>
  );
}