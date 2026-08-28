import { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Calendar, Plus, Building2, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import api from "@/services/api";

export default function PlannedVsActualVisits() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form modal state for adding planned schedule
  const [modalOpen, setModalOpen] = useState(false);
  const [newEmployeeId, setNewEmployeeId] = useState("");
  const [newSiteId, setNewSiteId] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [newFreq, setNewFreq] = useState("1");
  const [newMinDuration, setNewMinDuration] = useState("15");

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await api.get("/gps/planned-vs-actual", {
        params: { date },
      });
      if (res.data && res.data.report) {
        setReport(res.data.report);
      }
    } catch (err) {
      console.error("Error fetching planned vs actual report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [date]);

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    if (!newEmployeeId || !newSiteId) return;

    try {
      await api.post("/gps/planned-visits", {
        employee_id: parseInt(newEmployeeId),
        site_id: parseInt(newSiteId),
        site_name: newSiteName || `Site #${newSiteId}`,
        planned_date: date,
        required_frequency: parseInt(newFreq) || 1,
        min_duration_minutes: parseInt(newMinDuration) || 15,
      });

      setModalOpen(false);
      fetchReport();
    } catch (err) {
      console.error("Error creating planned visit schedule:", err);
    }
  };

  const completedCount = report.filter((r) => r.status === "COMPLETED").length;
  const partialCount = report.filter((r) => r.status === "PARTIAL").length;
  const missedCount = report.filter((r) => r.status === "MISSED").length;
  const fulfillmentRate = report.length > 0 ? roundToTwo((completedCount / report.length) * 100) : 100;

  function roundToTwo(num) {
    return Math.round(num * 100) / 100;
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case "COMPLETED":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> COMPLETED
          </Badge>
        );
      case "PARTIAL":
        return (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> PARTIAL
          </Badge>
        );
      default:
        return (
          <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20 flex items-center gap-1">
            <XCircle className="h-3 w-3" /> MISSED
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-5 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-sky-500" /> Planned vs Actual Visit Integration
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Compare planned site visit schedules against actual deduplicated visit sessions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-36 h-9 text-xs"
            />
          </div>

          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 text-xs gap-1.5">
                <Plus className="h-4 w-4" /> Add Schedule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md p-6">
              <DialogHeader>
                <DialogTitle className="text-base font-bold">Add Planned Site Visit Schedule</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddSchedule} className="space-y-4 text-xs mt-3">
                <div>
                  <label className="font-semibold block mb-1">Officer ID *</label>
                  <Input
                    type="number"
                    placeholder="e.g. 101"
                    value={newEmployeeId}
                    onChange={(e) => setNewEmployeeId(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Site ID *</label>
                  <Input
                    type="number"
                    placeholder="e.g. 5"
                    value={newSiteId}
                    onChange={(e) => setNewSiteId(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Site Name</label>
                  <Input
                    placeholder="e.g. Metro Tech Park"
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Required Visits</label>
                    <Input
                      type="number"
                      value={newFreq}
                      onChange={(e) => setNewFreq(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Min Duration (mins)</label>
                    <Input
                      type="number"
                      value={newMinDuration}
                      onChange={(e) => setNewMinDuration(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-9 text-xs mt-2">
                  Save Schedule
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border border-border">
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground font-medium block">Total Planned</span>
            <span className="text-xl font-bold text-foreground mt-1 block">{report.length}</span>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground font-medium block">Completed</span>
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">{completedCount}</span>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground font-medium block">Missed / Partial</span>
            <span className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1 block">
              {missedCount} / {partialCount}
            </span>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground font-medium block">Fulfillment Rate</span>
            <span className="text-xl font-bold text-sky-600 dark:text-sky-400 mt-1 block">{fulfillmentRate}%</span>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Table */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="p-4 border-b border-border">
          <CardTitle className="text-sm font-bold text-foreground">
            Site Visit Fulfillment Report ({date})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-xs text-muted-foreground">Loading report...</div>
          ) : report.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">
              No planned visit schedules found for {date}. Click "Add Schedule" to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-border text-muted-foreground uppercase text-[11px]">
                  <tr>
                    <th className="p-3.5 font-semibold">Officer ID</th>
                    <th className="p-3.5 font-semibold">Site Name</th>
                    <th className="p-3.5 font-semibold">Planned Freq</th>
                    <th className="p-3.5 font-semibold">Completed Visits</th>
                    <th className="p-3.5 font-semibold">Total Raw Visits</th>
                    <th className="p-3.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.map((item) => (
                    <tr key={item.schedule_id} className="hover:bg-muted/40 transition-colors">
                      <td className="p-3.5 font-medium text-foreground">Officer #{item.employee_id}</td>
                      <td className="p-3.5 text-foreground font-semibold">{item.site_name}</td>
                      <td className="p-3.5 text-muted-foreground">{item.required_frequency} visit(s)</td>
                      <td className="p-3.5 font-bold text-emerald-600 dark:text-emerald-400">
                        {item.actual_visits_completed}
                      </td>
                      <td className="p-3.5 text-muted-foreground">{item.total_visits_detected}</td>
                      <td className="p-3.5">{getStatusBadge(item.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
