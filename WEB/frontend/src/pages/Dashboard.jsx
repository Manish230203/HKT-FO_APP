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
import api from "../services/api";

export default function Dashboard() {
  const navigate = useNavigate();

  // State for metrics & data
  const [roundReports, setRoundReports] = useState([]);
  const [visitReports, setVisitReports] = useState([]);
  const [clients, setClients] = useState([]);
  const [branches, setBranches] = useState([]);
  const [sites, setSites] = useState([]);
  
  // Sudden Visit Modal State
  const [isSuddenVisitModalOpen, setIsSuddenVisitModalOpen] = useState(false);
  const [suddenClient, setSuddenClient] = useState("");
  const [suddenBranch, setSuddenBranch] = useState("");
  const [suddenSite, setSuddenSite] = useState("");
  const [suddenVisitType, setSuddenVisitType] = useState("");
  
  // Planned visits state
  const [plannedVisits, setPlannedVisits] = useState([]);
  
  // Filters state
  const [filterClient, setFilterClient] = useState("all");
  const [filterSite, setFilterSite] = useState("all");
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
        // Fetch clients
        const clientRes = await api.get("/assessments/clients");
        setClients(clientRes.data || []);

        // Fetch sites
        const siteRes = await api.get("/assessments/sites");
        setSites(siteRes.data || []);

        // Fetch branches
        const branchRes = await api.get("/assessments/branches");
        setBranches(branchRes.data || []);

        // Fetch round reports
        const roundRes = await api.get("/officer-rounds/reports");
        setRoundReports(roundRes.data || []);

        // Fetch visit reports
        const visitRes = await api.get("/officer-visits/reports");
        setVisitReports(visitRes.data || []);

        // Load planned visits from localStorage, or initialize with mock data
        const storedPlanned = localStorage.getItem("planned_visits");
        if (storedPlanned) {
          setPlannedVisits(JSON.parse(storedPlanned));
        } else {
          const defaultPlanned = [
            {
              id: "pv-1",
              clientId: clientRes.data?.[0]?.id || 1,
              clientName: clientRes.data?.[0]?.name || "Tata Power",
              siteId: siteRes.data?.[0]?.id || 1,
              siteName: siteRes.data?.[0]?.name || "Pimpri Substation",
              date: new Date().toISOString().split("T")[0],
              shift: "Morning",
              officerName: "Field Officer Amit",
              status: "Pending",
            },
            {
              id: "pv-2",
              clientId: clientRes.data?.[0]?.id || 1,
              clientName: clientRes.data?.[0]?.name || "Tata Power",
              siteId: siteRes.data?.[1]?.id || 2,
              siteName: siteRes.data?.[1]?.name || "Chinchwad Hub",
              date: new Date().toISOString().split("T")[0],
              shift: "Evening",
              officerName: "Field Officer Rajesh",
              status: "Completed",
            },
            {
              id: "pv-3",
              clientId: clientRes.data?.[1]?.id || 2,
              clientName: clientRes.data?.[1]?.name || "Humankind Tech",
              siteId: siteRes.data?.[2]?.id || 3,
              siteName: siteRes.data?.[2]?.name || "Baner HQ Office",
              date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
              shift: "Night A",
              officerName: "Field Officer Priyansh",
              status: "Pending",
            },
            {
              id: "pv-4",
              clientId: clientRes.data?.[1]?.id || 2,
              clientName: clientRes.data?.[1]?.name || "Humankind Tech",
              siteId: siteRes.data?.[0]?.id || 1,
              siteName: siteRes.data?.[0]?.name || "Pimpri Substation",
              date: new Date(Date.now() - 86400000).toISOString().split("T")[0],
              shift: "Morning",
              officerName: "Field Officer Amit",
              status: "Overdue",
            },
          ];
          setPlannedVisits(defaultPlanned);
          localStorage.setItem("planned_visits", JSON.stringify(defaultPlanned));
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
    setFilterStatus("all");
    setDateFilterType("today");
    setFilterDate("");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  const handleStartVisit = (pv) => {
    navigate(`/officer-visits/create?clientId=${pv.clientId}&siteId=${pv.siteId}&plannedId=${pv.id}`);
  };

  const handleStartSuddenVisit = () => {
    if (!suddenClient || !suddenBranch || !suddenSite || !suddenVisitType) {
      alert("All fields are mandatory.");
      return;
    }

    setIsSuddenVisitModalOpen(false);

    if (suddenVisitType === "night_round" || suddenVisitType === "day_round") {
      const shiftVal = suddenVisitType === "night_round" ? "Night" : "Day";
      navigate(
        `/officer-rounds/create?clientId=${suddenClient}&branchId=${suddenBranch}&siteId=${suddenSite}&shift=${shiftVal}&type=Surprise`
      );
    } else if (suddenVisitType === "general_visit") {
      navigate(
        `/general-visits?open=true&clientId=${suddenClient}&siteId=${suddenSite}`
      );
    }
  };

  // Filter planned visits
  const filteredPlanned = plannedVisits.filter((pv) => {
    const matchesClient = filterClient === "all" || pv.clientId?.toString() === filterClient;
    const matchesSite = filterSite === "all" || pv.siteId?.toString() === filterSite;
    const matchesStatus = filterStatus === "all" || pv.status?.toLowerCase() === filterStatus.toLowerCase();
    
    let matchesDate = true;
    if (dateFilterType === "today") {
      const todayStr = new Date().toISOString().split("T")[0];
      matchesDate = pv.date === todayStr;
    } else if (dateFilterType === "yesterday") {
      const yesterday = new Date(Date.now() - 86400000);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      matchesDate = pv.date === yesterdayStr;
    } else if (dateFilterType === "weekly") {
      const pvDateObj = new Date(pv.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      pvDateObj.setHours(0, 0, 0, 0);
      const diffTime = Math.abs(today - pvDateObj);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      matchesDate = diffDays <= 7;
    } else if (dateFilterType === "custom") {
      const matchesStart = !filterStartDate || pv.date >= filterStartDate;
      const matchesEnd = !filterEndDate || pv.date <= filterEndDate;
      matchesDate = matchesStart && matchesEnd;
    }
    
    return matchesClient && matchesSite && matchesStatus && matchesDate;
  });

  // KPI Calculations
  const totalPlannedCount = plannedVisits.length;
  const pendingPlannedCount = plannedVisits.filter((pv) => pv.status === "Pending").length;
  const completedPlannedCount = plannedVisits.filter((pv) => pv.status === "Completed").length;
  
  // Total unique sites inspected across both Rounds & Visits
  const uniqueVisitedRoundSites = roundReports.filter((r) => r.status === "Completed" && r.siteId).map((r) => r.siteId);
  const uniqueVisitedVisitSites = visitReports.filter((r) => r.status === "Completed" && r.siteId).map((r) => r.siteId);
  const uniqueSitesVisited = new Set([...uniqueVisitedRoundSites, ...uniqueVisitedVisitSites]).size;

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
            setIsSuddenVisitModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 h-10 px-4 font-semibold text-xs shrink-0 self-start md:self-auto"
        >
          <PlusCircle className="h-4.5 w-4.5" /> Add Sudden Visit
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Planned Visits */}
        {/* KPI 1: Planned Visits */}
        <Card className="kpi-card kpi-card-blue rounded-[14px] overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Planned Visits
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {totalPlannedCount}
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
                {uniqueSitesVisited}
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-green">
              <MapPin className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Night Round Reports */}
        <Card className="kpi-card kpi-card-purple rounded-[14px] overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                Night Round Reports
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {roundReports.length}
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-purple">
              <ShieldCheck className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Officer Visit Reports */}
        <Card className="kpi-card kpi-card-red rounded-[14px] overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Officer Visit Reports
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {visitReports.length}
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-red">
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
          
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 bg-muted/20 p-3.5 rounded-xl border border-border/60">
            {/* Client Filter */}
            <div className="w-full sm:w-auto min-w-[150px]">
              <Select value={filterClient} onValueChange={setFilterClient}>
                <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs font-normal rounded-lg">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Site Filter */}
            <div className="w-full sm:w-auto min-w-[150px]">
              <Select value={filterSite} onValueChange={setFilterSite}>
                <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs font-normal rounded-lg">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites
                    .filter((s) => filterClient === "all" || s.client_name === clients.find(c => c.id.toString() === filterClient)?.name)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="w-full sm:w-auto min-w-[120px]">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs font-normal rounded-lg">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Preset Filter */}
            <div className="w-full sm:w-auto min-w-[130px]">
              <Select
                value={dateFilterType}
                onValueChange={(val) => {
                  setDateFilterType(val);
                  if (val !== "custom") {
                    setFilterStartDate("");
                    setFilterEndDate("");
                  }
                }}
              >
                <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs font-normal rounded-lg">
                  <SelectValue placeholder="All Dates" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Input (shown only if Custom Range is selected) */}
            {dateFilterType === "custom" && (
              <>
                <div className="w-full sm:w-auto min-w-[150px] flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">From</span>
                  <Input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="h-9 border-border bg-background text-foreground text-xs rounded-lg"
                  />
                </div>
                <div className="w-full sm:w-auto min-w-[150px] flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">To</span>
                  <Input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="h-9 border-border bg-background text-foreground text-xs rounded-lg"
                  />
                </div>
              </>
            )}

            {/* Reset Filters */}
            <Button
              variant="ghost"
              onClick={handleResetFilters}
              className="text-muted-foreground hover:text-foreground h-9 px-3 text-xs flex items-center gap-1 rounded-lg ml-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          </div>

          {/* Planned Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Planned Date</TableHead>
                  <TableHead className="font-semibold text-slate-700">Client / Company</TableHead>
                  <TableHead className="font-semibold text-slate-700">Site Location</TableHead>
                  <TableHead className="font-semibold text-slate-700">Officer Assigned</TableHead>
                  <TableHead className="font-semibold text-slate-700">Shift</TableHead>
                  <TableHead className="font-semibold text-slate-700">Status</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700 pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading planned visit schedules...
                    </TableCell>
                  </TableRow>
                ) : filteredPlanned.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">
                      No planned visits found matching active filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPlanned.map((pv) => (
                    <TableRow key={pv.id} className="hover:bg-muted/20">
                      <TableCell className="font-semibold text-foreground">
                        {pv.date}
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
                      <TableCell className="text-muted-foreground">
                        {pv.shift}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            pv.status === "Completed"
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 px-2 py-0.5 rounded-full"
                              : pv.status === "Overdue"
                                ? "bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-rose-500/20 px-2 py-0.5 rounded-full"
                                : "bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20 px-2 py-0.5 rounded-full"
                          }
                        >
                          {pv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {pv.status === "Completed" ? (
                          <span className="text-[10px] text-muted-foreground font-semibold flex items-center justify-end gap-1">
                            <UserCheck className="h-3.5 w-3.5 text-emerald-500" /> Visit Done
                          </span>
                        ) : (
                          <Button
                            onClick={() => handleStartVisit(pv)}
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-7 px-3 text-[10px] font-semibold flex items-center gap-1 shadow-sm ml-auto"
                          >
                            Start Visit <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Sudden Visit Modal */}
      <Dialog open={isSuddenVisitModalOpen} onOpenChange={setIsSuddenVisitModalOpen}>
        <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Add Sudden Visit</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Client</label>
              <Select value={suddenClient} onValueChange={(val) => {
                setSuddenClient(val);
                setSuddenSite(""); // Reset site when client changes
              }}>
                <SelectTrigger className="h-10 text-xs bg-slate-800 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Select Client" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 text-xs">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()} className="focus:bg-slate-700 focus:text-slate-100">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Branch</label>
              <Select value={suddenBranch} onValueChange={setSuddenBranch}>
                <SelectTrigger className="h-10 text-xs bg-slate-800 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Select Branch" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 text-xs">
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()} className="focus:bg-slate-700 focus:text-slate-100">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Site</label>
              <Select value={suddenSite} onValueChange={setSuddenSite}>
                <SelectTrigger className="h-10 text-xs bg-slate-800 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Select Site" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 text-xs">
                  {sites
                    .filter((s) => !suddenClient || s.client_name === clients.find((c) => c.id.toString() === suddenClient)?.name)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()} className="focus:bg-slate-700 focus:text-slate-100">
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Type of Visit</label>
              <Select value={suddenVisitType} onValueChange={setSuddenVisitType}>
                <SelectTrigger className="h-10 text-xs bg-slate-800 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Select Type of Visit" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 text-xs">
                  <SelectItem value="night_round" className="focus:bg-slate-700 focus:text-slate-100">Night Round</SelectItem>
                  <SelectItem value="day_round" className="focus:bg-slate-700 focus:text-slate-100">Day Round</SelectItem>
                  <SelectItem value="general_visit" className="focus:bg-slate-700 focus:text-slate-100">General Visit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSuddenVisitModalOpen(false)}
              className="text-xs border-slate-700 hover:bg-slate-800 text-slate-100"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleStartSuddenVisit}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              Start Visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
