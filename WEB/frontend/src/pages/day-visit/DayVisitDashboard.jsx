import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Calendar,
  Building2,
  MapPin,
  ClipboardCheck,
  Search,
  PlusCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  FileText,
  UserCheck,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import api from "../../services/api";

export default function VisitDashboard() {
  const navigate = useNavigate();

  // State for metrics & data
  const [reports, setReports] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);

  // Planned visits state (stored in localStorage or state)
  const [plannedVisits, setPlannedVisits] = useState([]);

  // Filters state
  const [filterClient, setFilterClient] = useState("all");
  const [filterSite, setFilterSite] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDate, setFilterDate] = useState("");

  // Loading states
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

        // Fetch submitted reports to count unique visited sites
        const reportsRes = await api.get("/officer-visits/reports");
        const allReports = reportsRes.data || [];
        setReports(allReports);

        // Load planned visits from localStorage, or initialize with mock data
        const storedPlanned = localStorage.getItem("planned_visits");
        if (storedPlanned) {
          setPlannedVisits(JSON.parse(storedPlanned));
        } else {
          // Generate mock planned visits relative to loaded clients/sites if possible
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
              date: new Date(Date.now() + 86400000).toISOString().split("T")[0], // Tomorrow
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
              date: new Date(Date.now() - 86400000).toISOString().split("T")[0], // Yesterday
              shift: "Morning",
              officerName: "Field Officer Amit",
              status: "Overdue",
            },
          ];
          setPlannedVisits(defaultPlanned);
          localStorage.setItem("planned_visits", JSON.stringify(defaultPlanned));
        }
      } catch (error) {
        console.error("Error fetching dashboard data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Reset Filters
  const handleResetFilters = () => {
    setFilterClient("all");
    setFilterSite("all");
    setFilterStatus("all");
    setFilterDate("");
  };

  // Start Visit navigation handler
  const handleStartVisit = (pv) => {
    navigate(`/officer-visits/create?clientId=${pv.clientId}&siteId=${pv.siteId}&plannedId=${pv.id}`);
  };

  // Filtered planned visits
  const filteredPlanned = plannedVisits.filter((pv) => {
    const matchesClient = filterClient === "all" || pv.clientId?.toString() === filterClient;
    const matchesSite = filterSite === "all" || pv.siteId?.toString() === filterSite;
    const matchesStatus = filterStatus === "all" || pv.status?.toLowerCase() === filterStatus.toLowerCase();
    const matchesDate = !filterDate || pv.date === filterDate;
    return matchesClient && matchesSite && matchesStatus && matchesDate;
  });

  // KPI Calculations
  const totalPlannedCount = plannedVisits.length;
  const pendingPlannedCount = plannedVisits.filter((pv) => pv.status === "Pending").length;
  const completedPlannedCount = plannedVisits.filter((pv) => pv.status === "Completed").length;

  // Sites Visited (Unique Site names/Ids from completed reports)
  const uniqueSitesVisited = new Set(
    reports.filter((r) => r.status === "Completed" && r.siteId).map((r) => r.siteId)
  ).size;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 text-xs">
      {/* Title Header with Sudden Visit Button */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <LayoutDashboard className="h-5.5 w-5.5 text-blue-600" /> Visit Scheduling & Operations
          </h1>
          <p className="text-muted-foreground text-xs">
            Plan, monitor, and record official site inspection visits.
          </p>
        </div>
        <Button
          onClick={() => navigate("/officer-visits/create?type=Surprise")}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 h-10 px-4 font-semibold text-xs shrink-0 self-start md:self-auto"
        >
          <PlusCircle className="h-4.5 w-4.5" /> Add Sudden Visit
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Planned Visits */}
        <Card className="rounded-[14px] border border-border bg-card shadow-sm overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider block">
                Planned Visits
              </span>
              <span className="text-2xl font-bold text-foreground block">
                {totalPlannedCount}
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 text-amber-500" /> {pendingPlannedCount} pending, {completedPlannedCount} completed
              </span>
            </div>
            <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-blue-600 shrink-0">
              <Calendar className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Sites Visited */}
        <Card className="rounded-[14px] border border-border bg-card shadow-sm overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider block">
                Sites Visited
              </span>
              <span className="text-2xl font-bold text-foreground block">
                {uniqueSitesVisited}
              </span>
              <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Unique sites logged
              </span>
            </div>
            <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Sudden / Surprise Visits */}
        <Card className="rounded-[14px] border border-border bg-card shadow-sm overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider block">
                Sudden Visits Logged
              </span>
              <span className="text-2xl font-bold text-foreground block">
                {reports.filter((r) => r.visitType === "Surprise").length}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Unscheduled checks
              </span>
            </div>
            <div className="h-10 w-10 rounded-full bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 shrink-0">
              <ClipboardCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Total Reports Submitted */}
        <Card className="rounded-[14px] border border-border bg-card shadow-sm overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider block">
                Total Visit Reports
              </span>
              <span className="text-2xl font-bold text-foreground block">
                {reports.length}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Submitted to dashboard
              </span>
            </div>
            <div className="h-10 w-10 rounded-full bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center text-teal-600 shrink-0">
              <FileText className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Planned Visits Operations Area */}
      <Card className="rounded-[14px] border border-border bg-card shadow-sm">
        <CardHeader className="border-b pb-4 px-6">
          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-4.5 w-4.5 text-blue-600" /> Planned Visit Schedules
          </CardTitle>
          <CardDescription className="text-[10px]">
            View and manage scheduled inspections. Click "Start Visit" to log a report for a pending schedule.
          </CardDescription>
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

            {/* Date Filter */}
            <div className="w-full sm:w-auto min-w-[130px]">
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="h-9 border-border bg-background text-foreground text-xs rounded-lg"
              />
            </div>

            {/* Reset Filters */}
            <Button
              variant="ghost"
              onClick={handleResetFilters}
              className="text-muted-foreground hover:text-foreground h-9 px-3 text-xs flex items-center gap-1 rounded-lg ml-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          </div>

          {/* Planned Visits Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Planned Date</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Client / Company</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Site Location</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Officer Assigned</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Shift</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Status</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-200 pr-6">Action</TableHead>
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
    </div>
  );
}