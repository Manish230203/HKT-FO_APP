import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Upload,
  MapPin,
  FileText,
  UserCheck,
  Search,
  HelpCircle,
  Paperclip,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getStoredReports,
  saveStoredReports,
  getStoredQuestions,
  defaultGuards,
  getStoredTemplates,
} from "./mockData";

const STEPS = [
  "General Info",
  "Guards",
  "Checklist",
  "Lecture & Checking",
  "Suggestions",
  "Review",
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
            className="pr-10 cursor-pointer"
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
            className="h-7 text-[10px] px-2.5 rounded-md text-foreground"
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function CreateOfficerRoundReport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");

  const [currentStep, setCurrentStep] = useState(1);
  const [reportId, setReportId] = useState("");
  const [reportNo, setReportNo] = useState("");

  // Prefill fields from dashboard sudden visit modal if query parameters are provided
  useEffect(() => {
    const pClientId = searchParams.get("clientId");
    const pSiteId = searchParams.get("siteId");
    const pType = searchParams.get("type");
    const pShift = searchParams.get("shift");
    
    if (pClientId) {
      setClientId(parseInt(pClientId, 10));
    }
    if (pSiteId) {
      setSiteId(parseInt(pSiteId, 10));
    }
    if (pType) {
      setVisitType(pType);
    }
    if (pShift) {
      setShift(pShift);
    }
  }, [searchParams]);

  // STEP 1 State
  const [unit, setUnit] = useState("");
  const [clientId, setClientId] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [visitDate, setVisitDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [visitType, setVisitType] = useState("Scheduled");
  const [officer, setOfficer] = useState("");
  const [shift, setShift] = useState("");
  const [startTime, setStartTime] = useState("20:00");
  const [endTime, setEndTime] = useState("22:00");
  const [gps, setGps] = useState("18.5204° N, 73.8567° E");
  const [photos, setPhotos] = useState([]);
  const [lectureDetails, setLectureDetails] = useState("");
  const [randomChecking, setRandomChecking] = useState("");
  const [overallRemarks, setOverallRemarks] = useState("");

  // STEP 2 State
  const [guards, setGuards] = useState([]);
  const [guardSearch, setGuardSearch] = useState("");
  const [isAddGuardOpen, setIsAddGuardOpen] = useState(false);
  const [newGuardName, setNewGuardName] = useState("");
  const [newGuardEmpId, setNewGuardEmpId] = useState("");

  // STEP 3 State
  const [questions, setQuestions] = useState([]);
  const [isAddQuestionOpen, setIsAddQuestionOpen] = useState(false);

  // Add Question Spot Fields
  const [qSection, setQSection] = useState("");
  const [qQuestion, setQQuestion] = useState("");
  const [qType, setQType] = useState("yes_no");
  const [qRequired, setQRequired] = useState(false);
  const [qPhotoReq, setQPhotoReq] = useState(false);
  const [qGpsReq, setQGpsReq] = useState(false);
  const [qRemarksAllowed, setQRemarksAllowed] = useState(true);
  const [qOptions, setQOptions] = useState(["Yes", "No"]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // STEP 4 State
  const [observations, setObservations] = useState([]);
  const [isAddObsOpen, setIsAddObsOpen] = useState(false);
  const [editingObsId, setEditingObsId] = useState(null);

  // Add Observation Fields
  const [obsActionPoint, setObsActionPoint] = useState("");
  const [obsObservation, setObsObservation] = useState("");
  const [obsActionRequired, setObsActionRequired] = useState("");
  const [obsActionDone, setObsActionDone] = useState("");
  const [obsCorrective, setObsCorrective] = useState("");
  const [obsRemarks, setObsRemarks] = useState("");
  const [obsPriority, setObsPriority] = useState("Medium");
  const [obsStatus, setObsStatus] = useState("Pending");
  const [obsPhotos, setObsPhotos] = useState([]);

  // STEP 5 / Final comments
  const [suggestions, setSuggestions] = useState("");
  const [signature, setSignature] = useState("");

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

  // Load guards when siteId changes
  useEffect(() => {
    const loadGuards = async () => {
      if (siteId) {
        try {
          const guardRes = await api.get(
            `/assessments/guards?site_id=${siteId}`,
          );
          if (guardRes.data && guardRes.data.length > 0) {
            setGuards(guardRes.data.map((g) => ({ ...g, present: true })));
          } else {
            setGuards(defaultGuards.map((g) => ({ ...g })));
          }
        } catch (error) {
          console.error("Failed to load guards", error);
          setGuards(defaultGuards.map((g) => ({ ...g })));
        }
      } else {
        setGuards(defaultGuards.map((g) => ({ ...g })));
      }
    };
    if (!editId) {
      loadGuards();
    }
  }, [siteId, editId]);

  const randomizeMandatoryQuestions = (qs, count = 10) => {
    return qs;
  };

  // Load Initial Data
  useEffect(() => {
    const loadData = async () => {
      let loadedTemplates = [];
      try {
        const templatesRes = await api.get("/officer-rounds/templates");
        loadedTemplates = templatesRes.data || [];
      } catch (err) {
        console.error(
          "Failed to load templates from API, falling back to localStorage:",
          err,
        );
      }

      if (!loadedTemplates || loadedTemplates.length === 0) {
        loadedTemplates = getStoredTemplates();
      }

      setTemplates(loadedTemplates);

      const loadedQuestions = getStoredQuestions();
      setQuestions(
        loadedQuestions.map((q) => ({
          ...q,
          answer: q.answer || "",
          remarks: q.remarks || "",
        })),
      );
      setGuards(defaultGuards.map((g) => ({ ...g })));

      if (loadedTemplates.length > 0) {
        setSelectedTemplateId(loadedTemplates[0].id);
        if (!editId) {
          setQuestions(
            randomizeMandatoryQuestions(
              loadedTemplates[0].questions.map((q) => ({
                ...q,
                answer: "",
                remarks: "",
              })),
            ),
          );
        }
      }

      if (editId) {
        try {
          const reportRes = await api.get(`/officer-rounds/reports/${editId}`);
          const match = reportRes.data;
          if (match) {
            setReportId(match.id);
            setReportNo(match.reportNo || "");
            setUnit(match.unit);
            setClientId(match.clientId || null);
            setSiteId(match.siteId || null);
            setVisitDate(match.visitDate);
            setVisitType(match.visitType);
            setOfficer(match.officer);
            setShift(match.shift);
            setStartTime(match.startTime);
            setEndTime(match.endTime);
            setGps(match.gps);
            setPhotos(match.photos || []);
            setGuards(match.guards || []);
            if (match.checklist && match.checklist.length > 0) {
              setQuestions(match.checklist);
            }
            setObservations(match.observations || []);
            setSuggestions(match.suggestions || "");
            setSignature(match.officerSignature || "");
            setLectureDetails(match.lectureDetails || "");
            setRandomChecking(match.randomChecking || "");
            setOverallRemarks(match.overallRemarks || "");
          }
        } catch (e) {
          console.error("Failed to load report detail:", e);
        }
      } else {
        setReportId(`rep-${Date.now()}`);
        const initRoundReportNo = async () => {
          try {
            const res = await api.get("/officer-rounds/reports");
            const count = (res.data || []).length;
            const nextNum = (count + 1).toString().padStart(3, "0");
            setReportNo(`OR-${new Date().getFullYear()}-${nextNum}`);
          } catch (e) {
            setReportNo(
              `OR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
            );
          }
        };
        initRoundReportNo();
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
              setGps(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
            },
            (error) => {
              console.error("Error getting geolocation", error);
            },
          );
        }
      }
    };
    loadData();
  }, [editId]);

  const handleTemplateChange = (templateId) => {
    setSelectedTemplateId(templateId);
    const found = templates.find((t) => t.id === templateId);
    if (found) {
      setQuestions(
        randomizeMandatoryQuestions(
          found.questions.map((q) => ({ ...q, answer: "", remarks: "" })),
        ),
      );
    }
  };

  // Handle Dynamic Guard Action
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
      guards.map((g) => (g.id === id ? { ...g, present: isPresent } : g)),
    );
  };

  const handlePhotoUpload = (questionId, file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id === questionId) {
            const currentPhotos = q.photos || (q.photo ? [q.photo] : []);
            const updatedPhotos = [...currentPhotos, base64String];
            return {
              ...q,
              photos: updatedPhotos,
              photo: updatedPhotos[0],
            };
          }
          return q;
        }),
      );
    };
    reader.readAsDataURL(file);
  };

  // Add Question Spot
  const handleSaveQuestion = () => {
    if (!qQuestion || !qSection) return;
    const newQ = {
      id: `spot-${Date.now()}`,
      section: qSection,
      question: qQuestion,
      answerType: qType,
      required: qRequired,
      photoRequired: qPhotoReq,
      gpsRequired: qGpsReq,
      remarksAllowed: qRemarksAllowed,
      options:
        qType === "yes_no" || qType === "dropdown" ? qOptions : undefined,
      answer: qType === "checkbox" ? [] : "",
      remarks: "",
    };
    setQuestions([...questions, newQ]);
    setQQuestion("");
    setQSection("");
    setIsAddQuestionOpen(false);
  };

  const updateQuestionAnswer = (id, answer) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, answer } : q)));
  };

  const updateQuestionRemarks = (id, remarks) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, remarks } : q)));
  };

  // Observation Management
  const handleSaveObservation = () => {
    if (!obsActionPoint || !obsObservation) return;

    if (editingObsId) {
      setObservations(
        observations.map((o) =>
          o.id === editingObsId
            ? {
                ...o,
                actionPoint: obsActionPoint,
                observation: obsObservation,
                actionRequired: obsActionRequired,
                actionDone: obsActionDone,
                correctiveMeasures: obsCorrective,
                remarks: obsRemarks,
                priority: obsPriority,
                status: obsStatus,
                photos: obsPhotos,
              }
            : o,
        ),
      );
      setEditingObsId(null);
    } else {
      const newObs = {
        id: `obs-${Date.now()}`,
        actionPoint: obsActionPoint,
        observation: obsObservation,
        actionRequired: obsActionRequired,
        actionDone: obsActionDone,
        correctiveMeasures: obsCorrective,
        remarks: obsRemarks,
        priority: obsPriority,
        status: obsStatus,
        photos: obsPhotos,
        createdTime: new Date().toLocaleString(),
      };
      setObservations([...observations, newObs]);
    }

    // Reset Fields
    setObsActionPoint("");
    setObsObservation("");
    setObsActionRequired("");
    setObsActionDone("");
    setObsCorrective("");
    setObsRemarks("");
    setObsPriority("Medium");
    setObsStatus("Pending");
    setObsPhotos([]);
    setIsAddObsOpen(false);
  };

  const handleEditObservation = (obs) => {
    setEditingObsId(obs.id);
    setObsActionPoint(obs.actionPoint);
    setObsObservation(obs.observation);
    setObsActionRequired(obs.actionRequired);
    setObsActionDone(obs.actionDone);
    setObsCorrective(obs.correctiveMeasures);
    setObsRemarks(obs.remarks);
    setObsPriority(obs.priority);
    setObsStatus(obs.status);
    setObsPhotos(obs.photos || []);
    setIsAddObsOpen(true);
  };

  const handleDeleteObservation = (id) => {
    setObservations(observations.filter((o) => o.id !== id));
  };

  // Save / Submit logic
  const handleSaveReport = async (status) => {
    if (!clientId || !siteId) {
      alert("Client and Site selection is compulsory.");
      return;
    }

    if (status === "Completed") {
      const unansweredMandatory = questions.filter(
        (q) =>
          q.required &&
          (!q.answer || (Array.isArray(q.answer) && q.answer.length === 0)),
      );
      if (unansweredMandatory.length > 0) {
        alert(
          "Please answer all mandatory questions (*) before completing the report.",
        );
        return;
      }
    }

    const newReport = {
      id: reportId,
      reportNo:
        reportNo ||
        `OR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      unit: unit || "Unspecified Unit",
      clientId: clientId || undefined,
      siteId: siteId || undefined,
      visitDate,
      visitType,
      officer: officer || "Unspecified Officer",
      shift,
      startTime,
      endTime,
      gps,
      photos,
      guards,
      checklist: questions,
      observations,
      suggestions,
      attachments: [],
      officerSignature: signature,
      status,
      createdOn: new Date().toLocaleString(),
      lectureDetails,
      randomChecking,
      overallRemarks,
    };

    try {
      await api.post("/officer-rounds/reports", newReport);
    } catch (err) {
      console.error(
        "Failed to save report to backend database, saving to localStorage:",
        err,
      );
      const localReports = getStoredReports();
      const existsIdx = localReports.findIndex((r) => r.id === newReport.id);
      if (existsIdx > -1) {
        localReports[existsIdx] = newReport;
      } else {
        localReports.push(newReport);
      }
      saveStoredReports(localReports);
    }
    navigate("/officer-rounds");
  };

  // Filter Guards by Search
  const filteredGuards = guards.filter(
    (g) =>
      g.name.toLowerCase().includes(guardSearch.toLowerCase()) ||
      g.employeeId.toLowerCase().includes(guardSearch.toLowerCase()),
  );

  // Statistics for Tab 2 Charts
  const totalObs = observations.length;
  const compObs = observations.filter(
    (o) => o.status === "Completed" || o.status === "Closed",
  ).length;
  const pendObs = observations.filter(
    (o) => o.status === "Pending" || o.status === "In Progress",
  ).length;

  const highPriority = observations.filter((o) => o.priority === "High").length;
  const medPriority = observations.filter(
    (o) => o.priority === "Medium",
  ).length;
  const lowPriority = observations.filter((o) => o.priority === "Low").length;

  const pieData = [
    { name: "Completed/Closed", value: compObs, color: "#10B981" },
    { name: "Pending/Progress", value: pendObs, color: "#F59E0B" },
  ].filter((d) => d.value > 0);

  const barData = [
    { name: "High", count: highPriority, color: "#EF4444" },
    { name: "Medium", count: medPriority, color: "#F59E0B" },
    { name: "Low", count: lowPriority, color: "#3B82F6" },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => navigate(-1)}
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-lg border-border hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {editId
              ? "Edit Officer Night Round Report"
              : "Create Officer Night Round Report"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Fill out safety round, guards status, and compliance checkpoints below
          </p>
        </div>
      </div>
      {/* Stepper Header */}
      <div className="bg-white dark:bg-card dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 px-6 shadow-sm flex items-center justify-center overflow-x-auto w-full">
        <div className="flex items-center gap-6 w-full max-w-4xl justify-between relative min-w-[650px] py-1">
          {/* Background line */}
          <div className="absolute top-4 left-[38px] right-[38px] h-0.5 bg-slate-200 dark:bg-slate-800 z-0" />
          {/* Active progress line */}
          <div
            className="absolute top-4 left-[38px] h-0.5 bg-emerald-500 transition-all duration-300 z-0"
            style={{
              width: `calc(${((currentStep - 1) / (STEPS.length - 1)) * 100}% - ${((currentStep - 1) / (STEPS.length - 1)) * 76}px)`,
            }}
          />

          {STEPS.map((stepName, index) => {
            const stepNumber = index + 1;
            const isActive = currentStep === stepNumber;
            const isDone = currentStep > stepNumber;
            return (
              <button
                key={stepName}
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
                      : "bg-white dark:bg-card dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : stepNumber}
                </div>
                <span
                  className={`text-xs ${isActive ? "text-blue-600 dark:text-blue-400 font-bold" : "text-slate-500 dark:text-slate-400 dark:text-slate-500 font-normal"}`}
                >
                  {stepName}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {/* STEP 1: General Info */}
      {currentStep === 1 && (
        <Card className="rounded-[14px] border border-border bg-card shadow-sm">
          <CardContent className="p-6 space-y-6">
            <h3 className="text-lg font-bold text-foreground pb-2 border-b">
              General Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground">
                  Client <span className="text-red-500">*</span>
                </label>
                <Select
                  value={clientId?.toString() || "none"}
                  onValueChange={(v) => {
                    setClientId(v === "none" ? null : parseInt(v));
                    setSiteId(null);
                    setUnit("");
                  }}
                >
                  <SelectTrigger className="h-10 border-border rounded-lg bg-background text-foreground font-normal text-sm">
                    <SelectValue placeholder="Select a client..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="font-normal text-sm">
                      Choose a client...
                    </SelectItem>
                    {companies.map((company) => (
                      <SelectItem
                        key={company.id}
                        value={company.id.toString()}
                        className="font-normal text-sm"
                      >
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground">
                  Target Site <span className="text-red-500">*</span>
                </label>
                <Select
                  value={siteId?.toString() || "none"}
                  onValueChange={(v) => {
                    const sId = v === "none" ? null : parseInt(v);
                    setSiteId(sId);
                    const selectedSite = sites.find((s) => s.id === sId);
                    if (selectedSite) {
                      setUnit(selectedSite.name);
                    } else {
                      setUnit("");
                    }
                  }}
                  disabled={!clientId}
                >
                  <SelectTrigger className="h-10 border-border rounded-lg bg-background text-foreground font-normal text-sm">
                    <SelectValue
                      placeholder={
                        clientId
                          ? "Select target site..."
                          : "Please select a client first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="font-normal text-sm">
                      {clientId
                        ? "Choose a location..."
                        : "Choose a client first..."}
                    </SelectItem>
                    {sites.map((site) => (
                      <SelectItem
                        key={site.id}
                        value={site.id.toString()}
                        className="font-normal text-sm"
                      >
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground">
                  Visit Date <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={visitDate}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setVisitDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground">
                  Officer Name <span className="text-red-500">*</span>
                </label>
                <Input
                  value={officer}
                  onChange={(e) => setOfficer(e.target.value)}
                  placeholder="e.g. Manish Kenjale"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground">
                  Shift <span className="text-red-500">*</span>
                </label>
                <Input
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  placeholder="e.g. Night Shift A"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-primary" /> GPS Coordinates
                </label>
                <Input
                  value={gps}
                  onChange={(e) => setGps(e.target.value)}
                  placeholder="Latitude, Longitude"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-muted-foreground">
                    Start Time
                  </label>
                  <TimePicker24 value={startTime} onChange={setStartTime} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-muted-foreground">
                    End Time
                  </label>
                  <TimePicker24 value={endTime} onChange={setEndTime} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* STEP 2: Guards Attendance */}
      {currentStep === 2 && (
        <Card className="rounded-[14px] border border-border bg-card shadow-sm">
          <CardContent className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b">
              <h3 className="text-lg font-bold text-foreground">
                Guards Present On Duty
              </h3>
              <Button
                onClick={() => setIsAddGuardOpen(true)}
                variant="outline"
                className="border-primary text-primary hover:bg-primary/5 rounded-lg flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Add Temporary Guard
              </Button>
            </div>

            {/* Guard Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-muted-foreground" />
              <Input
                placeholder="Search guards by name or ID..."
                value={guardSearch}
                onChange={(e) => setGuardSearch(e.target.value)}
                className="pl-9 pr-4 py-2"
              />
            </div>

            {/* Guards Table */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Guard Name</TableHead>
                    <TableHead className="text-center">Status Choice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGuards.map((guard) => (
                    <TableRow key={guard.id}>
                      <TableCell className="font-semibold text-primary">
                        {guard.employeeId}
                      </TableCell>
                      <TableCell className="font-medium">
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
                            className={`rounded-lg px-3 ${guard.present ? "bg-emerald-500 hover:bg-emerald-600 text-white" : ""}`}
                          >
                            Present
                          </Button>
                          <Button
                            onClick={() =>
                              toggleGuardAttendance(guard.id, false)
                            }
                            variant={!guard.present ? "default" : "outline"}
                            size="sm"
                            className={`rounded-lg px-3 ${!guard.present ? "bg-rose-500 hover:bg-rose-600 text-white" : ""}`}
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
      {/* STEP 3: Dynamic Inspection Checklist */}
      {currentStep === 3 && (
        <Card className="rounded-[14px] border border-border bg-card shadow-sm">
          <CardContent className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <h3 className="text-lg font-bold text-foreground">
                  Inspection Checklist
                </h3>

                {/* Template Selector Dropdown */}
                {templates.length > 0 && (
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/60 px-3 py-1 rounded-full border">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Template:
                    </span>
                    <Select
                      value={selectedTemplateId}
                      onValueChange={handleTemplateChange}
                    >
                      <SelectTrigger className="w-[180px] h-7 border-none bg-transparent focus:ring-0 text-xs font-semibold text-foreground p-0 px-1 shadow-none">
                        <SelectValue placeholder="Select template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem
                            key={t.id}
                            value={t.id}
                            className="text-xs"
                          >
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <Button
                onClick={() => setIsAddQuestionOpen(true)}
                variant="outline"
                className="border-primary text-primary hover:bg-primary/5 rounded-lg flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Add Question On Spot
              </Button>
            </div>

            {/* Render Checklist grouped by Section */}
            {questions.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground text-sm">
                No checklist questions found.
              </p>
            ) : (
              <div className="space-y-6">
                {Array.from(new Set(questions.map((q) => q.section))).map(
                  (sectionName) => (
                    <div key={sectionName} className="space-y-3">
                      <h4 className="font-bold text-sm text-primary uppercase tracking-wider bg-primary/5 px-3 py-1.5 rounded-lg">
                        {sectionName}
                      </h4>
                      <div className="divide-y border rounded-lg">
                        {questions
                          .filter((q) => q.section === sectionName)
                          .map((q) => (
                            <div
                              key={q.id}
                              className="p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-muted/10 transition-colors"
                            >
                              <div className="flex-1 space-y-1.5">
                                <span className="text-sm font-semibold text-foreground flex items-center gap-1">
                                  {q.question}{" "}
                                  {q.required && (
                                    <span className="text-destructive">*</span>
                                  )}
                                </span>
                                {q.remarksAllowed && (
                                  <Input
                                    placeholder="Write remark/note..."
                                    value={q.remarks || ""}
                                    onChange={(e) =>
                                      updateQuestionRemarks(
                                        q.id,
                                        e.target.value,
                                      )
                                    }
                                    className="text-xs max-w-md mt-1.5"
                                  />
                                )}
                              </div>

                              <div className="flex flex-col items-end gap-2 shrink-0">
                                {/* Render different inputs based on answer type */}
                                {q.answerType === "yes_no" && (
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        updateQuestionAnswer(q.id, "Yes")
                                      }
                                      variant={
                                        q.answer === "Yes"
                                          ? "default"
                                          : "outline"
                                      }
                                      className={`rounded-lg h-8 px-4 ${q.answer === "Yes" ? "bg-emerald-500 hover:bg-emerald-600 text-white" : ""}`}
                                    >
                                      Yes
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        updateQuestionAnswer(q.id, "No")
                                      }
                                      variant={
                                        q.answer === "No"
                                          ? "default"
                                          : "outline"
                                      }
                                      className={`rounded-lg h-8 px-4 ${q.answer === "No" ? "bg-rose-500 hover:bg-rose-600 text-white" : ""}`}
                                    >
                                      No
                                    </Button>
                                  </div>
                                )}

                                {q.answerType === "text" && (
                                  <Input
                                    value={q.answer || ""}
                                    onChange={(e) =>
                                      updateQuestionAnswer(q.id, e.target.value)
                                    }
                                    placeholder="Type answer..."
                                    className="h-8 text-sm w-48"
                                  />
                                )}

                                {q.answerType === "number" && (
                                  <Input
                                    type="number"
                                    value={q.answer || ""}
                                    onChange={(e) =>
                                      updateQuestionAnswer(q.id, e.target.value)
                                    }
                                    placeholder="0"
                                    className="h-8 text-sm w-24"
                                  />
                                )}

                                {q.answerType === "dropdown" && (
                                  <Select
                                    value={q.answer || ""}
                                    onValueChange={(val) =>
                                      updateQuestionAnswer(q.id, val)
                                    }
                                  >
                                    <SelectTrigger className="h-8 w-44">
                                      <SelectValue placeholder="Select answer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(
                                        q.options || [
                                          "Pass",
                                          "Fail",
                                          "Needs Action",
                                        ]
                                      ).map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                          {opt}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}

                                <div className="flex items-center gap-2 flex-wrap">
                                  <label className="cursor-pointer">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handlePhotoUpload(q.id, file);
                                      }}
                                    />

                                    <div className="h-8 border border-border rounded-lg bg-background hover:bg-muted/40 px-3 text-xs flex items-center gap-1.5 transition-colors font-medium text-slate-700 dark:text-slate-200 dark:text-slate-300">
                                      <Upload className="h-3.5 w-3.5" />
                                      Add Photo
                                    </div>
                                  </label>
                                  {(q.photos && q.photos.length > 0
                                    ? q.photos
                                    : q.photo
                                      ? [q.photo]
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
                                          setQuestions((prev) =>
                                            prev.map((item) => {
                                              if (item.id === q.id) {
                                                const currentPhotos =
                                                  item.photos ||
                                                  (item.photo
                                                    ? [item.photo]
                                                    : []);
                                                const filtered =
                                                  currentPhotos.filter(
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
                                        <span className="text-[9px] font-bold">
                                          Remove
                                        </span>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}{" "}
      {/* STEP 4: Lecture & Checking */}
      {currentStep === 4 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Card - Lecture to Staff */}
          <Card className="rounded-[14px] border border-border bg-card shadow-sm flex flex-col">
            <CardContent className="p-6 space-y-4 flex-1 flex flex-col">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />{" "}
                  Short Lecture to Security Staff
                </h3>
                <p className="text-xs text-muted-foreground">
                  Brief details and key instructions given during the patrol
                  briefing.
                </p>
              </div>

              {/* Editor Mock Toolbar */}
              <div className="border border-border rounded-lg overflow-hidden bg-muted/10 flex flex-col flex-1 min-h-[300px]">
                <div className="border-b bg-muted/30 p-2 flex flex-wrap gap-1.5 items-center">
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs font-bold w-6 h-6 flex items-center justify-center"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs italic w-6 h-6 flex items-center justify-center"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs underline w-6 h-6 flex items-center justify-center"
                  >
                    U
                  </button>
                  <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs w-6 h-6 flex items-center justify-center"
                  >
                    List
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs w-6 h-6 flex items-center justify-center"
                  >
                    Num
                  </button>
                  <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs w-6 h-6 flex items-center justify-center"
                  >
                    Link
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs w-6 h-6 flex items-center justify-center"
                  >
                    Img
                  </button>
                </div>
                <textarea
                  value={lectureDetails}
                  onChange={(e) => setLectureDetails(e.target.value)}
                  placeholder="Type details of the lecture given to guards..."
                  className="flex-1 w-full p-4 bg-transparent text-sm focus:outline-none resize-none min-h-[250px] text-slate-800 dark:text-slate-200"
                />
              </div>
            </CardContent>
          </Card>

          {/* Right Card - Random Checking of Workers */}
          <Card className="rounded-[14px] border border-border bg-card shadow-sm flex flex-col">
            <CardContent className="p-6 space-y-4 flex-1 flex flex-col">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Search className="h-5 w-5 text-blue-600 dark:text-blue-400" />{" "}
                  Random Checking of Workers
                </h3>
                <p className="text-xs text-muted-foreground">
                  Record observations from spot-checks conducted on workers
                  during shift.
                </p>
              </div>

              {/* Editor Mock Toolbar */}
              <div className="border border-border rounded-lg overflow-hidden bg-muted/10 flex flex-col flex-1 min-h-[300px]">
                <div className="border-b bg-muted/30 p-2 flex flex-wrap gap-1.5 items-center">
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs font-bold w-6 h-6 flex items-center justify-center"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs italic w-6 h-6 flex items-center justify-center"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs underline w-6 h-6 flex items-center justify-center"
                  >
                    U
                  </button>
                  <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs w-6 h-6 flex items-center justify-center"
                  >
                    List
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs w-6 h-6 flex items-center justify-center"
                  >
                    Num
                  </button>
                  <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs w-6 h-6 flex items-center justify-center"
                  >
                    Link
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded text-xs w-6 h-6 flex items-center justify-center"
                  >
                    Cam
                  </button>
                </div>
                <textarea
                  value={randomChecking}
                  onChange={(e) => setRandomChecking(e.target.value)}
                  placeholder="Enter observations from worker spot checks..."
                  className="flex-1 w-full p-4 bg-transparent text-sm focus:outline-none resize-none min-h-[250px] text-slate-800 dark:text-slate-200"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {/* STEP 5: Suggestions */}
      {currentStep === 5 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Card - Security Suggestions */}
            <Card className="rounded-[14px] border border-border bg-card shadow-sm flex flex-col">
              <CardContent className="p-6 space-y-4 flex-1 flex flex-col">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />{" "}
                    Security Suggestions
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Provide actionable recommendations based on the findings
                    during this inspection.
                  </p>
                </div>

                <div className="space-y-1.5 flex-1 flex flex-col">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300 uppercase tracking-wider">
                    Detailed Recommendations
                  </label>
                  <div className="border border-border rounded-lg overflow-hidden bg-muted/10 flex flex-col flex-1 min-h-[250px]">
                    <textarea
                      value={suggestions}
                      onChange={(e) => setSuggestions(e.target.value)}
                      placeholder="Type your suggestions here... e.g., 'Increase frequency of night patrols around Sector D gate due to lighting failure...'"
                      className="flex-1 w-full p-4 bg-transparent text-sm focus:outline-none resize-none text-slate-800 dark:text-slate-200"
                    />

                    <div className="border-t bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/35 p-2 flex gap-1.5 items-center">
                      <button
                        type="button"
                        className="p-1 hover:bg-muted rounded text-xs font-bold w-6 h-6 flex items-center justify-center"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        className="p-1 hover:bg-muted rounded text-xs italic w-6 h-6 flex items-center justify-center"
                      >
                        I
                      </button>
                      <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
                      <button
                        type="button"
                        className="p-1 hover:bg-muted rounded text-xs w-6 h-6 flex items-center justify-center"
                      >
                        List
                      </button>
                      <button
                        type="button"
                        className="p-1 hover:bg-muted rounded text-xs w-6 h-6 flex items-center justify-center"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Right Card - Overall Remarks */}
            <Card className="rounded-[14px] border border-border bg-card shadow-sm flex flex-col">
              <CardContent className="p-6 space-y-4 flex-1 flex flex-col">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />{" "}
                    Overall Remarks
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Final summary observations regarding the general state of
                    security operations at the site.
                  </p>
                </div>

                <div className="space-y-1.5 flex-1 flex flex-col">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300 uppercase tracking-wider">
                    Inspector's Observations
                  </label>
                  <div className="border border-border rounded-lg overflow-hidden bg-muted/10 flex flex-col flex-1 min-h-[250px]">
                    <textarea
                      maxLength={1000}
                      value={overallRemarks}
                      onChange={(e) => setOverallRemarks(e.target.value)}
                      placeholder="Final summary and general remarks... e.g., 'Overall security posture is improved. Personnel showed high awareness during the surprise drill...'"
                      className="flex-1 w-full p-4 bg-transparent text-sm focus:outline-none resize-none text-slate-800 dark:text-slate-200"
                    />

                    <div className="border-t bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/35 p-2.5 flex justify-end items-center">
                      <span className="text-[10px] text-muted-foreground">
                        Character Count: {overallRemarks.length}/1000
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          {/* Bottom Grid Cards Removed */}
        </div>
      )}
      {/* STEP 6: Review & Submit */}
      {currentStep === 6 && (
        <div className="space-y-6">
          <Card className="rounded-[14px] border p-6 bg-card">
            <h3 className="text-lg font-bold pb-2 border-b text-foreground mb-4">
              Review & Submit Report
            </h3>

            <div className="space-y-6 text-xs text-foreground">
              {/* General Information */}
              <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-3">
                <h4 className="text-sm font-bold text-foreground border-b pb-1">
                  General Information
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold uppercase">
                      Unit / Site
                    </span>
                    <span className="font-semibold text-foreground">
                      {unit || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold uppercase">
                      Visit Date
                    </span>
                    <span className="font-semibold text-foreground">
                      {visitDate}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold uppercase">
                      Visit Type
                    </span>
                    <span className="font-semibold text-foreground">
                      {visitType}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold uppercase">
                      Officer
                    </span>
                    <span className="font-semibold text-foreground">
                      {officer || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold uppercase">
                      Shift
                    </span>
                    <span className="font-semibold text-foreground">
                      {shift || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold uppercase">
                      Start/End Time
                    </span>
                    <span className="font-semibold text-foreground">
                      {startTime} - {endTime}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[10px] font-bold uppercase">
                      GPS Location
                    </span>
                    <span className="font-semibold text-foreground">
                      {gps || "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Guards Present */}
              <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-2">
                <h4 className="text-sm font-bold text-foreground border-b pb-1">
                  Guards Present ({guards.filter((g) => g.present).length})
                </h4>
                <div className="space-y-1.5 pt-1">
                  {guards
                    .filter((g) => g.present)
                    .map((g) => (
                      <div
                        key={g.id}
                        className="flex justify-between items-center border-b border-border/40 py-1 text-xs"
                      >
                        <span className="text-foreground">
                          {g.name} ({g.employeeId})
                        </span>
                        <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 font-bold px-2 py-0.5 rounded-full text-[10px]">
                          Present
                        </Badge>
                      </div>
                    ))}
                  {guards.filter((g) => g.present).length === 0 && (
                    <p className="text-muted-foreground italic text-xs py-1">
                      No guards marked present.
                    </p>
                  )}
                </div>
              </div>

              {/* Inspection Checklist */}
              <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-2">
                <h4 className="text-sm font-bold text-foreground border-b pb-1">
                  Inspection Checklist (
                  {
                    questions.filter(
                      (q) =>
                        q.answer !== undefined &&
                        q.answer !== null &&
                        q.answer !== "" &&
                        (!Array.isArray(q.answer) || q.answer.length > 0),
                    ).length
                  }
                  )
                </h4>
                <div className="space-y-3 divide-y divide-border/40 pt-1">
                  {questions
                    .filter(
                      (q) =>
                        q.answer !== undefined &&
                        q.answer !== null &&
                        q.answer !== "" &&
                        (!Array.isArray(q.answer) || q.answer.length > 0),
                    )
                    .map((q, qIdx) => (
                      <div
                        key={q.id}
                        className={`pt-2 ${qIdx === 0 ? "pt-0" : ""}`}
                      >
                        <p className="font-semibold text-foreground text-xs">
                          {q.question}
                        </p>
                        <p className="text-blue-500 font-bold text-xs mt-0.5">
                          Answer: {q.answer}
                        </p>
                        {q.remarks && (
                          <p className="text-muted-foreground text-xs italic mt-0.5">
                            Remark: {q.remarks}
                          </p>
                        )}
                      </div>
                    ))}
                  {questions.filter(
                    (q) =>
                      q.answer !== undefined &&
                      q.answer !== null &&
                      q.answer !== "" &&
                      (!Array.isArray(q.answer) || q.answer.length > 0),
                  ).length === 0 && (
                    <p className="text-muted-foreground italic text-xs py-1">
                      No checklist questions answered.
                    </p>
                  )}
                </div>
              </div>

              {/* Lecture Details */}
              <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-2">
                <h4 className="text-sm font-bold text-foreground border-b pb-1">
                  Lecture Details
                </h4>
                <p className="text-xs text-foreground whitespace-pre-line pt-1">
                  {lectureDetails || "No lecture details recorded."}
                </p>
              </div>

              {/* Random Checking of Workers */}
              <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-2">
                <h4 className="text-sm font-bold text-foreground border-b pb-1">
                  Random Checking of Workers
                </h4>
                <p className="text-xs text-foreground whitespace-pre-line pt-1">
                  {randomChecking ||
                    "No worker checking observations recorded."}
                </p>
              </div>

              {/* Security Suggestions */}
              <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-2">
                <h4 className="text-sm font-bold text-foreground border-b pb-1">
                  Security Suggestions
                </h4>
                <p className="text-xs text-foreground whitespace-pre-line pt-1">
                  {suggestions || "No suggestions recorded."}
                </p>
              </div>

              {/* Overall Remarks */}
              <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-2">
                <h4 className="text-sm font-bold text-foreground border-b pb-1">
                  Overall Remarks
                </h4>
                <p className="text-xs text-foreground whitespace-pre-line pt-1">
                  {overallRemarks || "No overall remarks recorded."}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
      {/* Stepper Buttons Controls */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
        <Button
          variant="outline"
          onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 1))}
          disabled={currentStep === 1}
          className="h-10 text-sm font-normal gap-1.5 rounded-xl text-slate-700 dark:text-slate-200 dark:text-slate-300"
        >
          <ChevronLeft className="h-4.5 w-4.5" /> Back
        </Button>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleSaveReport("Draft")}
            className="h-10 font-normal text-sm rounded-xl text-slate-700 dark:text-slate-200 dark:text-slate-300"
          >
            Save Draft
          </Button>

          {currentStep < STEPS.length ? (
            <Button
              onClick={() => {
                if (currentStep === 1 && (!clientId || !siteId)) {
                  alert("Please select Client and Site first.");
                  return;
                }
                if (currentStep === 3) {
                  const unansweredMandatory = questions.filter(
                    (q) =>
                      q.required &&
                      (!q.answer ||
                        (Array.isArray(q.answer) && q.answer.length === 0)),
                  );
                  if (unansweredMandatory.length > 0) {
                    alert(
                      "Please answer all mandatory questions (*) before proceeding.",
                    );
                    return;
                  }
                }
                setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
              }}
              className="h-10 text-sm font-normal gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5"
            >
              Next <ChevronRight className="h-4.5 w-4.5" />
            </Button>
          ) : (
            <Button
              onClick={() => handleSaveReport("Completed")}
              className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-normal text-sm rounded-xl px-6 flex items-center gap-2 shadow-sm"
            >
              Submit Report
            </Button>
          )}
        </div>
      </div>
      {/* POPUP 1: Add Temporary Guard */}
      <Dialog open={isAddGuardOpen} onOpenChange={setIsAddGuardOpen}>
        <DialogContent className="rounded-xl border max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Temporary Guard</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                Guard Name
              </label>
              <Input
                value={newGuardName}
                onChange={(e) => setNewGuardName(e.target.value)}
                placeholder="e.g. Amit Patil"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                Employee ID
              </label>
              <Input
                value={newGuardEmpId}
                onChange={(e) => setNewGuardEmpId(e.target.value)}
                placeholder="e.g. TEMP98"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsAddGuardOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddTemporaryGuard}
              className="bg-blue-600 text-white hover:bg-blue-700 h-9 text-xs"
            >
              Add Guard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* POPUP 2: Add Question On Spot */}
      <Dialog open={isAddQuestionOpen} onOpenChange={setIsAddQuestionOpen}>
        <DialogContent className="rounded-[16px] border border-border bg-card shadow-lg max-w-3xl p-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-foreground">
              Add New Question
            </h3>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-6 space-y-4 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {/* Left Column - Form */}
              <div className="md:col-span-3 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Section *
                  </label>
                  <Select value={qSection} onValueChange={setQSection}>
                    <SelectTrigger className="h-10 border-border rounded-lg bg-background text-foreground font-normal text-sm">
                      <SelectValue placeholder="Select section..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Security">Security</SelectItem>
                      <SelectItem value="Safety">Safety & Health</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Question *
                  </label>
                  <Textarea
                    value={qQuestion}
                    onChange={(e) => setQQuestion(e.target.value)}
                    placeholder="Enter your question here..."
                    className="min-h-[90px] border-border rounded-lg bg-background text-foreground font-normal text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Answer Type *
                  </label>
                  <Select
                    value={qType}
                    onValueChange={(val) => {
                      setQType(val);
                      if (val === "yes_no") {
                        setQOptions(["Yes", "No"]);
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 border-border rounded-lg bg-background text-foreground font-normal text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes_no">Yes / No</SelectItem>
                      <SelectItem value="text">Free Text</SelectItem>
                      <SelectItem value="number">Numeric Input</SelectItem>
                      <SelectItem value="dropdown">Dropdown Options</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Options */}
                {(qType === "yes_no" || qType === "dropdown") && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Options
                    </label>
                    <div className="space-y-2">
                      {qOptions.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className="flex items-center gap-2.5 bg-muted/20 dark:bg-slate-900/50 p-2 px-3 rounded-lg border border-slate-200 dark:border-slate-800"
                        >
                          <div className="h-4 w-4 rounded-full border border-slate-350 dark:border-slate-600 flex items-center justify-center shrink-0">
                            {oIdx === 0 && (
                              <div className="h-2 w-2 rounded-full bg-blue-600" />
                            )}
                          </div>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const updated = [...qOptions];
                              updated[oIdx] = e.target.value;
                              setQOptions(updated);
                            }}
                            className="bg-transparent border-none p-0 text-sm font-normal focus:ring-0 w-full text-slate-800 dark:text-slate-200 focus-visible:outline-none"
                          />

                          {qOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                setQOptions(
                                  qOptions.filter((_, idx) => idx !== oIdx),
                                );
                              }}
                              className="text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setQOptions([
                            ...qOptions,
                            `Option ${qOptions.length + 1}`,
                          ])
                        }
                        className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 mt-1"
                      >
                        + Add Option
                      </button>
                    </div>
                  </div>
                )}

                {/* Checkboxes */}
                <div className="space-y-2.5 pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={qRequired}
                      onChange={(e) => setQRequired(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                    />

                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 dark:text-slate-300">
                      Required Question
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={qPhotoReq}
                      onChange={(e) => setQPhotoReq(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                    />

                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 dark:text-slate-300">
                      Enable Photo Upload
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={qGpsReq}
                      onChange={(e) => setQGpsReq(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                    />

                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 dark:text-slate-300">
                      Capture Location
                    </span>
                  </label>
                </div>
              </div>

              {/* Right Column - Preview */}
              <div className="md:col-span-2 flex flex-col">
                <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/35 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex-1 flex flex-col gap-4 min-h-[300px]">
                  <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest block">
                    Preview
                  </span>

                  <div className="space-y-3 flex-1">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-snug break-words">
                      {qQuestion || "Is CCTV Camera Working?"}
                    </h4>

                    {/* Render simulated preview answer controls */}
                    {qType === "yes_no" && (
                      <div className="space-y-2">
                        {qOptions.map((opt, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 dark:text-slate-300"
                          >
                            <div
                              className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center shrink-0 ${idx === 0 ? "border-blue-600" : "border-slate-300 dark:border-slate-700"}`}
                            >
                              {idx === 0 && (
                                <div className="h-2 w-2 rounded-full bg-blue-600" />
                              )}
                            </div>
                            <span className="break-all">{opt}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {qType === "dropdown" && (
                      <div className="border rounded-lg bg-background p-2 text-xs text-muted-foreground flex justify-between items-center">
                        <span>Select option...</span>
                        <ChevronRight className="h-4 w-4 transform rotate-90" />
                      </div>
                    )}

                    {qType === "text" && (
                      <div className="border rounded-lg bg-background p-2 text-xs text-muted-foreground">
                        Type answer...
                      </div>
                    )}

                    {qType === "number" && (
                      <div className="border rounded-lg bg-background p-2 text-xs text-muted-foreground w-20">
                        0
                      </div>
                    )}
                  </div>

                  {/* Simulated Remarks Textarea */}
                  {qRemarksAllowed && (
                    <div className="space-y-1 mt-auto">
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        Remarks
                      </span>
                      <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 bg-background text-xs text-slate-400 dark:text-slate-500">
                        Enter remarks...
                      </div>
                    </div>
                  )}

                  {/* Simulated Upload Box */}
                  {qPhotoReq && (
                    <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-4 flex flex-col items-center justify-center bg-background/50 text-slate-500 dark:text-slate-400 dark:text-slate-500 text-[11px] gap-1.5 mt-2">
                      <Upload className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                      <span>Upload Photo (Optional)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 gap-2 flex items-center justify-end bg-slate-50 dark:bg-slate-900/50/50 dark:bg-slate-900/20">
            <Button
              variant="outline"
              onClick={() => setIsAddQuestionOpen(false)}
              className="rounded-xl h-10 px-5 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 dark:text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveQuestion}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-6 font-semibold shadow-sm"
            >
              Save Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* POPUP 3: Add/Edit Observation Side Drawer Mock / Dialog */}
      <Dialog open={isAddObsOpen} onOpenChange={setIsAddObsOpen}>
        <DialogContent className="rounded-xl border max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingObsId ? "Edit Observation" : "Add Observation"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                Action Point *
              </label>
              <Input
                value={obsActionPoint}
                onChange={(e) => setObsActionPoint(e.target.value)}
                placeholder="e.g. Fused Bulb at Gate 2"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                Observation *
              </label>
              <Textarea
                value={obsObservation}
                onChange={(e) => setObsObservation(e.target.value)}
                placeholder="Describe the safety hazard or security threat"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground">
                  Action Required
                </label>
                <Input
                  value={obsActionRequired}
                  onChange={(e) => setObsActionRequired(e.target.value)}
                  placeholder="What needs to be done?"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground">
                  Action Done (If any)
                </label>
                <Input
                  value={obsActionDone}
                  onChange={(e) => setObsActionDone(e.target.value)}
                  placeholder="Action already completed"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                Corrective Measures
              </label>
              <Input
                value={obsCorrective}
                onChange={(e) => setObsCorrective(e.target.value)}
                placeholder="Future preventive measure"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground">
                  Priority
                </label>
                <Select
                  value={obsPriority}
                  onValueChange={(val) => setObsPriority(val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground">
                  Status
                </label>
                <Select
                  value={obsStatus}
                  onValueChange={(val) => setObsStatus(val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                Remarks
              </label>
              <Input
                value={obsRemarks}
                onChange={(e) => setObsRemarks(e.target.value)}
                placeholder="Additional notes or comments"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                Upload Observation Photos (Multiple Allowed)
              </label>
              <div className="border border-dashed rounded-lg p-4 flex flex-col items-center justify-center bg-muted/20 cursor-pointer hover:bg-muted/40 transition-all">
                <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">
                  Select multiple images
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsAddObsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveObservation}
              className="bg-primary text-white hover:bg-primary/90"
            >
              Save Observation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}