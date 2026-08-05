import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPin,
  Plus,
  Upload,
  Layers,
  Trash2,
  Edit,
  Clock,
  UserPlus,
  Search,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getStoredVisitReports,
  saveStoredVisitReports,
} from "../officer-round/mockData";
import api from "../../services/api";

const PRE_DEFINED_QUESTIONS = [
  { id: "pq_1", question: "Security manpower available as per deployment" },
  { id: "pq_2", question: "Guards in proper uniform, ID card & grooming" },
  { id: "pq_3", question: "Attendance & biometric verified" },
  { id: "pq_4", question: "All security posts properly manned" },
  { id: "pq_5", question: "Gate frisking carried out as per SOP" },
  { id: "pq_6", question: "Visitor management system followed" },
  { id: "pq_7", question: "Material inward/outward checking" },
  { id: "pq_8", question: "Vehicle checking procedure followed" },
  { id: "pq_9", question: "CCTV cameras functioning properly" },
  { id: "pq_10", question: "CCTV operator alert and monitoring live feed" },
  { id: "pq_11", question: "Access Control System working" },
  { id: "pq_12", question: "Fire alarm panel healthy" },
  { id: "pq_13", question: "Fire extinguishers available and valid" },
  { id: "pq_14", question: "Emergency exits free from obstruction" },
  { id: "pq_15", question: "First Aid Box available and updated" },
  { id: "pq_16", question: "Communication devices (Wireless/Mobile) working" },
  { id: "pq_17", question: "Key register maintained properly" },
  { id: "pq_18", question: "Incident register updated" },
  { id: "pq_19", question: "Daily occurrence book updated" },
  { id: "pq_20", question: "Visitor pass reconciliation completed" },
  { id: "pq_21", question: "Parking area under control" },
  { id: "pq_22", question: "Loading/Unloading area secured" },
  { id: "pq_23", question: "Housekeeping around security posts satisfactory" },
  { id: "pq_24", question: "Emergency contact numbers displayed" },
];

const STEPS = [
  { id: 1, name: "General Info" },
  { id: 2, name: "Guards" },
  { id: 3, name: "Observations" },
  { id: 4, name: "Customer Feedback" },
  { id: 5, name: "Overall Suggestion" },
  { id: 6, name: "Review" },
];

