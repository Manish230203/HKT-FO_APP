import { useState, useEffect } from "react";
import { 
  Building2, 
  CheckCircle2, 
  Clock, 
  Download, 
  AlertCircle
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
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ planned: 0, present: 0, absent: 0, missedPunch: 0 });

  // Filters
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("all");
  const [selectedSiteId, setSelectedSiteId] = useState("all");
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);

  // Regularize Dialog Modal
  const [isRegOpen, setIsRegOpen] = useState(false);
  const [selectedGuard, setSelectedGuard] = useState(null);
  const [regType, setRegType] = useState("Punch In");
  const [regTime, setRegTime] = useState("09:00");
  const [regReason, setRegReason] = useState("");

  useEffect(() => {
    loadFilterData();
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [selectedClientId, selectedSiteId, dateFilter]);

  const loadFilterData = async () => {
    try {
      const compRes = await api.get("/assessments/clients");
      setCompanies(compRes.data || []);
      const siteRes = await api.get("/assessments/sites");
      setSites(siteRes.data || []);
    } catch (e) {
      console.error("Failed to load filters", e);
    }
  };

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const clientParam = selectedClientId === "all" ? "" : `&client_id=${selectedClientId}`;
      const siteParam = selectedSiteId === "all" ? "" : `&site_id=${selectedSiteId}`;
      const res = await api.get(`/attendance/records?date=${dateFilter}${clientParam}${siteParam}`);
      if (res.data) {
        setRecords(res.data.records || []);
        setStats({
          planned: res.data.planned || 0,
          present: res.data.present || 0,
          absent: res.data.absent || 0,
          missedPunch: res.data.missedPunch || 0
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
        description: "Please enter a valid reason for regularization.",
        variant: "destructive"
      });
      return;
    }

    try {
      const payload = {
        employeeOid: selectedGuard.employeeOid,
        siteOid: selectedGuard.siteOid,
        shift: selectedGuard.shift,
        regularizedFor: regType,
        originalTime: regType === "Punch In" ? selectedGuard.punchInTime : selectedGuard.punchOutTime,
        regularizedTime: regTime,
        reason: regReason,
        date: dateFilter
      };

      await api.post("/attendance/regularize", payload);
      toast({
        title: "Success",
        description: `Regularized attendance successfully for ${selectedGuard.guardName}.`
      });
      setIsRegOpen(false);
      setRegReason("");
      fetchAttendance();
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to regularize attendance.",
        variant: "destructive"
      });
    }
  };

  const handleExportExcel = async () => {
    try {
      const clientParam = selectedClientId === "all" ? "all" : selectedClientId;
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Title Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Guard Attendance</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          View attendance summary and regularize missed punches
        </p>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-12 w-12 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block tracking-wider">Planned Guards</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 block">{stats.planned}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-1">Total scheduled for today</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-12 w-12 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block tracking-wider">Present Guards</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 block">{stats.present}</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-1">
                {stats.planned > 0 ? ((stats.present / stats.planned) * 100).toFixed(1) : 0}% of planned
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-12 w-12 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block tracking-wider">Absent Guards</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 block">{stats.absent}</span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-1">
                {stats.planned > 0 ? ((stats.absent / stats.planned) * 100).toFixed(1) : 0}% of planned
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-12 w-12 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block tracking-wider">Missed Punch Count</span>
              <span className="text-2xl font-bold text-slate-900 block dark:text-slate-100">{stats.missedPunch}</span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400 block mt-1">
                {stats.planned > 0 ? ((stats.missedPunch / stats.planned) * 100).toFixed(1) : 0}% of planned
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Client</label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Site</label>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Date Filter</label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main List Table */}
      <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Guard Attendance List</h3>
            <Button onClick={handleExportExcel} variant="outline" className="text-xs flex items-center gap-1.5 border-slate-200 dark:border-slate-800 dark:hover:bg-slate-850">
              <Download className="h-3.5 w-3.5" /> Export Excel
            </Button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading attendance logs...</div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No attendance logs found.</div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                <TableRow>
                  <TableHead className="font-bold w-12 text-center text-slate-400 dark:text-slate-500">#</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Emp ID</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Guard Name</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Site</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Shift</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Punch In Time</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Punch Out Time</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Status</TableHead>
                  <TableHead className="font-bold text-center text-slate-400 dark:text-slate-500">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-center font-medium text-slate-500 dark:text-slate-400">{idx + 1}</TableCell>
                    <TableCell className="font-semibold text-slate-700 dark:text-slate-300">{r.empId}</TableCell>
                    <TableCell className="font-bold text-slate-900 dark:text-slate-100">{r.guardName}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">{r.site}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400 text-xs">{r.shift}</TableCell>
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
                        onClick={() => {
                          setSelectedGuard(r);
                          setIsRegOpen(true);
                        }}
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

      {/* Regularize Modal Dialogue */}
      <Dialog open={isRegOpen} onOpenChange={setIsRegOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Regularize Attendance</DialogTitle>
            <DialogDescription>
              Submit details to manually add or correct logs for {selectedGuard?.guardName}.
            </DialogDescription>
          </DialogHeader>

          {selectedGuard && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Emp ID</label>
                  <Input value={selectedGuard.empId} disabled className="bg-slate-50 dark:bg-slate-900 dark:border-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Site</label>
                  <Input value={selectedGuard.site} disabled className="bg-slate-50 dark:bg-slate-900 dark:border-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Regularize For</label>
                <Select value={regType} onValueChange={(val) => setRegType(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Punch In">Punch In</SelectItem>
                    <SelectItem value="Punch Out">Punch Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Time (HH:MM)</label>
                <Input
                  type="time"
                  value={regTime}
                  onChange={(e) => setRegTime(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Reason</label>
                <Input
                  value={regReason}
                  onChange={(e) => setRegReason(e.target.value)}
                  placeholder="e.g. Forgot to punch out"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRegOpen(false)}>Cancel</Button>
            <Button onClick={handleRegularizeSubmit} className="bg-indigo-900 dark:bg-indigo-600 hover:bg-indigo-800 dark:hover:bg-indigo-700 text-white">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
