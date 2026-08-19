import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Calendar,
  MapPin,
  Search,
  PlusCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  FileText,
  UserCheck,
  RotateCcw,
  Moon,
  Sun,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import api from "../services/api";

export default function Dashboard() {
  const navigate = useNavigate();

  // State for metrics & data
  const [roundReports, setRoundReports] = useState([]);
  const [visitReports, setVisitReports] = useState([]);
  const [generalReports, setGeneralReports] = useState([]);
  const [clients, setClients] = useState([]);
  const [branches, setBranches] = useState([]);
  const [sites, setSites] = useState([]);

  // Sudden Visit Modal State
  const [isSuddenVisitModalOpen, setIsSuddenVisitModalOpen] = useState(false);
  const [suddenClient, setSuddenClient] = useState("");
  const [suddenBranch, setSuddenBranch] = useState("");
  const [suddenSite, setSuddenSite] = useState("");
  const [suddenVisitType, setSuddenVisitType] = useState("");
  const [suddenDate, setSuddenDate] = useState("");
  const [suddenRemark, setSuddenRemark] = useState("");

  // Planned visits state
  const [plannedVisits, setPlannedVisits] = useState([]);
  const [activeTab, setActiveTab] = useState("Planned");

  // Start Visit Modal State
  const [isStartVisitTypeModalOpen, setIsStartVisitTypeModalOpen] = useState(false);
  const [selectedPlannedVisit, setSelectedPlannedVisit] = useState(null);

  // User role check for Admin vs Field Officer
  const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
  const currentUser = userStr ? JSON.parse(userStr) : null;
  const isAdmin = currentUser ? ["Admin", "ADMIN", "admin", "Super Admin"].includes(currentUser.role) : false;
  // empOid for scoped API calls (Field Officers only)
  const empOid = (!isAdmin && currentUser?.id) ? String(currentUser.id) : null;

  // Filters state
  const [filterClient, setFilterClient] = useState("all");
  const [filterSite, setFilterSite] = useState("all");
  const [filterOfficer, setFilterOfficer] = useState(() => {
    if (currentUser) {
      if (["Admin", "ADMIN", "admin", "Super Admin"].includes(currentUser.role)) {
        return "all";
      }
      if (currentUser.name) return currentUser.name;
    }
    return "all";
  });
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFilterType, setDateFilterType] = useState("today");
  const [filterDate, setFilterDate] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Loading state
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch clients — scoped to officer's assigned clients if non-admin
        const clientParams = empOid ? `?empOid=${empOid}` : "";
        const clientRes = await api.get(`/assessments/clients${clientParams}`);
        setClients(clientRes.data || []);

        // Fetch sites — scoped to officer's assigned sites if non-admin
        const siteParams = empOid ? `?empOid=${empOid}` : "";
        const siteRes = await api.get(`/assessments/sites${siteParams}`);
        setSites(siteRes.data || []);

        // Fetch branches
        const branchRes = await api.get("/assessments/branches");
        setBranches(branchRes.data || []);

        // Fetch round reports — scoped to officer if non-admin
        const roundParams = empOid ? `?empOid=${empOid}` : "";
        const roundRes = await api.get(`/officer-rounds/reports${roundParams}`);
        setRoundReports(roundRes.data || []);

        // Fetch visit reports — scoped to officer if non-admin
        const visitParams = empOid ? `?empOid=${empOid}` : "";
        const visitRes = await api.get(`/officer-visits/reports${visitParams}`);
        setVisitReports(visitRes.data || []);

        // Fetch general visit reports — scoped to officer if non-admin
        try {
          const generalParams = empOid ? `?empOid=${empOid}` : "";
          const generalRes = await api.get(`/general-visits${generalParams}`);
          setGeneralReports(generalRes.data || []);
        } catch (e) {
          console.error("Failed to load general visits", e);
        }

        // Fetch dynamic planned visits — scoped to officer if non-admin
        try {
          const plannedParams = empOid ? `?empOid=${empOid}` : "";
          const plannedRes = await api.get(`/planned-visits${plannedParams}`);
          if (plannedRes.data && Array.isArray(plannedRes.data)) {
            setPlannedVisits(plannedRes.data);
          }
        } catch (pvErr) {
          console.error("Failed to load planned visits from DB", pvErr);
        }
      } catch (error) {
        console.error("Error loading dashboard metrics", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleResetFilters = () => {
    setFilterClient("all");
    setFilterSite("all");
    setFilterOfficer(isAdmin ? "all" : (currentUser?.name || "PAPPU KUMAR"));
    setFilterStatus("all");
    setDateFilterType("today");
    setFilterDate("");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  const handleStartVisit = (pv) => {
    setSelectedPlannedVisit(pv);
    setIsStartVisitTypeModalOpen(true);
  };

  const handleSuddenVisitSubmit = () => {
    if (!suddenClient || !suddenSite || !suddenVisitType) {
      alert("Please fill in Client, Site, and Visit Type.");
      return;
    }
    setIsSuddenVisitModalOpen(false);

    if (suddenVisitType === "night_round") {
      navigate(
        `/officer-rounds/create?clientId=${suddenClient}&siteId=${suddenSite}&date=${suddenDate}&remark=${encodeURIComponent(suddenRemark)}`
      );
    } else if (suddenVisitType === "day_round") {
      navigate(
        `/officer-visits/create?clientId=${suddenClient}&siteId=${suddenSite}&date=${suddenDate}&remark=${encodeURIComponent(suddenRemark)}`
      );
    } else if (suddenVisitType === "general_visit") {
      navigate(
        `/general-visits?open=true&clientId=${suddenClient}&siteId=${suddenSite}&date=${suddenDate}&remark=${encodeURIComponent(suddenRemark)}`
      );
    }
  };

  // Unique officers list for filter dropdown
  const officersList = Array.from(
    new Set(plannedVisits.map((pv) => pv.officerName).filter(Boolean))
  );

  // Filter planned visits for Planned tab
  const filteredPlanned = plannedVisits.filter((pv) => {
    // Exclude fully completed plans from Planned tab
    if (pv.status === "Completed" || (pv.completedVisits > 0 && pv.completedVisits >= pv.visitFrequency)) {
      return false;
    }

    // Officer filter: default to logged-in officer
    if (filterOfficer !== "all") {
      const targetOff = filterOfficer.toLowerCase().trim();
      const pvOff = (pv.officerName || "").toLowerCase().trim();
      if (!pvOff.includes(targetOff) && targetOff !== pv.officerId?.toString()) {
        return false;
      }
    }

    // Client filter
    if (filterClient !== "all" && pv.clientId?.toString() !== filterClient) {
      return false;
    }

    // Site filter
    if (filterSite !== "all" && pv.siteId?.toString() !== filterSite) {
      return false;
    }

    return true;
  });

  // Individual completed reports for Completed tab (showing visits one by one)
  const completedVisitsList = [
    ...roundReports.map((r) => {
      const matchedClient = clients.find((c) => c.id == (r.clientId || r.client_id));
      const matchedPlan = plannedVisits.find((p) => p.siteId == (r.siteId || r.site_id));
      const planTypeVal = matchedPlan?.planningType ? (
        matchedPlan.planningType.toUpperCase() === "WEEKLY" ? "Weekly" :
        matchedPlan.planningType.toUpperCase() === "MONTHLY" ? "Monthly" :
        matchedPlan.planningType.toUpperCase() === "SINGLE" ? "Single" :
        matchedPlan.planningType
      ) : "Single";

      return {
        id: r.id || r.oid,
        reportId: r.reportId || r.report_id,
        date: r.visitDate || r.visit_date || (r.createdAt ? String(r.createdAt).substring(0, 10) : "N/A"),
        clientId: r.clientId || r.client_id,
        clientName: r.clientName || r.client_name || r.company || matchedClient?.name || "N/A",
        siteId: r.siteId || r.site_id,
        siteName: r.unit || r.siteName || "N/A",
        officerName: r.officer || r.officerName || "Field Officer",
        visitType: "Night Round",
        planType: planTypeVal,
        type: "Night Round",
        status: "Completed",
        url: `/officer-rounds/preview/${r.id || r.oid}`,
      };
    }),
    ...visitReports.map((r) => {
      const matchedClient = clients.find((c) => c.id == (r.clientId || r.client_id));
      const matchedPlan = plannedVisits.find((p) => p.siteId == (r.siteId || r.site_id));
      const planTypeVal = matchedPlan?.planningType ? (
        matchedPlan.planningType.toUpperCase() === "WEEKLY" ? "Weekly" :
        matchedPlan.planningType.toUpperCase() === "MONTHLY" ? "Monthly" :
        matchedPlan.planningType.toUpperCase() === "SINGLE" ? "Single" :
        matchedPlan.planningType
      ) : "Single";

      return {
        id: r.id || r.oid,
        reportId: r.reportId || r.report_id,
        date: r.visitDate || r.visit_date || (r.createdAt ? String(r.createdAt).substring(0, 10) : "N/A"),
        clientId: r.clientId || r.client_id,
        clientName: r.clientName || r.client_name || r.company || matchedClient?.name || "N/A",
        siteId: r.siteId || r.site_id,
        siteName: r.unit || r.siteName || "N/A",
        officerName: r.officer || r.officerName || "Field Officer",
        visitType: "Day Visit",
        planType: planTypeVal,
        type: "Day Visit",
        status: "Completed",
        url: `/officer-visits/preview/${r.id || r.oid}`,
      };
    }),
  ]
    .filter((v) => {
      if (filterOfficer !== "all") {
        const targetOff = filterOfficer.toLowerCase().trim();
        const vOff = (v.officerName || "").toLowerCase().trim();
        if (!vOff.includes(targetOff)) return false;
      }
      if (filterClient !== "all" && v.clientId?.toString() !== filterClient) {
        return false;
      }
      if (filterSite !== "all" && v.siteId?.toString() !== filterSite) {
        return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Dynamic KPI Calculations from live Database records
  const plannedVisitsCount = plannedVisits.length;

  const sitesVisitedSet = new Set([
    ...roundReports.map((r) => r.siteId || r.unit).filter(Boolean),
    ...visitReports.map((r) => r.siteId || r.unit).filter(Boolean),
    ...generalReports.map((r) => r.siteId || r.unit).filter(Boolean),
  ]);
  const sitesVisitedCount = sitesVisitedSet.size;

  const pendingVisitsCount = plannedVisits.filter((pv) => pv.status === "Pending" || pv.status === "Overdue").length;

  const totalReportsCount = roundReports.length + visitReports.length + generalReports.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 text-sm">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <LayoutDashboard className="h-5.5 w-5.5 text-blue-600" /> Operations Dashboard
          </h1>
        </div>
        <Button
          onClick={() => {
            setSuddenClient("");
            setSuddenBranch("");
            setSuddenSite("");
            setSuddenVisitType("");
            setSuddenDate(new Date().toISOString().split("T")[0]);
            setSuddenRemark("");
            setIsSuddenVisitModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 h-10 px-4 font-semibold text-xs shrink-0 self-start md:self-auto"
        >
          <PlusCircle className="h-4.5 w-4.5" /> Add Visit
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Planned Visits */}
        <Card className="kpi-card kpi-card-blue rounded-[14px] overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Planned Visits
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {plannedVisitsCount}
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-blue">
              <Calendar className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Sites Visited */}
        <Card className="kpi-card kpi-card-green rounded-[14px] overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Sites Visited
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {sitesVisitedCount}
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-green">
              <MapPin className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Pending Visits - RED */}
        <Card className="kpi-card kpi-card-red rounded-[14px] overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Pending Visits
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {pendingVisitsCount}
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-red">
              <Clock className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Reports - PURPLE / VIOLET */}
        <Card className="kpi-card kpi-card-purple rounded-[14px] overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                Reports
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {totalReportsCount}
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-purple">
              <FileText className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Planned Visits Schedules */}
      <Card className="rounded-[14px] border border-border bg-card shadow-sm">
        <CardHeader className="border-b pb-4 px-6">
          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-4.5 w-4.5 text-blue-600" /> Planned Visit Schedules
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">

          {/* Tabs & Filters Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border/60 pb-2 mb-4 gap-3">
            {/* Status Tabs */}
            <div className="flex gap-2">
              {["Planned", "Completed"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${activeTab === tab
                      ? "bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-600/20"
                      : "text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Officer Filter Dropdown (Visible ONLY to Admin) */}
            {isAdmin && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider whitespace-nowrap">
                  Officer:
                </span>
                <Select value={filterOfficer} onValueChange={setFilterOfficer}>
                  <SelectTrigger className="h-8 text-xs bg-background border-input text-foreground w-[180px] rounded-lg">
                    <SelectValue placeholder="All Officers" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-foreground">
                    <SelectItem value="all">All Officers</SelectItem>
                    {officersList.map((off) => (
                      <SelectItem key={off} value={off}>
                        {off}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Planned Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Planned Period</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Client</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Site Location</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Officer Assigned</TableHead>
                  {activeTab === "Completed" && (
                    <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Visit Type</TableHead>
                  )}
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Plan Type</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Status</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-200 pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={activeTab === "Completed" ? 8 : 7} className="text-center py-8 text-muted-foreground">
                      Loading visit schedules...
                    </TableCell>
                  </TableRow>
                ) : activeTab === "Completed" ? (
                  /* COMPLETED TAB: Displays completed visits / reports one by one with Visit Type */
                  completedVisitsList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground italic">
                        No completed visits found matching active filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    completedVisitsList.map((v) => (
                      <TableRow key={`comp-${v.id}-${v.type}`} className="hover:bg-muted/20">
                        <TableCell className="font-semibold text-foreground">
                          {v.date}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {v.clientName}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {v.siteName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {v.officerName}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-medium">
                          {v.visitType}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-medium">
                          {v.planType}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 px-2.5 py-0.5 rounded-full font-bold">
                            Completed
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button
                            onClick={() => navigate(v.url)}
                            size="sm"
                            variant="outline"
                            className="text-xs border-border hover:bg-muted text-foreground h-7 px-3 font-semibold ml-auto flex items-center gap-1"
                          >
                            View Report <ArrowRight className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )
                ) : (
                  /* PLANNED TAB: Displays planned visit schedules without Visit Type column */
                  filteredPlanned.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">
                        No planned visits found matching active filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPlanned.map((pv) => {
                      const visitsDone = pv.completedVisits || 0;
                      // Colour code: 0 visits done = Dark Red Pending, at least 1 visit done = Yellow Pending
                      const isZeroDone = visitsDone === 0;

                      return (
                        <TableRow key={pv.id} className="hover:bg-muted/20">
                          <TableCell className="font-semibold text-foreground whitespace-nowrap">
                            {pv.plannedPeriod || pv.date}
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {pv.clientName}
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {pv.siteName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {pv.officerName}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-medium">
                            {pv.shift}
                          </TableCell>
                          <TableCell>
                            {isZeroDone ? (
                              <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 px-2.5 py-0.5 rounded-full font-bold">
                                Pending
                              </Badge>
                            ) : (
                              <span className="text-foreground font-medium text-xs">
                                Pending
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button
                              onClick={() => handleStartVisit(pv)}
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-7 px-3 text-[10px] font-semibold flex items-center gap-1 shadow-sm ml-auto"
                            >
                              Start Visit <ArrowRight className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Visit Modal */}
      <Dialog open={isSuddenVisitModalOpen} onOpenChange={setIsSuddenVisitModalOpen}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add Visit</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Client</label>
              <Select value={suddenClient} onValueChange={(val) => {
                setSuddenClient(val);
                setSuddenSite(""); // Reset site when client changes
              }}>
                <SelectTrigger className="h-9 text-xs bg-background border-input text-foreground">
                  <SelectValue placeholder="Select Client" />
                </SelectTrigger>
                <SelectContent className="bg-background border-input text-foreground text-xs">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()} className="focus:bg-accent focus:text-accent-foreground">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Branch</label>
              <Select value={suddenBranch} onValueChange={setSuddenBranch}>
                <SelectTrigger className="h-9 text-xs bg-background border-input text-foreground">
                  <SelectValue placeholder="Select Branch" />
                </SelectTrigger>
                <SelectContent className="bg-background border-input text-foreground text-xs">
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()} className="focus:bg-accent focus:text-accent-foreground">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Site</label>
              <Select value={suddenSite} onValueChange={setSuddenSite}>
                <SelectTrigger className="h-9 text-xs bg-background border-input text-foreground">
                  <SelectValue placeholder="Select Site" />
                </SelectTrigger>
                <SelectContent className="bg-background border-input text-foreground text-xs">
                  {sites
                    .filter((s) => !suddenClient || s.client_id?.toString() === suddenClient)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()} className="focus:bg-accent focus:text-accent-foreground">
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Type of Visit</label>
              <Select value={suddenVisitType} onValueChange={setSuddenVisitType}>
                <SelectTrigger className="h-9 text-xs bg-background border-input text-foreground">
                  <SelectValue placeholder="Select Type of Visit" />
                </SelectTrigger>
                <SelectContent className="bg-background border-input text-foreground text-xs">
                  <SelectItem value="night_round" className="focus:bg-accent focus:text-accent-foreground">Night Round</SelectItem>
                  <SelectItem value="day_round" className="focus:bg-accent focus:text-accent-foreground">Day Round</SelectItem>
                  <SelectItem value="general_visit" className="focus:bg-accent focus:text-accent-foreground">General Visit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Date</label>
              <Input
                type="date"
                value={suddenDate}
                onChange={(e) => setSuddenDate(e.target.value)}
                className="h-9 text-xs bg-background border-input text-foreground [&::-webkit-calendar-picker-indicator]:invert"
              />
            </div>

            <div className="grid gap-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Remark</label>
              <Textarea
                placeholder="Write visit remark/notes..."
                value={suddenRemark}
                onChange={(e) => setSuddenRemark(e.target.value)}
                className="min-h-[50px] text-xs bg-background border-input text-foreground placeholder:text-slate-500 dark:text-slate-400 dark:text-slate-500 rounded-lg"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSuddenVisitModalOpen(false)}
              className="text-xs border-border hover:bg-muted text-foreground h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSuddenVisitSubmit}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-9"
            >
              Start Visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Visit: Visit Type Selection Modal */}
      <Dialog open={isStartVisitTypeModalOpen} onOpenChange={setIsStartVisitTypeModalOpen}>
        <DialogContent className="sm:max-w-[430px] p-5 bg-card border-border text-foreground rounded-2xl shadow-xl">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-foreground flex items-center gap-2 text-sm font-bold">
              <Calendar className="h-4.5 w-4.5 text-blue-600" /> Start Visit: {selectedPlannedVisit?.siteName}
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Select the type of visit inspection to conduct for <span className="font-semibold text-foreground">{selectedPlannedVisit?.siteName}</span> ({selectedPlannedVisit?.clientName}):
            </p>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2.5 py-2">
            {/* Night Round Option */}
            <button
              onClick={() => {
                setIsStartVisitTypeModalOpen(false);
                navigate(`/officer-rounds/create?clientId=${selectedPlannedVisit?.clientId}&siteId=${selectedPlannedVisit?.siteId}&plannedId=${selectedPlannedVisit?.id}`);
              }}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 hover:border-indigo-500/40 transition-all text-left group"
            >
              <div className="h-9 w-9 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Moon className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-xs text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex items-center justify-between">
                  Night Round Inspection <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  Conduct official night patrolling & guard check
                </p>
              </div>
            </button>

            {/* Day Visit Option */}
            <button
              onClick={() => {
                setIsStartVisitTypeModalOpen(false);
                navigate(`/officer-visits/create?clientId=${selectedPlannedVisit?.clientId}&siteId=${selectedPlannedVisit?.siteId}&plannedId=${selectedPlannedVisit?.id}`);
              }}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background hover:bg-amber-50/50 dark:hover:bg-amber-950/30 hover:border-amber-500/40 transition-all text-left group"
            >
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Sun className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-xs text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 flex items-center justify-between">
                  Day Visit Inspection <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  Record daytime officer site audit & feedback
                </p>
              </div>
            </button>
          </div>

          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsStartVisitTypeModalOpen(false)}
              className="text-xs border-border hover:bg-muted text-foreground h-8 px-4 rounded-lg"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}