export function TimePicker24({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hour, min] = (value || "00:00").split(":");
  const hours = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, "0"),
  );
  const minutes = Array.from({ length: 60 }, (_, i) =>
    String(i).padStart(2, "0"),
  );

  const handleHourSelect = (h) => {
    onChange(`${h}:${min || "00"}`);
  };

  const handleMinSelect = (m) => {
    onChange(`${hour || "00"}:${m}`);
  };

  const handleInputChange = (val) => {
    let clean = val.replace(/[^0-9:]/g, "");
    if (clean.length > 5) return;
    if (
      clean.length === 2 &&
      !value.includes(":") &&
      val.length > value.length
    ) {
      clean = clean + ":";
    }
    if (clean.length >= 2) {
      const hours = parseInt(clean.slice(0, 2), 10);
      if (hours > 23) {
        clean = "23" + clean.slice(2);
      }
    }
    if (clean.length === 5) {
      const mins = parseInt(clean.slice(3, 5), 10);
      if (mins > 59) {
        clean = clean.slice(0, 3) + "59";
      }
    }
    onChange(clean);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            type="text"
            placeholder="HH:MM"
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setIsOpen(true)}
            className="h-10 border-border rounded-lg text-sm pr-10 bg-background/50 cursor-pointer"
          />

          <button
            type="button"
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
            onClick={() => setIsOpen(true)}
          >
            <Clock className="h-4 w-4" />
          </button>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-3 rounded-xl border border-border bg-card shadow-xl"
        align="start"
      >
        <div className="text-center font-semibold text-xs border-b pb-2 mb-2 text-foreground">
          Select Time (24h)
        </div>
        <div className="grid grid-cols-2 gap-2 h-48">
          <div>
            <div className="text-[10px] text-center font-bold text-muted-foreground uppercase mb-1">
              Hour
            </div>
            <div className="h-40 overflow-y-auto pr-1 flex flex-col gap-0.5 scrollbar-thin">
              {hours.map((h) => {
                const isSelected = h === hour;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleHourSelect(h)}
                    className={`text-xs py-1.5 px-2 rounded-md font-medium text-center transition-colors w-full ${
                      isSelected
                        ? "bg-blue-600 text-white font-bold"
                        : "text-foreground hover:bg-muted/80"
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-center font-bold text-muted-foreground uppercase mb-1">
              Min
            </div>
            <div className="h-40 overflow-y-auto pr-1 flex flex-col gap-0.5 scrollbar-thin">
              {minutes.map((m) => {
                const isSelected = m === min;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleMinSelect(m)}
                    className={`text-xs py-1.5 px-2 rounded-md font-medium text-center transition-colors w-full ${
                      isSelected
                        ? "bg-blue-600 text-white font-bold"
                        : "text-foreground hover:bg-muted/80"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="border-t pt-2 mt-2 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="h-7 text-[10px] px-2.5 rounded-md"
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function CreateOfficerVisitReport() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Pre-defined Checklist State
  const randomizeMandatoryQuestions = (qs, count = 10) => {
    return qs;
  };

  const [preDefinedAnswers, setPreDefinedAnswers] = useState(() =>
    randomizeMandatoryQuestions(
      PRE_DEFINED_QUESTIONS.map((q) => ({
        id: q.id,
        question: q.question,
        status: "", // Set default status to empty
        observation: "",
        correctiveAction: "",
        required: false,
      }))
    )
  );

  // STEP 1: General Info
  const [reportNo, setReportNo] = useState("");
  const [visitDate, setVisitDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [visitType, setVisitType] = useState("Scheduled");
  const [officerName, setOfficerName] = useState("");
  const [shift, setShift] = useState("Morning");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [gpsLocation, setGpsLocation] = useState("18.601955, 73.825619");
  // Client & Site selection
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [clientId, setClientId] = useState(null);
  const [siteId, setSiteId] = useState(null);

  // Prefill fields from dashboard schedule if query parameters are provided
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pClientId = urlParams.get("clientId");
    const pSiteId = urlParams.get("siteId");
    const pType = urlParams.get("type");
    
    if (pClientId) {
      setClientId(parseInt(pClientId, 10));
    }
    if (pSiteId) {
      setSiteId(parseInt(pSiteId, 10));
    }
    if (pType) {
      setVisitType(pType);
    } else if (urlParams.get("plannedId")) {
      setVisitType("Scheduled");
    }
  }, []);

  // STEP 2: Guards Present on Duty
  const [guards, setGuards] = useState([]);
  const [guardSearch, setGuardSearch] = useState("");
  const [isAddGuardOpen, setIsAddGuardOpen] = useState(false);
  const [newGuardName, setNewGuardName] = useState("");
  const [newGuardEmpId, setNewGuardEmpId] = useState("");

  const handleAddTemporaryGuard = () => {
    if (!newGuardName || !newGuardEmpId) return;
    const newGuard = {
      id: `temp-${Date.now()}`,
      name: newGuardName,
      employeeId: newGuardEmpId,
      present: true,
    };
    setGuards([...guards, newGuard]);
    setNewGuardName("");
    setNewGuardEmpId("");
    setIsAddGuardOpen(false);
  };

  const toggleGuardAttendance = (id, isPresent) => {
    setGuards(
      guards.map((g) => (g.id === id ? { ...g, present: isPresent } : g))
    );
  };

  // STEP 3: Inspection Checklist Questions
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [questions, setQuestions] = useState([]);

  // STEP 4: Lecture / Training & Random Checking
  const [lectureDetails, setLectureDetails] = useState("");
  const [randomChecking, setRandomChecking] = useState("");
  const [overallRemarks, setOverallRemarks] = useState("");

  // STEP 5: Suggestions & Customer Feedback
  const [suggestions, setSuggestions] = useState("");
  const [customerFeedback, setCustomerFeedback] = useState("");

  // STEP 6: Observations List State
  const [reportObservations, setReportObservations] = useState([]);
  // Observation Modal state
  const [isAddObsOpen, setIsAddObsOpen] = useState(false);
  const [obsActionPoint, setObsActionPoint] = useState("");
  const [obsCustomActionPoint, setObsCustomActionPoint] = useState("");
  const [obsUseCustomActionPoint, setObsUseCustomActionPoint] = useState(false);
  const [obsObservation, setObsObservation] = useState("");
  const [obsActionRequired, setObsActionRequired] = useState("");
  const [obsActionDone, setObsActionDone] = useState("");
  const [obsCorrectiveMeasures, setObsCorrectiveMeasures] = useState("");
  const [obsRemarks, setObsRemarks] = useState("");
  const [obsPhotos, setObsPhotos] = useState([]);
  const [editingObsId, setEditingObsId] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);

  // Load clients on mount
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const compRes = await api.get("/assessments/clients");
        setCompanies(compRes.data || []);
      } catch (error) {
        console.error("Failed to load clients", error);
      }
    };
    loadCompanies();
  }, []);

  // Load sites when clientId changes
  useEffect(() => {
    const loadSites = async () => {
      if (clientId) {
        try {
          const siteRes = await api.get(
            `/assessments/sites?company_id=${clientId}&all_sites=true`,
          );
          setSites(siteRes.data || []);
        } catch (error) {
          console.error("Failed to load sites", error);
        }
      } else {
        setSites([]);
      }
    };
    loadSites();
  }, [clientId]);

  // Load checkpoints when siteId changes
  useEffect(() => {
    const loadCheckpoints = async () => {
      if (siteId) {
        try {
          const res = await api.get(`/locations/checkpoints?site_id=${siteId}`);
          setCheckpoints(res.data || []);
        } catch (err) {
          console.error("Failed to load checkpoints:", err);
        }
      } else {
        setCheckpoints([]);
      }
    };
    loadCheckpoints();
  }, [siteId]);

  // Load checkpoints/guards when siteId changes
  useEffect(() => {
    const loadGuardsForSite = async () => {
      if (siteId) {
        try {
          const res = await api.get(`/assessments/guards?site_id=${siteId}`);
          if (res.data && res.data.length > 0) {
            setGuards(
              res.data.map((emp, idx) => ({
                id: emp.id?.toString() || `g_${idx + 1}`,
                name: emp.name,
                employeeId: emp.employeeId || emp.employee_id || `EMP-${idx + 100}`,
                present: true,
              })),
            );
          } else {
            // Seed defaults if site has no custom employees
            setGuards([
              {
                id: "g_1",
                name: "Rajesh Kumar",
                employeeId: "EMP001",
                present: true,
              },
              {
                id: "g_2",
                name: "Priyansh Sharma",
                employeeId: "EMP002",
                present: true,
              },
              {
                id: "g_3",
                name: "Amit Patel",
                employeeId: "EMP003",
                present: true,
              },
              {
                id: "g_4",
                name: "Sneha Gupta",
                employeeId: "EMP004",
                present: true,
              },
            ]);
          }
        } catch (error) {
          console.error("Failed to load employees/guards", error);
        }
      }
    };
    loadGuardsForSite();
  }, [siteId]);

  // Load Officer Day Visit template questions dynamically
  useEffect(() => {
    const loadVisitTemplate = async () => {
      if (!isEditMode) {
        try {
          const res = await api.get("/officer-visits/templates");
          if (res.data && res.data.length > 0) {
            const defaultTemp = res.data[0];
            if (
              defaultTemp &&
              defaultTemp.questions &&
              defaultTemp.questions.length > 0
            ) {
              setPreDefinedAnswers(
                randomizeMandatoryQuestions(
                  defaultTemp.questions.map((q) => ({
                    id: q.id,
                    question: q.question,
                    status: "",
                    observation: "",
                    correctiveAction: "",
                    required: !!q.required,
                  }))
                )
              );
            }
          } else {
            setPreDefinedAnswers(
              randomizeMandatoryQuestions(
                PRE_DEFINED_QUESTIONS.map((q) => ({
                  id: q.id,
                  question: q.question,
                  status: "",
                  observation: "",
                  correctiveAction: "",
                  required: false,
                }))
              )
            );
          }
        } catch (err) {
          console.error("Failed to load visit template, falling back:", err);
          setPreDefinedAnswers(
            randomizeMandatoryQuestions(
              PRE_DEFINED_QUESTIONS.map((q) => ({
                id: q.id,
                question: q.question,
                status: "",
                observation: "",
                correctiveAction: "",
                required: false,
              }))
            )
          );
        }
      }
    };
    loadVisitTemplate();
  }, [isEditMode]);

  // Load templates on step 3 transition
  useEffect(() => {
    if (currentStep === 3) {
      const loadTemplates = async () => {
        try {
          const res = await api.get("/officer-visits/templates");
          setTemplates(res.data || []);
          if (res.data && res.data.length > 0 && !selectedTemplateId) {
            setSelectedTemplateId(res.data[0].id);
          }
        } catch (err) {
          console.error("Failed to load templates:", err);
        }
      };
      loadTemplates();
    }
  }, [currentStep]);

  // Populate checklist questions from selected template
  useEffect(() => {
    if (selectedTemplateId && templates.length > 0) {
      const match = templates.find((t) => t.id === selectedTemplateId);
      if (match && match.questions) {
        if (!isEditMode || questions.length === 0) {
          const mappedQ = match.questions.map((q) => ({
            id: q.id,
            section: q.section,
            question: q.question,
            answerType: q.answerType || "yes_no",
            required: q.required || false,
            photoRequired: q.photoRequired || false,
            gpsRequired: q.gpsRequired || false,
            remarksAllowed: q.remarksAllowed || false,
            options: q.options || [],
            answer: q.answerType === "checkbox" ? [] : "",
            remarks: "",
            photo: undefined,
            photos: [],
          }));
          setQuestions(mappedQ);
        }
      }
    }
  }, [selectedTemplateId, templates]);

  // Load report data if editing
  useEffect(() => {
    if (isEditMode) {
      const loadReportData = async () => {
        const populateFromData = (report) => {
          setReportNo(report.reportNo);
          setVisitDate(report.visitDate);
          setVisitType(report.visitType);
          setOfficerName(report.officer);
          setShift(report.shift);
          setStartTime(report.startTime);
          setEndTime(report.endTime);
          setGpsLocation(report.gps);
          setClientId(report.clientId || null);
          setSiteId(report.siteId || null);
          if (report.suggestions) {
            try {
              const parsed = JSON.parse(report.suggestions);
              if (parsed && typeof parsed === "object") {
                setCustomerFeedback(parsed.customerFeedback || "");
                setSuggestions(parsed.overallSuggestions || "");
              } else {
                setCustomerFeedback("");
                setSuggestions(report.suggestions);
              }
            } catch (e) {
              setCustomerFeedback("");
              setSuggestions(report.suggestions);
            }
          } else {
            setCustomerFeedback("");
            setSuggestions("");
          }
          if (report.checklist && report.checklist.length > 0) {
            const hasPredefined = report.checklist.some(
              (c) => c.id && c.id.toString().startsWith("pq_"),
            );
            if (hasPredefined) {
              setPreDefinedAnswers(report.checklist);
            } else {
              setReportObservations(
                report.checklist.map((c) => ({
                  id: c.id || `obs-${Math.random()}`,
                  actionPoint: c.question || c.actionPoint || "Unknown Point",
                  observation: c.answer || c.observation || "",
                  correctiveMeasures: c.remarks || c.correctiveMeasures || "",
                  photos: c.photos || (c.photo ? [c.photo] : []),
                  actionRequired: c.actionRequired || "",
                  actionDone: c.actionDone || "",
                  remarks: c.remarks || "",
                })),
              );
            }
          }
          if (report.observations && report.observations.length > 0) {
            setReportObservations(report.observations);
          }
        };

        try {
          const res = await api.get(`/officer-visits/reports/${id}`);
          populateFromData(res.data);
        } catch (err) {
          console.error(
            "Failed to load report for edit, falling back to localStorage:",
            err,
          );
          const localReps = getStoredVisitReports();
          const match = localReps.find((r) => r.id === id);
          if (match) {
            populateFromData(match);
          }
        }
      };
      loadReportData();
    } else {
      const initNewReport = async () => {
        try {
          const res = await api.get("/officer-visits/reports");
          const count = (res.data || []).length;
          const nextNum = (count + 1).toString().padStart(3, "0");
          setReportNo(`OV-${new Date().getFullYear()}-${nextNum}`);
        } catch (e) {
          setReportNo(
            `OV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
          );
        }
      };
      initNewReport();
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            setGpsLocation(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
          },
          (error) => {
            console.error("Error getting geolocation:", error);
          },
        );
      }
      const token = sessionStorage.getItem("access_token");
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split(".")[1]));
          setOfficerName(payload.name || payload.username || "Field Officer");
        } catch (e) {
          setOfficerName("Field Officer");
        }
      } else {
        setOfficerName("Field Officer");
      }
    }
  }, [id, isEditMode]);

  // Handle Photo Upload inside Observation Dialog modal
  const handleObsPhotoUpload = (file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setObsPhotos((prev) => [...prev, base64String]);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoUploadForPQ = (pqId, file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setPreDefinedAnswers((prev) =>
        prev.map((item) => {
          if (item.id === pqId) {
            const currentPhotos =
              item.photos || (item.photo ? [item.photo] : []);
            return {
              ...item,
              photos: [...currentPhotos, base64String],
              photo: base64String,
            };
          }
          return item;
        }),
      );
    };
    reader.readAsDataURL(file);
  };

  const handleSaveReport = async (status) => {
    if (!clientId || !siteId) {
      alert("Client and Site selection is compulsory.");
      return;
    }
    
    if (status === "Completed") {
      const unansweredMandatory = preDefinedAnswers.filter(
        (q) => q.required && (!q.status || q.status.trim() === "")
      );
      if (unansweredMandatory.length > 0) {
        alert(
          "Please answer all mandatory questions (*) before completing the report."
        );
        return;
      }
    }
    
    // Update planned visit status if we started from dashboard schedule
    const pId = new URLSearchParams(window.location.search).get("plannedId");
    if (status === "Completed" && pId) {
      try {
        const stored = localStorage.getItem("planned_visits");
        if (stored) {
          const list = JSON.parse(stored);
          const updated = list.map((item) =>
            item.id === pId ? { ...item, status: "Completed" } : item
          );
          localStorage.setItem("planned_visits", JSON.stringify(updated));
        }
      } catch (e) {
        console.error("Failed to update planned visit status", e);
      }
    }
    
    setLoading(true);
    const targetUnit =
      sites.find((s) => s.id === siteId)?.name || "Unknown Site";
    const payload = {
      id: isEditMode ? id : `rep-${Date.now()}`,
      reportNo,
      unit: targetUnit,
      clientId,
      siteId,
      visitDate,
      visitType,
      officer: officerName,
      shift,
      startTime,
      endTime,
      gps: gpsLocation,
      guards: guards,
      checklist: preDefinedAnswers,
      lectureDetails,
      randomChecking,
      overallRemarks,
      suggestions: JSON.stringify({
        customerFeedback,
        overallSuggestions: suggestions,
      }),
      observations: reportObservations,
      status,
      createdOn: isEditMode ? undefined : new Date().toLocaleString(),
    };

    try {
      await api.post("/officer-visits/reports", payload);
      navigate("/officer-visit/reports");
    } catch (err) {
      console.error(
        "Failed to save report to API, falling back to localStorage:",
        err,
      );
      const stored = getStoredVisitReports();
      const exists = stored.some((r) => r.id === payload.id);
      let updated;
      if (exists) {
        updated = stored.map((r) =>
          r.id === payload.id ? { ...r, ...payload } : r,
        );
      } else {
        updated = [...stored, payload];
      }
      saveStoredVisitReports(updated);
      navigate("/officer-visit/reports");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveObservation = (e) => {
    e.preventDefault();
    if (!obsObservation) {
      alert("Please provide the observation details.");
      return;
    }
    const finalActionPoint = obsUseCustomActionPoint
      ? obsCustomActionPoint
      : obsActionPoint;
    if (!finalActionPoint) {
      alert("Please select or enter an Inspection Point.");
      return;
    }

    if (editingObsId) {
      setReportObservations((prev) =>
        prev.map((item) => {
          if (item.id === editingObsId) {
            return {
              ...item,
              actionPoint: finalActionPoint,
              observation: obsObservation,
              actionRequired: obsActionRequired,
              actionDone: obsActionDone,
              correctiveMeasures: obsCorrectiveMeasures,
              remarks: obsRemarks,
              photos: obsPhotos,
            };
          }
          return item;
        }),
      );
    } else {
      const newObs = {
        id: `obs-${Date.now()}`,
        actionPoint: finalActionPoint,
        observation: obsObservation,
        actionRequired: obsActionRequired,
        actionDone: obsActionDone,
        correctiveMeasures: obsCorrectiveMeasures,
        remarks: obsRemarks,
        photos: obsPhotos,
      };
      setReportObservations((prev) => [...prev, newObs]);
    }

    setIsAddObsOpen(false);
    resetObsForm();
  };

  const handleEditObservation = (obs) => {
    setEditingObsId(obs.id);
    const matchesDefaultList = checkpoints.some(
      (cp) => cp.name === obs.actionPoint,
    );
    if (matchesDefaultList) {
      setObsActionPoint(obs.actionPoint);
      setObsUseCustomActionPoint(false);
    } else {
      setObsCustomActionPoint(obs.actionPoint);
      setObsUseCustomActionPoint(true);
    }
    setObsObservation(obs.observation || "");
    setObsActionRequired(obs.actionRequired || "");
    setObsActionDone(obs.actionDone || "");
    setObsCorrectiveMeasures(obs.correctiveMeasures || "");
    setObsRemarks(obs.remarks || "");
    setObsPhotos(obs.photos || []);
    setIsAddObsOpen(true);
  };

  const resetObsForm = () => {
    setObsActionPoint("");
    setObsCustomActionPoint("");
    setObsUseCustomActionPoint(false);
    setObsObservation("");
    setObsActionRequired("");
    setObsActionDone("");
    setObsCorrectiveMeasures("");
    setObsRemarks("");
    setObsPhotos([]);
    setEditingObsId(null);
  };

  const filteredGuards = guards.filter(
    (g) =>
      g.name.toLowerCase().includes(guardSearch.toLowerCase()) ||
      g.employeeId.toLowerCase().includes(guardSearch.toLowerCase())
  );

  const nextStep = () => {
    if (currentStep === 1 && (!clientId || !siteId)) {
      alert("Client and Site selection is compulsory.");
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, 6));
  };

  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Title block */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => navigate(-1)}
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-lg border-border hover:bg-slate-50 dark:bg-slate-900/50"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {isEditMode ? "Edit Visit Report" : "New Visit Report"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {reportNo} • Log administrative checking rounds.
          </p>
        </div>
      </div>
      {/* Stepper Header */}
      <div className="bg-card border border-border rounded-2xl py-4 px-6 shadow-sm flex items-center justify-center overflow-x-auto w-full">
        <div className="flex items-center gap-6 w-full max-w-4xl justify-between relative min-w-[500px] py-1">
          {/* Background line */}
          <div className="absolute top-4 left-[38px] right-[38px] h-0.5 bg-muted z-0" />
          {/* Active progress line */}
          <div
            className="absolute top-4 left-[38px] h-0.5 bg-emerald-500 transition-all duration-300 z-0"
            style={{
              width: `calc(${((currentStep - 1) / (STEPS.length - 1)) * 100}% - ${((currentStep - 1) / (STEPS.length - 1)) * 76}px)`,
            }}
          />

          {STEPS.map((step, index) => {
            const stepNumber = index + 1;
            const isActive = currentStep === stepNumber;
            const isDone = currentStep > stepNumber;
            return (
              <button
                key={step.name}
                onClick={() => {
                  if (stepNumber > 1 && (!clientId || !siteId)) {
                    alert("Please select Client and Site first.");
                    return;
                  }
                  setCurrentStep(stepNumber);
                }}
                className="flex flex-col items-center gap-1.5 relative z-10 group cursor-pointer"
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all text-xs font-semibold ${
                    isActive || isDone
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "bg-card border-border text-muted-foreground"
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : stepNumber}
                </div>
                <span
                  className={`text-xs ${isActive ? "text-blue-600 dark:text-blue-400 font-bold" : "text-muted-foreground font-normal"}`}
                >
                  {step.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {/* STEP 1: General Info */}
      {currentStep === 1 && (
        <Card className="rounded-[14px] border border-border bg-card shadow-sm">
          <CardHeader className="border-b pb-4 px-6">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Layers className="h-4.5 w-4.5 text-blue-600" /> General Visit
              Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-600 dark:text-slate-300 font-semibold">
                  Client Name <span className="text-red-500">*</span>
                </label>
                <Select
                  value={clientId?.toString() || "none"}
                  onValueChange={(v) => {
                    setClientId(v === "none" ? null : parseInt(v));
                    setSiteId(null);
                  }}
                >
                  <SelectTrigger className="h-10 border-border rounded-lg bg-background text-foreground text-sm font-normal">
                    <SelectValue placeholder="Select a client..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose a client...</SelectItem>
                    {companies.map((company) => (
                      <SelectItem
                        key={company.id}
                        value={company.id.toString()}
                      >
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-600 dark:text-slate-300 font-semibold">
                  Target Site <span className="text-red-500">*</span>
                </label>
                <Select
                  value={siteId?.toString() || "none"}
                  onValueChange={(v) =>
                    setSiteId(v === "none" ? null : parseInt(v))
                  }
                  disabled={!clientId}
                >
                  <SelectTrigger className="h-10 border-border rounded-lg bg-background text-foreground text-sm font-normal">
                    <SelectValue
                      placeholder={
                        clientId
                          ? "Select target site..."
                          : "Select client first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose a location...</SelectItem>
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id.toString()}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-600 dark:text-slate-300 font-semibold">
                  Inspection Date
                </label>
                <Input
                  type="date"
                  value={visitDate}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setVisitDate(e.target.value)}
                  className="h-10 border-border rounded-lg text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-600 dark:text-slate-300 font-semibold">
                  Visit Type
                </label>
                <Select
                  value={visitType}
                  onValueChange={(v) => setVisitType(v)}
                >
                  <SelectTrigger className="h-10 border border-border rounded-lg bg-background text-foreground text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Scheduled">Scheduled Visit</SelectItem>
                    <SelectItem value="Surprise">Surprise Round</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-600 dark:text-slate-300 font-semibold">
                  Shift Name
                </label>
                <Select value={shift} onValueChange={setShift}>
                  <SelectTrigger className="h-10 border border-border rounded-lg bg-background text-foreground text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Morning">Morning Shift</SelectItem>
                    <SelectItem value="Evening">Evening Shift</SelectItem>
                    <SelectItem value="Night A">Night Shift (A)</SelectItem>
                    <SelectItem value="Night B">Night Shift (B)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-600 dark:text-slate-300 font-semibold">
                  Start Time
                </label>
                <TimePicker24 value={startTime} onChange={setStartTime} />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-600 dark:text-slate-300 font-semibold">End Time</label>
                <TimePicker24 value={endTime} onChange={setEndTime} />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-600 dark:text-slate-300 font-semibold">
                  Officer Name
                </label>
                <Input
                  value={officerName}
                  onChange={(e) => setOfficerName(e.target.value)}
                  placeholder="Officer Name"
                  className="h-10 border-border rounded-lg text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-blue-600" /> GPS
                  Coordinates
                </label>
                <Input
                  value={gpsLocation}
                  onChange={(e) => setGpsLocation(e.target.value)}
                  placeholder="Latitude, Longitude"
                  className="h-10 border-border rounded-lg text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}{" "}
      {/* STEP 2: Guards Attendance */}
      {currentStep === 2 && (
        <Card className="rounded-[14px] border border-border bg-card shadow-sm text-xs">
          <CardContent className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b">
              <h3 className="text-sm font-bold text-foreground">
                Guards Present On Duty
              </h3>
              <Button
                onClick={() => setIsAddGuardOpen(true)}
                variant="outline"
                className="border-primary text-primary hover:bg-primary/5 rounded-lg flex items-center gap-2 h-9 text-xs"
              >
                <Plus className="h-4 w-4" /> Add Temporary Guard
              </Button>
            </div>

            {/* Guard Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search guards by name or ID..."
                value={guardSearch}
                onChange={(e) => setGuardSearch(e.target.value)}
                className="pl-9 pr-4 h-9 text-xs"
              />
            </div>

            {/* Guards Table */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Employee ID</TableHead>
                    <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Guard Name</TableHead>
                    <TableHead className="text-center font-semibold text-slate-700 dark:text-slate-200">Status Choice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGuards.map((guard) => (
                    <TableRow key={guard.id}>
                      <TableCell className="font-semibold text-primary">
                        {guard.employeeId}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {guard.name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            onClick={() =>
                              toggleGuardAttendance(guard.id, true)
                            }
                            variant={guard.present ? "default" : "outline"}
                            size="sm"
                            className={`rounded-lg px-3 h-7 text-[10px] ${guard.present ? "bg-emerald-500 hover:bg-emerald-600 text-white" : ""}`}
                          >
                            Present
                          </Button>
                          <Button
                            onClick={() =>
                              toggleGuardAttendance(guard.id, false)
                            }
                            variant={!guard.present ? "default" : "outline"}
                            size="sm"
                            className={`rounded-lg px-3 h-7 text-[10px] ${!guard.present ? "bg-rose-500 hover:bg-rose-600 text-white" : ""}`}
                          >
                            Absent
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      {/* STEP 3: Add Observations */}
      {currentStep === 3 && (
        <div className="space-y-6">
          {/* Section A: Pre-defined Checklist */}
          <Card className="rounded-[14px] border border-border bg-card shadow-sm">
            <CardHeader className="border-b pb-4 px-6">
              <CardTitle className="text-sm font-bold text-foreground">
                A. Pre-defined Checklist
              </CardTitle>
              <CardDescription className="text-[11px]">
                Inspect and answer the following standard check points.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {preDefinedAnswers.map((pq, idx) => (
                <div
                  key={pq.id}
                  className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                      {idx + 1}. {pq.question} {pq.required && <span className="text-rose-500 font-bold">*</span>}
                    </span>
                    <div className="flex gap-1.5 shrink-0">
                      {["OK", "Not OK", "N/A"].map((statusOption) => {
                        const isSelected = pq.status === statusOption;
                        let btnStyle =
                          "border-border text-muted-foreground hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-800";
                        if (isSelected) {
                          if (statusOption === "OK")
                            btnStyle =
                              "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500";
                          else if (statusOption === "Not OK")
                            btnStyle =
                              "bg-rose-500 hover:bg-rose-600 text-white border-rose-500";
                          else
                            btnStyle =
                              "bg-slate-500 hover:bg-slate-600 text-white border-slate-500";
                        }
                        return (
                          <Button
                            key={statusOption}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setPreDefinedAnswers((prev) =>
                                prev.map((item) =>
                                  item.id === pq.id
                                    ? { ...item, status: statusOption }
                                    : item,
                                ),
                              );
                            }}
                            className={`h-7 px-2.5 text-[10px] font-semibold rounded-md transition-all ${btnStyle}`}
                          >
                            {statusOption}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                        Observation
                      </label>
                      <Input
                        placeholder="Add observation details..."
                        value={pq.observation || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPreDefinedAnswers((prev) =>
                            prev.map((item) =>
                              item.id === pq.id
                                ? { ...item, observation: val }
                                : item,
                            ),
                          );
                        }}
                        className="h-8 border-border text-[11px] rounded-md bg-background text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                        Corrective Action
                      </label>
                      <Input
                        placeholder="Add corrective action if any..."
                        value={pq.correctiveAction || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPreDefinedAnswers((prev) =>
                            prev.map((item) =>
                              item.id === pq.id
                                ? { ...item, correctiveAction: val }
                                : item,
                            ),
                          );
                        }}
                        className="h-8 border-border text-[11px] rounded-md bg-background text-foreground"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoUploadForPQ(pq.id, file);
                        }}
                      />

                      <div className="h-8 border border-border rounded-lg bg-background hover:bg-muted/40 px-3 text-xs flex items-center gap-1.5 transition-colors font-medium text-slate-700 dark:text-slate-200 dark:text-slate-300">
                        <Upload className="h-3.5 w-3.5" />
                        Add Photo
                      </div>
                    </label>
                    {(pq.photos && pq.photos.length > 0
                      ? pq.photos
                      : pq.photo
                        ? [pq.photo]
                        : []
                    ).map((pUrl, pIdx) => (
                      <div
                        key={pIdx}
                        className="relative h-8 w-8 rounded-lg overflow-hidden border border-border flex-shrink-0"
                      >
                        <img
                          src={pUrl}
                          alt="Preview"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPreDefinedAnswers((prev) =>
                              prev.map((item) => {
                                if (item.id === pq.id) {
                                  const currentPhotos =
                                    item.photos ||
                                    (item.photo ? [item.photo] : []);
                                  const filtered = currentPhotos.filter(
                                    (_, idx) => idx !== pIdx,
                                  );
                                  return {
                                    ...item,
                                    photos: filtered,
                                    photo:
                                      filtered.length > 0
                                        ? filtered[0]
                                        : undefined,
                                  };
                                }
                                return item;
                              }),
                            )
                          }
                          className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                        >
                          <span className="text-[9px] font-bold">Remove</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Section B: On-Spot Custom Observations */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  B. On-Spot Custom Observations
                </h2>
                <p className="text-xs text-muted-foreground">
                  Record any additional custom security findings found on site.
                </p>
              </div>
              <Button
                onClick={() => {
                  resetObsForm();
                  setIsAddObsOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 text-xs font-semibold h-9 px-3"
              >
                <Plus className="h-4 w-4" /> Add On-Spot Observation
              </Button>
            </div>

            {reportObservations.length === 0 ? (
              <Card className="rounded-[14px] border border-border border-dashed bg-card/40 p-8 text-center">
                <p className="text-xs text-muted-foreground italic">
                  No additional custom findings recorded. Click "+ Add On-Spot
                  Observation" to log one.
                </p>
              </Card>
            ) : (
              <Accordion type="single" collapsible className="w-full space-y-2">
                {reportObservations.map((obs, idx) => (
                  <AccordionItem
                    key={obs.id}
                    value={obs.id}
                    className="border rounded-xl px-4 bg-card shadow-sm overflow-hidden border-border/80"
                  >
                    <AccordionTrigger className="font-semibold text-xs hover:no-underline py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-bold">
                          #{idx + 1}
                        </span>
                        <span className="text-foreground font-bold">
                          {obs.actionPoint}
                        </span>
                        <Badge
                          variant="secondary"
                          className="ml-2 text-[10px] bg-muted text-muted-foreground font-normal"
                        >
                          {obs.observation.length > 55
                            ? `${obs.observation.slice(0, 55)}...`
                            : obs.observation}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2 pb-4 text-[11px] text-muted-foreground border-t border-border">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="font-bold text-[9px] text-muted-foreground uppercase tracking-wider block">
                            Observation Details
                          </span>
                          <p className="text-foreground font-medium">
                            {obs.observation}
                          </p>
                        </div>
                        <div>
                          <span className="font-bold text-[9px] text-muted-foreground uppercase tracking-wider block">
                            Corrective Action
                          </span>
                          <p className="text-foreground font-medium">
                            {obs.correctiveMeasures || "N/A"}
                          </p>
                        </div>
                      </div>
                      {obs.photos && obs.photos.length > 0 && (
                        <div className="pt-2">
                          <span className="font-bold text-[9px] text-muted-foreground uppercase tracking-wider block mb-1">
                            Evidence Photos
                          </span>
                          <div className="flex gap-2">
                            {obs.photos.map((p, pIdx) => (
                              <img
                                key={pIdx}
                                src={p}
                                alt="evidence"
                                className="h-12 w-16 rounded object-cover border"
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end gap-2 pt-2 border-t border-border">
                        <Button
                          type="button"
                          onClick={() => handleEditObservation(obs)}
                          variant="ghost"
                          size="sm"
                          className="text-blue-500 hover:text-blue-600 hover:bg-blue-50/10 h-8 text-[10px] font-semibold"
                        >
                          <Edit className="h-3.5 w-3.5 mr-1" /> Edit Finding
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            setReportObservations((prev) =>
                              prev.filter((item) => item.id !== obs.id),
                            )
                          }
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50/10 h-8 text-[10px] font-semibold"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Finding
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        </div>
      )}{" "}
      {/* STEP 4: Customer Feedback */}
      {currentStep === 4 && (
        <Card className="rounded-[14px] border border-border bg-card shadow-sm">
          <CardHeader className="border-b pb-4 px-6">
            <CardTitle className="text-sm font-bold text-foreground">
              Customer Feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 text-xs">
            <label className="text-muted-foreground font-semibold block mb-2">
              Customer Feedback / Remarks
            </label>
            <Textarea
              placeholder="Write customer feedback or notes..."
              value={customerFeedback}
              onChange={(e) => setCustomerFeedback(e.target.value)}
              className="min-h-[140px] border border-border text-xs rounded-lg bg-background text-foreground"
            />
          </CardContent>
        </Card>
      )}
      {/* STEP 5: Overall Suggestion */}
      {currentStep === 5 && (
        <Card className="rounded-[14px] border border-border bg-card shadow-sm">
          <CardHeader className="border-b pb-4 px-6">
            <CardTitle className="text-sm font-bold text-foreground">
              Overall Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 text-xs">
            <label className="text-muted-foreground font-semibold block mb-2">
              Overall Suggestions & Recommendations
            </label>
            <Textarea
              placeholder="Write any overall recommendations or suggestions..."
              value={suggestions}
              onChange={(e) => setSuggestions(e.target.value)}
              className="min-h-[140px] border border-border text-xs rounded-lg bg-background text-foreground"
            />
          </CardContent>
        </Card>
      )}
      {/* STEP 6: Review */}
      {currentStep === 6 && (
        <div className="space-y-6">
          <Card className="rounded-[14px] border border-border bg-card shadow-sm">
            <CardHeader className="border-b pb-3 px-6">
              <CardTitle className="text-sm font-bold text-foreground">
                General Information Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground block text-[10px] font-bold uppercase">
                  Client
                </span>
                <span className="text-foreground font-semibold">
                  {companies.find((c) => c.id === clientId)?.name || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] font-bold uppercase">
                  Site
                </span>
                <span className="text-foreground font-semibold">
                  {sites.find((s) => s.id === siteId)?.name || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] font-bold uppercase">
                  Inspection Date
                </span>
                <span className="text-foreground font-semibold">
                  {visitDate}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] font-bold uppercase">
                  Officer
                </span>
                <span className="text-foreground font-semibold">
                  {officerName}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Guards Present */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">
              Guards Present ({guards.filter((g) => g.present).length})
            </h3>
            <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
              {guards.filter((g) => g.present).length > 0 ? (
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                    <TableRow>
                      <TableHead className="font-bold text-slate-400 dark:text-slate-500 dark:text-slate-400 text-xs">Employee ID</TableHead>
                      <TableHead className="font-bold text-slate-400 dark:text-slate-500 dark:text-slate-400 text-xs">Guard Name</TableHead>
                      <TableHead className="font-bold text-slate-400 dark:text-slate-500 dark:text-slate-400 text-xs text-center w-28">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guards
                      .filter((g) => g.present)
                      .map((g) => (
                        <TableRow key={g.id}>
                          <TableCell className="font-semibold text-xs text-slate-700 dark:text-slate-200 dark:text-slate-300">
                            {g.employeeId}
                          </TableCell>
                          <TableCell className="font-semibold text-xs text-slate-700 dark:text-slate-200 dark:text-slate-300">
                            {g.name}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 px-2 py-0.5 rounded-full font-bold">
                              Present
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-4 text-center text-xs text-muted-foreground italic">
                  No guards marked present.
                </div>
              )}
            </div>
          </div>

          {/* Pre-defined Checklist Summary */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">
              Pre-defined Checklist Summary
            </h3>
            <div className="border rounded-xl bg-card overflow-hidden border-border/80 shadow-sm">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-400 dark:text-slate-500 dark:text-slate-400 text-xs">
                      Question
                    </TableHead>
                    <TableHead className="font-bold text-slate-400 dark:text-slate-500 dark:text-slate-400 text-xs text-center w-28">
                      Status
                    </TableHead>
                    <TableHead className="font-bold text-slate-400 dark:text-slate-500 dark:text-slate-400 text-xs">
                      Remarks / Observations
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preDefinedAnswers.map((pq) => (
                    <TableRow key={pq.id}>
                      <TableCell className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300 text-xs">
                        {pq.question}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={
                            pq.status === "Satisfactory"
                              ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50"
                              : pq.status === "Unsatisfactory"
                                ? "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          }
                        >
                          {pq.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300 dark:text-slate-400 dark:text-slate-500 text-xs">
                        {pq.observation || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Observations Summary Accordion */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">
              On-Spot Custom Observations Summary ({reportObservations.length})
            </h3>
            {reportObservations.length > 0 && (
              <Accordion type="single" collapsible className="w-full space-y-2">
                {reportObservations.map((obs, idx) => (
                  <AccordionItem
                    key={obs.id}
                    value={obs.id}
                    className="border rounded-xl px-4 bg-card shadow-sm border-border/80"
                  >
                    <AccordionTrigger className="font-semibold text-xs hover:no-underline py-2.5 text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-bold">
                          #{idx + 1}
                        </span>
                        <span className="text-foreground font-bold">
                          {obs.actionPoint}
                        </span>
                        <span className="text-muted-foreground font-normal text-[10px] truncate max-w-xs">
                          {obs.observation}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-2 pb-4 text-[11px] text-muted-foreground border-t border-border">
                      <div>
                        <span className="font-bold text-[9px] text-muted-foreground uppercase tracking-wider block">
                          Observation Details
                        </span>
                        <p className="text-foreground mt-0.5">
                          {obs.observation}
                        </p>
                      </div>
                      {obs.correctiveMeasures && (
                        <div>
                          <span className="font-bold text-[9px] text-muted-foreground uppercase tracking-wider block">
                            Corrective Action
                          </span>
                          <p className="text-foreground mt-0.5">
                            {obs.correctiveMeasures}
                          </p>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>

          {/* Customer Feedback & Suggestions Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="rounded-[14px] border border-border bg-card shadow-sm">
              <CardHeader className="border-b pb-3 px-6">
                <CardTitle className="text-sm font-bold text-foreground">
                  Customer Feedback Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 text-xs text-foreground font-medium">
                <p className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-border/60 min-h-[60px] whitespace-pre-wrap">
                  {customerFeedback || "No customer feedback recorded."}
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-[14px] border border-border bg-card shadow-sm">
              <CardHeader className="border-b pb-3 px-6">
                <CardTitle className="text-sm font-bold text-foreground">
                  Overall Suggestions Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 text-xs text-foreground font-medium">
                <p className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-border/60 min-h-[60px] whitespace-pre-wrap">
                  {suggestions || "No suggestions recorded."}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      {/* Navigation Footer */}
      <div className="flex items-center justify-between border-t pt-4 border-border">
        <Button
          onClick={prevStep}
          disabled={currentStep === 1}
          variant="outline"
          className="h-10 rounded-lg text-xs"
        >
          Previous
        </Button>
        <div className="flex gap-2">
          <Button
            onClick={() => handleSaveReport("Draft")}
            variant="ghost"
            disabled={loading}
            className="h-10 hover:bg-accent text-xs text-muted-foreground rounded-lg font-medium"
          >
            Save Draft
          </Button>

          {currentStep < 6 ? (
            <Button
              onClick={nextStep}
              className="bg-blue-600 hover:bg-blue-700 text-white h-10 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => handleSaveReport("Completed")}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-10 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm"
            >
              Submit Report
            </Button>
          )}
        </div>
      </div>
      {/* Add Observation Modal */}
      <Dialog open={isAddObsOpen} onOpenChange={setIsAddObsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-[16px] p-6 border bg-card shadow-lg text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              {editingObsId ? "Edit Observation" : "Add Observation"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveObservation} className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-muted-foreground font-semibold block">
                Inspection Point <span className="text-red-500">*</span>
              </label>
              {!obsUseCustomActionPoint ? (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select
                      value={obsActionPoint}
                      onValueChange={setObsActionPoint}
                    >
                      <SelectTrigger className="h-10 border-border rounded-lg text-xs font-normal bg-background text-foreground">
                        <SelectValue placeholder="Select inspection point..." />
                      </SelectTrigger>
                      <SelectContent>
                        {PRE_DEFINED_QUESTIONS.map((pq) => (
                          <SelectItem key={pq.id} value={pq.question}>
                            {pq.question}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setObsUseCustomActionPoint(true)}
                    variant="outline"
                    className="h-10 text-[11px]"
                  >
                    Custom
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={obsCustomActionPoint}
                    onChange={(e) => setObsCustomActionPoint(e.target.value)}
                    className="h-10 border-border text-xs rounded-lg bg-background text-foreground"
                  />
                  <Button
                    type="button"
                    onClick={() => setObsUseCustomActionPoint(false)}
                    variant="outline"
                    className="h-10 text-[11px]"
                  >
                    List
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-muted-foreground font-semibold block">
                Observation details <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={obsObservation}
                onChange={(e) => setObsObservation(e.target.value)}
                className="min-h-[70px] border-border text-xs rounded-lg bg-background text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold block">
                  Action Required
                </label>
                <Input
                  placeholder="Action required..."
                  value={obsActionRequired}
                  onChange={(e) => setObsActionRequired(e.target.value)}
                  className="h-10 border-border text-xs rounded-lg bg-background text-foreground"
                />
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold block">
                  Action Done
                </label>
                <Input
                  placeholder="Action done..."
                  value={obsActionDone}
                  onChange={(e) => setObsActionDone(e.target.value)}
                  className="h-10 border-border text-xs rounded-lg bg-background text-foreground"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground font-semibold block">
                Corrective Action / Measure
              </label>
              <Textarea
                placeholder="Recommended corrective measures..."
                value={obsCorrectiveMeasures}
                onChange={(e) => setObsCorrectiveMeasures(e.target.value)}
                className="min-h-[50px] border-border text-xs rounded-lg bg-background text-foreground"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground font-semibold block">
                Remarks
              </label>
              <Input
                placeholder="Remarks/notes..."
                value={obsRemarks}
                onChange={(e) => setObsRemarks(e.target.value)}
                className="h-10 border-border text-xs rounded-lg bg-background text-foreground"
              />
            </div>

            <div className="space-y-2">
              <label className="text-muted-foreground font-semibold block">
                Photos (Evidence)
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      files.forEach((file) => handleObsPhotoUpload(file));
                    }}
                  />

                  <div className="h-14 w-20 border border-dashed border-border rounded-lg bg-muted/50 hover:bg-muted flex flex-col items-center justify-center gap-1 transition-colors text-[10px] text-muted-foreground font-medium">
                    <Upload className="h-4 w-4" /> Upload
                  </div>
                </label>

                {obsPhotos.map((p, pIdx) => (
                  <div
                    key={pIdx}
                    className="relative h-14 w-20 rounded-lg overflow-hidden border border-border"
                  >
                    <img
                      src={p}
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setObsPhotos((prev) =>
                          prev.filter((_, idx) => idx !== pIdx),
                        )
                      }
                      className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity text-[8px] font-bold"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2 border-t">
              <Button
                type="button"
                onClick={() => setIsAddObsOpen(false)}
                variant="ghost"
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 text-white h-9 text-xs"
              >
                Save Observation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Guard Modal */}
      <Dialog open={isAddGuardOpen} onOpenChange={setIsAddGuardOpen}>
        <DialogContent className="max-w-md rounded-[16px] p-6 border bg-card shadow-lg text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <UserPlus className="h-4.5 w-4.5 text-blue-600" /> Add Temporary Guard
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <label className="text-slate-600 dark:text-slate-300 font-semibold">Guard Name</label>
              <Input
                placeholder="Enter guard name..."
                value={newGuardName}
                onChange={(e) => setNewGuardName(e.target.value)}
                className="h-10 border-border text-xs rounded-lg bg-background text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-600 dark:text-slate-300 font-semibold">Employee ID</label>
              <Input
                placeholder="Enter employee ID..."
                value={newGuardEmpId}
                onChange={(e) => setNewGuardEmpId(e.target.value)}
                className="h-10 border-border text-xs rounded-lg bg-background text-foreground"
              />
            </div>
            <DialogFooter className="pt-2 gap-2 border-t">
              <Button
                type="button"
                onClick={() => setIsAddGuardOpen(false)}
                variant="ghost"
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddTemporaryGuard}
                className="bg-blue-600 text-white h-9 text-xs"
              >
                Add Guard
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}