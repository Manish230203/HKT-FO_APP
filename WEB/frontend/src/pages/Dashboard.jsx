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
        const loadedRounds = (roundRes.data || []).map(r => ({
          ...r,
          visitDate: new Date().toISOString().split("T")[0]
        }));
        setRoundReports(loadedRounds);

        // Fetch visit reports
        const visitRes = await api.get("/officer-visits/reports");
        const loadedVisits = (visitRes.data || []).map(r => ({
          ...r,
          visitDate: new Date().toISOString().split("T")[0]
        }));
        setVisitReports(loadedVisits);

        // Load planned visits from localStorage, or initialize with mock data
        const storedPlanned = localStorage.getItem("planned_visits");
        if (storedPlanned) {
          let parsedPlanned = JSON.parse(storedPlanned);
          parsedPlanned = parsedPlanned.map(pv => {
            if (pv.id === "pv-1" || pv.id === "pv-2") {
              pv.date = new Date().toISOString().split("T")[0];
            } else if (pv.id === "pv-3") {
              pv.date = new Date(Date.now() + 86400000).toISOString().split("T")[0];
            } else if (pv.id === "pv-4") {
              pv.date = new Date(Date.now() - 86400000).toISOString().split("T")[0];
            }
            return pv;
          });
          setPlannedVisits(parsedPlanned);
          localStorage.setItem("planned_visits", JSON.stringify(parsedPlanned));
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
    navigate(`/select-visit-type?clientId=${pv.clientId}&siteId=${pv.siteId}&plannedId=${pv.id}&date=${pv.date}`);
  };

  const handleStartSuddenVisit = () => {
    if (!suddenClient || !suddenBranch || !suddenSite || !suddenVisitType || !suddenDate) {
      alert("All fields are mandatory.");
      return;
    }

    setIsSuddenVisitModalOpen(false);

    if (suddenVisitType === "night_round" || suddenVisitType === "day_round") {
      const shiftVal = suddenVisitType === "night_round" ? "Night" : "Day";
      navigate(
        `/officer-rounds/create?clientId=${suddenClient}&branchId=${suddenBranch}&siteId=${suddenSite}&shift=${shiftVal}&type=Surprise&date=${suddenDate}&remark=${encodeURIComponent(suddenRemark)}`
      );
    } else if (suddenVisitType === "general_visit") {
      navigate(
        `/general-visits?open=true&clientId=${suddenClient}&siteId=${suddenSite}&date=${suddenDate}&remark=${encodeURIComponent(suddenRemark)}`
      );
    }
  };

  // Filter planned visits
  const filteredPlanned = plannedVisits.filter((pv) => {
    if (activeTab === "Planned") {
      return pv.status === "Pending" || pv.status === "Overdue";
    } else if (activeTab === "In progress") {
      return pv.status === "In Progress";
    } else if (activeTab === "Completed") {
      return pv.status === "Completed";
    }
    return true;
  });

  const todayStr = new Date().toISOString().split("T")[0];

  // KPI Calculations (Today)
  const todayPlannedCount = plannedVisits.filter((pv) => pv.date === todayStr).length;

  // Sites Visited (Completed round reports & visit reports for today)
  const todayRoundSites = roundReports
    .filter((r) => r.status === "Completed" && r.visitDate === todayStr && r.siteId)
    .map((r) => r.siteId);
  const todayVisitSites = visitReports
    .filter((r) => r.status === "Completed" && r.visitDate === todayStr && r.siteId)
    .map((r) => r.siteId);
  const todaySitesVisitedCount = new Set([...todayRoundSites, ...todayVisitSites]).size;

  // Pending Visits (Today's planned visits with status "Pending")
  const todayPendingCount = plannedVisits.filter((pv) => pv.date === todayStr && pv.status === "Pending").length;

  // Reports (Total reports submitted today)
  const todayRoundReportsCount = roundReports.filter((r) => r.visitDate === todayStr).length;
  const todayVisitReportsCount = visitReports.filter((r) => r.visitDate === todayStr).length;
  const todayReportsCount = todayRoundReportsCount + todayVisitReportsCount;

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
                {todayPlannedCount}
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
                {todaySitesVisitedCount}
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-green">
              <MapPin className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Pending Visits */}
        <Card className="kpi-card kpi-card-purple rounded-[14px] overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                Pending Visits
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {todayPendingCount}
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-purple">
              <Clock className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Reports */}
        <Card className="kpi-card kpi-card-red rounded-[14px] overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Reports
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {todayReportsCount}
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

          {/* Tabs Bar */}
          <div className="flex border-b border-border/60 pb-1 mb-4 gap-2">
            {["Planned", "In progress", "Completed"].map((tab) => (
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

          {/* Planned Table */}
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
                    .filter((s) => !suddenClient || s.client_name === clients.find((c) => c.id.toString() === suddenClient)?.name)
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
              onClick={handleStartSuddenVisit}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-9"
            >
              Start Visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}