import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Download, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStoredReports } from "./mockData";
import api from "../../services/api";

const formatTo12Hour = (timeStr) => {
  if (!timeStr) return "N/A";
  return timeStr;
};

const RibbonHeader = ({ title }) => (
  <div className="relative inline-block mb-3 print:mb-2">
    <div className="bg-[#1e3a8a] text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-l-[4px] relative z-10 select-none">
      {title}
    </div>
    <div
      className="absolute top-0 right-[-10px] h-full w-[10px] bg-[#1e3a8a] z-0"
      style={{ clipPath: "polygon(0 0, 0 100%, 100% 100%)" }}
    />
  </div>
);

export default function ReportPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reportRef = useRef(null);
  const [report, setReport] = useState(null);
  const [clients, setClients] = useState([]);

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

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = formattedReportId;
    window.print();
    document.title = originalTitle;
  };

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

  const formattedReportId = `${clientName}-${report.unit}-ONR-${formatDateToDMY(report.visitDate)}-${report.reportNo}`;

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
    return "text-slate-900 font-bold";
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
          onClick={() => navigate("/officer-rounds")}
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-2 w-fit"
        >
          <ArrowLeft className="h-4.5 w-4.5" /> Back to Reports
        </Button>

        <div className="flex gap-2">
          <Button
            onClick={handlePrint}
            className="border-primary text-primary hover:bg-primary/5 flex items-center gap-2"
            variant="outline"
          >
            <Printer className="h-4.5 w-4.5" /> Print Report
          </Button>
          <Button
            onClick={handlePrint}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 rounded-full px-5"
          >
            <Download className="h-4.5 w-4.5" /> Download PDF
          </Button>
        </div>
      </div>

      {/* A4 Sheet Container */}
      <div
        ref={reportRef}
        className="bg-white text-slate-800 rounded-[14px] border shadow-md p-8 md:p-12 mx-auto w-full print:shadow-none print:border-none print:p-0 print:m-0 print:w-full print:bg-white"
      >
        {/* PDF Header */}
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
              <h2 className="text-sm font-extrabold tracking-tight text-slate-900 leading-none">
                Unique Delta Force Security Pvt. Ltd.
              </h2>
            </div>
          </div>

          <div className="text-center max-w-[40%]">
            <h3 className="text-xs font-black text-[#1e3a8a] uppercase tracking-wider border-b-2 border-[#1e3a8a] pb-1">
              FIELD OFFICER NIGHT ROUND REPORT
            </h3>
          </div>

          <div className="text-right max-w-[30%] shrink-0 pr-2">
            <span className="text-[8px] font-bold text-slate-400 uppercase block">
              Report ID
            </span>
            <span className="text-[10px] font-black text-blue-600 tracking-tight block break-all">
              {formattedReportId}
            </span>
          </div>
        </div>

        {/* General Information Block */}
        <div className="mb-6">
          <RibbonHeader title="General Information" />
          <div className="border border-slate-200 rounded-lg p-4 bg-white grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 shadow-sm text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Client
              </span>
              <span className="font-bold text-slate-900 block mb-1">
                {clientName}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Unit / Site
              </span>
              <span className="font-bold text-slate-900">{report.unit}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Inspection Date
              </span>
              <span className="font-bold text-slate-900">
                {report.visitDate}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Visit Type
              </span>
              <span
                className={`font-bold ${report.visitType === "Surprise" ? "text-rose-600" : "text-blue-600"}`}
              >
                {report.visitType}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Shift
              </span>
              <span className="font-bold text-slate-900">
                {report.shift || "Morning"}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Start Time
              </span>
              <span className="font-bold text-slate-900">
                {formatTo12Hour(report.startTime)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                End Time
              </span>
              <span className="font-bold text-slate-900">
                {formatTo12Hour(report.endTime)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Officer Name
              </span>
              <span className="font-bold text-slate-900">{report.officer}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-0.5">
                <MapPin className="h-3 w-3 text-blue-600" /> GPS Location
              </span>
              <span
                className="font-bold text-slate-900 truncate block"
                title={report.gps}
              >
                {report.gps || "N/A"}
              </span>
            </div>

            <div className="col-span-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Uploaded Photos
              </span>
              <span className="font-bold text-slate-900">
                {allPhotos.length}
              </span>
            </div>
          </div>
        </div>

        {/* Guards Present Section */}
        {report.guards && report.guards.filter((g) => g.present).length > 0 && (
          <div className="mb-8">
            <div className="border-t-[3px] border-blue-900 pt-4 mb-4">
              <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
                Guards Present on Duty
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-400 text-xs">
                <thead>
                  <tr className="bg-slate-200 border border-slate-400 text-slate-900 font-bold">
                    <th className="p-2 border border-slate-400 text-center w-[50px]">
                      Sr No
                    </th>
                    <th className="p-2 border border-slate-400">
                      Guard Name
                    </th>
                    <th className="p-2 border border-slate-400">
                      Employee ID / ID
                    </th>
                    <th className="p-2 border border-slate-400 text-center w-28">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.guards
                    .filter((g) => g.present)
                    .map((guard, idx) => (
                      <tr key={guard.id || idx} className="border border-slate-400">
                        <td className="p-2 border border-slate-400 text-center text-slate-800 font-medium">
                          {idx + 1}
                        </td>
                        <td className="p-2 border border-slate-400 font-semibold text-slate-900">
                          {guard.name}
                        </td>
                        <td className="p-2 border border-slate-400 text-slate-800">
                          {guard.employeeId}
                        </td>
                        <td className="p-2 border border-slate-400 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
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
        <div className="mb-6">
          <RibbonHeader title="2. Inspection Checklist" />
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-left text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3 pl-4 w-12">#</th>
                  <th className="p-3">Inspection Item</th>
                  <th className="p-3 w-32">Answer</th>
                  <th className="p-3 pr-4">Remarks</th>
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
                        className="border-b last:border-0 hover:bg-slate-50/50"
                      >
                        <td className="p-3 pl-4 font-semibold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="p-3 font-semibold text-slate-900">
                          {q.question}
                        </td>
                        <td className="p-3">
                          <span className={getAnswerColor(q.answer)}>
                            {q.answer || "N/A"}
                          </span>
                        </td>
                        <td className="p-3 pr-4 text-slate-500 italic font-medium">
                          {q.remarks || ""}
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
          <div className="mb-6">
            <RibbonHeader title="3. Photo Evidence" />
            <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
              <div className="grid grid-cols-4 gap-4">
                {allPhotos.map((photo, pIdx) => (
                  <div
                    key={pIdx}
                    className="aspect-square rounded-md overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="flex flex-col">
            <RibbonHeader title="4. Short Lecture" />
            <div className="border border-slate-200 rounded-lg p-4 bg-white flex-1 shadow-sm text-xs text-slate-600 whitespace-pre-line min-h-[100px]">
              {report.lectureDetails || "N/A"}
            </div>
          </div>

          <div className="flex flex-col">
            <RibbonHeader title="5. Random Checking" />
            <div className="border border-slate-200 rounded-lg p-4 bg-white flex-1 shadow-sm text-xs text-slate-600 whitespace-pre-line min-h-[100px]">
              {report.randomChecking || "N/A"}
            </div>
          </div>
        </div>

        {/* Suggestions Panel */}
        <div className="mb-8">
          <RibbonHeader title="6. Suggestions" />
          <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm text-xs text-slate-600">
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
              <p className="text-slate-500 italic">No suggestions recorded.</p>
            )}
          </div>
        </div>

        {/* Date and Time Footer Block */}
        <div className="flex flex-col items-end justify-end pt-6 border-t text-right mb-6">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
            Date & Time
          </span>
          <span className="text-xs font-black text-slate-900 mt-0.5">
            {report.visitDate}, {formatTo12Hour(report.endTime)}
          </span>
        </div>

        {/* Footer Meta */}
        <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase tracking-widest">
          <span>
            Generated by Unique Delta Force Security Pvt. Ltd. Inspection System
          </span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}
