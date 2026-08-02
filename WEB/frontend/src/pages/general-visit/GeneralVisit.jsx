import React, { useState, useEffect } from "react";
import {
  FileText,
  PlusCircle,
  Building2,
  MapPin,
  Users,
  Search,
  BookOpen,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import api from "../../services/api";

export default function GeneralVisit() {
  const [visits, setVisits] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);

  // Table Loading and Search State
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal State for New General Visit
  const [isOpen, setIsOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [personVisited, setPersonVisited] = useState("");
  const [reasonOfVisit, setReasonOfVisit] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load General Visits and Clients list
  const loadData = async () => {
    setLoading(true);
    try {
      const visitsRes = await api.get("/general-visits");
      setVisits(visitsRes.data || []);

      const clientsRes = await api.get("/assessments/clients");
      setClients(clientsRes.data || []);
    } catch (error) {
      console.error("Failed to load general visits data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Prefill fields from dashboard sudden visit modal if query parameters are provided
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("open") === "true") {
      setIsOpen(true);
      const pClientId = urlParams.get("clientId");
      const pSiteId = urlParams.get("siteId");
      const pDate = urlParams.get("date");
      const pRemark = urlParams.get("remark");
      if (pClientId) setSelectedClientId(pClientId);
      if (pSiteId) setSelectedSiteId(pSiteId);
      if (pDate) setVisitDate(pDate);
      else setVisitDate(new Date().toISOString().split("T")[0]);
      if (pRemark) setRemark(decodeURIComponent(pRemark));
    } else {
      setVisitDate(new Date().toISOString().split("T")[0]);
    }
  }, []);

  // Fetch sites when client changes inside modal
  useEffect(() => {
    const loadSites = async () => {
      if (selectedClientId) {
        try {
          const sitesRes = await api.get(`/assessments/sites?company_id=${selectedClientId}`);
          setSites(sitesRes.data || []);
        } catch (error) {
          console.error("Failed to load sites", error);
        }
      } else {
        setSites([]);
      }
    };
    loadSites();
  }, [selectedClientId]);

  // Handle Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClientId || !selectedSiteId || !personVisited.trim() || !reasonOfVisit.trim() || !visitDate) {
      alert("All fields are mandatory.");
      return;
    }

    setSubmitting(true);
    try {
      const clientName = clients.find((c) => c.id.toString() === selectedClientId)?.name || "";
      const siteName = sites.find((s) => s.id.toString() === selectedSiteId)?.name || "";

      const payload = {
        id: `gv-${Date.now()}`,
        clientId: parseInt(selectedClientId, 10),
        clientName,
        siteId: parseInt(selectedSiteId, 10),
        siteName,
        personVisited: personVisited.trim(),
        reasonOfVisit: reasonOfVisit.trim(),
        visitDate,
        startTime,
        endTime,
        remark: remark.trim(),
        created_on: Date.now(),
      };

      await api.post("/general-visits", payload);

      // Reset state and close modal
      setSelectedClientId("");
      setSelectedSiteId("");
      setPersonVisited("");
      setReasonOfVisit("");
      setVisitDate(new Date().toISOString().split("T")[0]);
      setStartTime("");
      setEndTime("");
      setRemark("");
      setIsOpen(false);

      // Reload table
      loadData();
    } catch (error) {
      console.error("Failed to save general visit", error);
      alert("Error saving general visit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Visit
  const handleDelete = async (id) => {
    if (confirm("Are you sure you want to delete this general visit record?")) {
      try {
        await api.delete(`/general-visits/${id}`);
        loadData();
      } catch (error) {
        console.error("Failed to delete general visit", error);
        alert("Failed to delete record.");
      }
    }
  };

  // Filtered visits
  const filteredVisits = visits.filter((v) => {
    const term = searchTerm.toLowerCase();
    return (
      v.clientName?.toLowerCase().includes(term) ||
      v.siteName?.toLowerCase().includes(term) ||
      v.personVisited?.toLowerCase().includes(term) ||
      v.reasonOfVisit?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 text-sm">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookOpen className="h-5.5 w-5.5 text-blue-600" /> General Visits Log
          </h1>
        </div>
        <Button
          onClick={() => {
            setSelectedClientId("");
            setSelectedSiteId("");
            setPersonVisited("");
            setReasonOfVisit("");
            setVisitDate(new Date().toISOString().split("T")[0]);
            setStartTime("");
            setEndTime("");
            setRemark("");
            setIsOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 h-10 px-4 font-semibold text-xs shrink-0 self-start sm:self-auto"
        >
          <PlusCircle className="h-4.5 w-4.5" /> Add General Visit
        </Button>
      </div>

      {/* Main List Table Card */}
      <Card className="rounded-[14px] border border-border bg-card shadow-sm">
        <CardHeader className="border-b pb-4 px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="text-sm font-bold text-foreground">
              General Visits Registry
            </CardTitle>
          </div>
          {/* Search bar */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search visits..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 h-9 text-xs rounded-lg"
            />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Date Logged</TableHead>
                  <TableHead className="font-semibold text-slate-700">Client / Company</TableHead>
                  <TableHead className="font-semibold text-slate-700">Site Location</TableHead>
                  <TableHead className="font-semibold text-slate-700">Person Visited</TableHead>
                  <TableHead className="font-semibold text-slate-700">Reason of Visit</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700 pr-6 w-20">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading general visits...
                    </TableCell>
                  </TableRow>
                ) : filteredVisits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic">
                      No general visits logged. Click "Add General Visit" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVisits.map((v) => (
                    <TableRow key={v.id} className="hover:bg-muted/20">
                      <TableCell className="font-semibold text-foreground whitespace-nowrap">
                        {v.createdOn}
                      </TableCell>
                      <TableCell className="font-medium text-foreground whitespace-nowrap">
                        {v.clientName}
                      </TableCell>
                      <TableCell className="font-medium text-foreground whitespace-nowrap">
                        {v.siteName}
                      </TableCell>
                      <TableCell className="text-slate-800 dark:text-slate-200">
                        {v.personVisited}
                      </TableCell>
                      <TableCell className="text-slate-800 dark:text-slate-200 max-w-sm truncate" title={v.reasonOfVisit}>
                        {v.reasonOfVisit}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(v.id)}
                          className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-500/10 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Creation Modal dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="rounded-xl border max-w-[500px] bg-card text-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" /> Log General Visit
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3 py-2">
            {/* Client Select */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Select Client <span className="text-rose-500">*</span>
              </label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs rounded-lg">
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Site Select */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Select Site <span className="text-rose-500">*</span>
              </label>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId} disabled={!selectedClientId}>
                <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs rounded-lg">
                  <SelectValue placeholder={selectedClientId ? "Choose a site..." : "Select client first..."} />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Input */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Date <span className="text-rose-500">*</span>
              </label>
              <Input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="h-9 border-border bg-background text-foreground text-xs rounded-lg [&::-webkit-calendar-picker-indicator]:invert"
                required
              />
            </div>

            {/* Start & End Time */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Start Time
                </label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="h-9 border-border bg-background text-foreground text-xs rounded-lg [&::-webkit-calendar-picker-indicator]:invert"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  End Time
                </label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="h-9 border-border bg-background text-foreground text-xs rounded-lg [&::-webkit-calendar-picker-indicator]:invert"
                />
              </div>
            </div>

            {/* Person Visited Textarea */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Person Visited <span className="text-rose-500">*</span>
              </label>
              <Textarea
                placeholder="Name or details of the person visited..."
                value={personVisited}
                onChange={(e) => setPersonVisited(e.target.value)}
                className="min-h-[50px] border-border text-xs rounded-lg bg-background"
                required
              />
            </div>

            {/* Reason of Visit Textarea */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Reason of Visit <span className="text-rose-500">*</span>
              </label>
              <Textarea
                placeholder="Reason or description of the visit..."
                value={reasonOfVisit}
                onChange={(e) => setReasonOfVisit(e.target.value)}
                className="min-h-[50px] border-border text-xs rounded-lg bg-background"
                required
              />
            </div>

            {/* Remark Textarea */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Remark
              </label>
              <Textarea
                placeholder="Write remark or notes..."
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className="min-h-[50px] border-border text-xs rounded-lg bg-background"
              />
            </div>

            <DialogFooter className="gap-2 pt-2 border-t mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="h-9 text-xs rounded-lg font-medium"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white h-9 text-xs font-semibold rounded-lg"
              >
                {submitting ? "Saving..." : "Save Visit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
