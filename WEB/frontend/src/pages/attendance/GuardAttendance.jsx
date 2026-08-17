import { useState, useEffect, useRef } from "react";
import {
  Building2,
  CheckCircle2,
  Clock,
  Download,
  AlertCircle,
  Filter,
  Calendar
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "../../services/api";
import { useToast } from "@/hooks/use-toast";

export default function GuardAttendance() {
  const { toast } = useToast();
  const dateInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ planned: 0, present: 0, absent: 0, missedPunch: 0 });

  // Filters
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [branches, setBranches] = useState([]);
  const [dutyTypes, setDutyTypes] = useState(["Regular", "Replacement", "Temporary"]);
  const [shifts, setShifts] = useState([]);

  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("all");
  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [selectedDesignation, setSelectedDesignation] = useState("all");
  const [selectedShift, setSelectedShift] = useState("all");
  const [selectedDutyType, setSelectedDutyType] = useState("all");
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);

  // Tabs: Pending, Approved
  const [activeTab, setActiveTab] = useState("Pending");

  // Regularize Dialog Modal States (Time Log Editor - Admin)
  const [isRegOpen, setIsRegOpen] = useState(false);
  const [selectedGuard, setSelectedGuard] = useState(null);
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [setHours, setSetHours] = useState("");
  const [regReason, setRegReason] = useState("Out attendance not marked (manually marked)");
  const [otBareBy, setOtBareBy] = useState("NONE");
  const [newAttendanceDate, setNewAttendanceDate] = useState("");

  const formatDMY = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${d.getDate().toString().padStart(2, "0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  const handleOpenRegularize = (r) => {
    setSelectedGuard(r);
    const currentDate = r.attendanceDate || dateFilter || new Date().toISOString().slice(0, 10);
    const parts = currentDate.split("-");
    const dmyStr = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : currentDate;

    const defaultIn = r.punchInTime && r.punchInTime !== "—" ? `${dmyStr} ${r.punchInTime}:00` : `${dmyStr} 07:00:00`;
    const defaultOut = r.punchOutTime && r.punchOutTime !== "—" ? `${dmyStr} ${r.punchOutTime}:00` : `${dmyStr} 15:30:00`;

    setInTime(defaultIn);
    setOutTime(defaultOut);
    setSetHours("");
    setRegReason("Out attendance not marked (manually marked)");
    setOtBareBy("NONE");
    setNewAttendanceDate(currentDate);
    setIsRegOpen(true);
  };

  useEffect(() => {
    loadFilterData();
  }, []);

  useEffect(() => {
    fetchSitesForClient(selectedClientId);
  }, [selectedClientId]);

  useEffect(() => {
    fetchShifts();
  }, [selectedClientId, selectedSiteId, selectedBranchId]);

  useEffect(() => {
    fetchAttendance();
  }, [selectedClientId, selectedSiteId, selectedBranchId, selectedDesignation, selectedShift, selectedDutyType, dateFilter]);

  const loadFilterData = async () => {
    try {
      const compRes = await api.get("/assessments/clients");
      setCompanies(compRes.data || []);
    } catch (e) {
      console.error("Failed to load clients", e);
    }
    try {
      const branchRes = await api.get("/assessments/branches");
      setBranches(branchRes.data || []);
    } catch (e) {
      console.error("Failed to load branches", e);
    }
    try {
      const dtRes = await api.get("/attendance/duty-types");
      if (dtRes.data && dtRes.data.duty_types) {
        setDutyTypes(dtRes.data.duty_types);
      }
    } catch (e) {
      console.error("Failed to load duty types", e);
    }
  };

  const fetchShifts = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedClientId && selectedClientId !== "all") params.append("client_id", selectedClientId);
      if (selectedSiteId && selectedSiteId !== "all") params.append("site_id", selectedSiteId);
      if (selectedBranchId && selectedBranchId !== "all") params.append("branch_id", selectedBranchId);

      const res = await api.get(`/attendance/shifts?${params.toString()}`);
      if (res.data && res.data.shifts) {
        setShifts(res.data.shifts);
      } else {
        setShifts([]);
      }
    } catch (e) {
      console.error("Failed to load shifts from db", e);
      setShifts([]);
    }
  };

  const fetchSitesForClient = async (clientId) => {
    if (!clientId || clientId === "all") {
      setSites([]);
      return;
    }
    try {
      const url = `/assessments/sites?company_id=${clientId}`;
      const siteRes = await api.get(url);
      setSites(siteRes.data || []);
    } catch (e) {
      console.error("Failed to load sites", e);
    }
  };

  const fetchAttendance = async () => {
    if (!selectedClientId || selectedClientId === "all") {
      setRecords([]);
      setStats({ planned: 0, present: 0, absent: 0, missedPunch: 0 });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const clientParam = `&client_id=${selectedClientId}`;
      const siteParam = selectedSiteId === "all" ? "" : `&site_id=${selectedSiteId}`;
      const branchParam = selectedBranchId === "all" ? "" : `&branch_id=${selectedBranchId}`;
      const desigParam = selectedDesignation === "all" ? "" : `&designation=${encodeURIComponent(selectedDesignation)}`;
      const shiftParam = selectedShift === "all" ? "" : `&shift=${encodeURIComponent(selectedShift)}`;
      const dutyTypeParam = selectedDutyType === "all" ? "" : `&duty_type=${encodeURIComponent(selectedDutyType)}`;

      const res = await api.get(`/attendance/records?date=${dateFilter}${clientParam}${siteParam}${branchParam}${desigParam}${shiftParam}${dutyTypeParam}`);

      if (res.data && res.data.success !== false) {
        setRecords(res.data.records || []);
        setStats({
          planned: res.data.planned || 0,
          present: res.data.present || 0,
          absent: res.data.absent || 0,
          missedPunch: res.data.missedPunch || 0
        });
      } else {
        toast({
          title: "Error",
          description: res.data?.message || "Failed to fetch attendance logs.",
          variant: "destructive"
        });
      }
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to fetch attendance logs.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegularizeSubmit = async () => {
    if (!regReason.trim()) {
      toast({
        title: "Validation Error",
        description: "Please select or enter a reason for regularization.",
        variant: "destructive"
      });
      return;
    }

    try {
      const isMissedPunchIn = selectedGuard.punchInTime === "—";
      const regFor = isMissedPunchIn ? "Punch In" : "Punch Out";
      const regTimeVal = isMissedPunchIn ? inTime : outTime;

      const payload = {
        employeeOid: selectedGuard.employeeOid,
        siteOid: selectedGuard.siteOid,
        shift: selectedGuard.shift,
        regularizedFor: regFor,
        originalTime: isMissedPunchIn ? selectedGuard.punchInTime : selectedGuard.punchOutTime,
        regularizedTime: regTimeVal,
        inTime: inTime,
        outTime: outTime,
        setHours: setHours,
        reason: regReason,
        otBareBy: otBareBy,
        newDate: newAttendanceDate,
        date: dateFilter
      };

      await api.post("/attendance/regularize", payload);
      toast({
        title: "Success",
        description: `Regularization request saved for ${selectedGuard.guardName}.`
      });
      setIsRegOpen(false);
      fetchAttendance();
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to submit regularization request.",
        variant: "destructive"
      });
    }
  };

  const handleExportExcel = async () => {
    if (!selectedClientId || selectedClientId === "all") {
      toast({
        title: "Client Required",
        description: "Please select a client before exporting attendance logs.",
        variant: "destructive"
      });
      return;
    }
    try {
      const clientParam = selectedClientId;
      const siteParam = selectedSiteId === "all" ? "all" : selectedSiteId;

      const baseUrl = api.defaults.baseURL || `http://${window.location.hostname}:8002/api`;
      const downloadUrl = `${baseUrl}/attendance/export-excel?date=${dateFilter}&client_id=${clientParam}&site_id=${siteParam}`;

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", `Attendance_Report_${dateFilter}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export Started",
        description: "Your Excel report is being generated and downloaded.",
      });
    } catch (e) {
      toast({
        title: "Export Failed",
        description: "Failed to export attendance logs.",
        variant: "destructive"
      });
    }
  };

  // Filter records based on Active Tab
  const displayedRecords = records.filter((r) => {
    if (activeTab === "Pending") {
      if (r.status === "Present" || r.status === "Approved") return false;
    } else if (activeTab === "Approved") {
      if (r.status !== "Present" && r.status !== "Approved") return false;
    }

    return true;
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Title Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Guard Attendance</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          View attendance summary and regularize missed punches
        </p>
      </div>

      {/* Filters Card (Positioned ABOVE KPI cards) */}
      <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-white">
            <Filter className="h-4 w-4 text-indigo-500" /> Filter Options
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-[5.5px] font-bold text-slate-500 dark:text-white uppercase tracking-wider block mb-1">Client</label>
              <Select value={selectedClientId} onValueChange={(val) => {
                setSelectedClientId(val);
                setSelectedSiteId("all");
              }}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 h-9 text-xs">
                  <SelectValue placeholder="Select Client" />
                </SelectTrigger>
                <SelectContent className="max-h-44 overflow-y-auto" viewportClassName="max-h-40 overflow-y-auto">
                  <SelectItem value="all">Select Client</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[8.5px] font-bold text-slate-900 dark:text-white uppercase tracking-wider block mb-1">Site</label>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId} disabled={!selectedClientId || selectedClientId === "all"}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 h-9 text-xs disabled:opacity-50">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent className="max-h-44 overflow-y-auto" viewportClassName="max-h-40 overflow-y-auto">
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[8.5px] font-bold text-slate-900 dark:text-white uppercase tracking-wider block mb-1">Branch</label>
              <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 h-9 text-xs">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent className="max-h-44 overflow-y-auto" viewportClassName="max-h-40 overflow-y-auto">
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[8.5px] font-bold text-slate-900 dark:text-white uppercase tracking-wider block mb-1">Designation</label>
              <Select value={selectedDesignation} onValueChange={setSelectedDesignation}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 h-9 text-xs">
                  <SelectValue placeholder="All Designations" />
                </SelectTrigger>
                <SelectContent className="max-h-44 overflow-y-auto" viewportClassName="max-h-40 overflow-y-auto">
                  <SelectItem value="all">All Designations</SelectItem>
                  <SelectItem value="security guard">Security Guard</SelectItem>
                  <SelectItem value="lady security guard">Lady Security Guard</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[8.5px] font-bold text-slate-900 dark:text-white uppercase tracking-wider block mb-1">Date Filter</label>
              <div className="relative flex items-center">
                <Input
                  ref={dateInputRef}
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  onClick={() => {
                    try {
                      if (dateInputRef.current && dateInputRef.current.showPicker) {
                        dateInputRef.current.showPicker();
                      }
                    } catch (err) { }
                  }}
                  className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 h-9 text-xs pr-8 cursor-pointer dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
                <Calendar
                  className="h-4 w-4 absolute right-2.5 text-slate-400 dark:text-slate-400 pointer-events-none"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Deployed Guards - Blue */}
        <Card className="kpi-card kpi-card-blue rounded-[14px] overflow-hidden shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Deployed Guards
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {stats.planned}
              </span>
              <span className="text-[10px] text-muted-foreground block mt-1">
                Total deployed for today
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-blue">
              <Building2 className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Present Guards - Green */}
        <Card className="kpi-card kpi-card-green rounded-[14px] overflow-hidden shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Present Guards
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {stats.present}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-1">
                {stats.planned > 0 ? ((stats.present / stats.planned) * 100).toFixed(1) : 0}% of deployed
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-green">
              <CheckCircle2 className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Absent Guards - RED */}
        <Card className="kpi-card kpi-card-red rounded-[14px] overflow-hidden shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Absent Guards
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {stats.absent}
              </span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400 block mt-1">
                {stats.planned > 0 ? ((stats.absent / stats.planned) * 100).toFixed(1) : 0}% of deployed
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-red">
              <AlertCircle className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Missed Punch Count - YELLOW / AMBER */}
        <Card className="kpi-card kpi-card-amber rounded-[14px] overflow-hidden shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Missed Punch Count
              </div>
              <span className="text-3xl font-bold text-foreground block leading-none">
                {stats.missedPunch}
              </span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-1">
                {stats.planned > 0 ? ((stats.missedPunch / stats.planned) * 100).toFixed(1) : 0}% of deployed
              </span>
            </div>
            <div className="h-12 w-12 rounded-[12px] flex items-center justify-center shrink-0 kpi-icon-amber">
              <Clock className="h-5.5 w-5.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main List Table Card */}
      <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Guard Attendance List</h3>

              {/* Shift filter beside heading */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Shift:</span>
                <Select value={selectedShift} onValueChange={setSelectedShift}>
                  <SelectTrigger className="w-[140px] bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 h-8 text-xs font-medium">
                    <SelectValue placeholder="All Shifts" />
                  </SelectTrigger>
                  <SelectContent className="max-h-44 overflow-y-auto">
                    <SelectItem value="all">All Shifts</SelectItem>
                    {shifts.map((s, idx) => (
                      <SelectItem key={idx} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleExportExcel} variant="outline" className="text-xs flex items-center gap-1.5 border-slate-200 dark:border-slate-800 dark:hover:bg-slate-850">
              <Download className="h-3.5 w-3.5" /> Export Excel
            </Button>
          </div>

          {/* Pending / Approved Tabs Bar */}
          <div className="flex border-b border-slate-100 dark:border-slate-800 px-4 pt-3 gap-2 bg-slate-50/50 dark:bg-slate-900/30">
            {["Pending", "Approved"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all duration-200 border-b-2 ${activeTab === tab
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 border-indigo-600 font-bold shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 border-transparent"
                  }`}
              >
                {tab} Records
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading attendance logs...</div>
          ) : !selectedClientId || selectedClientId === "all" ? (
            <div className="p-12 text-center flex flex-col items-center justify-center space-y-2 text-slate-500 dark:text-slate-400">
              <Building2 className="h-8 w-8 text-slate-400 dark:text-slate-600 mb-1" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">No Client Selected</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Please select a client from the dropdown above to view attendance records.</p>
            </div>
          ) : displayedRecords.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No {activeTab.toLowerCase()} attendance logs found matching the selected filters.</div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                <TableRow>
                  <TableHead className="font-bold w-12 text-center text-slate-400 dark:text-slate-500">#</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Emp ID</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Guard Name</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Duty Type</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Shift</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Punch In Time</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Punch Out Time</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Status</TableHead>
                  <TableHead className="font-bold text-center text-slate-400 dark:text-slate-500">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedRecords.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-center font-medium text-slate-500 dark:text-slate-400">{idx + 1}</TableCell>
                    <TableCell className="font-semibold text-slate-700 dark:text-slate-300">{r.empId}</TableCell>
                    <TableCell className="font-bold text-slate-900 dark:text-slate-100">{r.guardName}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300 font-medium">{r.dutyType || "Regular"}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400 text-xs font-semibold">{r.shift}</TableCell>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{r.punchInTime}</TableCell>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{r.punchOutTime}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          r.status === "Present"
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50"
                            : r.status === "Missed Punch Out"
                              ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50"
                              : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenRegularize(r)}
                        className="text-xs text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 font-bold"
                      >
                        Regularize
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Time Log Editor - Admin Modal */}
      <Dialog open={isRegOpen} onOpenChange={setIsRegOpen}>
        <DialogContent className="max-w-4xl p-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              Time Log Editor - Admin
            </h2>
          </div>

          {selectedGuard && (
            <div className="p-6 space-y-6">
              {/* Header Info Grid Bar */}
              <div className="border border-slate-300 dark:border-slate-700 rounded-md overflow-hidden text-xs shadow-xs">
                {/* Row 1 */}
                <div className="grid grid-cols-4 divide-x divide-slate-300 dark:divide-slate-700 border-b border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="italic text-slate-500 dark:text-slate-400 shrink-0">Site</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{selectedGuard.site || "Hyundai Talegaon"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pl-3">
                    <span className="italic text-slate-500 dark:text-slate-400 shrink-0">Emp Code</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{selectedGuard.empId || "S153883"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pl-3 overflow-hidden">
                    <span className="italic text-slate-500 dark:text-slate-400 shrink-0">Emp Name:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{selectedGuard.guardName || "ABHIJEET SHINDE"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pl-3">
                    <span className="italic text-slate-500 dark:text-slate-400 shrink-0">Attendance Date:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{formatDMY(dateFilter)}</span>
                  </div>
                </div>

                {/* Row 2 */}
                <div className="grid grid-cols-3 divide-x divide-slate-300 dark:divide-slate-700 bg-white dark:bg-slate-900 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="italic text-slate-500 dark:text-slate-400">Payroll Attendance Policy</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">DAY_BASE</span>
                  </div>
                  <div className="flex items-center gap-2 pl-3">
                    <span className="italic text-slate-500 dark:text-slate-400">Negative Tolerance mins</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">10</span>
                  </div>
                  <div className="flex items-center gap-2 pl-3">
                    <span className="italic text-slate-500 dark:text-slate-400">Positive Tolerance mins</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">45</span>
                  </div>
                </div>
              </div>

              {/* 3 Main Form Columns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
                {/* Column 1: Shift & Punch Time Logs */}
                <div className="space-y-3 pr-3">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Shift</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {selectedGuard.shift || "A-Shift"} [ 07:00 to 15:30 ]
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      IN Time <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={inTime}
                      onChange={(e) => setInTime(e.target.value)}
                      className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono shadow-2xs focus-visible:ring-sky-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      OUT Time <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={outTime}
                      onChange={(e) => setOutTime(e.target.value)}
                      className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono shadow-2xs focus-visible:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Column 2: Hours & Reason Dropdown */}
                <div className="space-y-3 md:pl-6 pr-3 pt-3 md:pt-0">
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 shrink-0 w-28">
                      Set Hours To
                    </label>
                    <Input
                      type="number"
                      value={setHours}
                      onChange={(e) => setSetHours(e.target.value)}
                      className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-2xs w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Set Hours Reason
                    </label>
                    <Select value={regReason} onValueChange={(val) => setRegReason(val)}>
                      <SelectTrigger className="h-8 text-xs border-sky-400 dark:border-sky-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-2xs ring-1 ring-sky-400/50">
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent className="text-xs max-h-60">
                        <SelectItem value="Out attendance not marked (manually marked)">Out attendance not marked (manually marked)</SelectItem>
                        <SelectItem value="Attendance not marked ( mark attendance)">Attendance not marked ( mark attendance)</SelectItem>
                        <SelectItem value="Late in time marked.">Late in time marked.</SelectItem>
                        <SelectItem value="Late out time marked.">Late out time marked.</SelectItem>
                        <SelectItem value="Late in and Early out time marked.">Late in and Early out time marked.</SelectItem>
                        <SelectItem value="Early out time marked.">Early out time marked.</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 shrink-0 w-28">
                      OT Bare By
                    </label>
                    <Select value={otBareBy} onValueChange={(val) => setOtBareBy(val)}>
                      <SelectTrigger className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 w-full shadow-2xs">
                        <SelectValue placeholder="NONE" />
                      </SelectTrigger>
                      <SelectContent className="text-xs">
                        <SelectItem value="NONE">NONE</SelectItem>
                        <SelectItem value="CLIENT">CLIENT</SelectItem>
                        <SelectItem value="COMPANY">COMPANY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Column 3: Change Attendance Date */}
                <div className="space-y-3 md:pl-6 pt-3 md:pt-0">
                  <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                    Change the attendance date
                  </h4>
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    Old Attendance Date <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">{formatDMY(dateFilter)}</span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">New Attendance Date</label>
                    <Input
                      type="date"
                      value={newAttendanceDate}
                      onChange={(e) => setNewAttendanceDate(e.target.value)}
                      className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono shadow-2xs"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => {
                      toast({
                        title: "Date Changed",
                        description: `New attendance date set to ${newAttendanceDate}`
                      });
                    }}
                    className="bg-[#2196F3] hover:bg-[#1976D2] text-white font-semibold text-xs h-8 px-5 rounded shadow-2xs transition-colors"
                  >
                    Change
                  </Button>
                </div>
              </div>

              {/* Bottom Center Save Button */}
              <div className="flex justify-center pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  onClick={handleRegularizeSubmit}
                  className="bg-[#2196F3] hover:bg-[#1976D2] text-white font-bold text-xs px-8 py-2 rounded shadow-2xs transition-colors"
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
