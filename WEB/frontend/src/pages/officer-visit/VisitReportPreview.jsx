import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../../services/api";
import { getStoredVisitReports } from "../officer-round/mockData";

export default function VisitReportPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reportRef = useRef(null);
  const [report, setReport] = useState(null);
  const [clients, setClients] = useState([]);

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

  const formattedReportId = report
    ? `${clientName}-${report.unit}-OVR-${formatDateToDMY(report.visitDate)}-${report.reportNo}`
    : "report";

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
    return "text-slate-900 font-bold";
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
        <Button
          onClick={handlePrint}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 shadow-sm text-xs font-semibold"
        >
          <Printer className="h-4.5 w-4.5" /> Print Report
        </Button>
      </div>

      {/* Main Report Document Container */}
      <div
        ref={reportRef}
        className="bg-white border border-slate-300 rounded-lg p-10 shadow-md print:shadow-none print:border-none print:p-0 text-sm text-black"
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
              FIELD OFFICER VISIT REPORT
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

        {/* Header line */}
        <div className="border-t-[3px] border-blue-900 pt-4 mb-4">
          <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
            General Information
          </div>
        </div>

        {/* Info Box */}
        <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50 mb-8 grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 text-xs">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Client
            </span>
            <span className="text-slate-900 font-bold text-sm block">
              {clientName}
            </span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Inspection Date
            </span>
            <span className="text-slate-900 font-bold text-sm block">
              {report.visitDate}
            </span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Visit Type
            </span>
            <span className="text-blue-600 font-bold text-sm block">
              {report.visitType || "Scheduled"}
            </span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Shift
            </span>
            <span className="text-slate-900 font-bold text-sm block">
              {report.shift || "Morning"}
            </span>
          </div>

          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Unit / Site
            </span>
            <span className="text-slate-900 font-bold text-sm block">
              {report.unit || "N/A"}
            </span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Start Time
            </span>
            <span className="text-slate-900 font-bold text-sm block">
              {formatTo12Hour(report.startTime)}
            </span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              End Time
            </span>
            <span className="text-slate-900 font-bold text-sm block">
              {formatTo12Hour(report.endTime)}
            </span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
              <MapPin className="h-3 w-3 text-blue-600" /> GPS Location
            </span>
            <span className="text-slate-900 font-bold text-sm block">
              {report.gps || "N/A"}
            </span>
          </div>

          <div className="col-span-2 md:col-span-4">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Uploaded Photos
            </span>
            <span className="text-slate-900 font-bold text-sm block">
              {allPhotos.length}
            </span>
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

        {/* Pre-defined Checklist Section */}
        {report.checklist &&
          report.checklist.length > 0 &&
          report.checklist.some(
            (c) => c.id && c.id.toString().startsWith("pq_") && c.status && c.status.trim() !== ""
          ) && (
            <div className="mb-8">
              <div className="border-t-[3px] border-blue-900 pt-4 mb-4">
                <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
                  A. Pre-defined Checklist Answers
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
                        Inspection Point
                      </th>
                      <th className="p-2 border border-slate-400">
                        Observation
                      </th>
                      <th className="p-2 border border-slate-400 text-center w-28">
                        Status (OK/Not OK)
                      </th>
                      <th className="p-2 border border-slate-400">
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
                        <tr key={c.id || idx} className="border border-slate-400">
                          <td className="p-2 border border-slate-400 text-center text-slate-800 font-medium">
                            {idx + 1}
                          </td>
                          <td className="p-2 border border-slate-400 font-semibold text-slate-900">
                            {c.question} {c.required && <span className="text-rose-500 font-bold">*</span>}
                          </td>
                          <td className="p-2 border border-slate-400 text-slate-800">
                            {c.observation || "-"}
                          </td>
                          <td className="p-2 border border-slate-400 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                c.status === "OK"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : c.status === "Not OK"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : "bg-slate-100 text-slate-600 border border-slate-200"
                              }`}
                            >
                              {c.status || "N/A"}
                            </span>
                          </td>
                          <td className="p-2 border border-slate-400 text-slate-800">
                            {c.correctiveAction || "-"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        <div className="border-t-[3px] border-blue-900 pt-4 mb-4">
          <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
            B. On-Spot Custom Observations
          </div>
        </div>

        {/* Action Points Table */}
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-left border-collapse border border-slate-400 text-xs">
            <thead>
              <tr className="bg-slate-200 border border-slate-400 text-slate-900 font-bold">
                <th className="p-2 border border-slate-400 text-center w-[50px]">
                  Sr No
                </th>
                <th className="p-2 border border-slate-400">
                  Inspection Point
                </th>
                <th className="p-2 border border-slate-400">Observation</th>
                <th className="p-2 border border-slate-400">Action Required</th>
                <th className="p-2 border border-slate-400">
                  Action Done / Status
                </th>
                <th className="p-2 border border-slate-400">
                  Corrective Measures
                </th>
                <th className="p-2 border border-slate-400">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {displayObservations && displayObservations.length > 0 ? (
                displayObservations.map((obs, idx) => (
                  <tr key={obs.id || idx} className="border border-slate-400">
                    <td className="p-2 border border-slate-400 text-center text-slate-800 font-medium">
                      {idx + 1}
                    </td>
                    <td className="p-2 border border-slate-400 font-semibold text-slate-900">
                      {obs.actionPoint}
                    </td>
                    <td className="p-2 border border-slate-400 text-slate-800">
                      {obs.observation || "N/A"}
                    </td>
                    <td className="p-2 border border-slate-400 text-slate-800">
                      {obs.actionRequired || "N/A"}
                    </td>
                    <td className="p-2 border border-slate-400 text-slate-800">
                      {obs.actionDone || "N/A"}
                    </td>
                    <td className="p-2 border border-slate-400 text-slate-800">
                      {obs.correctiveMeasures || "N/A"}
                    </td>
                    <td className="p-2 border border-slate-400 text-slate-800">
                      {obs.remarks || "N/A"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="border border-slate-400">
                  <td
                    colSpan={7}
                    className="p-4 text-center text-slate-500 italic"
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
            <div className="border-t-[3px] border-blue-900 pt-4 mb-4">
              <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
                Customer Feedback
              </div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs whitespace-pre-wrap font-medium">
              {customerFeedbackText}
            </div>
          </div>
        )}

        {/* Overall Suggestions */}
        {overallSuggestionsText && (
          <div className="mb-6">
            <div className="border-t-[3px] border-blue-900 pt-4 mb-4">
              <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
                Overall Suggestions
              </div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs whitespace-pre-wrap font-medium">
              {overallSuggestionsText}
            </div>
          </div>
        )}

        {/* Technical Snags/Observations */}
        {report.overallRemarks &&
        !report.overallRemarks.startsWith("Compiled report") ? (
          <div className="mb-6 text-sm">
            <span className="font-bold text-black">
              Technical Snag's/Observations:
            </span>
            <span className="text-slate-800 ml-2">{report.overallRemarks}</span>
          </div>
        ) : null}

        {/* Site Visit Photos */}
        {allPhotos.length > 0 && (
          <div className="mb-6">
            <div className="border-t-[3px] border-blue-900 pt-4 mb-4">
              <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
                Site Visit Photos
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {allPhotos.map((photo, pIdx) => (
                <div
                  key={pIdx}
                  className="rounded-lg overflow-hidden border border-slate-300 bg-slate-50 aspect-video flex items-center justify-center"
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
